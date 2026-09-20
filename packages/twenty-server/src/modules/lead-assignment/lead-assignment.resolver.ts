import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';

import { PermissionFlagType } from 'twenty-shared/constants';
import { isDefined } from 'twenty-shared/utils';

import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { SetterProfileDTO } from 'src/modules/lead-assignment/dtos/setter-profile.dto';
import { TelegramConfigDTO } from 'src/modules/lead-assignment/dtos/telegram-config.dto';
import { UpsertSetterProfileInput } from 'src/modules/lead-assignment/dtos/upsert-setter-profile.input';
import { UpsertTelegramConfigInput } from 'src/modules/lead-assignment/dtos/upsert-telegram-config.input';
import { TelegramConfigEntity } from 'src/modules/lead-assignment/entities/telegram-config.entity';
import { SetterProfileService } from 'src/modules/lead-assignment/services/setter-profile.service';
import { TelegramConfigService } from 'src/modules/lead-assignment/services/telegram-config.service';
import { TelegramService } from 'src/modules/lead-assignment/services/telegram.service';
import { WorkspaceMemberWorkspaceEntity } from 'src/modules/workspace-member/standard-objects/workspace-member.workspace-entity';

const DEFAULT_ACTIVE_DAYS = '1,2,3,4,5';
const DEFAULT_ACTIVE_START_HOUR = 9;
const DEFAULT_ACTIVE_END_HOUR = 18;

@UseGuards(WorkspaceAuthGuard)
@MetadataResolver(() => SetterProfileDTO)
export class LeadAssignmentResolver {
  constructor(
    private readonly setterProfileService: SetterProfileService,
    private readonly telegramConfigService: TelegramConfigService,
    private readonly telegramService: TelegramService,
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  @Query(() => [SetterProfileDTO])
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.API_KEYS_AND_WEBHOOKS))
  async setterProfiles(
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<SetterProfileDTO[]> {
    const profiles = await this.setterProfileService.findByWorkspaceId(
      workspace.id,
    );

    const authContext = buildSystemAuthContext(workspace.id);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const workspaceMemberRepository =
          await this.globalWorkspaceOrmManager.getRepository(
            workspace.id,
            WorkspaceMemberWorkspaceEntity,
            { shouldBypassPermissionChecks: true },
          );

        const workspaceMembers = await workspaceMemberRepository.find();

        return workspaceMembers.map((member) => {
          const profile = profiles.find(
            (candidate) => candidate.workspaceMemberId === member.id,
          );

          return {
            id: profile?.id ?? null,
            workspaceMemberId: member.id,
            memberName:
              [member.name?.firstName, member.name?.lastName]
                .filter(Boolean)
                .join(' ') ||
              member.userEmail ||
              'Unknown member',
            memberEmail: member.userEmail ?? null,
            isSetter: profile?.isSetter ?? false,
            activeDays: profile?.activeDays ?? DEFAULT_ACTIVE_DAYS,
            activeStartHour:
              profile?.activeStartHour ?? DEFAULT_ACTIVE_START_HOUR,
            activeEndHour: profile?.activeEndHour ?? DEFAULT_ACTIVE_END_HOUR,
            dailyLeadCap: profile?.dailyLeadCap ?? null,
            hasTelegramChatId: isDefined(profile?.telegramChatId),
            createdAt: profile?.createdAt ?? new Date(),
            updatedAt: profile?.updatedAt ?? new Date(),
          };
        });
      },
      authContext,
    );
  }

  @Mutation(() => SetterProfileDTO)
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.API_KEYS_AND_WEBHOOKS))
  async upsertSetterProfile(
    @Args('input') input: UpsertSetterProfileInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<SetterProfileDTO> {
    const profile = await this.setterProfileService.upsert(input, workspace.id);

    return {
      id: profile.id,
      workspaceMemberId: profile.workspaceMemberId,
      memberName: '',
      memberEmail: null,
      isSetter: profile.isSetter,
      activeDays: profile.activeDays,
      activeStartHour: profile.activeStartHour,
      activeEndHour: profile.activeEndHour,
      dailyLeadCap: profile.dailyLeadCap,
      hasTelegramChatId: isDefined(profile.telegramChatId),
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }

  @Query(() => TelegramConfigDTO, { nullable: true })
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.API_KEYS_AND_WEBHOOKS))
  async telegramConfig(
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<TelegramConfigDTO | null> {
    const config = await this.telegramConfigService.findByWorkspaceId(
      workspace.id,
    );

    return isDefined(config) ? this.toTelegramConfigDTO(config) : null;
  }

  @Mutation(() => TelegramConfigDTO)
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.API_KEYS_AND_WEBHOOKS))
  async upsertTelegramConfig(
    @Args('input') input: UpsertTelegramConfigInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<TelegramConfigDTO> {
    const config = await this.telegramConfigService.upsert(input, workspace.id);

    return this.toTelegramConfigDTO(config);
  }

  @Mutation(() => TelegramConfigDTO)
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.API_KEYS_AND_WEBHOOKS))
  async deleteTelegramConfig(
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<TelegramConfigDTO> {
    const config = await this.telegramConfigService.delete(workspace.id);

    return this.toTelegramConfigDTO(config);
  }

  @Mutation(() => Boolean)
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.API_KEYS_AND_WEBHOOKS))
  async testTelegramConnection(
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<boolean> {
    const config = await this.telegramConfigService.findByWorkspaceId(
      workspace.id,
    );

    if (!isDefined(config)) {
      return false;
    }

    try {
      const botToken = this.telegramConfigService.decryptBotToken(config);
      const botInfo = await this.telegramService.getMe(botToken);

      // The bot username is what the t.me deep links are built from; capture
      // it from getMe so the user does not have to type it
      if (botInfo.username !== config.botUsername) {
        await this.telegramConfigService.upsert(
          { botUsername: botInfo.username },
          workspace.id,
        );
      }

      return true;
    } catch {
      return false;
    }
  }

  private toTelegramConfigDTO(config: TelegramConfigEntity): TelegramConfigDTO {
    const botToken = this.telegramConfigService.decryptBotToken(config);

    return {
      id: config.id,
      hasBotToken: true,
      botTokenLastFour: botToken.slice(-4),
      botUsername: config.botUsername,
      isActive: config.isActive,
      workspaceId: config.workspaceId,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }
}
