import { BadRequestException } from '@nestjs/common';
import {
  deliveryTaskBusinessDate,
  deliveryTaskCommand,
  deliveryTaskCursor,
  deliveryTaskListSchema,
  deliveryTaskScopeHash,
  parseDeliveryTaskInput,
  readDeliveryTaskCursor,
  type DeliveryTaskSort,
} from 'src/modules/delivery/tasks/delivery-tasks.policy';

const TASK_ID = '748e2175-f020-4b10-b242-0cd1cecb8414';
const sort: DeliveryTaskSort = [
  0,
  1,
  '2026-10-29T10:00:00.123456',
  '2026-10-29',
  'Exact task',
  TASK_ID,
];

it('uses the viewer calendar across UTC midnight, DST and fractional-hour zones', () => {
  expect(
    deliveryTaskBusinessDate(new Date('2026-10-29T22:30:00Z'), 'Asia/Qatar'),
  ).toBe('2026-10-30');
  expect(
    deliveryTaskBusinessDate(
      new Date('2026-11-01T05:30:00Z'),
      'America/New_York',
    ),
  ).toBe('2026-11-01');
  expect(
    deliveryTaskBusinessDate(
      new Date('2026-10-29T18:30:00Z'),
      'Asia/Kathmandu',
    ),
  ).toBe('2026-10-30');
});
it('accepts bounded exact task filters without accepting a browser-supplied today or Planner scope', () => {
  expect(
    parseDeliveryTaskInput(deliveryTaskListSchema, {
      view: 'MINE',
      timezone: 'Asia/Qatar',
      scheduledFrom: '2026-10-29',
      scheduledThrough: '2026-10-30',
      limit: 50,
    }),
  ).toMatchObject({ view: 'MINE', limit: 50 });
  for (const input of [
    { view: 'ARCHIVED', timezone: 'UTC' },
    { view: 'HOME', timezone: 'invalid/zone' },
    { view: 'HOME', timezone: 'UTC', limit: 51 },
    { view: 'HOME', timezone: 'UTC', today: '2026-10-29' },
    { view: 'HOME', timezone: 'UTC', scheduledThrough: '2026-10-29' },
    {
      view: 'HOME',
      timezone: 'UTC',
      scheduledFrom: '2026-10-30',
      scheduledThrough: '2026-10-29',
    },
  ])
    expect(() => parseDeliveryTaskInput(deliveryTaskListSchema, input)).toThrow(
      BadRequestException,
    );
});
it('preserves microsecond sort identity and reference time, binding pages to current permission and filters', () => {
  const scope = deliveryTaskScopeHash({
    memberId: TASK_ID,
    projects: [TASK_ID],
    view: 'MINE',
  });
  const cursor = deliveryTaskCursor(scope, '2026-10-29T10:00:00.000Z', sort);
  expect(readDeliveryTaskCursor(cursor, scope)).toEqual({
    scope,
    observedAt: '2026-10-29T10:00:00.000Z',
    sort,
  });
  expect(() =>
    readDeliveryTaskCursor(
      cursor,
      deliveryTaskScopeHash({ projects: [], view: 'MINE' }),
    ),
  ).toThrow(BadRequestException);
  expect(() => readDeliveryTaskCursor('bad cursor', scope)).toThrow(
    BadRequestException,
  );
  expect(readDeliveryTaskCursor(null, scope)).toBeNull();
});
it('keeps existing task business validation and exact creative/review versions in the thin adapter', () => {
  const input = {
    action: 'review',
    taskId: TASK_ID,
    revision: 7,
    selectedSubmissionVersion: 2,
    reviewAssignmentRevision: 3,
    creativeVersion: 4,
    finalAssetId: TASK_ID,
    decision: 'CHANGES_REQUESTED',
    feedback: 'Use the reviewed correction.',
    plan: null,
  };
  expect(deliveryTaskCommand(input)).toEqual({ ...input, plan: undefined });
  expect(() =>
    deliveryTaskCommand({ ...input, reviewAssignmentRevision: -1 }),
  ).toThrow(BadRequestException);
  expect(() =>
    deliveryTaskCommand({
      action: 'member',
      workspaceMemberId: TASK_ID,
      access: 'ADMIN',
      roleLabel: 'Owner',
    }),
  ).toThrow(BadRequestException);
  expect(() =>
    deliveryTaskCommand({
      action: 'project',
      name: 'Other scope',
      companyId: null,
      memberIds: [],
    }),
  ).toThrow(BadRequestException);
});
