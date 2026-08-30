import { Injectable, Logger } from '@nestjs/common';

import { isNonEmptyString } from '@sniptt/guards';
import { type CountryCode, parsePhoneNumberWithError } from 'libphonenumber-js';
import { FieldActorSource } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { v4 } from 'uuid';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { CreatePersonService } from 'src/modules/contact-creation-manager/services/create-person.service';
import {
  type ChannelMessageChannel,
  type ChannelMessageStatus,
} from 'src/modules/messaging/channels/constants/channel-message.constant';
import { ChannelMessageTimelineService } from 'src/modules/messaging/channels/services/channel-message-timeline.service';
import { ChannelMessageWorkspaceEntity } from 'src/modules/messaging/channels/standard-objects/channel-message.workspace-entity';
import { getE164MatchVariants } from 'src/modules/messaging/channels/utils/normalize-phone-number.util';
import { PersonWorkspaceEntity } from 'src/modules/person/standard-objects/person.workspace-entity';

const TWILIO_STATUS_TO_CHANNEL_MESSAGE_STATUS: Record<
  string,
  ChannelMessageStatus
> = {
  accepted: 'QUEUED',
  scheduled: 'QUEUED',
  queued: 'QUEUED',
  sending: 'QUEUED',
  sent: 'SENT',
  delivered: 'DELIVERED',
  read: 'DELIVERED',
  receiving: 'RECEIVED',
  received: 'RECEIVED',
  failed: 'FAILED',
  undelivered: 'FAILED',
};

@Injectable()
export class ChannelMessageWebhookService {
  private readonly logger = new Logger(ChannelMessageWebhookService.name);

  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly createPersonService: CreatePersonService,
    private readonly channelMessageTimelineService: ChannelMessageTimelineService,
  ) {}

  async handleInbound({
    workspaceId,
    channel,
    from,
    to,
    body,
    externalId,
  }: {
    workspaceId: string;
    channel: ChannelMessageChannel;
    from: string;
    to: string;
    body: string;
    externalId: string | null;
  }): Promise<void> {
    const personId = await this.findOrCreatePersonId(workspaceId, from);
    const channelMessageId = v4();
    const receivedAt = new Date();

    const inserted =
      await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        async () => {
          const channelMessageRepository =
            await this.globalWorkspaceOrmManager.getRepository(
              workspaceId,
              ChannelMessageWorkspaceEntity,
              { shouldBypassPermissionChecks: true },
            );

          if (isNonEmptyString(externalId)) {
            const existing = await channelMessageRepository.findOne({
              where: { externalId, direction: 'INBOUND' },
            });

            // Twilio retries webhook delivery on non-2xx; the message must not
            // be duplicated when the retry comes in.
            if (isDefined(existing)) {
              return false;
            }
          }

          await channelMessageRepository.insert({
            id: channelMessageId,
            channel,
            direction: 'INBOUND',
            fromNumber: from,
            toNumber: to,
            body,
            externalId,
            status: 'RECEIVED',
            sentAt: null,
            receivedAt,
            errorMessage: null,
            personId,
            sequenceEnrollmentId: null,
          });

          return true;
        },
        buildSystemAuthContext(workspaceId),
      );

    if (!inserted) {
      return;
    }

    if (isDefined(personId)) {
      await this.channelMessageTimelineService.upsertPersonChannelMessageActivity(
        {
          workspaceId,
          personId,
          channelMessageId,
        },
      );
    }
  }

  async handleStatusUpdate({
    workspaceId,
    externalId,
    twilioStatus,
    errorMessage,
  }: {
    workspaceId: string;
    externalId: string;
    twilioStatus: string;
    errorMessage: string | null;
  }): Promise<void> {
    const status = TWILIO_STATUS_TO_CHANNEL_MESSAGE_STATUS[twilioStatus];

    if (!isDefined(status)) {
      this.logger.warn(
        `Unknown Twilio message status '${twilioStatus}' for ${externalId}`,
      );

      return;
    }

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const channelMessageRepository =
        await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          ChannelMessageWorkspaceEntity,
          { shouldBypassPermissionChecks: true },
        );

      await channelMessageRepository.update(
        { externalId, direction: 'OUTBOUND' },
        {
          status,
          ...(status === 'FAILED' && isNonEmptyString(errorMessage)
            ? { errorMessage }
            : {}),
        },
      );
    }, buildSystemAuthContext(workspaceId));
  }

  private async findOrCreatePersonId(
    workspaceId: string,
    fromNumber: string,
  ): Promise<string | null> {
    const variants = getE164MatchVariants(fromNumber);

    if (!isDefined(variants)) {
      this.logger.warn(
        `Could not parse inbound number '${fromNumber}' as E.164`,
      );

      return null;
    }

    const existingPersonId =
      await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        async () => {
          const personRepository =
            await this.globalWorkspaceOrmManager.getRepository(
              workspaceId,
              PersonWorkspaceEntity,
              { shouldBypassPermissionChecks: true },
            );

          const person = await personRepository
            .createQueryBuilder('person')
            .where(
              '(person.phonesPrimaryPhoneNumber = :nationalNumber AND person.phonesPrimaryPhoneCallingCode IN (:...callingCodes))',
              {
                nationalNumber: variants.nationalNumber,
                callingCodes: [
                  `+${variants.countryCallingCode}`,
                  variants.countryCallingCode,
                ],
              },
            )
            .orWhere(
              'person.phonesPrimaryPhoneNumber IN (:...fullNumberVariants)',
              {
                fullNumberVariants: [
                  variants.e164,
                  variants.e164.slice(1),
                  variants.nationalNumber,
                ],
              },
            )
            .getOne();

          return person?.id ?? null;
        },
        buildSystemAuthContext(workspaceId),
      );

    if (isDefined(existingPersonId)) {
      return existingPersonId;
    }

    const parsed = parsePhoneNumberWithError(variants.e164);
    const createdPeople = await this.createPersonService.createPeople(
      [
        {
          name: { firstName: '', lastName: '' },
          emails: { primaryEmail: '', additionalEmails: null },
          phones: {
            primaryPhoneNumber: variants.nationalNumber,
            primaryPhoneCountryCode: (parsed.country ?? '') as CountryCode,
            primaryPhoneCallingCode: `+${variants.countryCallingCode}`,
            additionalPhones: null,
          },
          createdBy: {
            source: FieldActorSource.WEBHOOK,
            workspaceMemberId: null,
            name: 'Twilio webhook',
            context: {},
          },
        },
      ],
      workspaceId,
    );

    const createdPersonId = createdPeople[0]?.id;

    return isNonEmptyString(createdPersonId) ? createdPersonId : null;
  }
}
