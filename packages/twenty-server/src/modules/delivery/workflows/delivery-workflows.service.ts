import { recordDeliveryRevision } from 'src/modules/delivery/revisions/record-delivery-revision';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, type EntityManager } from 'typeorm';
import { z } from 'zod';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { DeliveryNativeTaskAccessService } from 'src/modules/delivery/delivery-native-task-access.service';
import { canAccessDeliveryProject } from 'src/modules/delivery/delivery-policy';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { DeliveryTaskEntity } from 'src/modules/delivery/entities/delivery-task.entity';
import { readDeliverySnapshot } from 'src/modules/delivery/read-delivery-snapshot';
import { syncStoredDeliveryCommitment } from 'src/modules/delivery/commitments/record-delivery-commitment';
import { DeliveryWorkflowTemplateEntity } from 'src/modules/delivery/workflows/entities/delivery-workflow-template.entity';
import { DeliveryWorkflowVersionEntity } from 'src/modules/delivery/workflows/entities/delivery-workflow-version.entity';
import { DeliveryWorkflowArchiveEntity } from 'src/modules/delivery/workflows/entities/delivery-workflow-archive.entity';
import {
  workflowCatalogSchema,
  workflowSaveSchema,
  workflowArchiveSchema,
  taskWorkflowSchema,
  workflowApplySchema,
  workflowProgressSchema,
} from 'src/modules/delivery/workflows/delivery-workflows.types';
import {
  type DeliveryWorkflowVersionDTO,
  type DeliveryTaskWorkflowDTO,
} from 'src/modules/delivery/workflows/delivery-workflows.dto';
import { DELIVERY_WORKFLOW_STARTERS } from 'src/modules/delivery/workflows/delivery-workflows.starters';
import {
  applyPublishedDeliveryWorkflow,
  getPublishedDeliveryWorkflow,
} from 'src/modules/delivery/workflows/apply-delivery-workflow';
import {
  assertWorkflowAnswers,
  missingWorkflowRequirements,
  workflowHistoryCursor,
  readWorkflowHistoryCursor,
} from 'src/modules/delivery/workflows/delivery-workflows.policy';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';

