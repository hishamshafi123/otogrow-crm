import { BadRequestException, ConflictException } from '@nestjs/common';
import { type DeliveryDetails } from 'src/modules/delivery/delivery.types';
import { type Fulfilment } from 'src/modules/delivery/operations/delivery-operations.types';
import {
  founderAction,
  founderEvidence,
  founderException,
  founderExceptionPage,
  founderExceptionsSchema,
  founderTaskExceptions,
  type FounderTask,
} from 'src/modules/delivery/founder/delivery-founder.policy';

const WORKSPACE_ID = '0a420537-0122-45c3-a2f5-18298b636227';
const PROJECT_ID = 'dc95aebb-52a0-4aa0-bc8f-f93b24b11689';
const OWNER_ID = '2a3587de-498f-48bf-a1a8-9939109f877a';
const REVIEWER_ID = '3516f2eb-0554-49db-a56c-306e3273cb16';
const TASK_ID = 'd908d75f-00c9-4e91-8071-27c4b3216a79';
const owners = [
  { id: OWNER_ID, name: 'Assigned editor' },
  { id: REVIEWER_ID, name: 'Independent reviewer' },
];
const now = new Date('2026-10-28T10:00:00.000Z');
const task = (fields: Partial<FounderTask> = {}): FounderTask => ({
  id: TASK_ID,
  title: 'Client deliverable',
  projectId: PROJECT_ID,
  revision: 3,
  state: 'IN_PROGRESS',
  assigneeId: OWNER_ID,
  reviewerId: REVIEWER_ID,
  dueAt: '2026-10-27T10:00:00.000Z',
  updatedAt: '2026-10-27T08:00:00.000Z',
  nativeUpdatedAt: '2026-10-27T08:00:00.000Z',
  ...fields,
});
const taskItems = (fields: Partial<FounderTask> = {}) =>
  founderTaskExceptions(task(fields), owners, 'Client Alpha', now);
const query = (fields: Record<string, unknown> = {}) =>
  founderExceptionsSchema.parse(fields);

it('consolidates overdue, blocked and missing-owner facts into one stable task row', () => {
  const [item] = taskItems({ state: 'BLOCKED', assigneeId: null });
  expect(taskItems({ state: 'BLOCKED', assigneeId: null })).toHaveLength(1);
  expect(item).toMatchObject({
    key: `DELIVERY:TASK:${TASK_ID}`,
    reasonCode: 'TASK_BLOCKED',
    ownerState: 'UNASSIGNED',
    evidence: {
      state: 'BLOCKED',
      warnings: ['TASK_OVERDUE', 'TASK_OWNER_UNASSIGNED'],
    },
  });
  expect(taskItems({ state: 'CHANGES_REQUESTED' })[0].key).toBe(item.key);
});

it('assigns review work to the stored reviewer and preserves the actual past deadline as evidence', () => {
  expect(taskItems({ state: 'IN_REVIEW' })[0]).toMatchObject({
    reasonCode: 'TASK_REVIEW',
    ownerId: REVIEWER_ID,
    ownerName: 'Independent reviewer',
    evidence: { warnings: ['TASK_OVERDUE', 'TASK_REVIEW_TIME_UNAVAILABLE'] },
    nextAction: { code: 'REVIEW_SUBMISSION', targetId: TASK_ID },
  });
});

it('does not turn review work without a passed deadline into an overdue failure', () => {
  expect(
    taskItems({ state: 'IN_REVIEW', dueAt: '2026-10-29T00:00:00.000Z' })[0]
      .evidence.warnings,
  ).not.toContain('TASK_OVERDUE');
});

it('flags past-due internal approval without actual client delivery and keeps its reviewer accountable', () => {
  expect(taskItems({ state: 'APPROVED', assigneeId: null })[0]).toMatchObject({
    reasonCode: 'TASK_DELIVERY_OVERDUE',
    ownerId: REVIEWER_ID,
    evidence: { state: 'APPROVED', warnings: ['DELIVERY_NOT_DELIVERED'] },
    nextAction: {
      code: 'REVIEW_DELIVERY',
      targetType: 'TASK',
      targetId: TASK_ID,
    },
  });
});

it('does not invent an exception for ordinary assigned work with no deadline', () => {
  expect(taskItems({ dueAt: null })).toEqual([]);
});

