import { BadRequestException, ConflictException } from '@nestjs/common';
import { z } from 'zod';
import { isDefined } from 'twenty-shared/utils';
import { type DeliveryDetails } from 'src/modules/delivery/delivery.types';
import { type Fulfilment } from 'src/modules/delivery/operations/delivery-operations.types';
import { getDeliveryLifecycle } from 'src/modules/delivery/lifecycle/delivery-lifecycle';
import { deliveryReviewAge } from 'src/modules/delivery/reviews/delivery-reviews.policy';
import { deliveryCurrencySchema } from 'src/modules/delivery/business/delivery-business.types';
import { deliveryFinanceMonthSchema } from 'src/modules/delivery/finance/delivery-finance.policy';
import { financeReviewToken } from 'src/modules/delivery/finance/delivery-finance-reconciliation.policy';
import {
  type DeliveryFounderActionDTO,
  type DeliveryFounderEvidenceDTO,
  type DeliveryFounderExceptionDTO,
  type DeliveryFounderOptionDTO,
  type FounderDomain,
} from 'src/modules/delivery/founder/delivery-founder.dto';

export const FOUNDER_DOMAINS: FounderDomain[] = [
  'DELIVERY',
  'COMMITMENTS',
  'FINANCE',
  'CAMPAIGNS',
  'MANUAL_RISKS',
];
export const FOUNDER_SOURCE_LIMIT = 2000;
export const FOUNDER_EXCEPTION_LIMIT = 12000;
const identifier = z.uuid().transform((value) => value.toLowerCase());
export const founderExceptionsSchema = z
  .object({
    domain: z
      .enum(['ALL', ...FOUNDER_DOMAINS])
      .nullish()
      .transform((value) => value ?? 'ALL'),
    projectId: identifier.nullish().transform((value) => value ?? null),
    ownerId: identifier.nullish().transform((value) => value ?? null),
    currency: deliveryCurrencySchema
      .nullish()
      .transform((value) => value ?? null),
    serviceMonth: deliveryFinanceMonthSchema
      .nullish()
      .transform((value) => value ?? null),
    after: z
      .string()
      .min(1)
      .max(2000)
      .nullish()
      .transform((value) => value ?? null),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .nullish()
      .transform((value) => value ?? 25),
  })
  .strict();
export type FounderExceptionsQuery = z.infer<typeof founderExceptionsSchema>;

