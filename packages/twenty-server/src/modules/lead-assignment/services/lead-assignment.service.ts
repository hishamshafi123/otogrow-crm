import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isNonEmptyString } from '@sniptt/guards';
import { AppPath } from 'twenty-shared/types';
import { getAppPath, isDefined } from 'twenty-shared/utils';
import { Between, QueryFailedError, type Repository } from 'typeorm';
import { v4 } from 'uuid';

import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { LEAD_ASSIGNMENT_TASK_TITLE_PREFIX } from 'src/modules/lead-assignment/constants/lead-assignment.constant';
import { SetterAssignmentEntity } from 'src/modules/lead-assignment/entities/setter-assignment.entity';
import { SetterProfileService } from 'src/modules/lead-assignment/services/setter-profile.service';
import { TelegramConfigService } from 'src/modules/lead-assignment/services/telegram-config.service';
import { TelegramService } from 'src/modules/lead-assignment/services/telegram.service';
import { computeEligibleSetters } from 'src/modules/lead-assignment/utils/compute-eligible-setters.util';
import { PersonWorkspaceEntity } from 'src/modules/person/standard-objects/person.workspace-entity';
import { TaskTargetWorkspaceEntity } from 'src/modules/task/standard-objects/task-target.workspace-entity';
import { TaskWorkspaceEntity } from 'src/modules/task/standard-objects/task.workspace-entity';

// A concurrent assignment run can win the insert race on the unique
// (workspaceId, personId) index; the person is assigned either way
const isUniqueViolation = (error: unknown): boolean =>
  error instanceof QueryFailedError &&
  (error.driverError as { code?: string }).code === '23505';

