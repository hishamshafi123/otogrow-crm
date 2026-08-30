import { Injectable, Logger, type Type } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isNonEmptyString } from '@sniptt/guards';
import { IsNull, MoreThan, type ObjectLiteral, type Repository } from 'typeorm';
import { ApiPath } from 'twenty-shared/types';
import { isDefined, parseJson } from 'twenty-shared/utils';

import { InjectCacheStorage } from 'src/engine/core-modules/cache-storage/decorators/cache-storage.decorator';
import { CacheStorageService } from 'src/engine/core-modules/cache-storage/services/cache-storage.service';
import { CacheStorageNamespace } from 'src/engine/core-modules/cache-storage/types/cache-storage-namespace.enum';
import { compileOutboundEmailContent } from 'src/engine/core-modules/email/utils/compile-outbound-email-content.util';
import { UnsubscribeTokenService } from 'src/engine/core-modules/emailing-domain/services/unsubscribe-token.service';
import { UnsubscribeTopicVisibility } from 'src/engine/core-modules/emailing-domain/types/unsubscribe-topic-visibility.type';
import { appendHtmlFooter } from 'src/engine/core-modules/emailing-domain/utils/append-html-footer.util';
import { buildUnsubscribeHtmlFooter } from 'src/engine/core-modules/emailing-domain/utils/build-unsubscribe-html-footer.util';
import { buildUnsubscribeTextFooter } from 'src/engine/core-modules/emailing-domain/utils/build-unsubscribe-text-footer.util';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { type ComposedEmail } from 'src/engine/core-modules/tool/tools/email-tool/types/composed-email.type';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { TwilioConfigService } from 'src/engine/metadata-modules/twilio-config/twilio-config.service';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { CampaignVariableService } from 'src/modules/emailing/services/campaign-variable.service';
import { MessageSuppressionService } from 'src/modules/emailing/services/message-suppression.service';
import { UnsubscribeTopicService } from 'src/modules/emailing/services/unsubscribe-topic.service';
import { compileCampaignEmailContent } from 'src/modules/emailing/utils/compile-campaign-email-content.util';
import { renderCampaignTemplate } from 'src/modules/emailing/utils/render-campaign-template.util';
import { type SequenceStepChannel } from 'src/modules/messaging/channels/constants/channel-message.constant';
import { SendChannelMessageService } from 'src/modules/messaging/channels/services/send-channel-message.service';
import { ChannelMessageWorkspaceEntity } from 'src/modules/messaging/channels/standard-objects/channel-message.workspace-entity';
import { computeWhatsappFreeFormWindowStart } from 'src/modules/messaging/channels/utils/compute-whatsapp-free-form-window-start.util';
import { buildE164FromPhones } from 'src/modules/messaging/channels/utils/normalize-phone-number.util';
import { MessageWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message.workspace-entity';
import { SendEmailService } from 'src/modules/messaging/message-outbound-manager/services/send-email.service';
import { PersonWorkspaceEntity } from 'src/modules/person/standard-objects/person.workspace-entity';
import {
  SEND_SEQUENCE_STEP_JOB,
  SEQUENCES_UNSUBSCRIBE_TOPIC_NAME,
  SEQUENCE_DAILY_COUNTER_TTL_MS,
  SEQUENCE_SEND_ATTEMPT_COUNTER_TTL_MS,
  SEQUENCE_SEND_RETRY_LIMIT,
} from 'src/modules/sequences/constants/sequence.constant';
import { type SequenceDelayUnit } from 'src/modules/sequences/constants/sequence-delay-unit.constant';
import { SequenceEnrollmentWorkspaceEntity } from 'src/modules/sequences/standard-objects/sequence-enrollment.workspace-entity';
import { SequenceStepWorkspaceEntity } from 'src/modules/sequences/standard-objects/sequence-step.workspace-entity';
import { SequenceWorkspaceEntity } from 'src/modules/sequences/standard-objects/sequence.workspace-entity';
import { SequenceReplyDetectionService } from 'src/modules/sequences/services/sequence-reply-detection.service';
import { type SendSequenceStepJobData } from 'src/modules/sequences/types/send-sequence-step-job-data.type';
import {
  computeNextBusinessDayStart,
  computeSequenceNextSendAt,
} from 'src/modules/sequences/utils/compute-sequence-next-send-at.util';
import { type WorkspaceMemberWorkspaceEntity } from 'src/modules/workspace-member/standard-objects/workspace-member.workspace-entity';

@Injectable()
export class SequenceSendService {
  private readonly logger = new Logger(SequenceSendService.name);

  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly campaignVariableService: CampaignVariableService,
    private readonly messageSuppressionService: MessageSuppressionService,
    private readonly unsubscribeTopicService: UnsubscribeTopicService,
    private readonly unsubscribeTokenService: UnsubscribeTokenService,
    private readonly sendEmailService: SendEmailService,
    private readonly sendChannelMessageService: SendChannelMessageService,
    private readonly twilioConfigService: TwilioConfigService,
    private readonly sequenceReplyDetectionService: SequenceReplyDetectionService,
    private readonly twentyConfigService: TwentyConfigService,
    @InjectRepository(ConnectedAccountEntity)
    private readonly connectedAccountRepository: Repository<ConnectedAccountEntity>,
    @InjectRepository(UserWorkspaceEntity)
    private readonly userWorkspaceRepository: Repository<UserWorkspaceEntity>,
    @InjectCacheStorage(CacheStorageNamespace.ModuleEmailing)
    private readonly cacheStorageService: CacheStorageService,
    @InjectMessageQueue(MessageQueue.emailQueue)
    private readonly messageQueueService: MessageQueueService,
  ) {}

  private getSystemRepository<T extends ObjectLiteral>(
    workspaceId: string,
    entity: Type<T>,
  ) {
    return this.globalWorkspaceOrmManager.getRepository(workspaceId, entity, {
      shouldBypassPermissionChecks: true,
    });
  }

  async processSendJob({
    workspaceId,
    enrollmentId,
  }: SendSequenceStepJobData): Promise<void> {
    try {
      await this.processSendJobOrThrow({ workspaceId, enrollmentId });
      await this.cacheStorageService.del(this.attemptCounterKey(enrollmentId));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const attempts = await this.cacheStorageService.incrBy(
        this.attemptCounterKey(enrollmentId),
        1,
      );

      await this.cacheStorageService.expire(
        this.attemptCounterKey(enrollmentId),
        SEQUENCE_SEND_ATTEMPT_COUNTER_TTL_MS,
      );

      const isFinalAttempt = attempts >= SEQUENCE_SEND_RETRY_LIMIT;

      await this.recordSendError({
        workspaceId,
        enrollmentId,
        errorMessage,
        isFinalAttempt,
      });

      if (isFinalAttempt) {
        this.logger.warn(
          `Sequence enrollment ${enrollmentId} parked in ERROR after ${attempts} attempts: ${errorMessage}`,
        );

        return;
      }

      throw error;
    }
  }

  private async processSendJobOrThrow({
    workspaceId,
    enrollmentId,
  }: SendSequenceStepJobData): Promise<void> {
    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const enrollmentRepository = await this.getSystemRepository(
        workspaceId,
        SequenceEnrollmentWorkspaceEntity,
      );

      const enrollment = await enrollmentRepository.findOne({
        where: { id: enrollmentId },
      });

      if (!isDefined(enrollment) || enrollment.status !== 'ACTIVE') {
        return;
      }

      // The scheduler cron re-enqueues due enrollments on top of the delayed
      // job enqueued by the previous step; this guard makes duplicates
      // harmless.
      if (
        isDefined(enrollment.nextSendAt) &&
        enrollment.nextSendAt.getTime() > Date.now()
      ) {
        return;
      }

      const sequenceRepository = await this.getSystemRepository(
        workspaceId,
        SequenceWorkspaceEntity,
      );

      const sequence = await sequenceRepository.findOne({
        where: { id: enrollment.sequenceId },
      });

      if (!isDefined(sequence) || sequence.status !== 'ACTIVE') {
        return;
      }

      const stepRepository = await this.getSystemRepository(
        workspaceId,
        SequenceStepWorkspaceEntity,
      );

      const steps = await stepRepository.find({
        where: { sequenceId: sequence.id },
        order: { stepPosition: 'ASC' },
      });

      const step = steps.find(
        (candidate) => candidate.stepPosition > enrollment.currentStepPosition,
      );

      if (!isDefined(step)) {
        await enrollmentRepository.update(enrollmentId, {
          status: 'COMPLETED',
          nextSendAt: null,
        });

        return;
      }

      const personRepository = await this.getSystemRepository(
        workspaceId,
        PersonWorkspaceEntity,
      );

      const person = await personRepository.findOne({
        where: { id: enrollment.personId },
      });

      if (!isDefined(person)) {
        await this.failEnrollment(enrollmentRepository, {
          enrollmentId,
          status: 'ERROR',
          errorMessage: 'Enrolled person is missing',
        });

        return;
      }

      // Steps created before channels existed have no channel set; they are
      // the original email steps.
      const stepChannel = (step.channel ?? 'EMAIL') as SequenceStepChannel;

      let recipientEmail: string | null = null;
      let normalizedEmail: string | null = null;
      let channelRecipientNumber: string | null = null;

      if (stepChannel === 'EMAIL') {
        recipientEmail = person.emails?.primaryEmail ?? null;

        if (!isNonEmptyString(recipientEmail)) {
          await this.failEnrollment(enrollmentRepository, {
            enrollmentId,
            status: 'ERROR',
            errorMessage: 'Enrolled person has no primary email',
          });

          return;
        }

        normalizedEmail = recipientEmail.trim().toLowerCase();

        const globallySuppressed =
          await this.messageSuppressionService.getSuppressedAddresses(
            workspaceId,
            [normalizedEmail],
          );
        const topicSuppressed = isNonEmptyString(sequence.unsubscribeTopicId)
          ? await this.messageSuppressionService.getTopicSuppressedAddresses(
              workspaceId,
              [normalizedEmail],
              sequence.unsubscribeTopicId,
            )
          : new Set<string>();

        // Suppression is email-only: WhatsApp/SMS have no unsubscribe
        // topic mechanism here.
        if (
          globallySuppressed.has(normalizedEmail) ||
          topicSuppressed.has(normalizedEmail)
        ) {
          await enrollmentRepository.update(enrollmentId, {
            status: 'UNSUBSCRIBED',
            nextSendAt: null,
          });

          return;
        }
      } else {
        channelRecipientNumber = buildE164FromPhones(person.phones);

        if (!isDefined(channelRecipientNumber)) {
          await this.failEnrollment(enrollmentRepository, {
            enrollmentId,
            status: 'ERROR',
            errorMessage: `Enrolled person has no phone number for ${stepChannel} step`,
          });

          return;
        }
      }

      if (
        isDefined(enrollment.lastSentAt) &&
        (await this.sequenceReplyDetectionService.hasRepliedSince({
          workspaceId,
          personId: person.id,
          since: enrollment.lastSentAt,
        }))
      ) {
        await enrollmentRepository.update(enrollmentId, {
          status: 'REPLIED',
          nextSendAt: null,
        });

        return;
      }

      let dailyCounterKey: string | null = null;
      let lastSentHeaderMessageId: string | undefined;
      let threadExternalId: string | undefined;

      if (stepChannel === 'EMAIL') {
        const connectedAccount = await this.resolveSenderConnectedAccount({
          workspaceId,
          ownerWorkspaceMemberId: sequence.ownerId,
        });

        if (typeof connectedAccount === 'string') {
          await this.failEnrollment(enrollmentRepository, {
            enrollmentId,
            status: 'ERROR',
            errorMessage: connectedAccount,
          });

          return;
        }

        dailyCounterKey = this.dailyCounterKey(
          workspaceId,
          connectedAccount.id,
        );

        if (
          await this.requeueIfDailyCapReached({
            workspaceId,
            enrollmentId,
            sequence,
            dailyCounterKey,
            enrollmentRepository,
          })
        ) {
          return;
        }

        const variables =
          await this.campaignVariableService.buildVariablesForPerson(
            workspaceId,
            person,
          );
        const subject = renderCampaignTemplate(
          step.subject ?? sequence.name,
          variables,
          { escapeValues: false },
        );
        const compiledContent = await this.compileStepBody(
          step.body ?? '',
          variables,
        );

        const unsubscribeTopicId = await this.ensureUnsubscribeTopicId({
          workspaceId,
          sequenceRepository,
          sequence,
        });

        const token = this.unsubscribeTokenService.sign({
          workspaceId,
          emailAddress: normalizedEmail as string,
          unsubscribeTopicId,
        });
        const unsubscribeWebUrl = `${this.twentyConfigService.get('SERVER_URL')}/${ApiPath.Emailing}/unsubscribe?t=${token}`;

        const messageChannel = connectedAccount.messageChannels.find(
          (channel) => channel.handle === connectedAccount.handle,
        );

        const recipientEmailAddress = recipientEmail as string;

        const composedEmail: ComposedEmail = {
          recipients: { to: [recipientEmailAddress], cc: [], bcc: [] },
          toRecipientsDisplay: recipientEmailAddress,
          sanitizedSubject: subject,
          plainTextBody: `${compiledContent.plainText}${buildUnsubscribeTextFooter(unsubscribeWebUrl)}`,
          sanitizedHtmlBody: appendHtmlFooter(
            compiledContent.html,
            buildUnsubscribeHtmlFooter(unsubscribeWebUrl),
          ),
          attachments: [],
          connectedAccount,
          messageChannelId: messageChannel?.id,
          shouldPersistMessage: isDefined(messageChannel),
          ...(enrollment.currentStepPosition > 0 &&
          isNonEmptyString(enrollment.lastSentHeaderMessageId)
            ? { inReplyTo: enrollment.lastSentHeaderMessageId }
            : {}),
          ...(isNonEmptyString(enrollment.threadExternalId)
            ? { threadExternalId: enrollment.threadExternalId }
            : {}),
        };

        const sendResult =
          await this.sendEmailService.sendComposedEmail(composedEmail);

        const persistedMessage = composedEmail.shouldPersistMessage
          ? await this.sendEmailService.persistSentMessage(
              sendResult,
              composedEmail,
              workspaceId,
            )
          : undefined;

        if (isDefined(persistedMessage)) {
          const messageRepository = await this.getSystemRepository(
            workspaceId,
            MessageWorkspaceEntity,
          );

          await messageRepository.update(persistedMessage.messageId, {
            sequenceEnrollmentId: enrollmentId,
          });
        }

        lastSentHeaderMessageId = isNonEmptyString(sendResult.headerMessageId)
          ? sendResult.headerMessageId
          : undefined;
        threadExternalId = isNonEmptyString(sendResult.threadExternalId)
          ? sendResult.threadExternalId
          : undefined;
      } else {
        const twilioConfig =
          await this.twilioConfigService.findByWorkspaceId(workspaceId);

        if (!isDefined(twilioConfig) || !twilioConfig.isActive) {
          await this.failEnrollment(enrollmentRepository, {
            enrollmentId,
            status: 'ERROR',
            errorMessage: 'Twilio is not configured for this workspace',
          });

          return;
        }

        dailyCounterKey = this.channelDailyCounterKey(workspaceId, stepChannel);

        if (
          await this.requeueIfDailyCapReached({
            workspaceId,
            enrollmentId,
            sequence,
            dailyCounterKey,
            enrollmentRepository,
          })
        ) {
          return;
        }

        let templateName: string | null = null;
        let templateParams: Record<string, string> | null = null;

        if (stepChannel === 'WHATSAPP') {
          const isWithinFreeFormWindow =
            await this.hasInboundWhatsappWithinWindow({
              workspaceId,
              personId: person.id,
            });

          if (!isWithinFreeFormWindow) {
            if (!isNonEmptyString(step.whatsappTemplateName)) {
              await this.failEnrollment(enrollmentRepository, {
                enrollmentId,
                status: 'ERROR',
                errorMessage:
                  'No inbound WhatsApp message from this person in the last 24 hours; the step must set whatsappTemplateName to send outside the window',
              });

              return;
            }

            templateName = step.whatsappTemplateName;

            if (isNonEmptyString(step.whatsappTemplateParams)) {
              const parsedParams = parseJson<Record<string, string>>(
                step.whatsappTemplateParams,
              );

              if (!isDefined(parsedParams)) {
                await this.failEnrollment(enrollmentRepository, {
                  enrollmentId,
                  status: 'ERROR',
                  errorMessage: 'whatsappTemplateParams is not valid JSON',
                });

                return;
              }

              templateParams = parsedParams;
            }
          }
        }

        const variables =
          await this.campaignVariableService.buildVariablesForPerson(
            workspaceId,
            person,
          );
        const body = renderCampaignTemplate(step.body ?? '', variables, {
          escapeValues: false,
        });

        await this.sendChannelMessageService.send({
          workspaceId,
          personId: person.id,
          channel: stepChannel,
          toNumber: channelRecipientNumber as string,
          body,
          templateName,
          templateParams,
          sequenceEnrollmentId: enrollmentId,
        });
      }

      const nextStep = steps.find(
        (candidate) => candidate.stepPosition > step.stepPosition,
      );
      const sentAt = new Date();
      const nextSendAt = isDefined(nextStep)
        ? computeSequenceNextSendAt({
            delayValue: nextStep.delayValue,
            delayUnit: nextStep.delayUnit as SequenceDelayUnit,
            businessHoursTimeZone: sequence.businessHoursTimeZone,
            from: sentAt,
          })
        : null;

      await enrollmentRepository.update(enrollmentId, {
        currentStepPosition: step.stepPosition,
        lastSentAt: sentAt,
        lastError: null,
        ...(isDefined(lastSentHeaderMessageId)
          ? { lastSentHeaderMessageId }
          : {}),
        ...(isDefined(threadExternalId) ? { threadExternalId } : {}),
        ...(isDefined(nextSendAt)
          ? { nextSendAt }
          : { status: 'COMPLETED', nextSendAt: null }),
      });

      if (
        isDefined(dailyCounterKey) &&
        isDefined(sequence.dailySendCap) &&
        sequence.dailySendCap > 0
      ) {
        const sentCount = await this.cacheStorageService.incrBy(
          dailyCounterKey,
          1,
        );

        if (sentCount === 1) {
          await this.cacheStorageService.expire(
            dailyCounterKey,
            SEQUENCE_DAILY_COUNTER_TTL_MS,
          );
        }
      }

      if (isDefined(nextSendAt)) {
        await this.enqueueSendStepJob({
          workspaceId,
          enrollmentId,
          nextSendAt,
        });
      }
    }, buildSystemAuthContext(workspaceId));
  }

  private async requeueIfDailyCapReached({
    workspaceId,
    enrollmentId,
    sequence,
    dailyCounterKey,
    enrollmentRepository,
  }: {
    workspaceId: string;
    enrollmentId: string;
    sequence: SequenceWorkspaceEntity;
    dailyCounterKey: string;
    enrollmentRepository: Awaited<
      ReturnType<SequenceSendService['getSystemRepository']>
    >;
  }): Promise<boolean> {
    if (!isDefined(sequence.dailySendCap) || sequence.dailySendCap <= 0) {
      return false;
    }

    const sentToday =
      (await this.cacheStorageService.get<number>(dailyCounterKey)) ?? 0;

    if (sentToday < sequence.dailySendCap) {
      return false;
    }

    const requeueAt = computeNextBusinessDayStart(
      sequence.businessHoursTimeZone,
    );

    await enrollmentRepository.update(enrollmentId, {
      nextSendAt: requeueAt,
    });
    await this.enqueueSendStepJob({
      workspaceId,
      enrollmentId,
      nextSendAt: requeueAt,
    });

    return true;
  }

  private async hasInboundWhatsappWithinWindow({
    workspaceId,
    personId,
  }: {
    workspaceId: string;
    personId: string;
  }): Promise<boolean> {
    const channelMessageRepository = await this.getSystemRepository(
      workspaceId,
      ChannelMessageWorkspaceEntity,
    );

    const inboundCount = await channelMessageRepository.count({
      where: {
        personId,
        channel: 'WHATSAPP',
        direction: 'INBOUND',
        receivedAt: MoreThan(computeWhatsappFreeFormWindowStart(new Date())),
      },
    });

    return inboundCount > 0;
  }

  // The sender is the sequence owner's first connected account, mirroring the
  // workflow email action sender resolution.
  private async resolveSenderConnectedAccount({
    workspaceId,
    ownerWorkspaceMemberId,
  }: {
    workspaceId: string;
    ownerWorkspaceMemberId: string | null;
  }): Promise<ConnectedAccountEntity | string> {
    if (!isDefined(ownerWorkspaceMemberId)) {
      return 'Sequence has no owner workspace member';
    }

    const workspaceMemberRepository =
      await this.globalWorkspaceOrmManager.getRepository<WorkspaceMemberWorkspaceEntity>(
        workspaceId,
        'workspaceMember',
        { shouldBypassPermissionChecks: true },
      );

    const workspaceMember = await workspaceMemberRepository.findOne({
      where: { id: ownerWorkspaceMemberId },
    });

    if (!isDefined(workspaceMember)) {
      return `Sequence owner workspace member '${ownerWorkspaceMemberId}' not found`;
    }

    const userWorkspace = await this.userWorkspaceRepository.findOne({
      where: { userId: workspaceMember.userId, workspaceId },
    });

    if (!isDefined(userWorkspace)) {
      return `No user workspace found for sequence owner '${ownerWorkspaceMemberId}'`;
    }

    const connectedAccount = await this.connectedAccountRepository.findOne({
      where: {
        userWorkspaceId: userWorkspace.id,
        workspaceId,
        archivedAt: IsNull(),
      },
      order: { createdAt: 'ASC' },
      relations: { messageChannels: true },
    });

    if (!isDefined(connectedAccount)) {
      return `No connected account found for sequence owner '${ownerWorkspaceMemberId}'`;
    }

    if (isDefined(connectedAccount.authFailedAt)) {
      return `Connected account '${connectedAccount.handle}' needs re-authentication`;
    }

    return connectedAccount;
  }

  private async ensureUnsubscribeTopicId({
    workspaceId,
    sequenceRepository,
    sequence,
  }: {
    workspaceId: string;
    sequenceRepository: Awaited<
      ReturnType<SequenceSendService['getSystemRepository']>
    >;
    sequence: SequenceWorkspaceEntity;
  }): Promise<string> {
    if (isNonEmptyString(sequence.unsubscribeTopicId)) {
      return sequence.unsubscribeTopicId;
    }

    const topics =
      await this.unsubscribeTopicService.getUnsubscribeTopics(workspaceId);
    const existingTopic = topics.find(
      (topic) => topic.name === SEQUENCES_UNSUBSCRIBE_TOPIC_NAME,
    );

    const topic =
      existingTopic ??
      (await this.unsubscribeTopicService.createUnsubscribeTopic(workspaceId, {
        name: SEQUENCES_UNSUBSCRIBE_TOPIC_NAME,
        description: 'Email sequences',
        visibility: UnsubscribeTopicVisibility.PUBLIC,
      }));

    await sequenceRepository.update(sequence.id, {
      unsubscribeTopicId: topic.id,
    });

    return topic.id;
  }

  private async compileStepBody(
    bodyTemplate: string,
    variables: Record<string, string>,
  ): Promise<{ html: string; plainText: string }> {
    if (bodyTemplate.trim() === '') {
      return { html: '', plainText: '' };
    }

    // Step bodies written by the campaign editor are canonical email
    // documents; hand-written bodies fall back to markdown/plain text.
    try {
      return await compileCampaignEmailContent(bodyTemplate, variables);
    } catch {
      return compileOutboundEmailContent(
        renderCampaignTemplate(bodyTemplate, variables, {
          escapeValues: false,
        }),
      );
    }
  }

  private async failEnrollment(
    enrollmentRepository: Awaited<
      ReturnType<SequenceSendService['getSystemRepository']>
    >,
    {
      enrollmentId,
      status,
      errorMessage,
    }: {
      enrollmentId: string;
      status: 'ERROR';
      errorMessage: string;
    },
  ): Promise<void> {
    await enrollmentRepository.update(enrollmentId, {
      status,
      lastError: errorMessage,
      nextSendAt: null,
    });
  }

  private async recordSendError({
    workspaceId,
    enrollmentId,
    errorMessage,
    isFinalAttempt,
  }: {
    workspaceId: string;
    enrollmentId: string;
    errorMessage: string;
    isFinalAttempt: boolean;
  }): Promise<void> {
    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const enrollmentRepository = await this.getSystemRepository(
        workspaceId,
        SequenceEnrollmentWorkspaceEntity,
      );

      await enrollmentRepository.update(enrollmentId, {
        lastError: errorMessage,
        ...(isFinalAttempt ? { status: 'ERROR', nextSendAt: null } : {}),
      });
    }, buildSystemAuthContext(workspaceId));
  }

  private async enqueueSendStepJob({
    workspaceId,
    enrollmentId,
    nextSendAt,
  }: {
    workspaceId: string;
    enrollmentId: string;
    nextSendAt: Date;
  }): Promise<void> {
    await this.messageQueueService.add<SendSequenceStepJobData>(
      SEND_SEQUENCE_STEP_JOB,
      { workspaceId, enrollmentId },
      {
        delay: Math.max(0, nextSendAt.getTime() - Date.now()),
        retryLimit: SEQUENCE_SEND_RETRY_LIMIT,
      },
    );
  }

  private attemptCounterKey(enrollmentId: string): string {
    return `sequence-send-attempts:${enrollmentId}`;
  }

  private dailyCounterKey(
    workspaceId: string,
    connectedAccountId: string,
  ): string {
    return `sequence-daily-send:${workspaceId}:${connectedAccountId}:${new Date()
      .toISOString()
      .slice(0, 10)}`;
  }

  private channelDailyCounterKey(
    workspaceId: string,
    channel: SequenceStepChannel,
  ): string {
    return `sequence-daily-send:${workspaceId}:channel:${channel}:${new Date()
      .toISOString()
      .slice(0, 10)}`;
  }
}
