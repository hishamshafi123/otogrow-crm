import {
  founderTaskExceptions,
  type FounderTask,
} from 'src/modules/delivery/founder/delivery-founder.policy';
import {
  founderEscalationDraftSchema,
  founderEscalationSourceVerified,
  matchFounderEscalation,
} from 'src/modules/delivery/founder/escalation/delivery-founder-escalation.policy';
import { type DeliveryDetails } from 'src/modules/delivery/delivery.types';

const TASK_ID = 'd908d75f-00c9-4e91-8071-27c4b3216a79';
const PROJECT_ID = 'dc95aebb-52a0-4aa0-bc8f-f93b24b11689';
const PRIMARY_ID = '2a3587de-498f-48bf-a1a8-9939109f877a';
const BACKUP_ID = '3516f2eb-0554-49db-a56c-306e3273cb16';
const NOW = new Date('2026-10-29T12:00:00.000Z');
const SOURCE_KEY = `TASK_REVIEW:${TASK_ID}:2`;
const VERIFIED_KEY = `TASK:${TASK_ID}`;
const task = (fields: Partial<FounderTask> = {}): FounderTask => ({
  id: TASK_ID,
  projectId: PROJECT_ID,
  title: 'Pending creative',
  revision: 4,
  state: 'IN_REVIEW',
  assigneeId: TASK_ID,
  reviewerId: PRIMARY_ID,
  dueAt: null,
  updatedAt: '2026-10-29T11:30:00.000Z',
  nativeUpdatedAt: '2026-10-29T11:30:00.000Z',
  review: {
    effectiveReviewerId: BACKUP_ID,
    reviewerState: 'ACTIVE',
    assignmentRevision: 2,
  },
  ...fields,
});
const submission = (
  submittedAt = '2026-10-29T09:00:00.000Z',
): DeliveryDetails['submissions'] => [
  {
    version: 2,
    submittedAt,
    submittedBy: TASK_ID,
    description: 'Exact submitted work',
    evidence: [],
  },
];
const source = (
  submittedAt?: string,
  fields: Partial<FounderTask> = {},
  now = NOW,
) =>
  founderTaskExceptions(
    task(fields),
    [
      { id: PRIMARY_ID, name: 'Primary manager' },
      { id: BACKUP_ID, name: 'Backup reviewer' },
    ],
    'Client project',
    now,
    undefined,
    submission(submittedAt),
  )[0];
const rule = (fields: Record<string, unknown> = {}) =>
  founderEscalationDraftSchema.parse({
    id: PROJECT_ID,
    revision: 0,
    name: 'Chosen review wait',
    condition: 'TASK_REVIEW_WAIT',
    recipientId: PRIMARY_ID,
    priority: 'NORMAL',
    projectScope: 'ALL',
    projectIds: [],
    includeCompany: false,
    repeatMode: 'ONCE',
    repeatHours: null,
    maxSends: 1,
    minimumReviewWaitHours: 3,
    ...fields,
  });

