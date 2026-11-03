import { ConflictException } from '@nestjs/common';
import {
  assertDeliveryReviewAssignmentRevision,
  deliveryReviewAuthority,
  readCurrentDeliveryReviewAssignments,
} from 'src/modules/delivery/reviews/delivery-review-authority';
import { type EntityManager } from 'typeorm';
const PRIMARY = '4182ff40-d35d-49e9-b575-e23c6e101625',
  BACKUP = '5bf0cf27-a867-4302-adbb-74a87606c0b8',
  ASSIGNEE = '8de89106-fc21-43a9-9597-5d02571b765e';
const input = () => ({
  primaryReviewerId: PRIMARY,
  assigneeId: ASSIGNEE,
  projectMemberIds: [BACKUP, ASSIGNEE],
  access: [
    { memberId: PRIMARY, capabilities: ['delivery.manage'] },
    { memberId: BACKUP, capabilities: ['delivery.review'] },
  ],
  actorId: BACKUP,
});
const assignment = { mode: 'BACKUP' as const, reviewerId: BACKUP, revision: 1 };
it('retains primary-manager scope when no submission-specific assignment exists', () => {
  expect(
    deliveryReviewAuthority({ ...input(), actorId: PRIMARY }),
  ).toMatchObject({
    effectiveReviewerId: PRIMARY,
    assignmentRevision: 0,
    assignmentMode: 'PRIMARY',
    reviewerState: 'ACTIVE',
    canReview: true,
  });
  expect(deliveryReviewAuthority(input()).canReview).toBe(false);
});
it('allows only an explicitly assigned independent backup in an existing project', () => {
  expect(deliveryReviewAuthority({ ...input(), assignment })).toMatchObject({
    primaryReviewerId: PRIMARY,
    effectiveReviewerId: BACKUP,
    reviewerState: 'ACTIVE',
    canReview: true,
  });
  expect(
    deliveryReviewAuthority({ ...input(), assignment, actorId: PRIMARY })
      .canReview,
  ).toBe(false);
  expect(
    deliveryReviewAuthority({
      ...input(),
      assignment,
      projectMemberIds: [ASSIGNEE],
    }),
  ).toMatchObject({
    effectiveReviewerId: BACKUP,
    reviewerState: 'UNAVAILABLE',
    canReview: false,
  });
});
it.each([
  { capabilities: [] },
  { capabilities: ['phone.use'] },
  { capabilities: ['finance.manage'] },
])(
  'never derives review authority from unrelated grants %p',
  ({ capabilities }) => {
    const current = input();
    current.access[1].capabilities = capabilities;
    expect(deliveryReviewAuthority({ ...current, assignment })).toMatchObject({
      effectiveReviewerId: BACKUP,
      reviewerState: 'UNAVAILABLE',
      canReview: false,
    });
  },
);
it('does not silently fall back when a chosen backup leaves the workspace or loses review access', () => {
  expect(
    deliveryReviewAuthority({
      ...input(),
      assignment,
      access: [input().access[0]],
      actorId: PRIMARY,
    }),
  ).toMatchObject({
    effectiveReviewerId: BACKUP,
    reviewerState: 'UNAVAILABLE',
    canReview: false,
  });
});
it('prevents self-review after assignee changes, including managerial backups', () => {
  expect(
    deliveryReviewAuthority({
      ...input(),
      assignment,
      assigneeId: BACKUP,
      access: [{ memberId: BACKUP, capabilities: ['delivery.manage'] }],
    }),
  ).toMatchObject({ reviewerState: 'SELF_REVIEW', canReview: false });
});
it('keeps a canonical reviewer with only scoped-review capability unavailable as delivery manager', () => {
  expect(
    deliveryReviewAuthority({ ...input(), primaryReviewerId: BACKUP }),
  ).toMatchObject({ reviewerState: 'UNAVAILABLE', canReview: false });
});
it('requires the current assignment version after any explicit delegation or reset', () => {
  expect(() =>
    assertDeliveryReviewAssignmentRevision(0, undefined),
  ).not.toThrow();
  expect(() => assertDeliveryReviewAssignmentRevision(1, undefined)).toThrow(
    ConflictException,
  );
  expect(() => assertDeliveryReviewAssignmentRevision(2, 1)).toThrow(
    ConflictException,
  );
  expect(() => assertDeliveryReviewAssignmentRevision(2, 2)).not.toThrow();
});
it('retains explicit primary restoration revision without retaining the old backup', () => {
  expect(
    deliveryReviewAuthority({
      ...input(),
      assignment: { mode: 'PRIMARY', reviewerId: null, revision: 2 },
      actorId: PRIMARY,
    }),
  ).toMatchObject({
    effectiveReviewerId: PRIMARY,
    assignmentRevision: 2,
    canReview: true,
  });
});
it('rejects out-of-range source versions before issuing a database cast', async () => {
  const query = jest.fn();
  await expect(
    readCurrentDeliveryReviewAssignments(
      { query } as unknown as EntityManager,
      '0a420537-0122-45c3-a2f5-18298b636227',
      [
        {
          taskId: '748e2175-f020-4b10-b242-0cd1cecb8414',
          submissionVersion: 2147483648,
        },
      ],
    ),
  ).rejects.toThrow('source identity is unavailable');
  expect(query).not.toHaveBeenCalled();
});