it('keeps a departed owner unavailable instead of selecting another project member', () => {
  const id = '5516f2eb-0554-49db-a56c-306e3273cb16';
  expect(taskItems({ assigneeId: id, dueAt: null })[0]).toMatchObject({
    reasonCode: 'TASK_OWNER_UNAVAILABLE',
    ownerId: id,
    ownerName: null,
    ownerState: 'UNAVAILABLE',
  });
});

it.each([
  { title: 'Native title changed' },
  { dueAt: '2026-10-27T09:00:00.000Z' },
  { nativeUpdatedAt: '2026-10-27T08:00:00.000001Z' },
  { revision: 4 },
])('invalidates task provenance after a current source edit: %j', (change) => {
  expect(taskItems(change)[0].sourceRevision).not.toBe(
    taskItems()[0].sourceRevision,
  );
});

it('counts all matching unique tasks while returning a bounded page', () => {
  const items = Array.from({ length: 53 }, (_, index) => ({
    ...taskItems({ state: 'BLOCKED' })[0],
    key: `DELIVERY:TASK:${String(index).padStart(4, '0')}`,
  }));
  const page = founderExceptionPage(
    WORKSPACE_ID,
    [...items, items[0]],
    query({ limit: 25 }),
  );
  expect(page.totalCount).toBe(53);
  expect(page.counts.find((count) => count.domain === 'DELIVERY')?.count).toBe(
    53,
  );
  expect(page.items).toHaveLength(25);
  const second = founderExceptionPage(
    WORKSPACE_ID,
    items,
    query({ limit: 25, after: page.nextCursor }),
  );
  expect(second.items).toHaveLength(25);
  expect(
    new Set([...page.items, ...second.items].map((item) => item.key)).size,
  ).toBe(50);
  expect(second.totalCount).toBe(53);
});

it('rejects a cursor when previously reviewed source evidence changed', () => {
  const items = [
    taskItems()[0],
    { ...taskItems()[0], key: 'DELIVERY:TASK:zz' },
  ];
  const first = founderExceptionPage(WORKSPACE_ID, items, query({ limit: 1 }));
  expect(() =>
    founderExceptionPage(
      WORKSPACE_ID,
      [{ ...items[0], sourceRevision: 'changed' }, items[1]],
      query({ limit: 1, after: first.nextCursor }),
    ),
  ).toThrow(ConflictException);
});

it('binds cursors to workspace and filters rather than accepting another queue page', () => {
  const items = [
    taskItems()[0],
    { ...taskItems()[0], key: 'DELIVERY:TASK:zz' },
  ];
  const first = founderExceptionPage(WORKSPACE_ID, items, query({ limit: 1 }));
  expect(() =>
    founderExceptionPage(
      WORKSPACE_ID,
      items,
      query({ limit: 1, domain: 'DELIVERY', after: first.nextCursor }),
    ),
  ).toThrow(BadRequestException);
  expect(() =>
    founderExceptionPage(
      '1a420537-0122-45c3-a2f5-18298b636227',
      items,
      query({ limit: 1, after: first.nextCursor }),
    ),
  ).toThrow(BadRequestException);
});

it('keeps nonmonetary task evidence while filtering financial currencies exactly', () => {
  const financial = (currency: string) =>
    founderException({
      domain: 'FINANCE',
      sourceType: 'MONTHLY_RESULT',
      reasonCode: 'MONTHLY_NEGATIVE_RESULT',
      title: currency,
      evidence: founderEvidence({
        currency,
        resultMicros: '-9007199254740993',
      }),
      nextAction: founderAction({
        code: 'REVIEW_MONTHLY',
        targetType: 'MONTHLY',
        currency,
        serviceMonth: '2026-10',
      }),
    });
  const page = founderExceptionPage(
    WORKSPACE_ID,
    [taskItems()[0], financial('USD'), financial('EUR')],
    query({ currency: 'USD' }),
  );
  expect(page.totalCount).toBe(2);
  expect(
    page.items.find((item) => item.domain === 'FINANCE')?.evidence.resultMicros,
  ).toBe('-9007199254740993');
  expect(page.items.some((item) => item.domain === 'DELIVERY')).toBe(true);
  expect(page.items.some((item) => item.evidence.currency === 'EUR')).toBe(
    false,
  );
});

