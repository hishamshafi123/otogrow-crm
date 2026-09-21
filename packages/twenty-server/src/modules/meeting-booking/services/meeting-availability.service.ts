import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { google, type calendar_v3 as calendarV3 } from 'googleapis';
import { Temporal } from 'temporal-polyfill';
import { ConnectedAccountProvider } from 'twenty-shared/types';
import { type Repository } from 'typeorm';

import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { GoogleOAuth2ClientProvider } from 'src/modules/connected-account/oauth2-client-manager/drivers/google/google-oauth2-client.provider';
import { type MeetingAvailabilityInput } from 'src/modules/meeting-booking/dtos/meeting-availability.dto';

@Injectable()
export class MeetingAvailabilityService {
  constructor(
    @InjectRepository(ConnectedAccountEntity)
    private readonly connectedAccountRepository: Repository<ConnectedAccountEntity>,
    private readonly googleOAuth2ClientProvider: GoogleOAuth2ClientProvider,
  ) {}

  async getAvailability(
    workspaceId: string,
    userWorkspaceId: string,
    input: MeetingAvailabilityInput,
  ) {
    let date: Temporal.PlainDate;
    try {
      date = Temporal.PlainDate.from(input.date);
    } catch {
      throw new BadRequestException('Choose a valid date.');
    }
    if (input.endHour <= input.startHour)
      throw new BadRequestException('End time must be after start time.');
    const account = await this.connectedAccountRepository.findOne({
      where: {
        workspaceId,
        userWorkspaceId,
        provider: ConnectedAccountProvider.GOOGLE,
      },
      order: { createdAt: 'ASC' },
    });
    if (!account)
      throw new BadRequestException(
        'Connect your Google calendar in Settings → Accounts first.',
      );
    // The broad UTC window covers this calendar date in every IANA timezone.
    const anchor = Date.parse(`${input.date}T00:00:00Z`);
    const { events, timeZone } = await this.readEvents(
      account.id,
      new Date(anchor - 14 * 3600000).toISOString(),
      new Date(anchor + 38 * 3600000).toISOString(),
    );
    const dayStart = date.toZonedDateTime(timeZone);
    const start = dayStart.with({ hour: input.startHour }).epochMilliseconds;
    const end =
      input.endHour === 24
        ? dayStart.add({ days: 1 }).epochMilliseconds
        : dayStart.with({ hour: input.endHour }).epochMilliseconds;
    const busy = this.busyIntervals(events, timeZone);
    const slots: { startTime: string; endTime: string }[] = [];
    for (
      let time = start;
      time + input.durationMinutes * 60000 <= end;
      time += 15 * 60000
    ) {
      const finish = time + input.durationMinutes * 60000;
      if (
        time <= Date.now() ||
        busy.some((interval) => time < interval.end && finish > interval.start)
      )
        continue;
      slots.push({
        startTime: new Date(time).toISOString(),
        endTime: new Date(finish).toISOString(),
      });
    }
    return { timeZone, slots };
  }

  async assertAvailable(accountId: string, start: Date, end: Date) {
    if (start.getTime() <= Date.now())
      throw new BadRequestException('Choose a future meeting time.');
    const { events, timeZone } = await this.readEvents(
      accountId,
      start.toISOString(),
      end.toISOString(),
    );
    if (
      this.busyIntervals(events, timeZone).some(
        (interval) =>
          start.getTime() < interval.end && end.getTime() > interval.start,
      )
    ) {
      throw new BadRequestException(
        'This time is no longer available. Refresh the available times and choose another slot.',
      );
    }
  }

  private busyIntervals(events: calendarV3.Schema$Event[], timeZone: string) {
    return events
      .filter(
        (event) =>
          event.status !== 'cancelled' &&
          event.transparency !== 'transparent' &&
          !event.attendees?.some(
            (attendee) =>
              attendee.self && attendee.responseStatus === 'declined',
          ),
      )
      .map((event) => {
        const parse = (value: calendarV3.Schema$EventDateTime | undefined) => {
          if (value?.dateTime) {
            const timestamp = Date.parse(value.dateTime);
            if (!Number.isFinite(timestamp))
              throw new BadRequestException(
                'Calendar availability could not be verified.',
              );
            return timestamp;
          }
          if (value?.date)
            return Temporal.PlainDate.from(value.date).toZonedDateTime(
              value.timeZone ?? timeZone,
            ).epochMilliseconds;
          throw new BadRequestException(
            'Calendar availability could not be verified. Please retry.',
          );
        };
        return { start: parse(event.start), end: parse(event.end) };
      });
  }

  private async readEvents(
    accountId: string,
    timeMin: string,
    timeMax: string,
  ) {
    try {
      const auth = await this.googleOAuth2ClientProvider.getClient(accountId);
      const client = google.calendar({ version: 'v3', auth });
      const events: calendarV3.Schema$Event[] = [];
      let pageToken: string | undefined;
      let timeZone = 'UTC';
      for (let page = 0; page < 10; page++) {
        const response = await client.events.list(
          {
            calendarId: 'primary',
            timeMin,
            timeMax,
            singleEvents: true,
            showDeleted: false,
            maxResults: 2500,
            pageToken,
          },
          { timeout: 15000 },
        );
        events.push(...(response.data.items ?? []));
        timeZone = response.data.timeZone ?? timeZone;
        pageToken = response.data.nextPageToken ?? undefined;
        if (!pageToken) return { events, timeZone };
      }
      throw new Error('Too many calendar events');
    } catch {
      throw new BadRequestException(
        'Could not check your Google calendar. Reconnect it in Settings → Accounts with calendar access, then retry.',
      );
    }
  }
}
