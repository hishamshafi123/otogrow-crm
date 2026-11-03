import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { type EntityManager, In } from 'typeorm';
import { z } from 'zod';
import { DeliveryOperationsEntity } from 'src/modules/delivery/entities/delivery-operations.entity';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { DeliveryReminderOutboxEntity } from 'src/modules/delivery/entities/delivery-reminder-outbox.entity';
import { type DeliveryTaskEntity } from 'src/modules/delivery/entities/delivery-task.entity';
import {
  newDeliveryOperations,
  type DeliveryNotice,
  type DeliveryOperations,
} from 'src/modules/delivery/operations/delivery-operations.types';
import {
  deliveryReviewAuthority,
  readCurrentDeliveryReviewAssignments,
} from 'src/modules/delivery/reviews/delivery-review-authority';
import { type DeliveryReviewAssignmentNoticeDTO } from 'src/modules/delivery/reviews/delivery-reviews.dto';

const originSchema = z
  .object({
    submissionVersion: z.number().int().positive(),
    assignmentId: z.uuid().nullable(),
    assignmentRevision: z.number().int().nonnegative(),
    recipientId: z.uuid(),
  })
  .strict()
  .refine((value) =>
    value.assignmentId === null
      ? value.assignmentRevision === 0
      : value.assignmentRevision > 0,
  );
type ReviewNoticeScope = {
  actor: { memberId: string; isManager: boolean; capabilities: string[] };
  task: Pick<DeliveryTaskEntity, 'taskId' | 'projectId' | 'details'>;
  assigneeId: string | null;
};
const isUnreadTransport = (notice: DeliveryNotice) =>
  ['PENDING', 'QUEUED', 'UNCONFIGURED'].includes(notice.sendState);

export const currentDeliveryReviewNotice = async (
  manager: EntityManager,
  workspaceId: string,
  notice: DeliveryNotice,
  scope: ReviewNoticeScope,
): Promise<boolean> => {
  const origin = originSchema.safeParse(notice.reviewAssignment);
  if (
    notice.kind !== 'REVIEW_ASSIGNMENT' ||
    notice.cancelled ||
    !origin.success ||
    origin.data.recipientId !== notice.recipientId ||
    scope.actor.memberId !== notice.recipientId ||
    scope.task.taskId !== notice.taskId ||
    scope.task.details.state !== 'IN_REVIEW'
  )
    return false;
  const latest =
    scope.task.details.submissions[scope.task.details.submissions.length - 1];
  if (latest?.version !== origin.data.submissionVersion) return false;
  const assignment = (
    await readCurrentDeliveryReviewAssignments(manager, workspaceId, [
      { taskId: notice.taskId, submissionVersion: latest.version },
    ])
  ).get(notice.taskId);
  if (
    (origin.data.assignmentId !== null &&
      assignment?.id !== origin.data.assignmentId) ||
    (assignment?.revision ?? 0) < origin.data.assignmentRevision
  )
    return false;
  const project = await manager
    .getRepository(DeliveryProjectEntity)
    .findOneBy({ workspaceId, id: scope.task.projectId });
  if (!project) return false;
  return deliveryReviewAuthority({
    primaryReviewerId: scope.task.details.reviewerId,
    assigneeId: scope.assigneeId,
    assignment,
    projectMemberIds: project.memberIds,
    access: [
      {
        memberId: scope.actor.memberId,
        capabilities: scope.actor.isManager
          ? [...scope.actor.capabilities, 'delivery.manage']
          : scope.actor.capabilities,
      },
    ],
    actorId: scope.actor.memberId,
  }).canReview;
};

export const acknowledgeCurrentDeliveryReviewNotice = async (
  manager: EntityManager,
  workspaceId: string,
  notice: DeliveryNotice,
  scope: ReviewNoticeScope,
  now: Date,
): Promise<boolean> => {
  if (!(await currentDeliveryReviewNotice(manager, workspaceId, notice, scope)))
    throw new ForbiddenException(
      'This review notice no longer belongs to the current eligible reviewer.',
    );
  if (notice.acknowledgedAt) return false;
  notice.acknowledgedAt = now.toISOString();
  return true;
};

const saveOperations = async (
  manager: EntityManager,
  record: DeliveryOperationsEntity,
) => {
  if (JSON.stringify(record.state).length > 10000000)
    throw new BadRequestException(
      'Operations history reached its storage limit. Contact an administrator for maintenance.',
    );
  await manager.getRepository(DeliveryOperationsEntity).save(record);
};

export const suppressDeliveryReviewNotices = async (
  manager: EntityManager,
  workspaceId: string,
  state: DeliveryOperations,
  taskId: string,
  now: Date,
) => {
  const cancelled: string[] = [];
  for (const notice of state.notices) {
    if (
      notice.kind !== 'REVIEW_ASSIGNMENT' ||
      notice.taskId !== taskId ||
      notice.cancelled
    )
      continue;
    notice.cancelled = true;
    if (isUnreadTransport(notice)) {
      notice.sendState = 'SUPPRESSED';
      notice.error = null;
    }
    cancelled.push(notice.id);
  }
  if (cancelled.length)
    await manager.getRepository(DeliveryReminderOutboxEntity).update(
      {
        workspaceId,
        noticeId: In(cancelled),
        status: In(['QUEUED', 'UNCONFIGURED']),
      },
      { status: 'SUPPRESSED', finishedAt: now, error: null },
    );
};

