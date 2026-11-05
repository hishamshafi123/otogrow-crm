import {
  contentDayWindow,
  contentLocalDateTime,
  contentMonthWindow,
  contentPlannedInstant,
} from '@/delivery/content/content-dates';

it('uses the explicitly chosen publication zone rather than the browser zone', () => {
  expect(contentPlannedInstant('2026-11-05T06:00', 'Asia/Qatar')).toBe(
    '2026-11-05T03:00:00Z',
  );
  expect(contentLocalDateTime('2026-11-05T03:00:00Z', 'Asia/Qatar')).toBe(
    '2026-11-05T06:00',
  );
});

it.each(['2026-03-08T02:30', '2026-11-01T01:30'])(
  'rejects nonexistent or ambiguous local publication time %s',
  (date) => {
    expect(contentPlannedInstant(date, 'America/New_York')).toBeNull();
  },
);

it('does not silently normalize invalid dates, offset zones or malformed values', () => {
  expect(contentPlannedInstant('2026-02-30T06:00', 'UTC')).toBeNull();
  expect(contentPlannedInstant('2026-11-05T06:00', '+03:00')).toBeNull();
  expect(contentPlannedInstant('2026-11-05T06:00', 'Invalid/Zone')).toBeNull();
  expect(contentPlannedInstant('2026-11-05T06:00Z', 'UTC')).toBeNull();
  expect(contentLocalDateTime('not-an-instant', 'UTC')).toBeNull();
});

it('returns a complete leap-month range and dates for calendar counts', () => {
  const month = contentMonthWindow('2028-02', 'Asia/Qatar');
  expect(month?.dates).toHaveLength(29);
  expect(month?.dates.at(-1)).toBe('2028-02-29');
  expect(month?.from).toBe('2028-01-31T21:00:00Z');
  expect(month?.to).toBe('2028-02-29T21:00:00Z');
  expect(contentMonthWindow('2026-13', 'UTC')).toBeNull();
});

it('keeps a DST day complete without assuming 24 hours', () => {
  expect(contentDayWindow('2026-03-08', 'America/New_York')).toEqual({
    from: '2026-03-08T05:00:00Z',
    to: '2026-03-09T04:00:00Z',
  });
  expect(contentDayWindow('2026-02-30', 'UTC')).toBeNull();
});
