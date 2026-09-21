import { MeetingAvailabilityService } from 'src/modules/meeting-booking/services/meeting-availability.service';
import { WorkspaceMemberWorkspaceEntity } from 'src/modules/workspace-member/standard-objects/workspace-member.workspace-entity';
import { TaskWorkspaceEntity } from 'src/modules/task/standard-objects/task.workspace-entity';
import { TaskTargetWorkspaceEntity } from 'src/modules/task/standard-objects/task-target.workspace-entity';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isNonEmptyString } from '@sniptt/guards';
import { google, type calendar_v3 as calendarV3 } from 'googleapis';
import { ConnectedAccountProvider } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { type Repository } from 'typeorm';
import { v4 } from 'uuid';

import { CalendarChannelEntity } from 'src/engine/metadata-modules/calendar-channel/entities/calendar-channel.entity';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { getMissingCreateEventScopes } from 'src/modules/calendar/calendar-event-creation-manager/utils/get-missing-create-event-scopes.util';
import { formatGoogleCalendarEvents } from 'src/modules/calendar/calendar-event-import-manager/drivers/google-calendar/utils/format-google-calendar-event.util';
import { CalendarSaveEventsService } from 'src/modules/calendar/calendar-event-import-manager/services/calendar-save-events.service';
import { GoogleOAuth2ClientProvider } from 'src/modules/connected-account/oauth2-client-manager/drivers/google/google-oauth2-client.provider';
import { type BookMeetingInput } from 'src/modules/meeting-booking/dtos/book-meeting.input';
import { type BookMeetingOutputDTO } from 'src/modules/meeting-booking/dtos/book-meeting-output.dto';
import { createMeetingNote } from 'src/modules/meeting-booking/utils/create-meeting-note.util';
import { PersonWorkspaceEntity } from 'src/modules/person/standard-objects/person.workspace-entity';

const GOOGLE_CALENDAR_ID = 'primary';
// Email reminders 24h, 12h and 30min before the meeting.
const REMINDER_MINUTES = [1440, 720, 30];

