import { latestRecurrence } from 'src/modules/delivery/operations/delivery-recurrence';
import { type Recurrence } from 'src/modules/delivery/operations/delivery-operations.types';
const template: Recurrence = {
  id: 'template',
  projectId: 'project',
  creatorId: 'creator',
  userWorkspaceId: 'user',
  fields: {
    title: 'Report',
    brief: '',
    service: 'SEO',
    priority: 'NORMAL',
    assigneeId: 'editor',
    reviewerId: 'manager',
    scheduledDate: null,
    dueAt: null,
    checklist: [],
    evidence: [],
  },
  frequency: 'DAILY',
  weekdays: [1],
  monthDay: 31,
  time: '09:00',
  startDate: '2026-01-01',
  endDate: null,
  paused: false,
  dueHours: 24,
  lastDate: null,
  skipped: 0,
  error: null,
  lastTaskId: null,
};
describe('recurring delivery calendar', () => {
  it('creates only the latest due occurrence and counts skipped days', () => {
    expect(
      latestRecurrence(template, 'UTC', new Date('2026-01-05T10:00:00Z')),
    ).toEqual({ date: '2026-01-05', skipped: 4 });
  });
  it('does not create the current day before local time', () => {
    expect(
      latestRecurrence(
        { ...template, lastDate: '2026-01-04' },
        'Asia/Dubai',
        new Date('2026-01-05T04:59:00Z'),
      ),
    ).toBeNull();
  });
  it('does not duplicate an already processed date', () => {
    expect(
      latestRecurrence(
        { ...template, lastDate: '2026-01-05' },
        'UTC',
        new Date('2026-01-05T20:00:00Z'),
      ),
    ).toBeNull();
  });
  it('honors selected weekdays', () => {
    expect(
      latestRecurrence(
        { ...template, frequency: 'WEEKLY', weekdays: [1, 3] },
        'UTC',
        new Date('2026-01-08T10:00:00Z'),
      ),
    ).toEqual({ date: '2026-01-07', skipped: 1 });
  });
  it('clamps monthly day to leap-year month end', () => {
    expect(
      latestRecurrence(
        { ...template, frequency: 'MONTHLY', startDate: '2028-02-01' },
        'UTC',
        new Date('2028-02-29T09:00:00Z'),
      ),
    ).toEqual({ date: '2028-02-29', skipped: 0 });
  });
  it('runs a nonexistent spring DST time at the next local tick', () => {
    expect(
      latestRecurrence(
        { ...template, time: '02:30', startDate: '2026-03-08' },
        'America/New_York',
        new Date('2026-03-08T07:00:00Z'),
      ),
    ).toEqual({ date: '2026-03-08', skipped: 0 });
  });
  it('does not repeat work in the repeated autumn DST hour', () => {
    expect(
      latestRecurrence(
        { ...template, time: '01:30', lastDate: '2026-11-01' },
        'America/New_York',
        new Date('2026-11-01T06:30:00Z'),
      ),
    ).toBeNull();
  });
  it('honors pause and end date', () => {
    expect(
      latestRecurrence(
        { ...template, paused: true },
        'UTC',
        new Date('2026-01-05T10:00:00Z'),
      ),
    ).toBeNull();
    expect(
      latestRecurrence(
        { ...template, endDate: '2026-01-02' },
        'UTC',
        new Date('2026-01-05T10:00:00Z'),
      ),
    ).toEqual({ date: '2026-01-02', skipped: 1 });
  });
});
