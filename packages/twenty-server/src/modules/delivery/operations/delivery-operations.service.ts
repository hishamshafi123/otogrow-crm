import { resolveMetaClientRouting } from 'src/modules/delivery/advertising/delivery-meta-client-routing';
import { matchesApprovedDelivery } from 'src/modules/delivery/lifecycle/delivery-lifecycle';
import { recordDeliveryRevision } from 'src/modules/delivery/revisions/record-delivery-revision';
import { isValidUuid } from 'twenty-shared/utils';
import { getMetaReportIdentity } from 'src/modules/delivery/advertising/delivery-meta-report-store';
import { getPublishedDeliveryWorkflow } from 'src/modules/delivery/workflows/apply-delivery-workflow';
import { syncDeliveryCommitment } from 'src/modules/delivery/commitments/record-delivery-commitment';
import { readDeliveryOperations } from 'src/modules/delivery/read-delivery-snapshot';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { DataSource, type EntityManager } from 'typeorm';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { DeliveryCreativeService } from 'src/modules/delivery/creative/delivery-creative.service';
import { DeliveryTaskEntity } from 'src/modules/delivery/entities/delivery-task.entity';
import { DeliveryOperationsEntity } from 'src/modules/delivery/entities/delivery-operations.entity';
import { TelegramConfigService } from 'src/modules/lead-assignment/services/telegram-config.service';
import { TelegramConfigEntity } from 'src/modules/lead-assignment/entities/telegram-config.entity';
import { type TelegramUpdate } from 'src/modules/lead-assignment/services/telegram.service';
import {
  operationsCommandSchema,
  newDeliveryOperations,
  type DeliveryNotice,
  type DeliveryAlert,
  type DeliveryOperations,
  type Recurrence,
} from 'src/modules/delivery/operations/delivery-operations.types';
import { latestRecurrence } from 'src/modules/delivery/operations/delivery-recurrence';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import {
  DeliveryReminderOutboxEntity,
  type DeliveryReminderState,
} from 'src/modules/delivery/entities/delivery-reminder-outbox.entity';
import {
  DELIVERY_REMINDER_JOB,
  DELIVERY_REMINDER_CLAIM_TIMEOUT,
} from 'src/modules/delivery/operations/delivery-reminder.constants';

const HOURS_12 = 12 * 60 * 60 * 1000;
const MINUTES_5 = 5 * 60 * 1000;
const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');
const recurrenceActivityFields = (template: Recurrence) => ({
  projectId: template.projectId,
  assigneeId: template.fields.assigneeId,
  reviewerId: template.fields.reviewerId,
  frequency: template.frequency,
  weekdays: [...template.weekdays].sort().join(','),
  monthDay: String(template.monthDay),
  time: template.time,
  startDate: template.startDate,
  endDate: template.endDate,
  paused: String(template.paused),
  dueHours: String(template.dueHours),
  checklistCount: String(template.fields.checklist.length),
});

const alertActivityFields = (alert: DeliveryAlert) => ({
  alertCategory: alert.category,
  severity: alert.severity,
  ownerId: alert.ownerId,
  acknowledged: String(Boolean(alert.acknowledgedAt)),
  resolved: String(Boolean(alert.resolvedAt)),
});

