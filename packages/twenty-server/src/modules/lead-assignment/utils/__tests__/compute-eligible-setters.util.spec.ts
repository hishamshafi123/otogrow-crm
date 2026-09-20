import {
  type SetterEligibilityCandidate,
  computeEligibleSetters,
} from 'src/modules/lead-assignment/utils/compute-eligible-setters.util';

const buildCandidate = (
  overrides: Partial<SetterEligibilityCandidate> = {},
): SetterEligibilityCandidate => ({
  id: 'setter-1',
  workspaceMemberId: 'workspace-member-1',
  telegramChatId: null,
  activeDays: '1,2,3,4,5',
  activeStartHour: 9,
  activeEndHour: 18,
  dailyLeadCap: null,
  lastAssignedAt: null,
  assignmentsToday: 0,
  ...overrides,
});

// 2026-09-20 is a Sunday; 2026-09-21 a Monday (both UTC)
const SUNDAY_10AM_UTC = new Date('2026-09-20T10:00:00Z');
const MONDAY_10AM_UTC = new Date('2026-09-21T10:00:00Z');

describe('computeEligibleSetters', () => {
  it('includes a setter inside their schedule', () => {
    const eligible = computeEligibleSetters(
      [buildCandidate()],
      MONDAY_10AM_UTC,
    );

    expect(eligible).toHaveLength(1);
  });

  it('excludes a setter on an inactive day', () => {
    const eligible = computeEligibleSetters(
      [buildCandidate()],
      SUNDAY_10AM_UTC,
    );

    expect(eligible).toHaveLength(0);
  });

  it('excludes a setter outside their hours', () => {
    const earlyMorning = new Date('2026-09-21T06:00:00Z');
    const evening = new Date('2026-09-21T18:00:00Z');

    expect(
      computeEligibleSetters([buildCandidate()], earlyMorning),
    ).toHaveLength(0);
    expect(computeEligibleSetters([buildCandidate()], evening)).toHaveLength(0);
  });

  it('includes a setter whose day is listed with spaces', () => {
    const eligible = computeEligibleSetters(
      [buildCandidate({ activeDays: '1, 2, 3' })],
      MONDAY_10AM_UTC,
    );

    expect(eligible).toHaveLength(1);
  });

  it('excludes a setter who reached their daily cap', () => {
    const eligible = computeEligibleSetters(
      [buildCandidate({ dailyLeadCap: 5, assignmentsToday: 5 })],
      MONDAY_10AM_UTC,
    );

    expect(eligible).toHaveLength(0);
  });

  it('includes a setter below their daily cap', () => {
    const eligible = computeEligibleSetters(
      [buildCandidate({ dailyLeadCap: 5, assignmentsToday: 4 })],
      MONDAY_10AM_UTC,
    );

    expect(eligible).toHaveLength(1);
  });

  it('orders by oldest lastAssignedAt first, never-assigned first', () => {
    const neverAssigned = buildCandidate({ id: 'never', lastAssignedAt: null });
    const longAgo = buildCandidate({
      id: 'long-ago',
      lastAssignedAt: new Date('2026-09-20T08:00:00Z'),
    });
    const recent = buildCandidate({
      id: 'recent',
      lastAssignedAt: new Date('2026-09-21T09:00:00Z'),
    });

    const eligible = computeEligibleSetters(
      [recent, neverAssigned, longAgo],
      MONDAY_10AM_UTC,
    );

    expect(eligible.map((candidate) => candidate.id)).toEqual([
      'never',
      'long-ago',
      'recent',
    ]);
  });
});
