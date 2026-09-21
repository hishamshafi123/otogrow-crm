import { MeetingAvailabilityService } from 'src/modules/meeting-booking/services/meeting-availability.service';

const mockList = jest.fn();
jest.mock('googleapis', () => ({
  google: { calendar: () => ({ events: { list: mockList } }) },
}));

const buildService = () =>
  new MeetingAvailabilityService(
    { findOne: jest.fn().mockResolvedValue({ id: 'account' }) } as never,
    { getClient: jest.fn().mockResolvedValue({}) } as never,
  );
const INPUT = {
  date: '2030-01-07',
  durationMinutes: 30,
  startHour: 9,
  endHour: 11,
};

describe('Meeting calendar availability', () => {
  beforeEach(() => {
    mockList.mockReset();
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2030-01-07T04:00:00Z'));
  });
  afterEach(() => jest.restoreAllMocks());

  it('uses the calendar timezone and removes busy slots without removing adjacent slots', async () => {
    mockList.mockResolvedValue({
      data: {
        timeZone: 'Asia/Dubai',
        items: [
          {
            start: { dateTime: '2030-01-07T05:30:00Z' },
            end: { dateTime: '2030-01-07T06:00:00Z' },
          },
        ],
      },
    });
    const result = await buildService().getAvailability(
      'workspace',
      'member',
      INPUT,
    );
    expect(result.timeZone).toBe('Asia/Dubai');
    expect(result.slots.map((slot) => slot.startTime)).toEqual([
      '2030-01-07T05:00:00.000Z',
      '2030-01-07T06:00:00.000Z',
      '2030-01-07T06:15:00.000Z',
      '2030-01-07T06:30:00.000Z',
    ]);
  });

  it('excludes an all-day busy event using its calendar timezone', async () => {
    mockList.mockResolvedValue({
      data: {
        timeZone: 'Asia/Dubai',
        items: [{ start: { date: '2030-01-07' }, end: { date: '2030-01-08' } }],
      },
    });
    expect(
      (await buildService().getAvailability('workspace', 'member', INPUT))
        .slots,
    ).toEqual([]);
  });

  it('ignores cancelled, free and declined events and follows pagination', async () => {
    const event = {
      start: { date: '2030-01-07' },
      end: { date: '2030-01-08' },
    };
    mockList.mockResolvedValueOnce({
      data: {
        timeZone: 'Asia/Dubai',
        nextPageToken: 'next',
        items: [{ ...event, transparency: 'transparent' }],
      },
    });
    mockList.mockResolvedValueOnce({
      data: {
        timeZone: 'Asia/Dubai',
        items: [
          { ...event, status: 'cancelled' },
          { ...event, attendees: [{ self: true, responseStatus: 'declined' }] },
        ],
      },
    });
    expect(
      (await buildService().getAvailability('workspace', 'member', INPUT))
        .slots,
    ).toHaveLength(7);
    expect(mockList).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageToken: 'next', singleEvents: true }),
      expect.anything(),
    );
  });

  it('fails closed when Google cannot be read', async () => {
    mockList.mockRejectedValue(new Error('private token information'));
    await expect(
      buildService().getAvailability('workspace', 'member', INPUT),
    ).rejects.toThrow('Could not check your Google calendar');
  });

  it('rejects past booking times and conflicts at booking time', async () => {
    const service = buildService();
    await expect(
      service.assertAvailable(
        'account',
        new Date('2029-01-01'),
        new Date('2029-01-02'),
      ),
    ).rejects.toThrow('future');
    mockList.mockResolvedValue({
      data: {
        timeZone: 'UTC',
        items: [
          {
            start: { dateTime: '2030-01-07T09:00:00Z' },
            end: { dateTime: '2030-01-07T10:00:00Z' },
          },
        ],
      },
    });
    await expect(
      service.assertAvailable(
        'account',
        new Date('2030-01-07T09:30:00Z'),
        new Date('2030-01-07T10:00:00Z'),
      ),
    ).rejects.toThrow('no longer available');
  });
});
