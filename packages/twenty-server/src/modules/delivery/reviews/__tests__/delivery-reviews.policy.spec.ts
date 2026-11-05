import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  deliveryReviewAge,
  deliveryReviewAssignmentSchema,
  deliveryReviewCursor,
  deliveryReviewOffset,
  deliveryReviewHistoryCursor,
  readDeliveryReviewHistoryCursor,
  parseDeliveryReview,
} from 'src/modules/delivery/reviews/delivery-reviews.policy';
const WORKSPACE = '0a420537-0122-45c3-a2f5-18298b636227',
  TASK = '748e2175-f020-4b10-b242-0cd1cecb8414',
  MEMBER = '5bf0cf27-a867-4302-adbb-74a87606c0b8';
it('binds opaque history pages to current identity and native permission without accepting legacy raw IDs', () => {
  const scope = {
    workspaceId: WORKSPACE,
    memberId: MEMBER,
    taskId: TASK,
    nativeAccess: 'policy-one',
  };
  const cursor = deliveryReviewHistoryCursor(scope, MEMBER);
  expect(readDeliveryReviewHistoryCursor(cursor, scope)).toBe(MEMBER);
  expect(readDeliveryReviewHistoryCursor(null, scope)).toBeNull();
  for (const stale of [MEMBER, 'malformed', 'x'.repeat(2049), cursor + '='])
    expect(() => readDeliveryReviewHistoryCursor(stale, scope)).toThrow(
      'first page',
    );
  expect(() =>
    readDeliveryReviewHistoryCursor(cursor, {
      ...scope,
      nativeAccess: 'policy-two',
    }),
  ).toThrow('first page');
  expect(() =>
    readDeliveryReviewHistoryCursor(cursor, { ...scope, memberId: TASK }),
  ).toThrow('first page');
});
it('measures the exact submitted wait rather than task modification or planned capacity', () => {
  expect(
    deliveryReviewAge('2026-10-29T09:30:00Z', new Date('2026-10-29T10:00:00Z')),
  ).toEqual({
    submittedAt: '2026-10-29T09:30:00.000Z',
    ageSeconds: 1800,
    ageState: 'VALID',
  });
});
it.each([null, undefined, 'not a date', '2026-10-29'])(
  'keeps unknown timestamps unknown: %p',
  (value) => {
    expect(
      deliveryReviewAge(value, new Date('2026-10-29T10:00:00Z')),
    ).toMatchObject({ ageSeconds: null, ageState: 'UNKNOWN' });
  },
);
it('keeps future submission timestamps visible without inventing negative elapsed age', () => {
  expect(
    deliveryReviewAge('2026-10-30T00:00:00Z', new Date('2026-10-29T10:00:00Z')),
  ).toEqual({
    submittedAt: '2026-10-30T00:00:00.000Z',
    ageSeconds: null,
    ageState: 'FUTURE',
  });
});
it('keeps cursor valid across clock observation while rejecting changed source or scope', () => {
  const filter = { mine: true },
    sources = [{ taskId: TASK, submissionVersion: 1, assignmentRevision: 0 }];
  const cursor = deliveryReviewCursor(WORKSPACE, filter, sources, 25);
  expect(deliveryReviewOffset(cursor, WORKSPACE, filter, sources)).toBe(25);
  expect(() =>
    deliveryReviewOffset(cursor, WORKSPACE, filter, [
      { ...sources[0], assignmentRevision: 1 },
    ]),
  ).toThrow(ConflictException);
  expect(() =>
    deliveryReviewOffset(cursor, WORKSPACE, { mine: false }, sources),
  ).toThrow(ConflictException);
  expect(() =>
    deliveryReviewOffset('bad cursor', WORKSPACE, filter, sources),
  ).toThrow(BadRequestException);
});
it('requires an explicit independent backup identity or a primary reset, and a reason', () => {
  const command = {
    commandId: MEMBER,
    taskId: TASK,
    taskRevision: 1,
    submissionVersion: 1,
    assignmentRevision: 0,
    mode: 'BACKUP',
    reviewerId: MEMBER,
    reason: 'Cover the current pending review.',
  };
  expect(
    parseDeliveryReview(deliveryReviewAssignmentSchema, command).reviewerId,
  ).toBe(MEMBER);
  expect(() =>
    parseDeliveryReview(deliveryReviewAssignmentSchema, {
      ...command,
      reviewerId: null,
    }),
  ).toThrow(BadRequestException);
  expect(() =>
    parseDeliveryReview(deliveryReviewAssignmentSchema, {
      ...command,
      mode: 'PRIMARY',
    }),
  ).toThrow(BadRequestException);
  expect(() =>
    parseDeliveryReview(deliveryReviewAssignmentSchema, {
      ...command,
      reason: ' ',
    }),
  ).toThrow(BadRequestException);
  expect(
    parseDeliveryReview(deliveryReviewAssignmentSchema, {
      ...command,
      mode: 'PRIMARY',
      reviewerId: null,
    }).mode,
  ).toBe('PRIMARY');
});
