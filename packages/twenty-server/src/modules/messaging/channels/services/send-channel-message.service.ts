import { Injectable } from '@nestjs/common';

import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';
import { v4 } from 'uuid';

import { TwilioDriver } from 'src/engine/core-modules/twenty-config/enums/twilio-driver.enum';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { TwilioConfigService } from 'src/engine/metadata-modules/twilio-config/twilio-config.service';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { type ChannelMessageChannel } from 'src/modules/messaging/channels/constants/channel-message.constant';
import { ChannelMessageDriverFactory } from 'src/modules/messaging/channels/drivers/channel-message-driver.factory';
import { ChannelMessageTimelineService } from 'src/modules/messaging/channels/services/channel-message-timeline.service';
import { ChannelMessageWorkspaceEntity } from 'src/modules/messaging/channels/standard-objects/channel-message.workspace-entity';
import { normalizeToE164 } from 'src/modules/messaging/channels/utils/normalize-phone-number.util';

// Sender placeholder so the LOGGER driver works without any Twilio config.
const LOGGER_FALLBACK_SENDER_NUMBER = '+15550000000';

export type SendChannelMessageArgs = {
  workspaceId: string;
  personId: string | null;
  channel: ChannelMessageChannel;
  toNumber: string;
  body: string;
  templateName?: string | null;
  templateParams?: Record<string, string> | null;
  sequenceEnrollmentId?: string | null;
};

@Injectable()
export class SendChannelMessageService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly channelMessageDriverFactory: ChannelMessageDriverFactory,
    private readonly twilioConfigService: TwilioConfigService,
    private readonly channelMessageTimelineService: ChannelMessageTimelineService,
    private readonly twentyConfigService: TwentyConfigService,
  ) {}

  async send({
    workspaceId,
    personId,
    channel,
    toNumber,
    body,
    templateName,
    templateParams,
    sequenceEnrollmentId,
  }: SendChannelMessageArgs): Promise<ChannelMessageWorkspaceEntity> {
    const normalizedToNumber = normalizeToE164(toNumber);

    if (!isDefined(normalizedToNumber)) {
      throw new Error(`Invalid recipient phone number '${toNumber}'`);
    }

    const fromNumber = await this.resolveSenderNumber(workspaceId, channel);
    const driver = this.channelMessageDriverFactory.getCurrentDriver();

    const sendResult = await driver.send({
      workspaceId,
      channel,
      fromNumber,
      toNumber: normalizedToNumber,
      body,
      contentSid: isNonEmptyString(templateName) ? templateName : null,
      contentVariables: templateParams ?? null,
    });

    const channelMessageId = v4();
    const sentAt = new Date();

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const channelMessageRepository =
        await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          ChannelMessageWorkspaceEntity,
          { shouldBypassPermissionChecks: true },
        );

      await channelMessageRepository.insert({
        id: channelMessageId,
        channel,
        direction: 'OUTBOUND',
        fromNumber,
        toNumber: normalizedToNumber,
        body,
        externalId: sendResult.externalId,
        status: sendResult.status,
        sentAt,
        receivedAt: null,
        errorMessage: null,
        personId,
        sequenceEnrollmentId: sequenceEnrollmentId ?? null,
      });
    }, buildSystemAuthContext(workspaceId));

    if (isDefined(personId)) {
      await this.channelMessageTimelineService.upsertPersonChannelMessageActivity(
        {
          workspaceId,
          personId,
          channelMessageId,
        },
      );
    }

    return {
      id: channelMessageId,
      channel,
      direction: 'OUTBOUND',
      fromNumber,
      toNumber: normalizedToNumber,
      body,
      externalId: sendResult.externalId,
      status: sendResult.status,
      sentAt,
      receivedAt: null,
      errorMessage: null,
      personId,
      sequenceEnrollmentId: sequenceEnrollmentId ?? null,
    } as ChannelMessageWorkspaceEntity;
  }

  private async resolveSenderNumber(
    workspaceId: string,
    channel: ChannelMessageChannel,
  ): Promise<string> {
    const config =
      await this.twilioConfigService.findByWorkspaceId(workspaceId);

    const configuredNumber =
      channel === 'WHATSAPP' ? config?.whatsappSenderNumber : config?.smsNumber;

    if (isNonEmptyString(configuredNumber)) {
      const normalizedSender = normalizeToE164(configuredNumber);

      if (isDefined(normalizedSender)) {
        return normalizedSender;
      }
    }

    if (this.twentyConfigService.get('TWILIO_DRIVER') === TwilioDriver.LOGGER) {
      return LOGGER_FALLBACK_SENDER_NUMBER;
    }

    throw new Error(
      channel === 'WHATSAPP'
        ? 'Twilio WhatsApp sender number is not configured for this workspace'
        : 'Twilio SMS number is not configured for this workspace',
    );
  }
}