@Injectable()
export class DeliveryOperationsService {
  private readonly logger = new Logger(DeliveryOperationsService.name);
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly delivery: DeliveryService,
    private readonly creative: DeliveryCreativeService,
    private readonly telegram: TelegramConfigService,
    private readonly config: TwentyConfigService,
    @InjectMessageQueue(MessageQueue.messagingQueue)
    private readonly queue: MessageQueueService,
  ) {}

  private async transact<TResult>(
    workspaceId: string,
    operation: (
      state: DeliveryOperations,
      manager: EntityManager,
    ) => Promise<TResult>,
  ) {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`delivery:${workspaceId}`],
      );
      const repository = manager.getRepository(DeliveryOperationsEntity);
      const record =
        (await repository.findOneBy({ workspaceId })) ??
        repository.create({ workspaceId, state: newDeliveryOperations() });
      const result = await operation(record.state, manager);
      if (JSON.stringify(record.state).length > 10000000)
        throw new BadRequestException(
          'Operations history reached its storage limit. Contact an administrator for maintenance.',
        );
      await repository.save(record);
      return result;
    });
  }

  private async recordAlertActivity(
    manager: EntityManager,
    workspaceId: string,
    alert: DeliveryAlert,
    actorId: string | null,
    action:
      | 'DELIVERY_ALERT_CREATED'
      | 'DELIVERY_ALERT_UPDATED'
      | 'DELIVERY_ALERT_ACKNOWLEDGED'
      | 'DELIVERY_ALERT_RESOLVED',
    before: ReturnType<typeof alertActivityFields> | null,
    now: Date,
  ) {
    const task = await manager
      .getRepository(DeliveryTaskEntity)
      .findOneBy({ workspaceId, taskId: alert.taskId });
    const after = alertActivityFields(alert);
    await recordOtogrowActivity(manager, {
      workspaceId,
      actorId,
      actorType: actorId ? 'HUMAN' : 'SYSTEM',
      subjectMemberId: alert.ownerId,
      category: 'DELIVERY',
      action,
      outcome: 'RECORDED',
      summary: {
        DELIVERY_ALERT_CREATED: actorId
          ? 'Flagged a delivery issue for founder attention.'
          : 'Flagged an overdue delivery for founder attention.',
        DELIVERY_ALERT_UPDATED:
          'Updated a delivery issue and its responsible owner.',
        DELIVERY_ALERT_ACKNOWLEDGED: 'Acknowledged a delivery issue.',
        DELIVERY_ALERT_RESOLVED: 'Resolved a delivery issue.',
      }[action],
      projectId: task?.projectId ?? null,
      taskId: alert.taskId,
      sourceType: 'alert',
      sourceId: alert.id,
      occurredAt: now,
      changes: (Object.keys(after) as (keyof typeof after)[])
        .filter((field) => before?.[field] !== after[field])
        .map((field) => ({
          field,
          before: before?.[field] ?? null,
          after: after[field],
        })),
    });
  }

  private async active(
    workspace: WorkspaceEntity,
    memberId: string,
    manager: EntityManager,
  ) {
    const members: { userWorkspaceId: string }[] = await manager.query(
      `SELECT u.id AS "userWorkspaceId" FROM ${this.delivery.schema(workspace)}."workspaceMember" m JOIN core."userWorkspace" u ON u."userId"=m."userId" AND u."workspaceId"=$2 WHERE m.id=$1 AND m."deletedAt" IS NULL AND u."deletedAt" IS NULL`,
      [memberId, workspace.id],
    );
    return members[0]?.userWorkspaceId ?? null;
  }

  private async actor(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    manager: EntityManager,
  ) {
    if ((await this.active(workspace, memberId, manager)) !== userWorkspaceId)
      throw new ForbiddenException();
    return this.delivery.actor(workspace, memberId, userWorkspaceId, manager);
  }

  private async metaNoticeAllowed(
    state: DeliveryOperations,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    reportKey: string,
    manager: EntityManager,
  ) {
    const reportId = reportKey.slice('meta-report:'.length);
    if (!isValidUuid(reportId)) return false;
    const report = await getMetaReportIdentity(manager, workspace.id, reportId);
    if (!report) return false;
    const actor = await this.actor(
      workspace,
      memberId,
      userWorkspaceId,
      manager,
    );
    if (actor.isAdmin) return true;
    let routing;
    try {
      routing = resolveMetaClientRouting(state, report);
    } catch {
      return false;
    }
    if (actor.isManager && routing.managerId === memberId) return true;
    if (
      (!report.engagementId && report.status !== 'APPROVED') ||
      routing.marketerId !== memberId ||
      !report.projectId
    )
      return false;
    const project = await manager
      .getRepository(DeliveryProjectEntity)
      .findOneBy({ workspaceId: workspace.id, id: report.projectId });
    return Boolean(project?.memberIds.includes(memberId));
  }

  async snapshot(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
  ) {
    return readDeliveryOperations(
      this.dataSource,
      workspace.id,
      async (state, manager) => {
        const actor = await this.actor(
          workspace,
          memberId,
          userWorkspaceId,
          manager,
        );
        const snapshot = await this.delivery.snapshot(
          workspace,
          memberId,
          userWorkspaceId,
          manager,
        );
        const taskIds = new Set(snapshot.tasks.map((task) => task.id));
        const reportKeys = new Set(
          state.notices
            .filter(
              (notice) =>
                !notice.cancelled && notice.taskId.startsWith('meta-report:'),
            )
            .map((notice) => notice.taskId),
        );
        for (const key of reportKeys) {
          if (
            await this.metaNoticeAllowed(
              state,
              workspace,
              memberId,
              userWorkspaceId,
              key,
              manager,
            )
          )
            taskIds.add(key);
        }
        const bot = await manager
          .getRepository(TelegramConfigEntity)
          .findOneBy({ workspaceId: workspace.id });
        return {
          timezone: state.timezone,
          enabled: state.enabled,
          telegramEnabled: state.telegramEnabled,
          founderId: state.founderId,
          templates: actor.isManager ? state.templates : [],
          fulfilments: state.fulfilments.filter((item) =>
            taskIds.has(item.taskId),
          ),
          notices: state.notices.filter(
            (item) =>
              !item.cancelled &&
              taskIds.has(item.taskId) &&
              (item.recipientId === memberId || actor.isManager),
          ),
          alerts: actor.isAdmin
            ? state.alerts.filter((item) => taskIds.has(item.taskId))
            : [],
          connections: Object.entries(state.connections)
            .filter(([id]) => id === memberId || actor.isAdmin)
            .map(([id, connection]) => ({
              memberId: id,
              linkedAt: connection.linkedAt,
            })),
          botAvailable: Boolean(bot?.isActive && bot.botUsername),
        };
      },
    );
  }

  private notice(
    state: DeliveryOperations,
    taskId: string,
    recipientId: string,
    senderId: string,
    kind: DeliveryNotice['kind'],
    text: string,
    now: Date,
  ) {
    const notice: DeliveryNotice = {
      id: randomUUID(),
      taskId,
      recipientId,
      senderId,
      kind,
      text,
      createdAt: now.toISOString(),
      remindAt: new Date(
        now.getTime() +
          (kind === 'MESSAGE' || kind === 'ASSIGNMENT' ? MINUTES_5 : 0),
      ).toISOString(),
      seenAt: null,
      acknowledgedAt: null,
      cancelled: false,
      sendState: 'PENDING',
      attemptedAt: null,
      error: null,
    };
    state.notices.push(notice);
    return notice;
  }

  async command(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
    now = new Date(),
  ) {
    const parsed = operationsCommandSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException('Check the operation fields and schedule.');
    const command = parsed.data;
    let link: string | null = null;
    await this.transact(workspace.id, async (state, manager) => {
      const actor = await this.actor(
        workspace,
        memberId,
        userWorkspaceId,
        manager,
      );
      const requireManager = () => {
        if (!actor.isManager)
          throw new ForbiddenException('A manager is required.');
      };
      if (command.action === 'settings') {
        if (!actor.isAdmin) throw new ForbiddenException();
        try {
          new Intl.DateTimeFormat('en', { timeZone: command.timezone }).format(
            now,
          );
        } catch {
          throw new BadRequestException('Select a valid IANA timezone.');
        }
        if (command.founderId) {
          const founderUser = await this.active(
            workspace,
            command.founderId,
            manager,
          );
          if (
            !founderUser ||
            !(
              await this.delivery.actor(
                workspace,
                command.founderId,
                founderUser,
                manager,
              )
            ).isAdmin
          )
            throw new BadRequestException(
              'Select an active administrator for founder alerts.',
            );
        }
        const before = {
          timezone: state.timezone,
          enabled: String(state.enabled),
          telegramEnabled: String(state.telegramEnabled),
          founderId: state.founderId,
        };
        Object.assign(state, {
          timezone: command.timezone,
          enabled: command.enabled,
          telegramEnabled: command.telegramEnabled,
          founderId: command.founderId,
        });
        const after = {
          timezone: state.timezone,
          enabled: String(state.enabled),
          telegramEnabled: String(state.telegramEnabled),
          founderId: state.founderId,
        };
        const changes = (Object.keys(after) as (keyof typeof after)[])
          .filter((field) => before[field] !== after[field])
          .map((field) => ({
            field,
            before: before[field],
            after: after[field],
          }));
        if (changes.length)
          await recordOtogrowActivity(manager, {
            workspaceId: workspace.id,
            actorId: memberId,
            category: 'DELIVERY',
            action: 'DELIVERY_SETTINGS_UPDATED',
            outcome: 'RECORDED',
            summary: 'Updated delivery scheduling and reminder settings.',
            sourceType: 'settings',
            sourceId: workspace.id,
            occurredAt: now,
            changes,
          });
        return;
      }
      if (command.action === 'linkTelegram') {
        const bot = await this.telegram.findByWorkspaceId(workspace.id);
        if (
          !bot?.isActive ||
          !bot.botUsername ||
          !/^[a-zA-Z0-9_]+$/.test(bot.botUsername)
        )
          throw new BadRequestException(
            'Ask an admin to configure and test the Telegram bot first.',
          );
        const token = randomBytes(24).toString('hex');
        state.linkTokens = state.linkTokens.filter(
          (item) =>
            item.memberId !== memberId && item.expiresAt > now.toISOString(),
        );
        state.linkTokens.push({
          hash: hashToken(token),
          memberId,
          expiresAt: new Date(now.getTime() + 10 * 60000).toISOString(),
        });
        link = `https://t.me/${bot.botUsername}?start=delivery_${token}`;
        return;
      }
      if (command.action === 'unlinkTelegram') {
        const wasLinked = Boolean(state.connections[memberId]);
        delete state.connections[memberId];
        state.linkTokens = state.linkTokens.filter(
          (item) => item.memberId !== memberId,
        );
        if (wasLinked)
          await recordOtogrowActivity(manager, {
            workspaceId: workspace.id,
            actorId: memberId,
            subjectMemberId: memberId,
            category: 'DELIVERY',
            action: 'TELEGRAM_UNLINKED',
            outcome: 'RECORDED',
            summary: 'Disconnected a Telegram reminder account.',
            sourceType: 'connection',
            sourceId: memberId,
            occurredAt: now,
            changes: [{ field: 'linked', before: 'true', after: 'false' }],
          });
        return;
      }
      if (command.action === 'template') {
        requireManager();
        const template = command.template;
        const existing = template.id
          ? state.templates.find((item) => item.id === template.id)
          : null;
        if (template.id && !existing) throw new NotFoundException();
        if (!existing && state.templates.length >= 100)
          throw new BadRequestException('Maximum 100 recurring templates.');
        const visible = await this.delivery.snapshot(
          workspace,
          memberId,
          userWorkspaceId,
          manager,
        );
        const project = visible.projects.find(
          (item) => item.id === template.projectId,
        );
        if (
          !project?.memberIds.includes(template.fields.assigneeId) ||
          template.fields.assigneeId === template.fields.reviewerId
        )
          throw new BadRequestException(
            'Choose a project member and a separate reviewer.',
          );
        for (const id of [
          template.fields.assigneeId,
          template.fields.reviewerId,
        ])
          if (!(await this.active(workspace, id, manager)))
            throw new BadRequestException('Select active members.');
        const reviewerUser = await this.active(
          workspace,
          template.fields.reviewerId,
          manager,
        );
        if (
          !reviewerUser ||
          !(
            await this.delivery.actor(
              workspace,
              template.fields.reviewerId,
              reviewerUser,
              manager,
            )
          ).isManager
        )
          throw new BadRequestException('The reviewer must be a manager.');
        if (template.workflow)
          await getPublishedDeliveryWorkflow(
            manager,
            workspace.id,
            template.workflow.templateId,
            template.workflow.version,
          );
        const before = existing ? recurrenceActivityFields(existing) : null;
        const saved: Recurrence = existing
          ? Object.assign(existing, template, {
              creatorId: memberId,
              userWorkspaceId,
              error: null,
            })
          : {
              ...template,
              id: randomUUID(),
              creatorId: memberId,
              userWorkspaceId,
              lastDate: null,
              lastTaskId: null,
              skipped: 0,
              error: null,
            };
        if (!existing) state.templates.push(saved);
        const after = recurrenceActivityFields(saved);
        await recordOtogrowActivity(manager, {
          workspaceId: workspace.id,
          actorId: memberId,
          subjectMemberId: saved.fields.assigneeId,
          category: 'DELIVERY',
          action: existing
            ? 'RECURRING_TEMPLATE_UPDATED'
            : 'RECURRING_TEMPLATE_CREATED',
          outcome: 'RECORDED',
          summary: existing
            ? 'Updated recurring work and its assignment schedule.'
            : 'Scheduled recurring work with an assignee and independent reviewer.',
          projectId: saved.projectId,
          sourceType: 'recurrence',
          sourceId: saved.id,
          occurredAt: now,
          changes: (Object.keys(after) as (keyof typeof after)[])
            .filter((field) => before?.[field] !== after[field])
            .map((field) => ({
              field,
              before: before?.[field] ?? null,
              after: after[field],
            })),
        });
        return;
      }
      if (command.action === 'pause') {
        requireManager();
        const template = state.templates.find((item) => item.id === command.id);
        if (!template) throw new NotFoundException();
        if (template.paused === command.paused) return;
        const previousPaused = template.paused;
        template.paused = command.paused;
        await recordOtogrowActivity(manager, {
          workspaceId: workspace.id,
          actorId: memberId,
          subjectMemberId: template.fields.assigneeId,
          category: 'DELIVERY',
          action: command.paused
            ? 'RECURRING_TEMPLATE_PAUSED'
            : 'RECURRING_TEMPLATE_RESUMED',
          outcome: 'RECORDED',
          summary: command.paused
            ? 'Paused a recurring work schedule.'
            : 'Resumed a recurring work schedule.',
          projectId: template.projectId,
          sourceType: 'recurrence',
          sourceId: template.id,
          occurredAt: now,
          changes: [
            {
              field: 'paused',
              before: String(previousPaused),
              after: String(command.paused),
            },
          ],
        });
        return;
      }
      if (command.action === 'resolveAlert') {
        if (!actor.isAdmin) throw new ForbiddenException();
        const alert = state.alerts.find((item) => item.id === command.id);
        if (!alert) throw new NotFoundException();
        const before = alertActivityFields(alert);
        alert.acknowledgedAt = now.toISOString();
        if (command.resolve) alert.resolvedAt = now.toISOString();
        if (
          before.acknowledged === 'false' ||
          (command.resolve && before.resolved === 'false')
        )
          await this.recordAlertActivity(
            manager,
            workspace.id,
            alert,
            memberId,
            command.resolve
              ? 'DELIVERY_ALERT_RESOLVED'
              : 'DELIVERY_ALERT_ACKNOWLEDGED',
            before,
            now,
          );
        for (const notice of state.notices.filter(
          (item) => item.kind === 'ALERT' && item.taskId === alert.taskId,
        ))
          notice.cancelled = true;
        return;
      }
      if (command.action === 'acknowledge' || command.action === 'noticeSeen') {
        const notice = state.notices.find(
          (item) =>
            item.id === command.id &&
            item.recipientId === memberId &&
            !item.cancelled,
        );
        if (!notice) throw new NotFoundException();
        if (notice.taskId.startsWith('meta-report:')) {
          if (
            !(await this.metaNoticeAllowed(
              state,
              workspace,
              memberId,
              userWorkspaceId,
              notice.taskId,
              manager,
            ))
          )
            throw new ForbiddenException();
        } else {
          await this.creative.scope(
            manager,
            workspace,
            memberId,
            userWorkspaceId,
            notice.taskId,
          );
        }
        if (command.action === 'acknowledge')
          notice.acknowledgedAt ??= now.toISOString();
        else notice.seenAt ??= now.toISOString();
        return;
      }
      const scope = await this.creative.scope(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        command.taskId,
      );
      if (command.action === 'seen') {
        if (scope.assigneeId !== memberId) return;
        state.assignments[command.taskId] =
          `${memberId}:${scope.task.details.assignmentAt ?? 'legacy'}`;
        for (const notice of state.notices.filter(
          (item) =>
            item.taskId === command.taskId &&
            item.kind === 'ASSIGNMENT' &&
            item.recipientId === memberId &&
            (!scope.task.details.assignmentAt ||
              item.createdAt === scope.task.details.assignmentAt) &&
            !item.cancelled,
        ))
          notice.seenAt ??= now.toISOString();
        return;
      }
      if (command.action === 'message') {
        const recipientUser = await this.active(
          workspace,
          command.recipientId,
          manager,
        );
        if (!recipientUser)
          throw new BadRequestException('Recipient is no longer active.');
        await this.creative.scope(
          manager,
          workspace,
          command.recipientId,
          recipientUser,
          command.taskId,
        );
        const notice = this.notice(
          state,
          command.taskId,
          command.recipientId,
          memberId,
          'MESSAGE',
          command.text,
          now,
        );
        await recordOtogrowActivity(manager, {
          workspaceId: workspace.id,
          actorId: memberId,
          subjectMemberId: command.recipientId,
          category: 'DELIVERY',
          action: 'TASK_MESSAGE_SENT',
          outcome: 'RECORDED',
          summary: 'Sent a task message to a team member.',
          projectId: scope.task.projectId,
          taskId: command.taskId,
          sourceType: 'notice',
          sourceId: notice.id,
          occurredAt: now,
        });
        return;
      }
      requireManager();
      if (command.action === 'alert') {
        if (!(await this.active(workspace, command.ownerId, manager)))
          throw new BadRequestException('Select an active owner.');
        const current = state.alerts.find(
          (item) =>
            item.taskId === command.taskId &&
            item.category === command.category &&
            !item.resolvedAt,
        );
        const before = current ? alertActivityFields(current) : null;
        if (current)
          Object.assign(current, {
            reason: command.reason,
            severity: command.severity,
            ownerId: command.ownerId,
          });
        else {
          state.alerts.push({
            id: randomUUID(),
            taskId: command.taskId,
            category: command.category,
            severity: command.severity,
            reason: command.reason,
            ownerId: command.ownerId,
            createdAt: now.toISOString(),
            acknowledgedAt: null,
            resolvedAt: null,
          });
          if (state.founderId)
            this.notice(
              state,
              command.taskId,
              state.founderId,
              memberId,
              'ALERT',
              'A manager flagged a delivery issue. Review it in Otogrow.',
              now,
            );
        }
        const alert = current ?? state.alerts[state.alerts.length - 1];
        await this.recordAlertActivity(
          manager,
          workspace.id,
          alert,
          memberId,
          current ? 'DELIVERY_ALERT_UPDATED' : 'DELIVERY_ALERT_CREATED',
          before,
          now,
        );
        return;
      }
      if (scope.assigneeId === memberId)
        throw new ForbiddenException(
          'A different manager must confirm delivery and fulfilment.',
        );
      let fulfilment = state.fulfilments.find(
        (item) => item.taskId === command.taskId,
      );
      const previousFulfilment = {
        fulfilmentStatus: fulfilment?.status ?? null,
        deliveryCycle: fulfilment ? String(fulfilment.cycle) : null,
        nextCheckAt: fulfilment?.nextCheckAt ?? null,
        state: scope.task.details.state,
      };
      if (command.action === 'delivered') {
        if (scope.task.revision !== command.revision)
          throw new ConflictException('Refresh the changed task.');
        if (scope.task.details.state !== 'APPROVED')
          throw new BadRequestException(
            'Approve the work before recording delivery.',
          );
        if (
          fulfilment?.status === 'WAITING' &&
          matchesApprovedDelivery(scope.task.details, fulfilment)
        )
          throw new BadRequestException(
            'Answer the current fulfilment check first.',
          );
        if (!fulfilment) {
          fulfilment = {
            taskId: command.taskId,
            status: 'WAITING',
            deliveredAt: now.toISOString(),
            nextCheckAt: null,
            cycle: 0,
            history: [],
          };
          state.fulfilments.push(fulfilment);
        }
        fulfilment.deliveredSubmissionVersion =
          scope.task.details.submissions[
            scope.task.details.submissions.length - 1
          ]?.version;
        fulfilment.cycle++;
        fulfilment.status = 'WAITING';
        fulfilment.deliveredAt = now.toISOString();
        fulfilment.nextCheckAt = new Date(
          now.getTime() + HOURS_12,
        ).toISOString();
        fulfilment.history.push({
          at: now.toISOString(),
          actorId: memberId,
          action: 'DELIVERED',
          note: command.note,
        });
      } else if (command.action === 'fulfilment') {
        if (
          !fulfilment ||
          fulfilment.cycle !== command.cycle ||
          fulfilment.history.length !== command.historyLength ||
          fulfilment.status !== 'WAITING'
        )
          throw new ConflictException('Refresh the delivery cycle.');
        if (
          command.decision !== 'REDOING' &&
          !matchesApprovedDelivery(scope.task.details, fulfilment)
        )
          throw new ConflictException(
            'The approved version changed. Record its delivery before confirming fulfilment.',
          );
        fulfilment.history.push({
          at: now.toISOString(),
          actorId: memberId,
          action: command.decision,
          note: command.note,
        });
        fulfilment.nextCheckAt =
          command.decision === 'NOT_FULFILLED'
            ? new Date(now.getTime() + HOURS_12).toISOString()
            : null;
        if (command.decision !== 'NOT_FULFILLED')
          fulfilment.status = command.decision;
        if (command.decision === 'REDOING') {
          await recordDeliveryRevision(
            manager,
            scope.task,
            memberId,
            'CLIENT_REDO',
            command.note,
          );
          scope.task.details.state = 'CHANGES_REQUESTED';
          scope.task.details.events.push({
            id: randomUUID(),
            actorId: memberId,
            action: 'REDOING',
            text: command.note,
            at: now.toISOString(),
          });
          scope.task.revision++;
          await manager.getRepository(DeliveryTaskEntity).save(scope.task);
          await manager.query(
            `UPDATE ${this.delivery.schema(workspace)}.task SET status='IN_PROGRESS', "updatedAt"=now() WHERE id=$1`,
            [command.taskId],
          );
        }
      }
      if (
        fulfilment &&
        (command.action === 'delivered' || command.action === 'fulfilment')
      ) {
        await syncDeliveryCommitment(
          manager,
          workspace.id,
          command.taskId,
          scope.task.details,
          fulfilment,
          { actorId: memberId, actorType: 'HUMAN' },
        );
        const currentFulfilment = {
          fulfilmentStatus: fulfilment.status,
          deliveryCycle: String(fulfilment.cycle),
          nextCheckAt: fulfilment.nextCheckAt,
          state: scope.task.details.state,
        };
        await recordOtogrowActivity(manager, {
          workspaceId: workspace.id,
          actorId: memberId,
          subjectMemberId: scope.assigneeId,
          category: 'DELIVERY',
          action:
            command.action === 'delivered'
              ? 'TASK_DELIVERED'
              : 'TASK_FULFILMENT_CHECKED',
          outcome:
            command.action === 'fulfilment' && command.decision === 'FULFILLED'
              ? 'FULFILLED'
              : command.action === 'fulfilment' &&
                  command.decision === 'REDOING'
                ? 'CHANGES_REQUESTED'
                : 'RECORDED',
          summary:
            command.action === 'delivered'
              ? 'Recorded delivery of approved work for fulfilment follow-up.'
              : command.decision === 'FULFILLED'
                ? 'Confirmed that delivered work was fulfilled.'
                : command.decision === 'REDOING'
                  ? 'Reopened delivered work for revision and independent approval.'
                  : 'Recorded that delivered work is not yet fulfilled; follow-up remains scheduled.',
          projectId: scope.task.projectId,
          taskId: command.taskId,
          sourceType: 'delivery',
          sourceId: command.taskId,
          occurredAt: now,
          changes: (
            Object.keys(currentFulfilment) as (keyof typeof currentFulfilment)[]
          )
            .filter(
              (field) => previousFulfilment[field] !== currentFulfilment[field],
            )
            .map((field) => ({
              field,
              before: previousFulfilment[field],
              after: currentFulfilment[field],
            })),
        });
      }
      for (const notice of state.notices.filter(
        (item) => item.kind === 'FULFILMENT' && item.taskId === command.taskId,
      ))
        notice.cancelled = true;
    });
    return {
      ...(await this.snapshot(workspace, memberId, userWorkspaceId)),
      link,
    };
  }

  async handleTelegramUpdate(
    workspaceId: string,
    update: TelegramUpdate,
    now = new Date(),
  ) {
    const message = update.message;
    const match = message?.text?.match(
      /^\/start(?:@\w+)? delivery_([a-f0-9]{48})$/,
    );
    if (!match || !message || message.chat.id <= 0) return;
    const workspace = await this.dataSource
      .getRepository(WorkspaceEntity)
      .findOneBy({ id: workspaceId });
    if (!workspace) return;
    await this.transact(workspaceId, async (state, manager) => {
      const token = state.linkTokens.find(
        (item) =>
          item.hash === hashToken(match[1]) &&
          item.expiresAt > now.toISOString(),
      );
      if (!token || !(await this.active(workspace, token.memberId, manager)))
        return;
      if (
        Object.entries(state.connections).some(
          ([id, connection]) =>
            id !== token.memberId &&
            connection.chatId === String(message.chat.id),
        )
      )
        return;
      const previousConnection = state.connections[token.memberId];
      state.connections[token.memberId] = {
        chatId: String(message.chat.id),
        linkedAt: now.toISOString(),
      };
      if (previousConnection?.chatId !== String(message.chat.id))
        await recordOtogrowActivity(manager, {
          workspaceId,
          actorId: token.memberId,
          subjectMemberId: token.memberId,
          category: 'DELIVERY',
          action: 'TELEGRAM_LINKED',
          outcome: 'RECORDED',
          summary: previousConnection
            ? 'Updated a Telegram reminder connection.'
            : 'Linked a Telegram reminder account.',
          sourceType: 'connection',
          sourceId: token.memberId,
          occurredAt: now,
          changes: previousConnection
            ? []
            : [{ field: 'linked', before: 'false', after: 'true' }],
        });
      state.linkTokens = state.linkTokens.filter(
        (item) => item.hash !== token.hash,
      );
    });
  }

  async tickWorkspace(workspace: WorkspaceEntity, now = new Date()) {
    await this.transact(workspace.id, async (state, manager) => {
      if (!state.enabled) return;
      for (const template of state.templates) {
        const occurrence = latestRecurrence(template, state.timezone, now);
        if (!occurrence) continue;
        try {
          const creator = await this.actor(
            workspace,
            template.creatorId,
            template.userWorkspaceId,
            manager,
          );
          if (!creator.isManager) {
            template.error = 'Template creator no longer has manager access.';
            continue;
          }
          // An invalid occurrence must not leave a task behind when its error is retained.
          const createdTaskId = await manager.transaction(
            async (recurrenceManager) => {
              const taskId = await this.delivery.command(
                workspace,
                template.creatorId,
                template.userWorkspaceId,
                {
                  action: 'create',
                  projectId: template.projectId,
                  workflow: template.workflow ?? null,
                  fields: {
                    ...template.fields,
                    scheduledDate: occurrence.date,
                    dueAt: new Date(
                      now.getTime() + template.dueHours * 3600000,
                    ).toISOString(),
                    checklist: template.fields.checklist.map((item) => ({
                      ...item,
                      id: randomUUID(),
                      done: false,
                    })),
                    evidence: [],
                  },
                },
                recurrenceManager,
                { actorType: 'SYSTEM', actorId: null },
              );
              if (typeof taskId !== 'string')
                throw new Error(
                  'Recurring task creation did not return an identity.',
                );
              return taskId;
            },
          );
          template.lastTaskId = createdTaskId;
          template.lastDate = occurrence.date;
          template.skipped += occurrence.skipped;
          template.error = null;
        } catch (error) {
          if (
            !(
              error instanceof BadRequestException ||
              error instanceof ForbiddenException ||
              error instanceof NotFoundException
            )
          )
            throw error;
          template.error = template.workflow
            ? 'Schedule or service workflow changed. Check staff access and restore the pinned workflow or choose another published version.'
            : 'Assignment or access changed. Edit the template to select active members and reviewer.';
        }
      }
      const tasks: {
        id: string;
        projectId: string;
        assigneeId: string;
        dueAt: string | null;
        details: DeliveryTaskEntity['details'];
      }[] = await manager.query(
        `SELECT t.id,d."projectId",t."assigneeId",t."dueAt",d.details FROM core."deliveryTask" d JOIN ${this.delivery.schema(workspace)}.task t ON t.id=d."taskId" WHERE d."workspaceId"=$1 AND t."deletedAt" IS NULL`,
        [workspace.id],
      );
      for (const task of tasks) {
        const assignmentIdentity = `${task.assigneeId}:${task.details.assignmentAt ?? 'legacy'}`;
        if (state.assignments[task.id] !== assignmentIdentity) {
          for (const notice of state.notices.filter(
            (item) => item.taskId === task.id && item.kind === 'ASSIGNMENT',
          ))
            notice.cancelled = true;
          state.assignments[task.id] = assignmentIdentity;
          if (task.assigneeId)
            this.notice(
              state,
              task.id,
              task.assigneeId,
              task.details.reviewerId,
              'ASSIGNMENT',
              'You have a task assignment to review.',
              task.details.assignmentAt
                ? new Date(task.details.assignmentAt)
                : now,
            );
        }
        const fulfilment = state.fulfilments.find(
          (item) => item.taskId === task.id,
        );
        if (
          fulfilment?.status === 'WAITING' &&
          task.details.state !== 'APPROVED'
        ) {
          const previousCheckAt = fulfilment.nextCheckAt;
          fulfilment.history.push({
            at: now.toISOString(),
            actorId: 'system',
            action: 'REDOING',
            note: 'Production was reopened; revised approval and redelivery are required.',
          });
          fulfilment.status = 'REDOING';
          fulfilment.nextCheckAt = null;
          await recordOtogrowActivity(manager, {
            workspaceId: workspace.id,
            actorId: null,
            actorType: 'SYSTEM',
            subjectMemberId: task.assigneeId,
            category: 'DELIVERY',
            action: 'TASK_REOPENED',
            outcome: 'CHANGES_REQUESTED',
            summary:
              'Reopened fulfilment because production requires renewed approval and delivery.',
            projectId: task.projectId,
            taskId: task.id,
            sourceType: 'delivery',
            sourceId: task.id,
            occurredAt: now,
            changes: [
              {
                field: 'fulfilmentStatus',
                before: 'WAITING',
                after: 'REDOING',
              },
              { field: 'nextCheckAt', before: previousCheckAt, after: null },
            ],
          });
          for (const notice of state.notices.filter(
            (item) => item.taskId === task.id && item.kind === 'FULFILMENT',
          ))
            notice.cancelled = true;
        }
        if (
          fulfilment?.status === 'WAITING' &&
          fulfilment.nextCheckAt &&
          fulfilment.nextCheckAt <= now.toISOString()
        ) {
          for (const notice of state.notices.filter(
            (item) =>
              item.taskId === task.id &&
              item.kind === 'FULFILMENT' &&
              item.recipientId !== task.details.reviewerId,
          ))
            notice.cancelled = true;
          const existing = state.notices.find(
            (item) =>
              item.taskId === task.id &&
              item.kind === 'FULFILMENT' &&
              !item.cancelled,
          );
          if (!existing)
            this.notice(
              state,
              task.id,
              task.details.reviewerId,
              task.details.reviewerId,
              'FULFILMENT',
              'Has the delivered work been fulfilled? Choose fulfilled, not fulfilled, or redoing.',
              now,
            );
        }
        const overdue =
          task.dueAt &&
          new Date(task.dueAt).getTime() < now.getTime() &&
          (!fulfilment || fulfilment.status === 'REDOING');
        const sourceKey = `${task.id}:${task.dueAt}:${fulfilment?.cycle ?? 0}`;
        if (
          overdue &&
          !state.alerts.some(
            (item) =>
              item.taskId === task.id &&
              item.category === 'LATE' &&
              item.sourceKey === sourceKey,
          )
        ) {
          state.alerts.push({
            id: randomUUID(),
            taskId: task.id,
            category: 'LATE',
            sourceKey,
            severity: 'URGENT',
            reason: 'The delivery deadline passed without recorded delivery.',
            ownerId: task.details.reviewerId,
            createdAt: now.toISOString(),
            acknowledgedAt: null,
            resolvedAt: null,
          });
          await this.recordAlertActivity(
            manager,
            workspace.id,
            state.alerts[state.alerts.length - 1],
            null,
            'DELIVERY_ALERT_CREATED',
            null,
            now,
          );
          if (state.founderId)
            this.notice(
              state,
              task.id,
              state.founderId,
              task.details.reviewerId,
              'ALERT',
              'A delivery deadline passed. Review the task in Otogrow.',
              now,
            );
        }
      }
    });
  }

  async dispatchWorkspace(workspace: WorkspaceEntity, now = new Date()) {
    const queuedIds = await this.transact(
      workspace.id,
      async (state, manager) => {
        if (!state.enabled) return [];
        const outbox = manager.getRepository(DeliveryReminderOutboxEntity);
        let queuedCount = 0;
        for (const notice of state.notices) {
          if (
            notice.sendState === 'SENDING' &&
            notice.attemptedAt &&
            new Date(notice.attemptedAt).getTime() <
              now.getTime() - DELIVERY_REMINDER_CLAIM_TIMEOUT
          ) {
            notice.sendState = 'UNCERTAIN';
            notice.error =
              'Worker interrupted after claiming send. Check Telegram before any manual follow-up; no automatic resend.';
            await outbox.update(
              {
                workspaceId: workspace.id,
                noticeId: notice.id,
                status: 'SENDING',
              },
              {
                status: 'UNCERTAIN',
                finishedAt: now,
                error: notice.error,
              },
            );
          }
          if (
            notice.sendState !== 'PENDING' ||
            notice.remindAt > now.toISOString()
          )
            continue;
          if (notice.cancelled || notice.seenAt || notice.acknowledgedAt) {
            notice.sendState = 'SUPPRESSED';
            continue;
          }
          if (
            !state.telegramEnabled ||
            !state.connections[notice.recipientId]
          ) {
            notice.sendState = 'UNCONFIGURED';
            notice.error =
              'Telegram is disabled or recipient is not linked. The OS notification remains available.';
            continue;
          }
          if (queuedCount >= 20) continue;
          const existing = await outbox.findOneBy({
            workspaceId: workspace.id,
            noticeId: notice.id,
          });
          if (existing) {
            notice.sendState = existing.status;
            notice.attemptedAt = existing.attemptedAt?.toISOString() ?? null;
            notice.error = existing.error;
            continue;
          }
          await outbox.insert({
            workspaceId: workspace.id,
            noticeId: notice.id,
            status: 'QUEUED',
          });
          notice.sendState = 'QUEUED';
          notice.error = null;
          queuedCount++;
        }
        return (
          await outbox.find({
            where: { workspaceId: workspace.id, status: 'QUEUED' },
            order: { createdAt: 'ASC' },
            take: 20,
          })
        ).map((entry) => entry.id);
      },
    );
    for (const outboxId of queuedIds) await this.enqueueReminder(outboxId);
  }

  async enqueueReminder(outboxId: string) {
    try {
      await this.queue.add(
        DELIVERY_REMINDER_JOB,
        { outboxId },
        {
          id: `delivery-reminder-${outboxId}`,
          retryLimit: 2,
          backoff: { strategy: 'exponential', initialDelayMilliseconds: 1000 },
        },
      );
    } catch {
      this.logger.warn(
        'Telegram reminder queue is unavailable; the durable outbox will retry enqueueing.',
      );
    }
  }

  async claimReminder(outboxId: string, now = new Date()) {
    const initial = await this.dataSource
      .getRepository(DeliveryReminderOutboxEntity)
      .findOneBy({ id: outboxId });
    if (!initial || initial.status !== 'QUEUED') return null;
    const workspace = await this.dataSource
      .getRepository(WorkspaceEntity)
      .findOneBy({ id: initial.workspaceId });
    if (!workspace) return null;
    return this.transact(workspace.id, async (state, manager) => {
      const repository = manager.getRepository(DeliveryReminderOutboxEntity);
      const entry = await repository.findOneBy({
        id: outboxId,
        workspaceId: workspace.id,
        status: 'QUEUED',
      });
      if (!entry) return null;
      const notice = state.notices.find((item) => item.id === entry.noticeId);
      const finish = async (
        status: 'SUPPRESSED' | 'UNCONFIGURED',
        error: string | null = null,
      ) => {
        entry.status = status;
        entry.finishedAt = now;
        entry.error = error;
        if (notice) {
          notice.sendState = status;
          notice.error = error;
        }
        await repository.save(entry);
        return null;
      };
      if (
        !notice ||
        notice.sendState !== 'QUEUED' ||
        notice.cancelled ||
        notice.seenAt ||
        notice.acknowledgedAt ||
        !state.enabled ||
        !state.telegramEnabled
      )
        return finish('SUPPRESSED');
      try {
        const userWorkspaceId = await this.active(
          workspace,
          notice.recipientId,
          manager,
        );
        if (!userWorkspaceId) return finish('SUPPRESSED');
        const isMetaReport = notice.taskId.startsWith('meta-report:');
        if (
          isMetaReport &&
          !(await this.metaNoticeAllowed(
            state,
            workspace,
            notice.recipientId,
            userWorkspaceId,
            notice.taskId,
            manager,
          ))
        )
          return finish('SUPPRESSED');
        const scope = isMetaReport
          ? null
          : await this.creative.scope(
              manager,
              workspace,
              notice.recipientId,
              userWorkspaceId,
              notice.taskId,
            );
        if (
          (notice.kind === 'ASSIGNMENT' &&
            (scope?.assigneeId !== notice.recipientId ||
              (scope?.task.details.assignmentAt &&
                scope.task.details.assignmentAt !== notice.createdAt))) ||
          (notice.kind === 'ALERT' && !scope?.actor.isAdmin) ||
          (notice.kind === 'FULFILMENT' &&
            (!scope?.actor.isManager ||
              scope.task.details.reviewerId !== notice.recipientId))
        )
          return finish('SUPPRESSED');
        const bot = await this.telegram.findByWorkspaceId(workspace.id);
        const connection = state.connections[notice.recipientId];
        if (!bot?.isActive || !connection)
          return finish(
            'UNCONFIGURED',
            'Bot or recipient connection unavailable.',
          );
        const base =
          this.config.get('FRONTEND_URL') ?? this.config.get('SERVER_URL');
        const url = new URL('/delivery', base);
        if (isMetaReport) url.searchParams.set('view', 'ads');
        else url.searchParams.set('task', notice.taskId);
        const botToken = this.telegram.decryptBotToken(bot);
        entry.status = 'SENDING';
        entry.attemptedAt = now;
        notice.sendState = 'SENDING';
        notice.attemptedAt = now.toISOString();
        await repository.save(entry);
        return {
          botToken,
          chatId: connection.chatId,
          text: `Otogrow: ${notice.kind === 'MESSAGE' ? 'An internal task message needs your attention.' : notice.kind === 'ASSIGNMENT' ? 'A task assignment needs your attention.' : 'A delivery check needs your attention.'}\n${url}`,
        };
      } catch (error) {
        if (
          error instanceof ForbiddenException ||
          error instanceof NotFoundException
        )
          return finish('SUPPRESSED');
        throw error;
      }
    });
  }

  async finishReminder(
    outboxId: string,
    status: Extract<DeliveryReminderState, 'SENT' | 'FAILED' | 'UNCERTAIN'>,
    error: string | null,
    now = new Date(),
    expiredBefore?: Date,
  ) {
    const initial = await this.dataSource
      .getRepository(DeliveryReminderOutboxEntity)
      .findOneBy({ id: outboxId });
    if (!initial || initial.status !== 'SENDING') return;
    await this.transact(initial.workspaceId, async (state, manager) => {
      const repository = manager.getRepository(DeliveryReminderOutboxEntity);
      const entry = await repository.findOneBy({
        id: outboxId,
        workspaceId: initial.workspaceId,
        status: 'SENDING',
      });
      if (
        !entry ||
        (expiredBefore &&
          (!entry.attemptedAt || entry.attemptedAt >= expiredBefore))
      )
        return;
      entry.status = status;
      entry.error = error;
      entry.finishedAt = now;
      const notice = state.notices.find((item) => item.id === entry.noticeId);
      if (notice) {
        notice.sendState = status;
        notice.error = error;
      }
      await repository.save(entry);
    });
  }

  @Cron('* * * * *')
  async tick() {
    const records = await this.dataSource
      .getRepository(DeliveryOperationsEntity)
      .find();
    for (const record of records.filter((item) => item.state.enabled)) {
      try {
        const workspace = await this.dataSource
          .getRepository(WorkspaceEntity)
          .findOneBy({ id: record.workspaceId });
        if (!workspace) continue;
        await this.tickWorkspace(workspace);
        await this.dispatchWorkspace(workspace);
      } catch {
        this.logger.warn(
          `Delivery scheduler could not process workspace ${record.workspaceId}.`,
        );
      }
    }
  }
}
