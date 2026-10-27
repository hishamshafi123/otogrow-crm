import {
  commitmentEndExclusive,
  commitmentLastDay,
} from '@/delivery/commitments/commitmentDates';

describe('commitment calendar boundaries', () => {
  it.each([
    ['2026-10-31', '2026-11-01'],
    ['2026-12-31', '2027-01-01'],
    ['2024-02-29', '2024-03-01'],
    ['2026-03-08', '2026-03-09'],
    ['2026-11-01', '2026-11-02'],
  ])(
    'includes %s as the last day without local timezone or DST shifts',
    (lastDay, exclusive) => {
      expect(commitmentEndExclusive(lastDay)).toBe(exclusive);
      expect(commitmentLastDay(exclusive)).toBe(lastDay);
    },
  );
  it('preserves open-ended packages and rejects malformed dates', () => {
    for (const value of [
      null,
      undefined,
      '',
      '2026-02-30',
      'not a date',
      '2026-10-25T00:00:00Z',
    ]) {
      expect(commitmentEndExclusive(value)).toBeNull();
      expect(commitmentLastDay(value)).toBeNull();
    }
  });
});