export const founderEvidence = (
  fields: Partial<DeliveryFounderEvidenceDTO> = {},
): DeliveryFounderEvidenceDTO => ({
  state: null,
  date: null,
  timezone: null,
  currency: null,
  amountMicros: null,
  revenueMicros: null,
  costMicros: null,
  resultMicros: null,
  promisedQuantity: null,
  fulfilledQuantity: null,
  remainingQuantity: null,
  reviewSubmittedAt: null,
  reviewSubmissionVersion: null,
  reviewAssignmentRevision: null,
  warnings: [],
  ...fields,
});
export const founderAction = (
  fields: Pick<DeliveryFounderActionDTO, 'code' | 'targetType'> &
    Partial<DeliveryFounderActionDTO>,
): DeliveryFounderActionDTO => ({
  targetId: null,
  engagementId: null,
  periodId: null,
  currency: null,
  serviceMonth: null,
  sourceKind: null,
  submissionVersion: null,
  ...fields,
});
export const founderOwner = (
  ownerId: string | null,
  owners: DeliveryFounderOptionDTO[],
) => {
  const owner = owners.find((member) => member.id === ownerId);
  return {
    ownerId,
    ownerName: owner?.name ?? null,
    ownerState: owner ? 'ACTIVE' : ownerId ? 'UNAVAILABLE' : 'UNASSIGNED',
  };
};
export const founderException = (
  fields: Pick<
    DeliveryFounderExceptionDTO,
    'domain' | 'reasonCode' | 'sourceType' | 'title' | 'evidence' | 'nextAction'
  > &
    Partial<DeliveryFounderExceptionDTO>,
): DeliveryFounderExceptionDTO => ({
  key: `${fields.domain}:${fields.sourceType}:${fields.sourceId ?? fields.nextAction.currency ?? 'UNKNOWN'}:${fields.nextAction.serviceMonth ?? ''}:${fields.reasonCode}`,
  sourceId: null,
  sourceRevision: null,
  projectId: null,
  projectName: null,
  occurredAt: null,
  dueAt: null,
  ownerId: null,
  ownerName: null,
  ownerState: 'UNASSIGNED',
  ...fields,
});
export type FounderTask = {
  id: string;
  title: string;
  projectId: string;
  revision: number;
  state: string;
  assigneeId: string | null;
  reviewerId: string | null;
  dueAt: string | null;
  updatedAt: string;
  nativeUpdatedAt: string;
  review?: {
    effectiveReviewerId: string | null;
    reviewerState: string;
    assignmentRevision: number;
  };
};
export const founderTaskExceptions = (
  task: FounderTask,
  owners: DeliveryFounderOptionDTO[],
  projectName: string | null,
  now: Date,
  delivery?: Fulfilment,
  submissions: DeliveryDetails['submissions'] = [],
): DeliveryFounderExceptionDTO[] => {
  const overdue = Boolean(
    task.dueAt &&
    Number.isFinite(Date.parse(task.dueAt)) &&
    Date.parse(task.dueAt) < now.getTime(),
  );
  const lifecycle =
    task.state === 'APPROVED'
      ? getDeliveryLifecycle({ state: 'APPROVED', submissions }, delivery)
      : null;
  if (
    lifecycle &&
    (!overdue ||
      lifecycle.status === 'WAITING' ||
      lifecycle.status === 'FULFILLED')
  )
    return [];
  const pendingReview = task.state === 'IN_REVIEW';
  const submission = submissions[submissions.length - 1];
  const submissionVersion =
    Number.isSafeInteger(submission?.version) && submission.version > 0
      ? submission.version
      : null;
  const reviewAge = deliveryReviewAge(submission?.submittedAt, now);
  const owner = founderOwner(
    pendingReview && task.review
      ? task.review.effectiveReviewerId
      : pendingReview || task.state === 'APPROVED'
        ? task.reviewerId
        : task.assigneeId,
    owners,
  );
  if (pendingReview && task.review && task.review.reviewerState !== 'ACTIVE')
    owner.ownerState =
      task.review.reviewerState === 'UNASSIGNED' ? 'UNASSIGNED' : 'UNAVAILABLE';
  const reasons = [
    ...(task.state === 'BLOCKED' ? ['TASK_BLOCKED'] : []),
    ...(task.state === 'CHANGES_REQUESTED' ? ['TASK_REVISION_REQUESTED'] : []),
    ...(task.state === 'IN_REVIEW' ? ['TASK_REVIEW'] : []),
    ...(overdue ? [lifecycle ? 'TASK_DELIVERY_OVERDUE' : 'TASK_OVERDUE'] : []),
    ...(owner.ownerState === 'UNASSIGNED' ? ['TASK_OWNER_UNASSIGNED'] : []),
    ...(owner.ownerState === 'UNAVAILABLE' ? ['TASK_OWNER_UNAVAILABLE'] : []),
  ];
  const reasonCode = reasons[0];
  if (!reasonCode) return [];
  return [
    founderException({
      key: `DELIVERY:TASK:${task.id}`,
      domain: 'DELIVERY',
      reasonCode,
      sourceType: 'TASK',
      sourceId: task.id,
      sourceRevision: financeReviewToken({
        revision: task.revision,
        title: task.title,
        dueAt: task.dueAt,
        updatedAt: task.updatedAt,
        nativeUpdatedAt: task.nativeUpdatedAt,
        lifecycle,
        pendingReview: pendingReview
          ? {
              submissionVersion,
              submittedAt: reviewAge.submittedAt,
              assignment: task.review ?? null,
            }
          : null,
        approvedSubmission: lifecycle
          ? submissions[submissions.length - 1]
          : null,
      }),
      title: task.title,
      projectId: task.projectId,
      projectName,
      occurredAt: task.updatedAt,
      dueAt: task.dueAt,
      ...owner,
      evidence: founderEvidence({
        state: task.state,
        date: task.dueAt,
        reviewSubmittedAt: pendingReview ? reviewAge.submittedAt : null,
        reviewSubmissionVersion: pendingReview ? submissionVersion : null,
        reviewAssignmentRevision: pendingReview
          ? (task.review?.assignmentRevision ?? 0)
          : null,
        warnings: [
          ...reasons.slice(1),
          ...(lifecycle ? [`DELIVERY_${lifecycle.status}`] : []),
          ...(pendingReview &&
          (reviewAge.ageState !== 'VALID' || submissionVersion === null)
            ? ['TASK_REVIEW_TIME_UNAVAILABLE']
            : []),
          ...(pendingReview && task.review?.reviewerState === 'SELF_REVIEW'
            ? ['TASK_REVIEW_SELF_REVIEW']
            : []),
        ],
      }),
      nextAction: founderAction({
        code: lifecycle
          ? 'REVIEW_DELIVERY'
          : task.state === 'IN_REVIEW'
            ? 'REVIEW_SUBMISSION'
            : 'OPEN_TASK',
        targetType: 'TASK',
        targetId: task.id,
        submissionVersion: pendingReview ? submissionVersion : null,
      }),
    }),
  ];
};
const cursorSchema = z
  .object({
    version: z.literal(1),
    workspaceId: identifier,
    filter: z.string().length(64),
    snapshot: z.string().length(64),
    key: z.string().max(1000),
  })
  .strict();
