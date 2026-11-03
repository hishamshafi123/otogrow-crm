import { BadRequestException } from '@nestjs/common';
import {
  capacityReadCursor,
  capacityReadScope,
  deliveryCapacityAssignmentsSchema,
  deliveryCapacityReadDates,
  deliveryCapacitySummarySchema,
  parseCapacityReadInput,
  readCapacityReadCursor,
} from 'src/modules/delivery/capacity/read/delivery-capacity-read.policy';

const MEMBER_ID = '748e2175-f020-4b10-b242-0cd1cecb8414';
const calendar = { startDate: '2026-10-29', timezone: 'Asia/Qatar' };

it('uses exactly seven entered calendar dates across leap, month and year boundaries', () => {
  expect(deliveryCapacityReadDates('2028-02-27')).toEqual([
    '2028-02-27',
    '2028-02-28',
    '2028-02-29',
    '2028-03-01',
    '2028-03-02',
    '2028-03-03',
    '2028-03-04',
  ]);
  expect(deliveryCapacityReadDates('2026-12-29')[6]).toBe('2027-01-04');
  expect(deliveryCapacityReadDates('0099-12-29')[6]).toBe('0100-01-04');
});
it.each(['2026-02-30', '1900-02-29', '0000-01-01', '9999-12-26', 'not-a-date'])(
  'rejects invalid or overflowing range %s',
  (date) => {
    expect(() => deliveryCapacityReadDates(date)).toThrow(BadRequestException);
  },
);
it('bounds both reads and rejects browser filters that could misrepresent whole-team capacity', () => {
  expect(
    parseCapacityReadInput(deliveryCapacitySummarySchema, {
      ...calendar,
      limit: 25,
    }),
  ).toMatchObject({ limit: 25 });
  for (const input of [
    { ...calendar, limit: 26 },
    { ...calendar, limit: 0 },
    { ...calendar, timezone: 'invalid/zone' },
    { ...calendar, projectId: MEMBER_ID },
    { ...calendar, state: 'APPROVED' },
    { ...calendar, today: '2026-10-29' },
  ])
    expect(() =>
      parseCapacityReadInput(deliveryCapacitySummarySchema, input),
    ).toThrow(BadRequestException);
});
it('requires exact explicit owner and date selections, including the global unavailable-owner recovery', () => {
  for (const selection of [
    { memberId: MEMBER_ID, bucket: 'DAY', date: calendar.startDate },
    { memberId: MEMBER_ID, bucket: 'NEEDS_PLANNING', date: null },
    { memberId: null, bucket: 'UNAVAILABLE_OWNER', date: null },
  ])
    expect(
      parseCapacityReadInput(deliveryCapacityAssignmentsSchema, {
        ...calendar,
        ...selection,
      }),
    ).toMatchObject(selection);
  for (const selection of [
    { memberId: MEMBER_ID, bucket: 'DAY', date: null },
    { memberId: MEMBER_ID, bucket: 'NEEDS_PLANNING', date: calendar.startDate },
    { memberId: MEMBER_ID, bucket: 'UNAVAILABLE_OWNER', date: null },
    { bucket: 'UNAVAILABLE_OWNER', date: null },
    { memberId: null, bucket: 'UNAVAILABLE_OWNER' },
  ])
    expect(() =>
      parseCapacityReadInput(deliveryCapacityAssignmentsSchema, {
        ...calendar,
        ...selection,
      }),
    ).toThrow(BadRequestException);
});
it('binds tied-name and dual-assignment cursors to current authority and exact selection', () => {
  const scope = capacityReadScope({ ...calendar, memberId: MEMBER_ID });
  const summary = capacityReadCursor(scope, 'SUMMARY', [
    'Same name',
    MEMBER_ID,
  ]);
  expect(readCapacityReadCursor(summary, scope, 'SUMMARY')).toEqual([
    'Same name',
    MEMBER_ID,
  ]);
  const assignments = capacityReadCursor(scope, 'ASSIGNMENTS', [
    '',
    'Same task',
    MEMBER_ID,
    'REVIEW',
  ]);
  expect(readCapacityReadCursor(assignments, scope, 'ASSIGNMENTS')).toEqual([
    '',
    'Same task',
    MEMBER_ID,
    'REVIEW',
  ]);
  expect(() => readCapacityReadCursor(summary, scope, 'ASSIGNMENTS')).toThrow(
    BadRequestException,
  );
  expect(() =>
    readCapacityReadCursor(
      assignments,
      capacityReadScope({ ...calendar, memberId: null }),
      'ASSIGNMENTS',
    ),
  ).toThrow(BadRequestException);
  expect(() => readCapacityReadCursor('invalid', scope, 'SUMMARY')).toThrow(
    BadRequestException,
  );
  expect(() =>
    readCapacityReadCursor(
      capacityReadCursor(scope, 'ASSIGNMENTS', [
        '',
        'Task',
        MEMBER_ID,
        'OTHER',
      ]),
      scope,
      'ASSIGNMENTS',
    ),
  ).toThrow(BadRequestException);
});
