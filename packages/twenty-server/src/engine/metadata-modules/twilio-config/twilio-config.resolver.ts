import { ForbiddenException, UseGuards } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';

import { PermissionFlagType } from 'twenty-shared/constants';
import { isDefined } from 'twenty-shared/utils';

import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { TwilioDriver } from 'src/engine/core-modules/twenty-config/enums/twilio-driver.enum';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { AuthWorkspaceMemberId } from 'src/engine/decorators/auth/auth-workspace-member-id.decorator';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { TwilioConfigDTO } from 'src/engine/metadata-modules/twilio-config/dtos/twilio-config.dto';
import { UpsertTwilioConfigInput } from 'src/engine/metadata-modules/twilio-config/dtos/upsert-twilio-config.input';
import { TwilioConfigEntity } from 'src/engine/metadata-modules/twilio-config/entities/twilio-config.entity';
import { TwilioCallingProvisioningService } from 'src/engine/metadata-modules/twilio-config/services/twilio-calling-provisioning.service';
import { TwilioClientService } from 'src/engine/metadata-modules/twilio-config/services/twilio-client.service';
import { TwilioVoiceTokenService } from 'src/engine/metadata-modules/twilio-config/services/twilio-voice-token.service';
import { TwilioConfigService } from 'src/engine/metadata-modules/twilio-config/twilio-config.service';

type TwilioConnectionTestResult = {
  success: boolean;
  message: string | null;
};

@UseGuards(WorkspaceAuthGuard)
@MetadataResolver(() => TwilioConfigDTO)
export class TwilioConfigResolver {
  constructor(
    private readonly twilioConfigService: TwilioConfigService,
    private readonly twilioClientService: TwilioClientService,
    private readonly twentyConfigService: TwentyConfigService,
    private readonly twilioCallingProvisioningService: TwilioCallingProvisioningService,
    private readonly twilioVoiceTokenService: TwilioVoiceTokenService,
  ) {}

  @Query(() => TwilioConfigDTO, { nullable: true })
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.API_KEYS_AND_WEBHOOKS))
  async twilioConfig(
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<TwilioConfigDTO | null> {
    const config = await this.twilioConfigService.findByWorkspaceId(
      workspace.id,
    );

    return isDefined(config) ? this.toDTO(config) : null;
  }

  @Mutation(() => TwilioConfigDTO)
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.API_KEYS_AND_WEBHOOKS))
  async upsertTwilioConfig(
    @Args('input') input: UpsertTwilioConfigInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<TwilioConfigDTO> {
    const config = await this.twilioConfigService.upsert(input, workspace.id);

    return this.toDTO(config);
  }

  @Mutation(() => TwilioConfigDTO)
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.API_KEYS_AND_WEBHOOKS))
  async deleteTwilioConfig(
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<TwilioConfigDTO> {
    const config = await this.twilioConfigService.delete(workspace.id);

    return this.toDTO(config);
  }

  @Mutation(() => Boolean)
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.API_KEYS_AND_WEBHOOKS))
  async testTwilioConnection(
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<boolean> {
    const result = await this.testConnection(workspace.id);

    return result.success;
  }

  @Mutation(() => TwilioConfigDTO)
  @UseGuards(SettingsPermissionGuard(PermissionFlagType.API_KEYS_AND_WEBHOOKS))
  async provisionTwilioCalling(
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<TwilioConfigDTO> {
    const config = await this.twilioCallingProvisioningService.provisionCalling(
      workspace.id,
    );

    return this.toDTO(config);
  }

  // Every workspace member may place calls; the voice token carries no
  // settings privileges.
  @Mutation(() => String)
  @UseGuards(NoPermissionGuard)
  async generateTwilioVoiceToken(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() workspaceMemberId: string | undefined,
  ): Promise<string> {
    if (!isDefined(workspaceMemberId)) {
      throw new ForbiddenException(
        'A workspace member token is required to place calls',
      );
    }

    return this.twilioVoiceTokenService.generateVoiceToken({
      workspaceId: workspace.id,
      workspaceMemberId,
    });
  }

  private async testConnection(
    workspaceId: string,
  ): Promise<TwilioConnectionTestResult> {
    if (this.twentyConfigService.get('TWILIO_DRIVER') === TwilioDriver.LOGGER) {
      return { success: true, message: null };
    }

    const client = await this.twilioClientService.getClient(workspaceId);

    if (!isDefined(client)) {
      return { success: false, message: 'Twilio is not configured' };
    }

    const config =
      await this.twilioConfigService.findByWorkspaceId(workspaceId);

    if (!isDefined(config)) {
      return { success: false, message: 'Twilio is not configured' };
    }

    try {
      await client.api.v2010.accounts(config.accountSid).fetch();

      return { success: true, message: null };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private toDTO(config: TwilioConfigEntity): TwilioConfigDTO {
    const authToken = this.twilioConfigService.decryptAuthToken(config);

    return {
      id: config.id,
      accountSid: config.accountSid,
      hasAuthToken: true,
      authTokenLastFour: authToken.slice(-4),
      whatsappSenderNumber: config.whatsappSenderNumber,
      smsNumber: config.smsNumber,
      voiceNumber: config.voiceNumber,
      callingEnabled:
        isDefined(config.apiKeySid) &&
        isDefined(config.twimlAppSid) &&
        isDefined(config.apiKeySecret),
      isActive: config.isActive,
      workspaceId: config.workspaceId,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }
}
