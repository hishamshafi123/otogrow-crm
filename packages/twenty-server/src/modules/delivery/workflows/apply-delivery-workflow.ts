import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { type EntityManager } from 'typeorm';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type DeliveryTaskEntity } from 'src/modules/delivery/entities/delivery-task.entity';
import { DeliveryWorkflowTemplateEntity } from 'src/modules/delivery/workflows/entities/delivery-workflow-template.entity';
import { DeliveryWorkflowVersionEntity } from 'src/modules/delivery/workflows/entities/delivery-workflow-version.entity';
import { DeliveryWorkflowArchiveEntity } from 'src/modules/delivery/workflows/entities/delivery-workflow-archive.entity';
import { type DeliveryAppliedWorkflow } from 'src/modules/delivery/workflows/delivery-workflows.types';

export const getPublishedDeliveryWorkflow = async (
  manager: EntityManager,
  workspaceId: string,
  templateId: string,
  version: number,
  expectedRevision?: number,
) => {
  const template = await manager
    .getRepository(DeliveryWorkflowTemplateEntity)
    .findOneBy({ id: templateId, workspaceId });
  if (!template)
    throw new NotFoundException('Service workflow template not found.');
  if (template.archived)
    throw new BadRequestException(
      'Restore this archived workflow before applying it to new work.',
    );
  if (expectedRevision !== undefined && template.revision !== expectedRevision)
    throw new ConflictException(
      'This workflow template changed. Refresh it before applying.',
    );
  const published = await manager
    .getRepository(DeliveryWorkflowVersionEntity)
    .findOneBy({ workspaceId, templateId, version });
  if (!published)
    throw new NotFoundException('Published workflow version not found.');
  return { template, published };
};

export const applyPublishedDeliveryWorkflow = async (
  manager: EntityManager,
  workspace: WorkspaceEntity,
  task: DeliveryTaskEntity,
  published: DeliveryWorkflowVersionEntity,
  actorId: string | null,
  allowSameVersion = false,
) => {
  if (!manager.queryRunner?.isTransactionActive)
    throw new Error('Workflow application requires a transaction.');
  if (
    published.workspaceId !== workspace.id ||
    task.workspaceId !== workspace.id
  )
    throw new NotFoundException();
  if (
    !workspace.databaseSchema ||
    !/^[a-zA-Z0-9_]+$/.test(workspace.databaseSchema)
  )
    throw new BadRequestException('Workspace is not ready.');
  const current = task.details.workflow;
  if (current) {
    if (
      !allowSameVersion &&
      current.templateId === published.templateId &&
      current.version === published.version
    )
      throw new ConflictException(
        'This workflow version is already applied to the task.',
      );
    await manager.getRepository(DeliveryWorkflowArchiveEntity).insert({
      workspaceId: workspace.id,
      taskId: task.taskId,
      snapshot: current,
      createdAt: new Date(),
    });
  }
  const people: { name: string }[] = actorId
    ? await manager.query(
        `SELECT trim(concat_ws(' ',"nameFirstName","nameLastName")) AS name FROM "${workspace.databaseSchema}"."workspaceMember" WHERE id=$1`,
        [actorId],
      )
    : [];
  const workflow: DeliveryAppliedWorkflow = {
    templateId: published.templateId,
    version: published.version,
    revision: (current?.revision ?? 0) + 1,
    definition: structuredClone(published.definition),
    checkedIds: [],
    evidence: [],
    appliedAt: new Date().toISOString(),
    appliedBy: actorId ?? 'SYSTEM',
    appliedByName: actorId ? people[0]?.name || 'Former team member' : 'System',
  };
  task.details.workflow = workflow;
  return workflow;
};
