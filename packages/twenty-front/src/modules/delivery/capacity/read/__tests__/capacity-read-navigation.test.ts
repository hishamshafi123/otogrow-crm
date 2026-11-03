import {
  capacityCalendarDate,
  capacityReadInputs,
} from '@/delivery/capacity/read/capacity-read-navigation';
import {
  ASSIGNEE_ID,
  PROJECT_ID,
} from '@/delivery/tasks/__tests__/tasks.fixtures';
it('uses the verified server observation in the chosen calendar rather than the computer date', () => {
  expect(capacityCalendarDate('2026-10-28T23:30:00Z', 'Asia/Qatar')).toBe(
    '2026-10-29',
  );
  expect(
    capacityCalendarDate('2026-10-29T01:00:00Z', 'America/Los_Angeles'),
  ).toBe('2026-10-28');
  expect(capacityCalendarDate('unknown', 'Asia/Qatar')).toBe('');
});
it('keeps all-project capacity independent of task-card filters and bounds each page to25', () => {
  const inputs = capacityReadInputs(
    new URLSearchParams({
      view: 'planner',
      project: PROJECT_ID,
      search: 'card filter',
      status: 'BLOCKED',
      capacityFrom: '2026-10-29',
      capacityAfter: 'member-cursor',
    }),
    '2026-10-28',
    'Asia/Qatar',
  );
  expect(inputs.summary).toEqual({
    startDate: '2026-10-29',
    timezone: 'Asia/Qatar',
    after: 'member-cursor',
    limit: 25,
  });
  expect(inputs.assignments).toBeNull();
});
it('requires explicit nullable member/date fields and preserves exact day versus global unavailable-owner scope', () => {
  const day = capacityReadInputs(
    new URLSearchParams({
      capacityMember: ASSIGNEE_ID,
      capacityBucket: 'DAY',
      capacityDate: '2026-10-29',
    }),
    '2026-10-29',
    'Asia/Qatar',
  );
  expect(day.assignments).toMatchObject({
    memberId: ASSIGNEE_ID,
    bucket: 'DAY',
    date: '2026-10-29',
    limit: 25,
  });
  const missing = capacityReadInputs(
    new URLSearchParams({
      capacityMissingOwner: '1',
      capacityBucket: 'UNAVAILABLE_OWNER',
    }),
    '2026-10-29',
    'Asia/Qatar',
  );
  expect(missing.assignments).toMatchObject({
    memberId: null,
    date: null,
    bucket: 'UNAVAILABLE_OWNER',
  });
});
it.each([
  'capacityFrom=9999-12-31',
  'capacityFrom=2026-02-30',
  'capacityMember=unknown',
  `capacityMember=${ASSIGNEE_ID}`,
  `capacityMember=${ASSIGNEE_ID}&capacityMissingOwner=1&capacityBucket=DAY&capacityDate=2026-10-29`,
  `capacityMember=${ASSIGNEE_ID}&capacityBucket=DAY&capacityDate=2026-11-05`,
  'capacityBucket=UNAVAILABLE_OWNER',
  'capacityBucket=ALL',
])(
  'rejects an invalid capacity range or selection without broadening it: %s',
  (query) => {
    expect(
      capacityReadInputs(new URLSearchParams(query), '2026-10-29', 'Asia/Qatar')
        .valid,
    ).toBe(false);
  },
);
