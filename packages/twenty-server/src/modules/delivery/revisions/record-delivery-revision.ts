import { type EntityManager } from 'typeorm';
import { type DeliveryTaskEntity } from 'src/modules/delivery/entities/delivery-task.entity';
import { DeliveryRevisionEntity } from 'src/modules/delivery/revisions/entities/delivery-revision.entity';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';

export const recordDeliveryRevision = async (
  manager: EntityManager,
  task: DeliveryTaskEntity,
  actorId: string,
  source:
    | 'INTERNAL_REVIEW'
    | 'CLIENT_REDO'
    | 'CREATIVE_REOPEN'
    | 'WORKFLOW_REOPEN',
  reason: string,
) => {
  const repository = manager.getRepository(DeliveryRevisionEntity);
  const latest = await repository.findOne({
    where: { workspaceId: task.workspaceId, taskId: task.taskId },
    order: { round: 'DESC' },
  });
  // Callers hold the task's delivery write lock; the next task version identifies this one transition.
  const round = await repository.save({
    workspaceId: task.workspaceId,
    taskId: task.taskId,
    projectId: task.projectId,
    round: (latest?.round ?? 0) + 1,
    taskRevision: task.revision + 1,
    submissionVersion:
      task.details.submissions[task.details.submissions.length - 1]?.version ??
      null,
    source,
    reason,
    cause: 'UNCLASSIFIED',
    effortMinutes: null,
    internalCost: null,
    proposedCharge: 0,
    currency: null,
    revision: 1,
  });
  await recordOtogrowActivity(manager, {
    workspaceId: task.workspaceId,
    actorId,
    actorType: 'HUMAN',
    category: 'DELIVERY',
    action: 'REVISION_OPENED',
    outcome: 'CHANGES_REQUESTED',
    summary: 'Opened a tracked revision round.',
    projectId: task.projectId,
    taskId: task.taskId,
    sourceType: 'task',
    sourceId: task.taskId,
    changes: [
      { field: 'revisionRound', before: null, after: String(round.round) },
      { field: 'revisionSource', before: null, after: source },
      { field: 'revisionCause', before: null, after: 'UNCLASSIFIED' },
    ],
  });
  return round;
};
