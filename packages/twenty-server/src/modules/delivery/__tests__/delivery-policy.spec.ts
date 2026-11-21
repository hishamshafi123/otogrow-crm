import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  assertDeliveryReview,
  canAccessDeliveryProject,
} from 'src/modules/delivery/delivery-policy';
import { deliveryCommandSchema } from 'src/modules/delivery/delivery-validation';
import { type DeliveryDetails } from 'src/modules/delivery/delivery.types';

const editorId = '20202020-0000-4000-8000-000000000001';
const reviewerId = '20202020-0000-4000-8000-000000000002';
const pendingDetails = (): DeliveryDetails => ({
  brief: 'Show the actual product',
  service: 'Video',
  priority: 'NORMAL',
  scheduledDate: null,
  reviewerId,
  state: 'IN_REVIEW',
  blocker: '',
  checklist: [],
  evidence: ['https://example.com/video'],
  submissions: [
    {
      version: 1,
      description: 'First cut',
      evidence: ['https://example.com/video'],
      submittedBy: editorId,
      submittedAt: '2026-10-24T00:00:00.000Z',
    },
  ],
  events: [],
});

describe('delivery authorization', () => {
  it('allows members only within their assigned project and managers across projects', () => {
    expect(canAccessDeliveryProject(false, editorId, [editorId])).toBe(true);
    expect(canAccessDeliveryProject(false, editorId, [reviewerId])).toBe(false);
    expect(canAccessDeliveryProject(true, reviewerId, [])).toBe(true);
  });
  it('rejects self approval even when the assignee is an administrator', () => {
    const details = { ...pendingDetails(), reviewerId: editorId };
    expect(() =>
      assertDeliveryReview(details, editorId, editorId, true, '', 'APPROVED'),
    ).toThrow(ForbiddenException);
  });
  it.each([
    [reviewerId, false],
    [editorId, true],
  ])('rejects unauthorized reviewer %s', (actorId, manager) => {
    expect(() =>
      assertDeliveryReview(
        pendingDetails(),
        editorId,
        actorId,
        manager,
        '',
        'APPROVED',
      ),
    ).toThrow(ForbiddenException);
  });
  it('allows the assigned manager to approve another teammate’s submission', () => {
    expect(() =>
      assertDeliveryReview(
        pendingDetails(),
        editorId,
        reviewerId,
        true,
        '',
        'APPROVED',
      ),
    ).not.toThrow();
  });
  it.each([
    'PLANNED',
    'IN_PROGRESS',
    'BLOCKED',
    'CHANGES_REQUESTED',
    'APPROVED',
  ] as const)('rejects a review from %s', (state) => {
    expect(() =>
      assertDeliveryReview(
        { ...pendingDetails(), state },
        editorId,
        reviewerId,
        true,
        '',
        'APPROVED',
      ),
    ).toThrow(BadRequestException);
  });
  it('requires a submission and actionable revision feedback', () => {
    expect(() =>
      assertDeliveryReview(
        { ...pendingDetails(), submissions: [] },
        editorId,
        reviewerId,
        true,
        '',
        'APPROVED',
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      assertDeliveryReview(
        pendingDetails(),
        editorId,
        reviewerId,
        true,
        '  ',
        'CHANGES_REQUESTED',
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      assertDeliveryReview(
        pendingDetails(),
        editorId,
        reviewerId,
        true,
        'Fix product label',
        'CHANGES_REQUESTED',
      ),
    ).not.toThrow();
  });
});

describe('delivery commands', () => {
  const submit = {
    action: 'submit',
    taskId: editorId,
    revision: 1,
    description: 'First cut',
    evidence: ['https://example.com/video'],
  };
  it('accepts a versioned submission with evidence', () => {
    expect(deliveryCommandSchema.safeParse(submit).success).toBe(true);
  });
  it('allows stored creative evidence to be validated against its task by the service', () => {
    expect(
      deliveryCommandSchema.safeParse({ ...submit, evidence: [] }).success,
    ).toBe(true);
  });
  it.each([
    { evidence: ['javascript:alert(1)'] },
    { evidence: ['file:///etc/passwd'] },
  ])('rejects unsafe evidence %s', ({ evidence }) => {
    expect(
      deliveryCommandSchema.safeParse({ ...submit, evidence }).success,
    ).toBe(false);
  });
  it('rejects missing concurrency versions and injected authority fields', () => {
    expect(
      deliveryCommandSchema.safeParse({ ...submit, revision: undefined })
        .success,
    ).toBe(false);
    expect(
      deliveryCommandSchema.safeParse({ ...submit, access: 'ADMIN' }).success,
    ).toBe(false);
  });
  it('does not let progress commands mark work approved', () => {
    expect(
      deliveryCommandSchema.safeParse({
        action: 'progress',
        taskId: editorId,
        revision: 1,
        state: 'APPROVED',
        blocker: '',
        checklist: [],
        evidence: [],
      }).success,
    ).toBe(false);
  });
});


it('allows only the saved first-task self-review exception during final approval', () => {
  const details: DeliveryDetails = {
    ...pendingDetails(),
    reviewerId: editorId,
    allowSelfReview: true,
  };
  expect(() =>
    assertDeliveryReview(
      details,
      editorId,
      editorId,
      true,
      '',
      'APPROVED',
    ),
  ).not.toThrow();
  expect(() =>
    assertDeliveryReview(
      details,
      editorId,
      reviewerId,
      true,
      '',
      'APPROVED',
    ),
  ).toThrow(ForbiddenException);
});
