import { ForbiddenException, Injectable, Logger } from '@nestjs/common';

import { isNonEmptyString } from '@sniptt/guards';
import { type CountryCode, parsePhoneNumberWithError } from 'libphonenumber-js';
import { FieldActorSource } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { v4 } from 'uuid';
import { isUUID } from 'class-validator';

import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import {
  PermissionsException,
  PermissionsExceptionCode,
} from 'src/engine/metadata-modules/permissions/permissions.exception';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { CallWorkspaceEntity } from 'src/modules/calling/standard-objects/call.workspace-entity';
import {
  TERMINAL_CALL_STATUSES,
  TWILIO_CALL_STATUS_TO_CALL_STATUS,
} from 'src/modules/calling/constants/call.constant';
import { CallTimelineService } from 'src/modules/calling/services/call-timeline.service';
import { CreatePersonService } from 'src/modules/contact-creation-manager/services/create-person.service';
import { getE164MatchVariants } from 'src/modules/messaging/channels/utils/normalize-phone-number.util';
import { PersonWorkspaceEntity } from 'src/modules/person/standard-objects/person.workspace-entity';

@Injectable()
export class CallLogService {
  private readonly logger = new Logger(CallLogService.name);

  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly createPersonService: CreatePersonService,
    private readonly callTimelineService: CallTimelineService,
  ) {}

  async upsertOutboundCall({
    workspaceId,
    callSid,
    fromNumber,
    toNumber,
    personId,
    callerAuthContext,
  }: {
    workspaceId: string;
    callSid: string;
    fromNumber: string;
    toNumber: string;
    personId: string | null;
    callerAuthContext: UserWorkspaceAuthContext;
  }): Promise<{ callId: string | null; created: boolean }> {
    if (callerAuthContext.workspace.id !== workspaceId)
      throw new ForbiddenException('Contact is not available for this call.');
    if (isDefined(personId)) {
      if (!isUUID(personId))
        throw new ForbiddenException('Contact is not available for this call.');
      const person =
        await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
          async () => {
            const repository =
              await this.globalWorkspaceOrmManager.getRepository(
                workspaceId,
                PersonWorkspaceEntity,
              );
            return repository.findOne({
              where: { id: personId },
              select: { id: true },
            });
          },
          callerAuthContext,
        );
      if (!isDefined(person))
        throw new ForbiddenException('Contact is not available for this call.');
    }
    const resolvedPersonId =
      personId ??
      (await this.findPersonIdByPhone(
        workspaceId,
        toNumber,
        callerAuthContext,
      ));

    return this.insertCallIfAbsent({
      workspaceId,
      callSid,
      direction: 'OUTBOUND',
      fromNumber,
      toNumber,
      personId: resolvedPersonId,
      callerAuthContext,
    });
  }

  async handleInboundCall({
    workspaceId,
    callSid,
    fromNumber,
    toNumber,
  }: {
    workspaceId: string;
    callSid: string;
    fromNumber: string;
    toNumber: string;
  }): Promise<{ callId: string | null; created: boolean }> {
    const personId = await this.findOrCreatePersonId(workspaceId, fromNumber);

    const { callId, created } = await this.insertCallIfAbsent({
      workspaceId,
      callSid,
      direction: 'INBOUND',
      fromNumber,
      toNumber,
      personId,
    });

    if (!created) {
      return { callId, created };
    }

    if (isDefined(personId) && isDefined(callId)) {
      await this.callTimelineService.upsertPersonCallActivity({
        workspaceId,
        personId,
        callId,
      });
    }

    return { callId, created };
  }

  async updateCallStatus({
    workspaceId,
    callSid,
    twilioStatus,
    callDurationSeconds,
    errorMessage,
  }: {
    workspaceId: string;
    callSid: string;
    twilioStatus: string;
    callDurationSeconds: number | null;
    errorMessage: string | null;
  }): Promise<void> {
    const status = TWILIO_CALL_STATUS_TO_CALL_STATUS[twilioStatus];

    if (!isDefined(status)) {
      this.logger.warn(
        `Unknown Twilio call status '${twilioStatus}' for ${callSid}`,
      );

      return;
    }

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const callRepository = await this.globalWorkspaceOrmManager.getRepository(
        workspaceId,
        CallWorkspaceEntity,
        { shouldBypassPermissionChecks: true },
      );

      const now = new Date();

      await callRepository.update(
        { externalId: callSid },
        {
          status,
          ...(status === 'IN_PROGRESS' ? { answeredAt: now } : {}),
          ...(TERMINAL_CALL_STATUSES.includes(status) ? { endedAt: now } : {}),
          ...(status === 'COMPLETED' && isDefined(callDurationSeconds)
            ? { durationSeconds: callDurationSeconds }
            : {}),
          ...(status === 'FAILED' && isNonEmptyString(errorMessage)
            ? { errorMessage }
            : {}),
        },
      );
    }, buildSystemAuthContext(workspaceId));
  }

  async attachRecording({
    workspaceId,
    callSid,
    recordingSid,
    recordingDurationSeconds,
  }: {
    workspaceId: string;
    callSid: string;
    recordingSid: string;
    recordingDurationSeconds: number | null;
  }): Promise<void> {
    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const callRepository = await this.globalWorkspaceOrmManager.getRepository(
        workspaceId,
        CallWorkspaceEntity,
        { shouldBypassPermissionChecks: true },
      );

      await callRepository.update(
        { externalId: callSid },
        {
          recordingSid,
          ...(isDefined(recordingDurationSeconds)
            ? { durationSeconds: recordingDurationSeconds }
            : {}),
        },
      );
    }, buildSystemAuthContext(workspaceId));
  }

  private async insertCallIfAbsent({
    workspaceId,
    callSid,
    direction,
    fromNumber,
    toNumber,
    personId,
    callerAuthContext,
  }: {
    workspaceId: string;
    callSid: string;
    direction: 'INBOUND' | 'OUTBOUND';
    fromNumber: string;
    toNumber: string;
    personId: string | null;
    callerAuthContext?: UserWorkspaceAuthContext;
  }): Promise<{ callId: string | null; created: boolean }> {
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const callRepository =
          await this.globalWorkspaceOrmManager.getRepository(
            workspaceId,
            CallWorkspaceEntity,
            { shouldBypassPermissionChecks: true },
          );

        // Twilio retries webhook delivery on non-2xx; the call must not be
        // duplicated when the retry comes in.
        const existing = await callRepository.findOne({
          where: { externalId: callSid },
        });

        if (isDefined(existing)) {
          return { callId: existing.id, created: false };
        }

        const companyId = isDefined(personId)
          ? await this.findPersonCompanyId(
              workspaceId,
              personId,
              callerAuthContext,
            )
          : null;

        const callId = v4();

        await callRepository.insert({
          id: callId,
          direction,
          status: 'INITIATED',
          fromNumber,
          toNumber,
          durationSeconds: null,
          startedAt: new Date(),
          answeredAt: null,
          endedAt: null,
          externalId: callSid,
          recordingSid: null,
          errorMessage: null,
          personId,
          companyId,
        });

        return { callId, created: true };
      },
      buildSystemAuthContext(workspaceId),
    );
  }

  private async findPersonCompanyId(
    workspaceId: string,
    personId: string,
    callerAuthContext?: UserWorkspaceAuthContext,
  ): Promise<string | null> {
    return this.globalWorkspaceOrmManager
      .executeInWorkspaceContext(
        async () => {
          const personRepository =
            await this.globalWorkspaceOrmManager.getRepository(
              workspaceId,
              PersonWorkspaceEntity,
              isDefined(callerAuthContext)
                ? undefined
                : { shouldBypassPermissionChecks: true },
            );

          const person = await personRepository.findOne({
            where: { id: personId },
            select: { companyId: true },
          });

          return person?.companyId ?? null;
        },
        callerAuthContext ?? buildSystemAuthContext(workspaceId),
      )
      .catch((error: unknown) => {
        if (
          isDefined(callerAuthContext) &&
          error instanceof PermissionsException &&
          error.code === PermissionsExceptionCode.PERMISSION_DENIED
        )
          return null;
        throw error;
      });
  }

  private async findPersonIdByPhone(
    workspaceId: string,
    phoneNumber: string,
    callerAuthContext?: UserWorkspaceAuthContext,
  ): Promise<string | null> {
    const variants = getE164MatchVariants(phoneNumber);

    if (!isDefined(variants)) {
      return null;
    }

    return this.globalWorkspaceOrmManager
      .executeInWorkspaceContext(
        async () => {
          const personRepository =
            await this.globalWorkspaceOrmManager.getRepository(
              workspaceId,
              PersonWorkspaceEntity,
              isDefined(callerAuthContext)
                ? undefined
                : { shouldBypassPermissionChecks: true },
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
        callerAuthContext ?? buildSystemAuthContext(workspaceId),
      )
      .catch((error: unknown) => {
        // A caller may dial a known number without gaining access to restricted CRM contacts.
        if (
          isDefined(callerAuthContext) &&
          error instanceof PermissionsException &&
          error.code === PermissionsExceptionCode.PERMISSION_DENIED
        )
          return null;
        throw error;
      });
  }

  private async findOrCreatePersonId(
    workspaceId: string,
    fromNumber: string,
  ): Promise<string | null> {
    const existingPersonId = await this.findPersonIdByPhone(
      workspaceId,
      fromNumber,
    );

    if (isDefined(existingPersonId)) {
      return existingPersonId;
    }

    const variants = getE164MatchVariants(fromNumber);

    if (!isDefined(variants)) {
      this.logger.warn(
        `Could not parse inbound call number '${fromNumber}' as E.164`,
      );

      return null;
    }

    const parsed = parsePhoneNumberWithError(variants.e164);

    try {
      const createdPeople = await this.createPersonService.createPeople(
        [
          {
            name: { firstName: '', lastName: '' },
            // emails omitted on purpose: the unique index on
            // emailsPrimaryEmail would reject a second '' placeholder row.
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
    } catch (error) {
      // A concurrent webhook delivery (or an existing empty-email row) can
      // lose the insert race; the call must still be logged.
      this.logger.warn(
        `Person creation failed for inbound call from '${fromNumber}': ${error instanceof Error ? error.message : String(error)}`,
      );

      return this.findPersonIdByPhone(workspaceId, fromNumber);
    }
  }
}