it('attributes pending review to its current backup while keeping an exact submission action', () => {
  expect(source()).toMatchObject({
    ownerId: BACKUP_ID,
    ownerName: 'Backup reviewer',
    ownerState: 'ACTIVE',
    evidence: {
      reviewSubmittedAt: '2026-10-29T09:00:00.000Z',
      reviewSubmissionVersion: 2,
      reviewAssignmentRevision: 2,
    },
    nextAction: { targetId: TASK_ID, submissionVersion: 2 },
  });
});
it('does not silently return to the primary manager when an explicit backup becomes unavailable', () => {
  expect(
    source(undefined, {
      review: {
        effectiveReviewerId: BACKUP_ID,
        reviewerState: 'UNAVAILABLE',
        assignmentRevision: 2,
      },
    }),
  ).toMatchObject({ ownerId: BACKUP_ID, ownerState: 'UNAVAILABLE' });
});
it('keeps approved client-delivery responsibility with the canonical manager', () => {
  expect(
    source(undefined, { state: 'APPROVED', dueAt: '2026-10-28T10:00:00.000Z' }),
  ).toMatchObject({
    ownerId: PRIMARY_ID,
    nextAction: { code: 'REVIEW_DELIVERY', submissionVersion: null },
  });
});
it('does not change source identity just because elapsed waiting time increases', () => {
  expect(
    source(undefined, {}, new Date('2026-10-29T13:00:00Z')).sourceRevision,
  ).toBe(source().sourceRevision);
});
it('matches at the explicitly chosen boundary, using submission time rather than latest task edits', () => {
  expect(matchFounderEscalation(rule(), [source()], NOW)).toHaveLength(1);
  expect(
    matchFounderEscalation(
      rule({ minimumReviewWaitHours: 4 }),
      [source()],
      NOW,
    ),
  ).toEqual([]);
  expect(
    matchFounderEscalation(
      rule(),
      [source()],
      new Date('2026-10-29T11:59:59Z'),
    ),
  ).toEqual([]);
});
it.each(['', 'invalid', '2026-10-30T09:00:00.000Z'])(
  'neither fires nor falsely clears an age issue when submission time is unverified: %s',
  (submittedAt) => {
    const item = source(submittedAt);
    expect(matchFounderEscalation(rule(), [item], NOW)).toEqual([]);
    expect(
      founderEscalationSourceVerified(
        rule(),
        [item],
        [VERIFIED_KEY],
        SOURCE_KEY,
        NOW,
      ),
    ).toBe(false);
    expect(item.evidence.warnings).toContain('TASK_REVIEW_TIME_UNAVAILABLE');
  },
);
it('does not treat a timestamp without a verified positive submission version as sufficient', () => {
  const item = source();
  item.evidence.reviewSubmissionVersion = null;
  expect(matchFounderEscalation(rule(), [item], NOW)).toEqual([]);
  expect(
    founderEscalationSourceVerified(
      rule(),
      [item],
      [VERIFIED_KEY],
      SOURCE_KEY,
      NOW,
    ),
  ).toBe(false);
});
it('allows positively observed nonreview state to clear, but never treats an absent source as verified', () => {
  const item = source(undefined, { state: 'BLOCKED' });
  expect(
    founderEscalationSourceVerified(
      rule(),
      [item],
      [VERIFIED_KEY],
      SOURCE_KEY,
      NOW,
    ),
  ).toBe(true);
  expect(founderEscalationSourceVerified(rule(), [], [], SOURCE_KEY, NOW)).toBe(
    false,
  );
});
it('preserves legacy any-pending rules and does not invent a minimum wait', () => {
  const currentRule = rule({
    condition: 'TASK_REVIEW',
    minimumReviewWaitHours: undefined,
  });
  expect(currentRule.minimumReviewWaitHours).toBeNull();
  expect(matchFounderEscalation(currentRule, [source('')], NOW)).toHaveLength(
    1,
  );
});
it.each([
  { minimumReviewWaitHours: 0 },
  { minimumReviewWaitHours: 721 },
  { minimumReviewWaitHours: 1.5 },
  { condition: 'TASK_OVERDUE', minimumReviewWaitHours: 2 },
])('rejects an invalid or unrelated wait configuration %j', (fields) => {
  expect(() => rule(fields)).toThrow();
});

it('opens a separate occurrence for each known submission and positively closes only its replaced version', () => {
  const current = source();
  expect(matchFounderEscalation(rule(), [current], NOW)[0].key).toBe(
    SOURCE_KEY,
  );
  expect(
    founderEscalationSourceVerified(
      rule(),
      [current],
      [VERIFIED_KEY],
      `TASK_REVIEW:${TASK_ID}:1`,
      NOW,
    ),
  ).toBe(true);
  current.evidence.reviewSubmittedAt = null;
  expect(
    founderEscalationSourceVerified(
      rule(),
      [current],
      [VERIFIED_KEY],
      `TASK_REVIEW:${TASK_ID}:1`,
      NOW,
    ),
  ).toBe(true);
  expect(
    founderEscalationSourceVerified(
      rule(),
      [current],
      [VERIFIED_KEY],
      SOURCE_KEY,
      NOW,
    ),
  ).toBe(false);
  expect(
    matchFounderEscalation(
      rule({ condition: 'TASK_REVIEW', minimumReviewWaitHours: null }),
      [current],
      NOW,
    )[0].key,
  ).toBe(VERIFIED_KEY);
});