it.each([
  { limit: 0 },
  { limit: 51 },
  { currency: 'USDX' },
  { ownerId: 'UNASSIGNED' },
  { after: 'a'.repeat(2001) },
  { serviceMonth: '2026-13' },
])('rejects unsupported query inputs %j', (input) => {
  expect(founderExceptionsSchema.safeParse(input).success).toBe(false);
});

const approvedSubmissions: DeliveryDetails['submissions'] = [
  {
    version: 2,
    description: '',
    evidence: [],
    submittedBy: OWNER_ID,
    submittedAt: '2026-10-25T10:00:00Z',
    decision: 'APPROVED',
    reviewedBy: REVIEWER_ID,
    reviewedAt: '2026-10-25T11:00:00Z',
  },
];
const delivery = (fields: Partial<Fulfilment> = {}): Fulfilment => ({
  taskId: TASK_ID,
  status: 'WAITING',
  cycle: 2,
  deliveredSubmissionVersion: 2,
  deliveredAt: '2026-10-25T12:00:00Z',
  nextCheckAt: null,
  history: [
    {
      at: '2026-10-25T12:00:00Z',
      actorId: REVIEWER_ID,
      action: 'DELIVERED',
      note: '',
    },
  ],
  ...fields,
});
const approvedItems = (
  evidence?: Fulfilment,
  fields: Partial<FounderTask> = {},
) =>
  founderTaskExceptions(
    task({ state: 'APPROVED', ...fields }),
    owners,
    'Client Alpha',
    now,
    evidence,
    approvedSubmissions,
  );

it('suppresses overdue-delivery attention for matching current approved-version delivery awaiting fulfilment', () => {
  expect(approvedItems(delivery())).toEqual([]);
});

it('suppresses overdue-delivery attention only after matching current cycle fulfilment evidence', () => {
  expect(
    approvedItems(
      delivery({
        status: 'FULFILLED',
        history: [
          {
            at: '2026-10-25T13:00:00Z',
            actorId: REVIEWER_ID,
            action: 'FULFILLED',
            note: '',
          },
        ],
      }),
    ),
  ).toEqual([]);
});

it.each<Partial<Fulfilment>>([
  { deliveredSubmissionVersion: 1 },
  { deliveredSubmissionVersion: undefined },
  { deliveredAt: '2026-10-25T10:30:00Z' },
])(
  'retains overdue-delivery attention for stale or unproved approved-version evidence %j',
  (fields) => {
    expect(approvedItems(delivery(fields))[0]).toMatchObject({
      reasonCode: 'TASK_DELIVERY_OVERDUE',
      evidence: { warnings: ['DELIVERY_NEEDS_RECONFIRMATION'] },
    });
  },
);

it('keeps a redo cycle overdue even when its older approved version was delivered', () => {
  expect(
    approvedItems(delivery({ status: 'REDOING', cycle: 3 }))[0],
  ).toMatchObject({
    reasonCode: 'TASK_DELIVERY_OVERDUE',
    evidence: { warnings: ['DELIVERY_REDOING'] },
  });
});

it('does not reuse a previous cycle fulfilment timestamp for a later delivery cycle', () => {
  expect(
    approvedItems(
      delivery({
        status: 'FULFILLED',
        cycle: 3,
        deliveredAt: '2026-10-26T12:00:00Z',
        history: [
          {
            at: '2026-10-25T13:00:00Z',
            actorId: REVIEWER_ID,
            action: 'FULFILLED',
            note: '',
          },
        ],
      }),
    )[0],
  ).toMatchObject({
    reasonCode: 'TASK_DELIVERY_OVERDUE',
    evidence: { warnings: ['DELIVERY_NEEDS_RECONFIRMATION'] },
  });
});

it('does not invent overdue delivery before the actual deadline', () => {
  expect(approvedItems(undefined, { dueAt: '2026-10-29T00:00:00Z' })).toEqual(
    [],
  );
  expect(approvedItems(undefined, { dueAt: null })).toEqual([]);
});

it('invalidates task provenance when the current redo delivery cycle changes', () => {
  expect(
    approvedItems(delivery({ status: 'REDOING', cycle: 3 }))[0].sourceRevision,
  ).not.toBe(
    approvedItems(delivery({ status: 'REDOING', cycle: 2 }))[0].sourceRevision,
  );
});
