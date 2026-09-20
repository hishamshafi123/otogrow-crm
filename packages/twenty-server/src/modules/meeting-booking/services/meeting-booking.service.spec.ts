import { BadRequestException, NotFoundException } from '@nestjs/common';

import { ConnectedAccountProvider } from 'twenty-shared/types';
import { type Repository } from 'typeorm';

import { type CalendarChannelEntity } from 'src/engine/metadata-modules/calendar-channel/entities/calendar-channel.entity';
import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { type GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { type CalendarSaveEventsService } from 'src/modules/calendar/calendar-event-import-manager/services/calendar-save-events.service';
import { type GoogleOAuth2ClientProvider } from 'src/modules/connected-account/oauth2-client-manager/drivers/google/google-oauth2-client.provider';
import { MeetingBookingService } from 'src/modules/meeting-booking/services/meeting-booking.service';
import { createMeetingNote } from 'src/modules/meeting-booking/utils/create-meeting-note.util';

const mockEventsInsert = jest.fn();

jest.mock('googleapis', () => ({
  google: {
    calendar: jest.fn(() => ({
      events: { insert: mockEventsInsert },
    })),
  },
}));

jest.mock('src/modules/meeting-booking/utils/create-meeting-note.util', () => ({
  createMeetingNote: jest.fn(),
}));

const WORKSPACE_ID = 'workspace-1';
const USER_WORKSPACE_ID = 'user-workspace-1';
const PERSON_ID = '11111111-1111-4111-8111-111111111111';

const GOOGLE_ACCOUNT = {
  id: 'account-1',
  provider: ConnectedAccountProvider.GOOGLE,
  scopes: ['https://www.googleapis.com/auth/calendar.events'],
} as ConnectedAccountEntity;

const PERSON = {
  id: PERSON_ID,
  name: { firstName: 'John', lastName: 'Doe' },
  emails: { primaryEmail: 'john@example.com' },
};

const CREATED_GOOGLE_EVENT = {
  id: 'evt-1',
  htmlLink: 'https://calendar.google.com/event?eid=evt-1',
  hangoutLink: 'https://meet.google.com/abc-defg-hij',
  conferenceData: {
    entryPoints: [{ uri: 'https://meet.google.com/abc-defg-hij' }],
  },
  start: { dateTime: '2026-09-21T14:00:00.000Z' },
  end: { dateTime: '2026-09-21T14:30:00.000Z' },
  summary: 'Meeting with John Doe',
};

describe('MeetingBookingService', () => {
  let service: MeetingBookingService;
  let personRepository: { findOne: jest.Mock };
  let connectedAccountRepository: { findOne: jest.Mock };
  let calendarChannelRepository: { findOne: jest.Mock };
  let calendarSaveEventsService: {
    saveCalendarEventsAndEnqueueContactCreationJob: jest.Mock;
  };

  const bookMeeting = (
    input: Partial<{
      personId: string;
      startTime: string;
      durationMinutes: number;
    }> = {},
  ) =>
    service.bookMeeting({
      workspaceId: WORKSPACE_ID,
      userWorkspaceId: USER_WORKSPACE_ID,
      input: {
        personId: PERSON_ID,
        startTime: '2026-09-21T14:00:00.000Z',
        ...input,
      },
    });

  beforeEach(() => {
    jest.clearAllMocks();

    personRepository = { findOne: jest.fn().mockResolvedValue(PERSON) };
    connectedAccountRepository = {
      findOne: jest.fn().mockResolvedValue(GOOGLE_ACCOUNT),
    };
    calendarChannelRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'channel-1' }),
    };
    calendarSaveEventsService = {
      saveCalendarEventsAndEnqueueContactCreationJob: jest
        .fn()
        .mockResolvedValue(undefined),
    };

    mockEventsInsert.mockResolvedValue({ data: CREATED_GOOGLE_EVENT });

    const globalWorkspaceOrmManager = {
      executeInWorkspaceContext: jest.fn((callback) => callback()),
      getRepository: jest.fn().mockResolvedValue(personRepository),
    } as unknown as GlobalWorkspaceOrmManager;

    const googleOAuth2ClientProvider = {
      getClient: jest.fn().mockResolvedValue({}),
    } as unknown as GoogleOAuth2ClientProvider;

    service = new MeetingBookingService(
      globalWorkspaceOrmManager,
      connectedAccountRepository as unknown as Repository<ConnectedAccountEntity>,
      calendarChannelRepository as unknown as Repository<CalendarChannelEntity>,
      googleOAuth2ClientProvider,
      calendarSaveEventsService as unknown as CalendarSaveEventsService,
    );
  });

  it('creates a Google event with Meet conferencing, the lead as attendee and email reminders', async () => {
    const result = await bookMeeting();

    expect(mockEventsInsert).toHaveBeenCalledTimes(1);

    const insertArgs = mockEventsInsert.mock.calls[0][0];

    expect(insertArgs.calendarId).toBe('primary');
    expect(insertArgs.conferenceDataVersion).toBe(1);
    expect(insertArgs.sendUpdates).toBe('all');
    expect(insertArgs.requestBody.summary).toBe('Meeting with John Doe');
    expect(insertArgs.requestBody.attendees).toEqual([
      { email: 'john@example.com' },
    ]);
    expect(
      insertArgs.requestBody.conferenceData.createRequest.conferenceSolutionKey,
    ).toEqual({ type: 'hangoutsMeet' });
    expect(insertArgs.requestBody.reminders).toEqual({
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 1440 },
        { method: 'email', minutes: 720 },
        { method: 'email', minutes: 30 },
      ],
    });
    expect(insertArgs.requestBody.start).toEqual({
      dateTime: '2026-09-21T14:00:00.000Z',
      timeZone: 'UTC',
    });
    expect(insertArgs.requestBody.end).toEqual({
      dateTime: '2026-09-21T14:30:00.000Z',
      timeZone: 'UTC',
    });

    expect(result).toEqual({
      eventId: 'evt-1',
      meetLink: 'https://meet.google.com/abc-defg-hij',
      htmlLink: 'https://calendar.google.com/event?eid=evt-1',
    });
  });

  it('applies the requested duration to the event end time', async () => {
    await bookMeeting({ durationMinutes: 45 });

    const insertArgs = mockEventsInsert.mock.calls[0][0];

    expect(insertArgs.requestBody.end.dateTime).toBe(
      '2026-09-21T14:45:00.000Z',
    );
  });

  it('persists the created event and writes a timeline note with the Meet link', async () => {
    await bookMeeting();

    expect(
      calendarSaveEventsService.saveCalendarEventsAndEnqueueContactCreationJob,
    ).toHaveBeenCalledTimes(1);

    expect(createMeetingNote).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        personId: PERSON_ID,
        markdown: expect.stringContaining(
          'Meet link: https://meet.google.com/abc-defg-hij',
        ),
      }),
    );
  });

  it('still succeeds when persisting the calendar event fails', async () => {
    calendarSaveEventsService.saveCalendarEventsAndEnqueueContactCreationJob.mockRejectedValue(
      new Error('db down'),
    );

    const result = await bookMeeting();

    expect(result.eventId).toBe('evt-1');
  });

  it('throws NotFoundException when the person does not exist', async () => {
    personRepository.findOne.mockResolvedValue(null);

    await expect(bookMeeting()).rejects.toThrow(NotFoundException);
    expect(mockEventsInsert).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when the person has no primary email', async () => {
    personRepository.findOne.mockResolvedValue({
      ...PERSON,
      emails: { primaryEmail: '' },
    });

    await expect(bookMeeting()).rejects.toThrow(BadRequestException);
    await expect(bookMeeting()).rejects.toThrow(
      'This person has no primary email address',
    );
    expect(mockEventsInsert).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when the member has no connected Google account', async () => {
    connectedAccountRepository.findOne.mockResolvedValue(null);

    await expect(bookMeeting()).rejects.toThrow(
      'Connect your Google account in Settings → Accounts first',
    );
    expect(mockEventsInsert).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when the Google account misses the calendar scope', async () => {
    connectedAccountRepository.findOne.mockResolvedValue({
      ...GOOGLE_ACCOUNT,
      scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    });

    await expect(bookMeeting()).rejects.toThrow(
      'Your Google account is missing calendar access',
    );
    expect(mockEventsInsert).not.toHaveBeenCalled();
  });
});
