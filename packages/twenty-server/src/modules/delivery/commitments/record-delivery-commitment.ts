import { DeliveryTaskEntity } from 'src/modules/delivery/entities/delivery-task.entity';
import { DeliveryOperationsEntity } from 'src/modules/delivery/entities/delivery-operations.entity';
import { type EntityManager } from 'typeorm';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type DeliveryDetails } from 'src/modules/delivery/delivery.types';
import { type Fulfilment } from 'src/modules/delivery/operations/delivery-operations.types';
import { DeliveryCommitmentEventEntity } from 'src/modules/delivery/commitments/entities/delivery-commitment-event.entity';
import { DeliveryCommitmentPeriodEntity } from 'src/modules/delivery/commitments/entities/delivery-commitment-period.entity';
import { DeliveryCommitmentAllocationEntity } from 'src/modules/delivery/commitments/entities/delivery-commitment-allocation.entity';
import {
  type CommitmentActor,
  type CommitmentChange,
} from 'src/modules/delivery/commitments/delivery-commitments.types';
import { currentCommitmentEvidence } from 'src/modules/delivery/commitments/delivery-commitments.policy';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';

export const recordDeliveryCommitment = async (
  manager: EntityManager,
  period: DeliveryCommitmentPeriodEntity,
  actor: CommitmentActor,
  input: {
    eventId?: string;
    action: string;
    reason: string;
    changes: CommitmentChange[];
    taskId?: string;
    taskName?: string;
  },
) => {
  if (!manager.queryRunner?.isTransactionActive)
    throw new Error('Commitment changes require an active transaction.');
  const workspace = await manager
    .getRepository(WorkspaceEntity)
    .findOneByOrFail({ id: period.workspaceId });
  if (
    !workspace.databaseSchema ||
    !/^[a-zA-Z0-9_]+$/.test(workspace.databaseSchema)
  )
    throw new Error('Workspace is not ready.');
  const people: { name: string }[] = actor.actorId
    ? await manager.query(
        `SELECT trim(concat_ws(' ',"nameFirstName","nameLastName")) AS name FROM "${workspace.databaseSchema}"."workspaceMember" WHERE id=$1`,
        [actor.actorId],
      )
    : [];
  const repository = manager.getRepository(DeliveryCommitmentEventEntity);
  await repository.insert({
    ...(input.eventId ? { id: input.eventId } : {}),
    workspaceId: period.workspaceId,
    periodId: period.id,
    ...actor,
    actorName:
      actor.actorType === 'CLIENT'
        ? 'Client portal'
        : actor.actorType === 'SYSTEM'
          ? 'System'
          : people[0]?.name || 'Former team member',
    action: input.action,
    reason: input.reason,
    changes: input.changes,
    taskId: input.taskId ?? null,
    taskName: input.taskName ?? null,
    createdAt: new Date(),
  });
  await recordOtogrowActivity(manager, {
    workspaceId: period.workspaceId,
    ...actor,
    category: 'CLIENT',
    action: input.action,
    outcome:
      input.action === 'COMMITMENT_TASK_CREDITED' ? 'FULFILLED' : 'RECORDED',
    summary:
      input.action === 'COMMITMENT_TASK_CREDITED'
        ? 'Recorded one fulfilled work item against its agreed commitment.'
        : input.action === 'COMMITMENT_TASK_REOPENED'
          ? 'Removed the current fulfilment credit while keeping its history.'
          : 'Updated a structured service commitment.',
    projectId: period.projectId,
    taskId: input.taskId,
    sourceType: 'client-engagement',
    sourceId: period.engagementId,
    changes: [],
  });
};

export const syncDeliveryCommitment = async (
  manager: EntityManager,
  workspaceId: string,
  taskId: string,
  details: DeliveryDetails,
  fulfilment: Fulfilment | undefined,
  actor: CommitmentActor,
) => {
  if (!manager.queryRunner?.isTransactionActive)
    throw new Error('Commitment sync requires an active transaction.');
  const repository = manager.getRepository(DeliveryCommitmentAllocationEntity);
  const allocation = await repository.findOneBy({ workspaceId, taskId });
  if (!allocation || allocation.state === 'REMOVED') return;
  const period = await manager
    .getRepository(DeliveryCommitmentPeriodEntity)
    .findOneByOrFail({ id: allocation.periodId, workspaceId });
  const currentTask = await manager
    .getRepository(DeliveryTaskEntity)
    .findOneBy({ workspaceId, taskId, projectId: period.projectId });
  const evidence = currentCommitmentEvidence(
    currentTask ? details : null,
    fulfilment,
  );
  const credited = evidence.valid;
  const state = credited
    ? 'FULFILLED'
    : allocation.creditedCycle !== null
      ? 'REOPENED'
      : 'ASSIGNED';
  if (
    allocation.state === state &&
    (!credited ||
      (allocation.creditedCycle === evidence.cycle &&
        allocation.creditedSubmissionVersion === evidence.submissionVersion))
  )
    return;
  const before = allocation.state;
  allocation.state = state;
  allocation.revision++;
  if (credited) {
    allocation.creditedCycle = evidence.cycle;
    allocation.creditedSubmissionVersion = evidence.submissionVersion;
    allocation.fulfilledAt = evidence.fulfilledAt;
  }
  await repository.save(allocation);
  await recordDeliveryCommitment(manager, period, actor, {
    action: credited ? 'COMMITMENT_TASK_CREDITED' : 'COMMITMENT_TASK_REOPENED',
    reason: credited
      ? 'The current approved delivery was confirmed fulfilled.'
      : evidence.valid
        ? 'The delivery cycle changed.'
        : evidence.reason,
    taskId,
    taskName: allocation.taskName,
    changes: [
      { field: 'state', before, after: state },
      {
        field: 'deliveryCycle',
        before: null,
        after: credited ? String(evidence.cycle) : null,
      },
      {
        field: 'submissionVersion',
        before: null,
        after: credited ? String(evidence.submissionVersion) : null,
      },
    ],
  });
};

export const syncStoredDeliveryCommitment = async (
  manager: EntityManager,
  task: DeliveryTaskEntity,
  actor: CommitmentActor,
) => {
  if (
    !(await manager
      .getRepository(DeliveryCommitmentAllocationEntity)
      .existsBy({ workspaceId: task.workspaceId, taskId: task.taskId }))
  )
    return;
  const operations = await manager
    .getRepository(DeliveryOperationsEntity)
    .findOneBy({ workspaceId: task.workspaceId });
  await syncDeliveryCommitment(
    manager,
    task.workspaceId,
    task.taskId,
    task.details,
    operations?.state.fulfilments.find((item) => item.taskId === task.taskId),
    actor,
  );
};