const parseInput = <TOutput>(
  schema: z.ZodType<TOutput>,
  input: unknown,
): TOutput => {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new BadRequestException(
      result.error.issues.map((item) => item.message).join(' '),
    );
  return result.data;
};
const versionDTO = (
  version: DeliveryWorkflowVersionEntity,
): DeliveryWorkflowVersionDTO => ({
  templateId: version.templateId,
  version: version.version,
  definition: version.definition,
  publishedAt: version.createdAt.toISOString(),
  publishedByName: version.publishedByName,
  reason: version.reason,
});
@Injectable()
export class DeliveryWorkflowsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly delivery: DeliveryService,
    private readonly nativeTasks: DeliveryNativeTaskAccessService,
  ) {}
  private async requireManager(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    manager: EntityManager,
  ) {
    if (
      !(
        await this.delivery.actor(workspace, memberId, userWorkspaceId, manager)
      ).isManager
    )
      throw new ForbiddenException(
        'A delivery manager is required to manage workflow templates.',
      );
  }
  private transact<TResult>(
    workspaceId: string,
    operation: (manager: EntityManager) => Promise<TResult>,
  ) {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`delivery:${workspaceId}`],
      );
      return operation(manager);
    });
  }
  private async readCatalog(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    manager: EntityManager,
    input: z.infer<typeof workflowCatalogSchema>,
  ) {
    await this.requireManager(workspace, memberId, userWorkspaceId, manager);
    const templates = await manager
      .getRepository(DeliveryWorkflowTemplateEntity)
      .find({
        where: {
          workspaceId: workspace.id,
          ...(!input.includeArchived ? { archived: false } : {}),
        },
        order: { updatedAt: 'DESC', id: 'DESC' },
      });
    const current: DeliveryWorkflowVersionEntity[] = await manager.query(
      'SELECT v.* FROM core."deliveryWorkflowVersion" v JOIN core."deliveryWorkflowTemplate" t ON t.id=v."templateId" AND t."workspaceId"=v."workspaceId" AND t."currentVersion"=v.version WHERE v."workspaceId"=$1',
      [workspace.id],
    );
    let versions: DeliveryWorkflowVersionEntity[] = [];
    if (input.templateId) {
      if (
        !(await manager
          .getRepository(DeliveryWorkflowTemplateEntity)
          .existsBy({ workspaceId: workspace.id, id: input.templateId }))
      )
        throw new NotFoundException('Workflow template not found.');
      versions = await manager
        .getRepository(DeliveryWorkflowVersionEntity)
        .find({
          where: { workspaceId: workspace.id, templateId: input.templateId },
          order: { version: 'DESC' },
        });
    }
    return {
      workspaceId: workspace.id,
      memberId,
      userWorkspaceId,
      templates: templates.map((template) => {
        const version = current.find((item) => item.templateId === template.id);
        if (!version) throw new Error('Published workflow version missing.');
        return {
          id: template.id,
          revision: template.revision,
          archived: template.archived,
          stateReason: template.stateReason,
          current: versionDTO(version),
        };
      }),
      versions: versions.map(versionDTO),
      starters: DELIVERY_WORKFLOW_STARTERS,
    };
  }
  async catalog(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ) {
    const parsed = parseInput(workflowCatalogSchema, input);
    return readDeliverySnapshot(this.dataSource, workspace.id, (manager) =>
      this.readCatalog(workspace, memberId, userWorkspaceId, manager, parsed),
    );
  }
  async save(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ) {
    const parsed = parseInput(workflowSaveSchema, input);
    return this.transact(workspace.id, async (manager) => {
      await this.requireManager(workspace, memberId, userWorkspaceId, manager);
      const repository = manager.getRepository(DeliveryWorkflowTemplateEntity);
      const previous = await repository.findOneBy({ id: parsed.id });
      if (previous && previous.workspaceId !== workspace.id)
        throw new NotFoundException();
      if ((previous?.revision ?? 0) !== parsed.revision)
        throw new ConflictException(
          'This workflow changed. Refresh before publishing.',
        );
      if (previous?.archived)
        throw new ConflictException(
          'Restore the workflow before publishing a new version.',
        );
      if (previous) {
        const version = await manager
          .getRepository(DeliveryWorkflowVersionEntity)
          .findOneByOrFail({
            workspaceId: workspace.id,
            templateId: previous.id,
            version: previous.currentVersion,
          });
        if (
          JSON.stringify(version.definition) ===
          JSON.stringify(parsed.definition)
        )
          throw new BadRequestException(
            'Change the definition before publishing another version.',
          );
      }
      const people: { name: string }[] = await manager.query(
        `SELECT trim(concat_ws(' ',"nameFirstName","nameLastName")) AS name FROM ${this.delivery.schema(workspace)}."workspaceMember" WHERE id=$1`,
        [memberId],
      );
      const template = await repository.save(
        repository.create({
          ...previous,
          id: parsed.id,
          workspaceId: workspace.id,
          revision: (previous?.revision ?? 0) + 1,
          currentVersion: (previous?.currentVersion ?? 0) + 1,
          archived: false,
          stateReason: previous?.stateReason ?? '',
        }),
      );
      await manager.getRepository(DeliveryWorkflowVersionEntity).insert({
        workspaceId: workspace.id,
        templateId: template.id,
        version: template.currentVersion,
        definition: parsed.definition,
        publishedBy: memberId,
        publishedByName: people[0]?.name || 'Former team member',
        reason: parsed.reason,
        createdAt: new Date(),
      });
      await recordOtogrowActivity(manager, {
        workspaceId: workspace.id,
        actorId: memberId,
        category: 'DELIVERY',
        action: 'WORKFLOW_TEMPLATE_PUBLISHED',
        outcome: 'RECORDED',
        summary: 'Published an immutable service workflow version.',
        sourceType: 'workflow-template',
        sourceId: template.id,
        changes: [
          {
            field: 'revision',
            before: previous ? String(previous.currentVersion) : null,
            after: String(template.currentVersion),
          },
          {
            field: 'checklistCount',
            before: null,
            after: String(parsed.definition.checklist.length),
          },
          {
            field: 'evidenceCount',
            before: null,
            after: String(parsed.definition.evidence.length),
          },
        ],
      });
      return this.readCatalog(workspace, memberId, userWorkspaceId, manager, {
        includeArchived: true,
        templateId: template.id,
      });
    });
  }
  async archive(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ) {
    const parsed = parseInput(workflowArchiveSchema, input);
    return this.transact(workspace.id, async (manager) => {
      await this.requireManager(workspace, memberId, userWorkspaceId, manager);
      const repository = manager.getRepository(DeliveryWorkflowTemplateEntity);
      const template = await repository.findOneBy({
        id: parsed.id,
        workspaceId: workspace.id,
      });
      if (!template) throw new NotFoundException();
      if (template.revision !== parsed.revision)
        throw new ConflictException(
          'This workflow changed. Refresh before saving.',
        );
      if (template.archived === parsed.archived)
        throw new ConflictException('This workflow already has that state.');
      template.archived = parsed.archived;
      template.stateReason = parsed.reason;
      template.revision++;
      await repository.save(template);
      await recordOtogrowActivity(manager, {
        workspaceId: workspace.id,
        actorId: memberId,
        category: 'DELIVERY',
        action: parsed.archived
          ? 'WORKFLOW_TEMPLATE_ARCHIVED'
          : 'WORKFLOW_TEMPLATE_RESTORED',
        outcome: 'RECORDED',
        summary: parsed.archived
          ? 'Archived a workflow template; pinned task versions remain readable.'
          : 'Restored a workflow template for new applications.',
        sourceType: 'workflow-template',
        sourceId: template.id,
        changes: [
          {
            field: 'state',
            before: parsed.archived ? 'ACTIVE' : 'ARCHIVED',
            after: parsed.archived ? 'ARCHIVED' : 'ACTIVE',
          },
        ],
      });
      return this.readCatalog(workspace, memberId, userWorkspaceId, manager, {
        includeArchived: true,
        templateId: template.id,
      });
    });
  }
  private async scope(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    taskId: string,
    manager: EntityManager,
  ) {
    const actor = await this.delivery.actor(
      workspace,
      memberId,
      userWorkspaceId,
      manager,
    );
    const nativeVisibility = await this.nativeTasks.assert(
      manager,
      workspace,
      { memberId, userWorkspaceId },
      taskId,
      ['id', 'assigneeId'],
    );
    const task = await manager
      .getRepository(DeliveryTaskEntity)
      .findOneBy({ workspaceId: workspace.id, taskId });
    const project = task
      ? await manager
          .getRepository(DeliveryProjectEntity)
          .findOneBy({ workspaceId: workspace.id, id: task.projectId })
      : null;
    if (
      !task ||
      !project ||
      !canAccessDeliveryProject(actor.isManager, memberId, project.memberIds)
    )
      throw new NotFoundException('Task not available.');
    const native: { assigneeId: string | null }[] = await manager.query(
      `SELECT "assigneeId" FROM ${this.delivery.schema(workspace)}.task WHERE id=$1 AND "deletedAt" IS NULL`,
      [taskId],
    );
    if (!native[0]) throw new NotFoundException('Task not available.');
    return {
      task,
      actor,
      project,
      nativeVisibility,
      assigneeId: native[0].assigneeId,
    };
  }
  private async readTask(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    manager: EntityManager,
    input: z.infer<typeof taskWorkflowSchema>,
  ): Promise<DeliveryTaskWorkflowDTO> {
    const { task, actor, project, nativeVisibility, assigneeId } =
      await this.scope(
        workspace,
        memberId,
        userWorkspaceId,
        input.taskId,
        manager,
      );
    const historyScope = {
      workspaceId: workspace.id,
      memberId,
      userWorkspaceId,
      taskId: task.taskId,
      projectId: project.id,
      projectRevision: project.revision,
      projectMembers: [...project.memberIds].sort(),
      capabilities: [...actor.capabilities].sort(),
      roleIds: [...actor.roleIds].sort(),
      nativeAccess: nativeVisibility.fingerprint,
    };
    const history = manager
      .getRepository(DeliveryWorkflowArchiveEntity)
      .createQueryBuilder('archive')
      .where(
        'archive."workspaceId"=:workspaceId AND archive."taskId"=:taskId',
        { workspaceId: workspace.id, taskId: task.taskId },
      )
      .orderBy('archive.createdAt', 'DESC')
      .addOrderBy('archive.id', 'DESC')
      .take((input.limit ?? 10) + 1);
    if (input.historyCursor) {
      const cursor = readWorkflowHistoryCursor(
        input.historyCursor,
        historyScope,
      );
      history.andWhere(
        '(archive."createdAt",archive.id)<(:at::timestamptz,:id::uuid)',
        cursor,
      );
    }
    const rows = await history.getMany();
    const visible = rows.slice(0, input.limit ?? 10);
    const last = visible[visible.length - 1];
    const locked = ['APPROVED', 'IN_REVIEW'].includes(task.details.state);
    let canManage = actor.isManager;
    if (canManage && locked) {
      try {
        await this.nativeTasks.assert(
          manager,
          workspace,
          { memberId, userWorkspaceId },
          task.taskId,
          ['id', 'assigneeId'],
          { type: 'update', updatedColumns: ['status'] },
        );
      } catch (error) {
        if (
          error instanceof ForbiddenException ||
          error instanceof NotFoundException
        )
          canManage = false;
        else throw error;
      }
    }
    return {
      workspaceId: workspace.id,
      memberId,
      userWorkspaceId,
      taskId: task.taskId,
      taskRevision: task.revision,
      canManage,
      canEdit: !locked && (actor.isManager || assigneeId === memberId),
      locked,
      workflow: task.details.workflow ?? null,
      previousApplications: visible.map((row) => row.snapshot),
      missingRequirements: missingWorkflowRequirements(task.details.workflow),
      nextHistoryCursor:
        rows.length > (input.limit ?? 10) && last
          ? workflowHistoryCursor(historyScope, last)
          : null,
    };
  }
  async task(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ) {
    const parsed = parseInput(taskWorkflowSchema, input);
    return readDeliverySnapshot(this.dataSource, workspace.id, (manager) =>
      this.readTask(workspace, memberId, userWorkspaceId, manager, parsed),
    );
  }
  async apply(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ) {
    const parsed = parseInput(workflowApplySchema, input);
    return this.transact(workspace.id, async (manager) => {
      const { task, actor, assigneeId } = await this.scope(
        workspace,
        memberId,
        userWorkspaceId,
        parsed.taskId,
        manager,
      );
      if (!actor.isManager)
        throw new ForbiddenException(
          'A manager must choose the task workflow.',
        );
      if (task.revision !== parsed.taskRevision)
        throw new ConflictException(
          'Task changed. Refresh before applying the workflow.',
        );
      const locked = ['APPROVED', 'IN_REVIEW'].includes(task.details.state);
      if (locked && !parsed.reopen)
        throw new ConflictException(
          'Explicitly reopen this work before changing its requirements.',
        );
      if (locked)
        await this.nativeTasks.assert(
          manager,
          workspace,
          { memberId, userWorkspaceId },
          task.taskId,
          ['id', 'assigneeId'],
          { type: 'update', updatedColumns: ['status'] },
        );
      const { published } = await getPublishedDeliveryWorkflow(
        manager,
        workspace.id,
        parsed.templateId,
        parsed.version,
        parsed.templateRevision,
      );
      await applyPublishedDeliveryWorkflow(
        manager,
        workspace,
        task,
        published,
        memberId,
        locked && parsed.reopen,
      );
      if (locked) {
        await recordDeliveryRevision(
          manager,
          task,
          memberId,
          'WORKFLOW_REOPEN',
          parsed.reason,
        );
        task.details.state = 'CHANGES_REQUESTED';
        await manager.query(
          `UPDATE ${this.delivery.schema(workspace)}.task SET status='IN_PROGRESS',"updatedAt"=now() WHERE id=$1`,
          [task.taskId],
        );
        await this.nativeTasks.assert(
          manager,
          workspace,
          { memberId, userWorkspaceId },
          task.taskId,
          ['id', 'assigneeId'],
          { type: 'update', updatedColumns: ['status'] },
        );
      }
      task.revision++;
      task.details.events.push({
        id: randomUUID(),
        actorId: memberId,
        action: 'WORKFLOW_APPLIED',
        text: parsed.reason,
        at: new Date().toISOString(),
      });
      await manager.getRepository(DeliveryTaskEntity).save(task);
      await syncStoredDeliveryCommitment(manager, task, {
        actorId: memberId,
        actorType: 'HUMAN',
      });
      await recordOtogrowActivity(manager, {
        workspaceId: workspace.id,
        actorId: memberId,
        subjectMemberId: assigneeId,
        category: 'DELIVERY',
        action: 'WORKFLOW_APPLIED',
        outcome: locked ? 'CHANGES_REQUESTED' : 'RECORDED',
        summary: locked
          ? 'Reopened production and applied a service workflow version.'
          : 'Applied a pinned service workflow version to the task.',
        projectId: task.projectId,
        taskId: task.taskId,
        sourceType: 'task',
        sourceId: task.taskId,
        changes: [
          {
            field: 'revision',
            before: String(parsed.taskRevision),
            after: String(task.revision),
          },
        ],
      });
      return this.readTask(workspace, memberId, userWorkspaceId, manager, {
        taskId: task.taskId,
      });
    });
  }
  async progress(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
  ) {
    const parsed = parseInput(workflowProgressSchema, input);
    return this.transact(workspace.id, async (manager) => {
      const { task, actor, assigneeId } = await this.scope(
        workspace,
        memberId,
        userWorkspaceId,
        parsed.taskId,
        manager,
      );
      if (!actor.isManager && assigneeId !== memberId)
        throw new ForbiddenException(
          'Only the assignee or a manager can update workflow evidence.',
        );
      if (
        task.revision !== parsed.taskRevision ||
        task.details.workflow?.revision !== parsed.workflowRevision
      )
        throw new ConflictException(
          'Task requirements changed. Refresh before saving evidence.',
        );
      if (['APPROVED', 'IN_REVIEW'].includes(task.details.state))
        throw new ConflictException(
          'Submitted work is locked. A manager must reopen it before changing evidence.',
        );
      const workflow = task.details.workflow;
      if (!workflow)
        throw new BadRequestException('Apply a published workflow first.');
      assertWorkflowAnswers(workflow, parsed.checkedIds, parsed.evidence);
      workflow.checkedIds = parsed.checkedIds;
      workflow.evidence = parsed.evidence;
      workflow.revision++;
      task.revision++;
      await manager.getRepository(DeliveryTaskEntity).save(task);
      await recordOtogrowActivity(manager, {
        workspaceId: workspace.id,
        actorId: memberId,
        subjectMemberId: assigneeId,
        category: 'DELIVERY',
        action: 'WORKFLOW_PROGRESS',
        outcome: 'RECORDED',
        summary: 'Updated service checklist progress and evidence responses.',
        projectId: task.projectId,
        taskId: task.taskId,
        sourceType: 'task',
        sourceId: task.taskId,
        changes: [
          {
            field: 'checklistCompleted',
            before: null,
            after: String(workflow.checkedIds.length),
          },
          {
            field: 'evidenceCount',
            before: null,
            after: String(
              workflow.evidence.filter((item) => item.value).length,
            ),
          },
        ],
      });
      return this.readTask(workspace, memberId, userWorkspaceId, manager, {
        taskId: task.taskId,
      });
    });
  }
}