@Injectable()
export class LeadAssignmentService {
  private readonly logger = new Logger(LeadAssignmentService.name);

  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly setterProfileService: SetterProfileService,
    private readonly telegramConfigService: TelegramConfigService,
    private readonly telegramService: TelegramService,
    private readonly twentyConfigService: TwentyConfigService,
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository -- called from a queue job with an explicit workspaceId, no ambient workspace context
    @InjectRepository(SetterAssignmentEntity)
    private readonly setterAssignmentRepository: Repository<SetterAssignmentEntity>,
  ) {}

  async assignPersonToSetter(
    workspaceId: string,
    personId: string,
  ): Promise<void> {
    const existingAssignment = await this.setterAssignmentRepository.findOne({
      where: { workspaceId, personId },
    });

    if (isDefined(existingAssignment)) {
      if (!isDefined(existingAssignment.notificationSentAt)) {
        await this.retryAssignmentNotification(workspaceId, existingAssignment);
      }
      return;
    }

    const setters = (
      await this.setterProfileService.findByWorkspaceId(workspaceId)
    ).filter((profile) => profile.isSetter);

    if (setters.length === 0) {
      return;
    }

    const now = new Date();
    const dayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const candidates = await Promise.all(
      setters.map(async (setter) => ({
        id: setter.id,
        workspaceMemberId: setter.workspaceMemberId,
        telegramChatId: setter.telegramChatId,
        activeDays: setter.activeDays,
        activeStartHour: setter.activeStartHour,
        activeEndHour: setter.activeEndHour,
        dailyLeadCap: setter.dailyLeadCap,
        lastAssignedAt: setter.lastAssignedAt,
        assignmentsToday: await this.setterAssignmentRepository.count({
          where: {
            setterProfileId: setter.id,
            createdAt: Between(dayStart, dayEnd),
          },
        }),
      })),
    );

    const [winner] = computeEligibleSetters(candidates, now);

    if (!isDefined(winner)) {
      return;
    }

    const authContext = buildSystemAuthContext(workspaceId);

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const personRepository =
        await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          PersonWorkspaceEntity,
          { shouldBypassPermissionChecks: true },
        );

      const person = await personRepository.findOne({
        where: { id: personId },
      });

      if (!isDefined(person) || !isNonEmptyString(person.leadSource)) {
        return;
      }

      try {
        await this.setterAssignmentRepository.insert({
          id: v4(),
          workspaceId,
          setterProfileId: winner.id,
          workspaceMemberId: winner.workspaceMemberId,
          personId,
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          return;
        }

        throw error;
      }

      // Person has no workspace-member relation (no owner field), so
      // assignment is expressed through the Task alone
      const leadName =
        [person.name?.firstName, person.name?.lastName]
          .filter(isNonEmptyString)
          .join(' ') || 'lead';

      const taskRepository = await this.globalWorkspaceOrmManager.getRepository(
        workspaceId,
        TaskWorkspaceEntity,
        { shouldBypassPermissionChecks: true },
      );

      const taskId = v4();

      await taskRepository.insert({
        id: taskId,
        title: `${LEAD_ASSIGNMENT_TASK_TITLE_PREFIX}${leadName}`,
        dueAt: now,
        status: 'TODO',
        assigneeId: winner.workspaceMemberId,
      });

      const taskTargetRepository =
        await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          TaskTargetWorkspaceEntity,
          { shouldBypassPermissionChecks: true },
        );

      await taskTargetRepository.insert({
        id: v4(),
        taskId,
        targetPersonId: personId,
      });

      await this.setterProfileService.updateLastAssignedAt(winner.id, now);

      this.logger.log(
        `Assigned person ${personId} to setter ${winner.workspaceMemberId} in workspace ${workspaceId}`,
      );

      await this.sendTelegramPing({
        workspaceId,
        telegramChatId: winner.telegramChatId,
        leadName,
        leadPhone: person.phones?.primaryPhoneNumber ?? null,
        leadSource: person.leadSource,
        personId,
      });
    }, authContext);
  }

  private async retryAssignmentNotification(
    workspaceId: string,
    assignment: SetterAssignmentEntity,
  ): Promise<void> {
    const setter = (
      await this.setterProfileService.findByWorkspaceId(workspaceId)
    ).find((profile) => profile.id === assignment.setterProfileId);

    if (!setter) return;
    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const personRepository =
        await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          PersonWorkspaceEntity,
          { shouldBypassPermissionChecks: true },
        );
      const person = await personRepository.findOne({
        where: { id: assignment.personId },
      });

      if (!person) return;
      await this.sendTelegramPing({
        workspaceId,
        telegramChatId: setter.telegramChatId,
        leadName:
          [person.name?.firstName, person.name?.lastName]
            .filter(isNonEmptyString)
            .join(' ') || 'lead',
        leadPhone: person.phones?.primaryPhoneNumber ?? null,
        leadSource: person.leadSource ?? '',
        personId: assignment.personId,
      });
    }, buildSystemAuthContext(workspaceId));
  }

  private async sendTelegramPing({
    workspaceId,
    telegramChatId,
    leadName,
    leadPhone,
    leadSource,
    personId,
  }: {
    workspaceId: string;
    telegramChatId: string | null;
    leadName: string;
    leadPhone: string | null;
    leadSource: string;
    personId: string;
  }): Promise<boolean> {
    if (!isNonEmptyString(telegramChatId)) {
      return false;
    }

    const config =
      await this.telegramConfigService.findByWorkspaceId(workspaceId);

    if (!isDefined(config) || !config.isActive) {
      return false;
    }

    const baseUrl =
      this.twentyConfigService.get('FRONTEND_URL') ??
      this.twentyConfigService.get('SERVER_URL');

    // A Telegram outage must not fail the assignment: the Task already
    // carries the lead; sheet polling retries while notificationSentAt is empty
    try {
      return await this.setterAssignmentRepository.manager.transaction(
        async (manager) => {
          const repository = manager.getRepository(SetterAssignmentEntity);
          // The creation job and sheet poller can reach notification delivery together.
          const pending = await repository.findOne({
            where: { workspaceId, personId },
            lock: { mode: 'pessimistic_write' },
          });

          if (!pending || isDefined(pending.notificationSentAt)) return false;
          await this.telegramService.sendLeadAssignmentMessage(
            config,
            telegramChatId,
            {
              leadName,
              leadPhone,
              leadSource,
              personUrl: `${baseUrl}${getAppPath(AppPath.RecordShowPage, { objectNameSingular: 'person', objectRecordId: personId })}`,
            },
          );
          await repository.update(
            { workspaceId, personId },
            { notificationSentAt: new Date() },
          );
          return true;
        },
      );
    } catch (error) {
      this.logger.warn(
        `Failed to send Telegram assignment ping for person ${personId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }
}