export const cancelDeliveryReviewNotices = async (
  manager: EntityManager,
  workspaceId: string,
  taskId: string,
  now: Date,
) => {
  const repository = manager.getRepository(DeliveryOperationsEntity);
  const record = await repository.findOne({
    where: { workspaceId },
    lock: { mode: 'pessimistic_write' },
  });
  if (
    !record ||
    !record.state.notices.some(
      (notice) =>
        notice.kind === 'REVIEW_ASSIGNMENT' &&
        notice.taskId === taskId &&
        !notice.cancelled,
    )
  )
    return;
  await suppressDeliveryReviewNotices(
    manager,
    workspaceId,
    record.state,
    taskId,
    now,
  );
  await saveOperations(manager, record);
};

export const recordDeliveryReviewNotice = async (
  manager: EntityManager,
  workspaceId: string,
  input: {
    taskId: string;
    submissionVersion: number;
    assignmentId: string | null;
    assignmentRevision: number;
    previousRecipientId: string | null;
    recipientId: string | null;
    eligible: boolean;
    senderId: string;
    now: Date;
  },
) => {
  if (input.previousRecipientId === input.recipientId) return;
  const repository = manager.getRepository(DeliveryOperationsEntity);
  let record = await repository.findOne({
    where: { workspaceId },
    lock: { mode: 'pessimistic_write' },
  });
  const mint =
    input.eligible &&
    input.recipientId !== null &&
    input.recipientId !== input.senderId;
  if (!record && !mint) return;
  record ??= repository.create({ workspaceId, state: newDeliveryOperations() });
  await suppressDeliveryReviewNotices(
    manager,
    workspaceId,
    record.state,
    input.taskId,
    input.now,
  );
  if (mint && input.recipientId) {
    record.state.notices.push({
      id: randomUUID(),
      taskId: input.taskId,
      recipientId: input.recipientId,
      senderId: input.senderId,
      kind: 'REVIEW_ASSIGNMENT',
      reviewAssignment: {
        submissionVersion: input.submissionVersion,
        assignmentId: input.assignmentId,
        assignmentRevision: input.assignmentRevision,
        recipientId: input.recipientId,
      },
      text: 'A pending submission has been assigned for your independent review.',
      createdAt: input.now.toISOString(),
      remindAt: new Date(input.now.getTime() + 5 * 60 * 1000).toISOString(),
      seenAt: null,
      acknowledgedAt: null,
      cancelled: false,
      sendState: 'PENDING',
      attemptedAt: null,
      error: null,
    });
  }
  await saveOperations(manager, record);
};

export const readDeliveryReviewNotice = async (
  manager: EntityManager,
  workspaceId: string,
  input: {
    taskId: string;
    submissionVersion: number;
    assignmentId: string | null;
    recipientId: string;
    assignmentRevision: number;
  },
): Promise<DeliveryReviewAssignmentNoticeDTO | null> => {
  const rows: { notice: DeliveryNotice }[] = await manager.query(
    `SELECT jsonb_build_object('id',notice->'id','taskId',notice->'taskId','recipientId',notice->'recipientId','kind',notice->'kind','reviewAssignment',notice->'reviewAssignment','createdAt',notice->'createdAt','remindAt',notice->'remindAt','seenAt',notice->'seenAt','acknowledgedAt',notice->'acknowledgedAt','sendState',notice->'sendState') AS notice FROM core."deliveryOperations",jsonb_array_elements(state->'notices') notice WHERE "workspaceId"=$1 AND notice->>'kind'='REVIEW_ASSIGNMENT' AND notice->>'taskId'=$2 AND notice->>'recipientId'=$3 AND notice->>'cancelled'='false' AND ((notice->'reviewAssignment'->>'assignmentId' IS NOT DISTINCT FROM $4::text) OR (notice->'reviewAssignment'->>'assignmentId' IS NULL AND notice->'reviewAssignment'->>'assignmentRevision'='0')) AND notice->'reviewAssignment'->>'submissionVersion'=$5 ORDER BY notice->>'createdAt' DESC,notice->>'id' DESC LIMIT 2`,
    [
      workspaceId,
      input.taskId,
      input.recipientId,
      input.assignmentId,
      String(input.submissionVersion),
    ],
  );
  if (rows.length !== 1) return null;
  const notice = rows[0].notice,
    origin = originSchema.safeParse(notice.reviewAssignment);
  if (
    !origin.success ||
    origin.data.recipientId !== input.recipientId ||
    origin.data.assignmentRevision > input.assignmentRevision
  )
    return null;
  return {
    id: notice.id,
    ...origin.data,
    createdAt: notice.createdAt,
    remindAt: notice.remindAt,
    seenAt: notice.seenAt,
    acknowledgedAt: notice.acknowledgedAt,
    sendState: notice.sendState,
  };
};
