import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isDefined, isValidUuid } from 'twenty-shared/utils';
import { type Repository } from 'typeorm';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { type UpsertSetterProfileInput } from 'src/modules/lead-assignment/dtos/upsert-setter-profile.input';
import { SetterProfileEntity } from 'src/modules/lead-assignment/entities/setter-profile.entity';
import { WorkspaceMemberWorkspaceEntity } from 'src/modules/workspace-member/standard-objects/workspace-member.workspace-entity';

const DEFAULT_ACTIVE_DAYS = '1,2,3,4,5';
const DEFAULT_ACTIVE_START_HOUR = 9;
const DEFAULT_ACTIVE_END_HOUR = 18;

@Injectable()
export class SetterProfileService {
  constructor(
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository -- every method receives an explicit workspaceId; no ambient workspace context
    @InjectRepository(SetterProfileEntity)
    private readonly setterProfileRepository: Repository<SetterProfileEntity>,
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async findByWorkspaceId(workspaceId: string): Promise<SetterProfileEntity[]> {
    return this.setterProfileRepository.find({ where: { workspaceId } });
  }

  async findByWorkspaceMember(
    workspaceId: string,
    workspaceMemberId: string,
  ): Promise<SetterProfileEntity | null> {
    return this.setterProfileRepository.findOne({
      where: { workspaceId, workspaceMemberId },
    });
  }

  async upsert(
    input: UpsertSetterProfileInput,
    workspaceId: string,
  ): Promise<SetterProfileEntity> {
    const existing = await this.findByWorkspaceMember(
      workspaceId,
      input.workspaceMemberId,
    );

    if (isDefined(existing)) {
      return this.setterProfileRepository.save({
        ...existing,
        isSetter: input.isSetter,
        activeDays: input.activeDays,
        activeStartHour: input.activeStartHour,
        activeEndHour: input.activeEndHour,
        dailyLeadCap: input.dailyLeadCap ?? null,
      });
    }

    return this.setterProfileRepository.save({
      workspaceId,
      workspaceMemberId: input.workspaceMemberId,
      isSetter: input.isSetter,
      activeDays: input.activeDays,
      activeStartHour: input.activeStartHour,
      activeEndHour: input.activeEndHour,
      dailyLeadCap: input.dailyLeadCap ?? null,
    });
  }

  async setTelegramChatId(
    workspaceId: string,
    workspaceMemberId: string,
    telegramChatId: string,
  ): Promise<SetterProfileEntity | null> {
    if (!isValidUuid(workspaceMemberId)) {
      return null;
    }

    const existing = await this.findByWorkspaceMember(
      workspaceId,
      workspaceMemberId,
    );

    if (isDefined(existing)) {
      return this.setterProfileRepository.save({
        ...existing,
        telegramChatId,
      });
    }

    const memberExists = await this.workspaceMemberExists(
      workspaceId,
      workspaceMemberId,
    );

    if (!memberExists) {
      return null;
    }

    return this.setterProfileRepository.save({
      workspaceId,
      workspaceMemberId,
      isSetter: false,
      activeDays: DEFAULT_ACTIVE_DAYS,
      activeStartHour: DEFAULT_ACTIVE_START_HOUR,
      activeEndHour: DEFAULT_ACTIVE_END_HOUR,
      dailyLeadCap: null,
      telegramChatId,
    });
  }

  private async workspaceMemberExists(
    workspaceId: string,
    workspaceMemberId: string,
  ): Promise<boolean> {
    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const workspaceMemberRepository =
          await this.globalWorkspaceOrmManager.getRepository(
            workspaceId,
            WorkspaceMemberWorkspaceEntity,
            { shouldBypassPermissionChecks: true },
          );

        const member = await workspaceMemberRepository.findOne({
          where: { id: workspaceMemberId },
        });

        return isDefined(member);
      },
      authContext,
    );
  }

  async updateLastAssignedAt(id: string, lastAssignedAt: Date): Promise<void> {
    await this.setterProfileRepository.update(id, { lastAssignedAt });
  }
}