export const founderExceptionPage = (
  workspaceId: string,
  items: DeliveryFounderExceptionDTO[],
  query: FounderExceptionsQuery,
) => {
  if (items.length > FOUNDER_EXCEPTION_LIMIT)
    throw new BadRequestException(
      'The founder queue exceeds its safe review limit. Select a narrower domain or project; no exceptions were truncated.',
    );
  const filtered = [...new Map(items.map((item) => [item.key, item])).values()]
    .filter(
      (item) =>
        (query.domain === 'ALL' || item.domain === query.domain) &&
        (!query.projectId || item.projectId === query.projectId) &&
        (!query.ownerId || item.ownerId === query.ownerId) &&
        (!query.currency ||
          !['FINANCE', 'CAMPAIGNS'].includes(item.domain) ||
          item.evidence.currency === query.currency),
    )
    .sort((left, right) =>
      left.key < right.key ? -1 : left.key > right.key ? 1 : 0,
    );
  const filter = financeReviewToken({ ...query, after: null, limit: null });
  const snapshot = financeReviewToken(filtered);
  let afterKey: string | null = null;
  if (isDefined(query.after)) {
    let cursor: z.infer<typeof cursorSchema>;
    try {
      cursor = cursorSchema.parse(
        JSON.parse(Buffer.from(query.after, 'base64url').toString()),
      );
    } catch {
      throw new BadRequestException(
        'This founder page is invalid. Return to the first page.',
      );
    }
    if (cursor.workspaceId !== workspaceId || cursor.filter !== filter)
      throw new BadRequestException(
        'This founder page belongs to another selection. Return to the first page.',
      );
    if (
      cursor.snapshot !== snapshot ||
      !filtered.some((item) => item.key === cursor.key)
    )
      throw new ConflictException(
        'The source evidence changed. Refresh the founder queue from its first page.',
      );
    afterKey = cursor.key;
  }
  const remaining = filtered.filter(
    (item) => afterKey === null || item.key > afterKey,
  );
  const visible = remaining.slice(0, query.limit);
  const last = visible[visible.length - 1];
  return {
    counts: FOUNDER_DOMAINS.map((domain) => ({
      domain,
      count: filtered.filter((item) => item.domain === domain).length,
    })),
    totalCount: filtered.length,
    items: visible,
    nextCursor:
      remaining.length > query.limit && last
        ? Buffer.from(
            JSON.stringify({
              version: 1,
              workspaceId,
              filter,
              snapshot,
              key: last.key,
            }),
          ).toString('base64url')
        : null,
  };
};