@Injectable()
export class MeetingBookingService {
  private readonly logger = new Logger(MeetingBookingService.name);

  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    @InjectRepository(ConnectedAccountEntity)
    private readonly connectedAccountRepository: Repository<ConnectedAccountEntity>,
    @InjectRepository(CalendarChannelEntity)
    private readonly calendarChannelRepository: Repository<CalendarChannelEntity>,
    private readonly googleOAuth2ClientProvider: GoogleOAuth2ClientProvider,
    private readonly calendarSaveEventsService: CalendarSaveEventsService,
    private readonly meetingAvailabilityService: MeetingAvailabilityService,
  ) {}

  async bookMeeting({
    workspaceId,
    userWorkspaceId,
    input,
  }: {
    workspaceId: string;
    userWorkspaceId: string;
    input: BookMeetingInput;
  }): Promise<BookMeetingOutputDTO> {
    const person =
      await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        async () => {
          const personRepository =
            await this.globalWorkspaceOrmManager.getRepository(
              workspaceId,
              PersonWorkspaceEntity,
              { shouldBypassPermissionChecks: true },
            );

          return personRepository.findOne({ where: { id: input.personId } });
        },
        buildSystemAuthContext(workspaceId),
      );

    if (!isDefined(person)) {
      throw new NotFoundException(
        `Person ${input.personId} not found in this workspace`,
      );
    }

    const leadEmail = person.emails?.primaryEmail;

    if (!isNonEmptyString(leadEmail)) {
      throw new BadRequestException(
        'This person has no primary email address. Add one before booking a meeting.',
      );
    }

    const assignee = input.assigneeWorkspaceMemberId
      ? await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
          async () => {
            const repository =
              await this.globalWorkspaceOrmManager.getRepository(
                workspaceId,
                WorkspaceMemberWorkspaceEntity,
                { shouldBypassPermissionChecks: true },
              );
            const member = await repository.findOne({
              where: { id: input.assigneeWorkspaceMemberId },
            });
            if (!member?.userEmail)
              throw new BadRequestException(
                'Choose a workspace member with an email address.',
              );
            return member;
          },
          buildSystemAuthContext(workspaceId),
        )
      : null;

    const connectedAccount = await this.findMemberGoogleAccount(
      workspaceId,
      userWorkspaceId,
    );

    if (!isDefined(connectedAccount)) {
      throw new BadRequestException(
        'Connect your Google account in Settings → Accounts first',
      );
    }

    const missingScopes = getMissingCreateEventScopes(connectedAccount);

    if (missingScopes.length > 0) {
      throw new BadRequestException(
        'Your Google account is missing calendar access. Reconnect it in Settings → Accounts and grant calendar permissions.',
      );
    }

    const startsAt = new Date(input.startTime);

    if (Number.isNaN(startsAt.getTime())) {
      throw new BadRequestException(
        `startTime '${input.startTime}' is not a valid ISO 8601 date-time`,
      );
    }

    const durationMinutes = input.durationMinutes ?? 30;
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);

    const personName =
      [person.name?.firstName, person.name?.lastName]
        .filter(isNonEmptyString)
        .join(' ') || leadEmail;

    const createdEvent =
      await this.connectedAccountRepository.manager.transaction(
        async (manager) => {
          // Serialize bookings from this CRM so concurrent requests cannot both claim the same slot.
          await manager.query(
            'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
            [`meeting-booking:${workspaceId}:${connectedAccount.id}`],
          );
          await this.meetingAvailabilityService.assertAvailable(
            connectedAccount.id,
            startsAt,
            endsAt,
          );
          return this.insertGoogleCalendarEvent({
            connectedAccountId: connectedAccount.id,
            personName,
            leadEmail,
            assigneeEmail: assignee?.userEmail ?? undefined,
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
          });
        },
      );

    await this.persistCalendarEvent({
      createdEvent,
      connectedAccount,
      workspaceId,
    });

    const meetLink =
      createdEvent.conferenceData?.entryPoints?.[0]?.uri ??
      createdEvent.hangoutLink ??
      null;

    let warning: string | null = null;
    try {
      await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        async () => {
          await createMeetingNote({
            globalWorkspaceOrmManager: this.globalWorkspaceOrmManager,
            workspaceId,
            personId: person.id,
            title: `Meeting booked for ${startsAt.toUTCString()}`,
            markdown: `Meeting booked for ${startsAt.toUTCString()} (${durationMinutes} min) with ${personName}.${meetLink ? ` Meet link: ${meetLink}` : ''}`,
          });
          const repository = await this.globalWorkspaceOrmManager.getRepository(
            workspaceId,
            PersonWorkspaceEntity,
            { shouldBypassPermissionChecks: true },
          );
          await repository.update(person.id, { leadStatus: 'MEETING_BOOKED' });
          if (assignee) {
            const tasks = await this.globalWorkspaceOrmManager.getRepository(
              workspaceId,
              TaskWorkspaceEntity,
              { shouldBypassPermissionChecks: true },
            );
            const targets = await this.globalWorkspaceOrmManager.getRepository(
              workspaceId,
              TaskTargetWorkspaceEntity,
              { shouldBypassPermissionChecks: true },
            );
            const taskId = v4();
            await tasks.insert({
              id: taskId,
              title: `Meeting with ${personName}`,
              dueAt: startsAt,
              status: 'TODO',
              assigneeId: assignee.id,
            });
            await targets.insert({
              id: v4(),
              taskId,
              targetPersonId: person.id,
            });
          }
        },
        buildSystemAuthContext(workspaceId),
      );
    } catch {
      // The invitation already exists; returning a booking error would encourage duplicate invitations.
      warning =
        'The calendar meeting was booked, but some CRM updates failed. Check the contact and assigned task before retrying.';
      this.logger.warn(warning);
    }

    return {
      warning,
      eventId: createdEvent.id ?? '',
      meetLink,
      htmlLink: createdEvent.htmlLink ?? null,
    };
  }

  private async findMemberGoogleAccount(
    workspaceId: string,
    userWorkspaceId: string,
  ): Promise<ConnectedAccountEntity | null> {
    return this.connectedAccountRepository.findOne({
      where: {
        workspaceId,
        userWorkspaceId,
        provider: ConnectedAccountProvider.GOOGLE,
      },
      order: { createdAt: 'ASC' },
    });
  }

  private async insertGoogleCalendarEvent({
    connectedAccountId,
    personName,
    leadEmail,
    assigneeEmail,
    startsAt,
    endsAt,
  }: {
    connectedAccountId: string;
    personName: string;
    leadEmail: string;
    assigneeEmail?: string;
    startsAt: string;
    endsAt: string;
  }): Promise<calendarV3.Schema$Event> {
    const oAuth2Client =
      await this.googleOAuth2ClientProvider.getClient(connectedAccountId);

    const googleCalendarClient = google.calendar({
      version: 'v3',
      auth: oAuth2Client,
    });

    const requestBody: calendarV3.Schema$Event = {
      summary: `Meeting with ${personName}`,
      start: { dateTime: startsAt, timeZone: 'UTC' },
      end: { dateTime: endsAt, timeZone: 'UTC' },
      attendees: [
        ...new Set([leadEmail, assigneeEmail].filter(isNonEmptyString)),
      ].map((email) => ({ email })),
      conferenceData: {
        createRequest: {
          requestId: v4(),
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
      reminders: {
        useDefault: false,
        overrides: REMINDER_MINUTES.map((minutes) => ({
          method: 'email',
          minutes,
        })),
      },
    };

    const { data } = await googleCalendarClient.events.insert(
      {
        calendarId: GOOGLE_CALENDAR_ID,
        conferenceDataVersion: 1,
        sendUpdates: 'all',
        requestBody,
      },
      { timeout: 15000 },
    );

    return data;
  }

  // Persist the created event so it shows on the person's timeline right away.
  // The next provider sync reconciles it via its external id, so a persistence
  // failure here is non-fatal.
  private async persistCalendarEvent({
    createdEvent,
    connectedAccount,
    workspaceId,
  }: {
    createdEvent: calendarV3.Schema$Event;
    connectedAccount: ConnectedAccountEntity;
    workspaceId: string;
  }): Promise<void> {
    const calendarChannel = await this.calendarChannelRepository.findOne({
      where: {
        connectedAccountId: connectedAccount.id,
        workspaceId,
        isSyncEnabled: true,
      },
      order: { createdAt: 'ASC' },
    });

    if (!isDefined(calendarChannel)) {
      return;
    }

    try {
      await this.calendarSaveEventsService.saveCalendarEventsAndEnqueueContactCreationJob(
        formatGoogleCalendarEvents([createdEvent]),
        calendarChannel,
        connectedAccount,
        workspaceId,
      );
    } catch (persistenceError) {
      this.logger.warn(
        `Failed to persist booked meeting (sync will recover): ${persistenceError}`,
      );
    }
  }
}
