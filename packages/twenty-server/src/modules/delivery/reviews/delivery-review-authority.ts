import { BadRequestException, ConflictException } from '@nestjs/common';
import { type EntityManager } from 'typeorm';
import { isValidUuid } from 'twenty-shared/utils';
import { type OtogrowAccess } from 'src/modules/otogrow-access/otogrow-access.types';
import { DeliveryReviewAssignmentEntity } from 'src/modules/delivery/reviews/entities/delivery-review-assignment.entity';

export type DeliveryReviewSource = {
  taskId: string;
  submissionVersion: number;
};
export const readCurrentDeliveryReviewAssignments = async (
  manager: EntityManager,
  workspaceId: string,
  sources: DeliveryReviewSource[],
): Promise<Map<string, DeliveryReviewAssignmentEntity>> => {
  if (
    sources.some(
      (source) =>
        !isValidUuid(source.taskId) ||
        !Number.isSafeInteger(source.submissionVersion) ||
        source.submissionVersion <= 0 ||
        source.submissionVersion > 2147483647,
    )
  )
    throw new BadRequestException(
      'Review assignment source identity is unavailable.',
    );
  if (!sources.length) return new Map();
  const selected = [
    ...new Map(sources.map((source) => [source.taskId, source])).values(),
  ];
  const rows: DeliveryReviewAssignmentEntity[] = await manager.query(
    `SELECT assignment.* FROM core."deliveryReviewAssignment" assignment JOIN jsonb_to_recordset($2::jsonb) AS selected("taskId" uuid,"submissionVersion" integer) ON selected."taskId"=assignment."taskId" AND selected."submissionVersion"=assignment."submissionVersion" WHERE assignment."workspaceId"=$1`,
    [workspaceId, JSON.stringify(selected)],
  );
  return new Map(rows.map((row) => [row.taskId, row]));
};
export const deliveryReviewAuthority = (input: {
  primaryReviewerId: string | null;
  assigneeId: string | null;
  assignment?: Pick<
    DeliveryReviewAssignmentEntity,
    'revision' | 'mode' | 'reviewerId'
  > | null;
  projectMemberIds: string[];
  access: Pick<OtogrowAccess, 'memberId' | 'capabilities'>[];
  actorId: string;
}) => {
  const mode = input.assignment?.mode ?? 'PRIMARY';
  const chosen =
    mode === 'BACKUP' ? input.assignment?.reviewerId : input.primaryReviewerId;
  const effectiveReviewerId = chosen && isValidUuid(chosen) ? chosen : null;
  const reviewer = input.access.find(
    (access) => access.memberId === effectiveReviewerId,
  );
  const isManager =
    reviewer?.capabilities.some((capability) =>
      ['workspace.admin', 'delivery.manage'].includes(capability),
    ) ?? false;
  const eligible = Boolean(
    reviewer &&
    (mode === 'BACKUP'
      ? input.projectMemberIds.includes(reviewer.memberId) &&
        (isManager || reviewer.capabilities.includes('delivery.review'))
      : isManager),
  );
  const reviewerState = !chosen
    ? 'UNASSIGNED'
    : effectiveReviewerId === input.assigneeId
      ? 'SELF_REVIEW'
      : !effectiveReviewerId || !eligible
        ? 'UNAVAILABLE'
        : 'ACTIVE';
  return {
    primaryReviewerId:
      input.primaryReviewerId && isValidUuid(input.primaryReviewerId)
        ? input.primaryReviewerId
        : null,
    effectiveReviewerId,
    assignmentRevision: input.assignment?.revision ?? 0,
    assignmentMode: mode,
    reviewerState,
    canReview:
      reviewerState === 'ACTIVE' && effectiveReviewerId === input.actorId,
  };
};
export const assertDeliveryReviewAssignmentRevision = (
  revision: number,
  expected: number | undefined,
) => {
  if (revision === 0 && (expected === undefined || expected === 0)) return;
  if (revision !== expected)
    throw new ConflictException(
      'The review assignment changed. Refresh its current reviewer before deciding.',
    );
};
