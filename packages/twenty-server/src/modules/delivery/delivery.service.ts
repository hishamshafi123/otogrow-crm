import { getDeliveryLifecycle } from 'src/modules/delivery/lifecycle/delivery-lifecycle';
import { DeliveryNativeTaskAccessService } from 'src/modules/delivery/delivery-native-task-access.service';
import { type DeliveryNativeTaskWriteOperation } from 'src/modules/delivery/native-task-visibility';
import { freezeCreativeSubmissionLearning } from 'src/modules/delivery/creative/learning/freeze-creative-submission-learning';
import { assertDeliveryCreativeReview } from 'src/modules/delivery/creative/assert-delivery-creative-review';
import { recordDeliveryRevision } from 'src/modules/delivery/revisions/record-delivery-revision';
import {
  newDeliveryOperations,
  type Fulfilment,
} from 'src/modules/delivery/operations/delivery-operations.types';
import {
  applyPublishedDeliveryWorkflow,
  getPublishedDeliveryWorkflow,
} from 'src/modules/delivery/workflows/apply-delivery-workflow';
import {
  assertWorkflowSubmission,
  assertWorkflowReview,
} from 'src/modules/delivery/workflows/delivery-workflows.policy';
import { syncStoredDeliveryCommitment } from 'src/modules/delivery/commitments/record-delivery-commitment';
import { canReadFinance } from 'src/modules/delivery/business/delivery-business.policy';
import { readDeliverySnapshot } from 'src/modules/delivery/read-delivery-snapshot';
import {
  assertCreativeSubmission,
  invalidateCreativeBrief,
} from 'src/modules/delivery/creative/delivery-creative.policy';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { isDefined } from 'twenty-shared/utils';
import { v4 } from 'uuid';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { DeliveryTaskEntity } from 'src/modules/delivery/entities/delivery-task.entity';
import { DeliveryMemberEntity } from 'src/modules/delivery/entities/delivery-member.entity';
import { DeliveryOperationsEntity } from 'src/modules/delivery/entities/delivery-operations.entity';
import {
  includeCompanyInClientRoster,
  resolveEffectiveClientCompanyIds,
} from 'src/modules/delivery/clients/delivery-client-hub.policy';
import { deliveryCommandSchema } from 'src/modules/delivery/delivery-validation';
import {
  assertDeliveryReview,
  canAccessDeliveryProject,
} from 'src/modules/delivery/delivery-policy';
import { type DeliveryDetails } from 'src/modules/delivery/delivery.types';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';
import {
  assertDeliveryReviewAssignmentRevision,
  deliveryReviewAuthority,
  readCurrentDeliveryReviewAssignments,
} from 'src/modules/delivery/reviews/delivery-review-authority';
import {
  cancelDeliveryReviewNotices,
  recordDeliveryReviewNotice,
} from 'src/modules/delivery/reviews/delivery-review-notices';

const planningActivity = (details: DeliveryDetails) => ({
  workMinutes: isDefined(details.plan?.workMinutes)
    ? String(details.plan.workMinutes)
    : null,
  revisionMinutes: isDefined(details.plan?.revisionMinutes)
    ? String(details.plan.revisionMinutes)
    : null,
  waitMinutes: isDefined(details.plan?.waitMinutes)
    ? String(details.plan.waitMinutes)
    : null,
  reviewMinutes: isDefined(details.plan?.reviewMinutes)
    ? String(details.plan.reviewMinutes)
    : null,
  reviewDate: details.plan?.reviewDate ?? null,
  complexity: details.plan?.complexity ?? null,
});

type DeliveryActor = {
  memberId: string;
  isAdmin: boolean;
  isManager: boolean;
  capabilities: string[];
  roleIds: string[];
};
type NativeTask = {
  id: string;
  title: string;
  assigneeId: string;
  dueAt: string | null;
};
type Member = { id: string; name: string };

@Injectable()
export class DeliveryService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly access: OtogrowAccessService,
    private readonly nativeTasks: DeliveryNativeTaskAccessService,
  ) {}

  schema(workspace: WorkspaceEntity): string {
    if (
      !workspace.databaseSchema ||
      !/^[a-zA-Z0-9_]+$/.test(workspace.databaseSchema)
    ) {
      throw new BadRequestException('Workspace is not ready.');
    }
    return `"${workspace.databaseSchema}"`;
  }

  async actor(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<DeliveryActor> {
    if (!isDefined(memberId) || !isDefined(userWorkspaceId))
      throw new ForbiddenException();
    const access = await this.access.accessForUser(
      workspace.id,
      memberId,
      userWorkspaceId,
      manager,
    );
    const isAdmin = access.capabilities.includes('workspace.admin');
    return {
      memberId,
      capabilities: access.capabilities,
      roleIds: access.roleIds,
      isAdmin,
      isManager: isAdmin || access.capabilities.includes('delivery.manage'),
    };
  }

  private async members(
    manager: EntityManager,
    workspace: WorkspaceEntity,
  ): Promise<Member[]> {
    return (await this.access.listActiveMembers(workspace.id, manager)).map(
      (member) => ({ id: member.memberId, name: member.name }),
    );
  }

  async snapshot(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    transactionManager?: EntityManager,
  ) {
    return readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => {
        const actor = await this.actor(
          workspace,
          memberId,
          userWorkspaceId,
          manager,
        );
        const projects = (
          await manager
            .getRepository(DeliveryProjectEntity)
            .findBy({ workspaceId: workspace.id })
        ).filter((project) =>
          canAccessDeliveryProject(
            actor.isManager,
            memberId,
            project.memberIds,
          ),
        );
        const projectIds = projects.map((project) => project.id);
        const visibility = projectIds.length
          ? await this.nativeTasks.visibility(
              manager,
              workspace,
              { memberId, userWorkspaceId },
              ['id', 'title', 'assigneeId', 'dueAt', 'createdAt'],
            )
          : null;
        const tasks: (NativeTask & {
          projectId: string;
          details: DeliveryDetails;
          revision: number;
        })[] = visibility
          ? await this.nativeTasks.query(
              manager,
              `SELECT t.id, t.title, t."assigneeId", t."dueAt", d."projectId", d.details, d.revision FROM "core"."deliveryTask" d JOIN ${this.schema(workspace)}."task" t ON t.id = d."taskId" WHERE d."workspaceId" = $1 AND d."projectId" = ANY($2::uuid[]) AND t."deletedAt" IS NULL AND ${this.nativeTasks.predicate(workspace, visibility, 't.id')} ORDER BY t."dueAt" ASC NULLS LAST, t."createdAt" DESC`,
              [workspace.id, projectIds],
              visibility,
            )
          : [];
        const profiles = await manager
          .getRepository(DeliveryMemberEntity)
          .findBy({ workspaceId: workspace.id });
        const members = await this.members(manager, workspace);
        const memberAccess = new Map(
          (await this.access.listAccess(workspace.id, manager)).map(
            (access) => [access.memberId, access],
          ),
        );
        const visibleMemberIds = new Set([
          memberId,
          ...projects.flatMap((project) => project.memberIds),
          ...tasks.flatMap((task) => [
            task.assigneeId,
            task.details.reviewerId,
          ]),
        ]);
        const projectCompanyIds = projects
          .map((project) => project.companyId)
          .filter(isDefined);
        let managerClientCompanyIds: string[] = [];
        if (actor.isManager) {
          const operationsRecord = await manager
            .getRepository(DeliveryOperationsEntity)
            .findOneBy({ workspaceId: workspace.id });
          const engagementCompanyIds = (
            operationsRecord?.state.clients?.engagements ?? []
          ).map((engagement) => engagement.companyId);
          managerClientCompanyIds = [
            ...new Set([
              ...resolveEffectiveClientCompanyIds(
                operationsRecord?.state.clientRoster,
                projectCompanyIds,
                engagementCompanyIds,
              ),
              ...projectCompanyIds,
            ]),
          ];
        }
        const companyIdsToLoad = actor.isManager
          ? managerClientCompanyIds
          : projectCompanyIds;
        const companies: { id: string; name: string }[] =
          companyIdsToLoad.length
            ? await manager.query(
                `SELECT id, name FROM ${this.schema(workspace)}."company" WHERE id = ANY($1::uuid[]) AND "deletedAt" IS NULL ORDER BY name LIMIT 1000`,
                [companyIdsToLoad],
              )
            : [];
        const deliveryRows: { delivery: Fulfilment; timezone: string }[] =
          tasks.length
            ? await manager.query(
                `SELECT jsonb_set(item, '{history}', CASE WHEN jsonb_array_length(item->'history') > 0 THEN jsonb_build_array(item->'history'->-1) ELSE '[]'::jsonb END) AS delivery, state->>'timezone' AS timezone FROM core."deliveryOperations", jsonb_array_elements(COALESCE(state->'fulfilments', '[]'::jsonb)) item WHERE "workspaceId"=$1 AND item->>'taskId'=ANY($2::text[])`,
                [workspace.id, tasks.map((task) => task.id)],
              )
            : [];
        const deliveries = new Map(
          deliveryRows.map((row) => [row.delivery.taskId, row]),
        );
        const reviewAssignments = await readCurrentDeliveryReviewAssignments(
          manager,
          workspace.id,
          tasks.flatMap((task) => {
            const latest =
              task.details.submissions[task.details.submissions.length - 1];
            return latest &&
              Number.isInteger(latest.version) &&
              latest.version > 0
              ? [{ taskId: task.id, submissionVersion: latest.version }]
              : [];
          }),
        );
        return {
          workspaceId: workspace.id,
          memberId,
          userWorkspaceId,
          actor,
          projects,
          tasks: tasks.map((task) => ({
            ...task,
            review: {
              submissionVersion:
                task.details.submissions[task.details.submissions.length - 1]
                  ?.version ?? null,
              ...deliveryReviewAuthority({
                primaryReviewerId: task.details.reviewerId,
                assigneeId: task.assigneeId,
                allowSelfReview: task.details.allowSelfReview,
                assignment: reviewAssignments.get(task.id),
                projectMemberIds:
                  projects.find((project) => project.id === task.projectId)
                    ?.memberIds ?? [],
                access: [...memberAccess.values()],
                actorId: memberId,
              }),
            },
            details:
              task.details.creative && !canReadFinance(actor)
                ? {
                    ...task.details,
                    creative: { ...task.details.creative, revisionCharge: 0 },
                  }
                : task.details,
            delivery: {
              ...getDeliveryLifecycle(
                task.details,
                deliveries.get(task.id)?.delivery,
              ),
              timezone: deliveries.get(task.id)?.timezone ?? 'UTC',
            },
          })),
          companies,
          members: members
            .filter(
              (member) =>
                memberAccess.has(member.id) &&
                (actor.isManager || visibleMemberIds.has(member.id)),
            )
            .map((member) => {
              const profile = profiles.find(
                (candidate) => candidate.workspaceMemberId === member.id,
              );
              return {
                ...member,
                roleLabel: profile?.roleLabel ?? '',
                access: memberAccess
                  .get(member.id)
                  ?.capabilities.includes('workspace.admin')
                  ? 'ADMIN'
                  : memberAccess
                        .get(member.id)
                        ?.capabilities.includes('delivery.manage')
                    ? 'MANAGER'
                    : 'MEMBER',
              };
            }),
        };
      },
      transactionManager,
    );
  }

  async command(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
    transactionManager?: EntityManager,
    activityActor?: { actorType: 'SYSTEM' | 'CLIENT'; actorId: null },
    options?: { allowSelfReview?: boolean },
  ) {
    const parsed = deliveryCommandSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException(
        'Check the required fields, dates and evidence links.',
      );
    const command = parsed.data;
    const apply = async (manager: EntityManager) => {
      // Serialize access changes with submissions so revocation cannot race a write.
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`delivery:${workspace.id}`],
      );
      const actor = await this.actor(
        workspace,
        memberId,
        userWorkspaceId,
        manager,
      );
      const projectRepository = manager.getRepository(DeliveryProjectEntity);
      const taskRepository = manager.getRepository(DeliveryTaskEntity);
      const members = await this.members(manager, workspace);
      const assertMembers = (ids: string[]) => {
        if (ids.some((id) => !members.some((member) => member.id === id)))
          throw new BadRequestException('Select active workspace members.');
      };
      const requireManager = () => {
        if (!actor.isManager)
          throw new ForbiddenException('A delivery manager is required.');
      };
      if (command.action === 'member') {
        throw new BadRequestException(
          'Manage multiple roles in Team → People and roles. Reload the page to use the current role editor.',
        );
      }
      if (command.action === 'project') {
        requireManager();
        assertMembers(command.memberIds);
        if (command.companyId) {
          const companies: { id: string }[] = await manager.query(
            `SELECT id FROM ${this.schema(workspace)}."company" WHERE id = $1 AND "deletedAt" IS NULL`,
            [command.companyId],
          );
          if (!companies.length)
            throw new BadRequestException('Company not found.');
        }
        const existing = command.id
          ? await projectRepository.findOneBy({
              id: command.id,
              workspaceId: workspace.id,
            })
          : null;
        if (command.id && !existing) throw new NotFoundException();
        if (existing && existing.revision !== command.revision)
          throw new ConflictException(
            'This project changed. Refresh and reload the latest version before saving. Your draft has not been applied.',
          );
        const project = await projectRepository.save({
          ...existing,
          workspaceId: workspace.id,
          name: command.name,
          companyId: command.companyId,
          memberIds: [...new Set(command.memberIds)],
          revision: (existing?.revision ?? 0) + 1,
        });
        if (project.companyId) {
          const operationsRepo = manager.getRepository(
            DeliveryOperationsEntity,
          );
          if (
            operationsRepo &&
            typeof operationsRepo.findOneBy === 'function' &&
            typeof operationsRepo.save === 'function'
          ) {
            const operationsRecord =
              (await operationsRepo.findOneBy({ workspaceId: workspace.id })) ??
              (typeof operationsRepo.create === 'function'
                ? operationsRepo.create({
                    workspaceId: workspace.id,
                    state: newDeliveryOperations(),
                  })
                : null);
            if (operationsRecord?.state) {
              const rosterUpdate = includeCompanyInClientRoster(
                operationsRecord.state.clientRoster,
                project.companyId,
                {
                  forceReinclude:
                    !existing || existing.companyId !== project.companyId,
                },
              );
              if (rosterUpdate.changed) {
                operationsRecord.state.clientRoster = rosterUpdate.roster;
                await operationsRepo.save(operationsRecord);
              }
            }
          }
        }
        await recordOtogrowActivity(manager, {
          workspaceId: workspace.id,
          actorId: activityActor ? activityActor.actorId : memberId,
          actorType: activityActor?.actorType ?? 'HUMAN',
          category: 'DELIVERY',
          action: existing ? 'PROJECT_UPDATED' : 'PROJECT_CREATED',
          outcome: 'RECORDED',
          summary: existing
            ? 'Updated a delivery project.'
            : 'Created a delivery project.',
          projectId: project.id,
          sourceType: 'project',
          sourceId: project.id,
          changes: [
            {
              field: 'revision',
              before: existing ? String(existing.revision) : null,
              after: String(project.revision),
            },
            {
              field: 'memberIds',
              before: existing
                ? [...existing.memberIds].sort().join(',')
                : null,
              after: [...project.memberIds].sort().join(','),
            },
            {
              field: 'companyId',
              before: existing?.companyId ?? null,
              after: project.companyId,
            },
          ].filter((change) => change.before !== change.after),
        });
        return project.id;
      }
      const event = (action: string, text: string) => ({
        id: v4(),
        actorId: memberId,
        action,
        text,
        at: new Date().toISOString(),
      });
      const validateAssignment = async (
        project: DeliveryProjectEntity,
        assigneeId: string,
        reviewerId: string,
        allowSelfReview = false,
      ) => {
        assertMembers([assigneeId, reviewerId]);
        if (assigneeId === reviewerId && !allowSelfReview)
          throw new BadRequestException(
            'Choose a reviewer other than the assignee.',
          );
        if (!project.memberIds.includes(assigneeId))
          throw new BadRequestException(
            'Add the assignee to this project first.',
          );
        const reviewerAccess = await this.access.getAccess(
          workspace.id,
          reviewerId,
          manager,
        );
        if (!reviewerAccess.capabilities.includes('delivery.manage'))
          throw new BadRequestException(
            'Give the reviewer delivery management access in Team first.',
          );
      };
      if (command.action === 'create') {
        requireManager();
        const createOperation: DeliveryNativeTaskWriteOperation = {
          type: 'insert',
          updatedColumns: ['title', 'assigneeId', 'dueAt', 'status'],
        };
        await this.nativeTasks.visibility(
          manager,
          workspace,
          { memberId, userWorkspaceId },
          undefined,
          createOperation,
        );
        const project = await projectRepository.findOneBy({
          id: command.projectId,
          workspaceId: workspace.id,
        });
        if (!project) throw new NotFoundException();
        const fields = command.fields;
        await validateAssignment(
          project,
          fields.assigneeId,
          fields.reviewerId,
          options?.allowSelfReview === true,
        );
        const taskId = v4();
        await manager.query(
          `INSERT INTO ${this.schema(workspace)}."task" (id, title, "assigneeId", "dueAt", status) VALUES ($1, $2, $3, $4, 'TODO')`,
          [taskId, fields.title, fields.assigneeId, fields.dueAt],
        );
        await this.nativeTasks.assert(
          manager,
          workspace,
          { memberId, userWorkspaceId },
          taskId,
          undefined,
          createOperation,
        );
        const created = await taskRepository.save({
          workspaceId: workspace.id,
          taskId,
          projectId: project.id,
          details: {
            assignmentAt: new Date().toISOString(),
            ...(options?.allowSelfReview === true &&
            fields.assigneeId === fields.reviewerId
              ? { allowSelfReview: true }
              : {}),
            brief: fields.brief,
            service: fields.service,
            priority: fields.priority,
            scheduledDate: fields.scheduledDate,
            reviewerId: fields.reviewerId,
            state: 'PLANNED',
            blocker: '',
            checklist: fields.checklist,
            evidence: fields.evidence,
            submissions: [],
            events: [event('CREATED', fields.title)],
          },
        });
        if (command.workflow) {
          const { published } = await getPublishedDeliveryWorkflow(
            manager,
            workspace.id,
            command.workflow.templateId,
            command.workflow.version,
          );
          await applyPublishedDeliveryWorkflow(
            manager,
            workspace,
            created,
            published,
            activityActor ? activityActor.actorId : memberId,
          );
          await taskRepository.save(created);
        }
        await recordOtogrowActivity(manager, {
          workspaceId: workspace.id,
          actorId: activityActor ? activityActor.actorId : memberId,
          actorType: activityActor?.actorType ?? 'HUMAN',
          subjectMemberId: fields.assigneeId,
          category: 'DELIVERY',
          action: 'TASK_CREATED',
          outcome: 'RECORDED',
          summary:
            activityActor?.actorType === 'SYSTEM'
              ? 'Created a scheduled delivery task.'
              : activityActor?.actorType === 'CLIENT'
                ? 'Created and assigned a task from a client request.'
                : 'Created and assigned a delivery task.',
          projectId: project.id,
          taskId,
          sourceType: 'task',
          sourceId: taskId,
          changes: Object.entries({
            state: 'PLANNED',
            assigneeId: fields.assigneeId,
            reviewerId: fields.reviewerId,
            dueAt: fields.dueAt,
            scheduledDate: fields.scheduledDate,
            priority: fields.priority,
            revision: String(created.revision),
          }).map(([field, after]) => ({ field, before: null, after })),
        });
        return taskId;
      }
      const deliveryTask = await taskRepository.findOneBy({
        workspaceId: workspace.id,
        taskId: command.taskId,
      });
      if (!deliveryTask) throw new NotFoundException();
      const project = await projectRepository.findOneBy({
        workspaceId: workspace.id,
        id: deliveryTask.projectId,
      });
      if (
        !project ||
        !canAccessDeliveryProject(actor.isManager, memberId, project.memberIds)
      )
        throw new NotFoundException();
      const writeOperation: DeliveryNativeTaskWriteOperation = {
        type: 'update',
        updatedColumns:
          command.action === 'edit'
            ? ['title', 'assigneeId', 'dueAt', 'status']
            : ['status'],
      };
      await this.nativeTasks.assert(
        manager,
        workspace,
        { memberId, userWorkspaceId },
        command.taskId,
        undefined,
        writeOperation,
      );
      const nativeTasks: NativeTask[] = await manager.query(
        `SELECT id, title, "assigneeId", "dueAt" FROM ${this.schema(workspace)}."task" WHERE id = $1 AND "deletedAt" IS NULL FOR UPDATE`,
        [command.taskId],
      );
      const task = nativeTasks[0];
      if (!task) throw new NotFoundException();
      if (deliveryTask.revision !== command.revision)
        throw new ConflictException(
          'This task changed. Refresh it before saving.',
        );
      const details = deliveryTask.details;
      const before = {
        ...planningActivity(details),
        state: details.state,
        assigneeId: task.assigneeId,
        reviewerId: details.reviewerId,
        dueAt: task.dueAt ? new Date(task.dueAt).toISOString() : null,
        scheduledDate: details.scheduledDate,
        priority: details.priority,
        revision: String(deliveryTask.revision),
        submissionVersion: String(details.submissions.length),
        evidenceCount: String(details.evidence.length),
        checklistCount: String(details.checklist.length),
        checklistCompleted: String(
          details.checklist.filter((item) => item.done).length,
        ),
      };
      if (command.action === 'plan') {
        requireManager();
        if (details.state === 'APPROVED')
          throw new BadRequestException(
            'Approved work does not need a remaining effort estimate.',
          );
        details.plan = command.plan;
        details.events.push(
          event(
            'PLANNING_UPDATED',
            'Updated remaining effort and review planning.',
          ),
        );
      } else if (command.action === 'edit') {
        requireManager();
        if (['IN_REVIEW', 'APPROVED'].includes(details.state))
          throw new BadRequestException(
            'Review this submission before editing its brief.',
          );
        await validateAssignment(
          project,
          command.fields.assigneeId,
          command.fields.reviewerId,
        );
        const { title, assigneeId, dueAt, ...fields } = command.fields;
        await manager.query(
          `UPDATE ${this.schema(workspace)}."task" SET title=$2, "assigneeId"=$3, "dueAt"=$4, "updatedAt"=now() WHERE id=$1`,
          [task.id, title, assigneeId, dueAt],
        );
        if (details.creative && fields.brief !== details.brief)
          invalidateCreativeBrief(details.creative);
        if (assigneeId !== task.assigneeId)
          details.assignmentAt = new Date().toISOString();
        Object.assign(details, fields);
        details.events.push(event('UPDATED', title));
      } else if (command.action === 'review') {
        const latest = details.submissions[details.submissions.length - 1];
        const assignment = latest
          ? (
              await readCurrentDeliveryReviewAssignments(
                manager,
                workspace.id,
                [{ taskId: command.taskId, submissionVersion: latest.version }],
              )
            ).get(command.taskId)
          : undefined;
        const reviewAuthority = deliveryReviewAuthority({
          primaryReviewerId: details.reviewerId,
          assigneeId: task.assigneeId,
          allowSelfReview: details.allowSelfReview,
          assignment,
          projectMemberIds: project.memberIds,
          access: [{ memberId, capabilities: actor.capabilities }],
          actorId: memberId,
        });
        assertDeliveryReviewAssignmentRevision(
          reviewAuthority.assignmentRevision,
          command.reviewAssignmentRevision,
        );
        assertDeliveryReview(
          details,
          task.assigneeId,
          memberId,
          reviewAuthority.canReview,
          command.feedback,
          command.decision,
          reviewAuthority.effectiveReviewerId,
        );
        assertDeliveryCreativeReview(details, command);
        const submission = details.submissions[details.submissions.length - 1];
        if (command.decision === 'CHANGES_REQUESTED')
          await recordDeliveryRevision(
            manager,
            deliveryTask,
            memberId,
            'INTERNAL_REVIEW',
            command.feedback,
          );
        if (command.decision === 'APPROVED') {
          if (
            details.workflow &&
            (!submission.workflow ||
              submission.workflow.revision !== details.workflow.revision ||
              submission.workflow.templateId !== details.workflow.templateId ||
              submission.workflow.version !== details.workflow.version)
          )
            throw new ConflictException(
              'The submitted workflow requirements changed. Request a new submission.',
            );
        }
        assertWorkflowReview(
          submission.workflow,
          command.workflowReview?.checkedIds,
          command.decision === 'APPROVED',
        );
        Object.assign(submission, {
          ...(submission.workflow
            ? {
                workflowReview: {
                  checkedIds: command.workflowReview?.checkedIds ?? [],
                },
              }
            : {}),
          decision: command.decision,
          feedback: command.feedback,
          reviewedBy: memberId,
          reviewedAt: new Date().toISOString(),
        });
        details.state = command.decision;
        details.events.push(event(command.decision, command.feedback));
      } else if (command.action === 'comment') {
        details.events.push(event('COMMENT', command.text));
      } else {
        if (task.assigneeId !== memberId)
          throw new ForbiddenException(
            'Only the assignee can submit or update production progress.',
          );
        if (['APPROVED', 'IN_REVIEW'].includes(details.state))
          throw new BadRequestException(
            'This submission is locked pending review.',
          );
        if (command.action === 'submit') {
          assertWorkflowSubmission(details.workflow);
          if (details.creative) assertCreativeSubmission(details.creative);
          else if (!command.evidence.length)
            throw new BadRequestException('Add evidence before submitting.');
          details.submissions.push({
            ...(details.workflow
              ? { workflow: structuredClone(details.workflow) }
              : {}),
            version: details.submissions.length + 1,
            ...(details.creative
              ? {
                  creativeVersion: details.creative.version,
                  finalAssetId: details.creative.finalAssetId ?? undefined,
                  creativeLearning: freezeCreativeSubmissionLearning(
                    details.creative,
                    details.draftCopy,
                    project,
                  ),
                }
              : {}),
            description: command.description,
            evidence: command.evidence,
            submittedBy: memberId,
            submittedAt: new Date().toISOString(),
          });
          details.evidence = command.evidence;
          details.state = 'IN_REVIEW';
          details.blocker = '';
          details.events.push(event('SUBMITTED', command.description));
        } else {
          if (command.state === 'BLOCKED' && !command.blocker.trim())
            throw new BadRequestException(
              'Explain what is blocking this task.',
            );
          details.state = command.state;
          details.blocker = command.blocker;
          details.checklist = command.checklist;
          details.evidence = command.evidence;
          details.events.push(event('PROGRESS', command.state));
        }
      }
      deliveryTask.revision += 1;
      if (command.action === 'submit' || command.action === 'review')
        await cancelDeliveryReviewNotices(
          manager,
          workspace.id,
          command.taskId,
          new Date(),
        );
      if (command.action === 'submit') {
        const latest = details.submissions[details.submissions.length - 1];
        const authority = deliveryReviewAuthority({
          primaryReviewerId: details.reviewerId,
          assigneeId: task.assigneeId,
          allowSelfReview: details.allowSelfReview,
          projectMemberIds: project.memberIds,
          access: await this.access.listAccess(workspace.id, manager),
          actorId: details.reviewerId,
        });
        await recordDeliveryReviewNotice(manager, workspace.id, {
          taskId: command.taskId,
          submissionVersion: latest.version,
          assignmentId: null,
          assignmentRevision: 0,
          previousRecipientId: null,
          recipientId: authority.effectiveReviewerId,
          eligible: authority.reviewerState === 'ACTIVE',
          senderId: memberId,
          now: new Date(),
        });
      }
      await taskRepository.save(deliveryTask);
      await syncStoredDeliveryCommitment(
        manager,
        deliveryTask,
        activityActor ?? { actorId: memberId, actorType: 'HUMAN' },
      );
      await manager.query(
        `UPDATE ${this.schema(workspace)}."task" SET status=$2, "updatedAt"=now() WHERE id=$1`,
        [
          task.id,
          details.state === 'APPROVED'
            ? 'DONE'
            : details.state === 'PLANNED'
              ? 'TODO'
              : 'IN_PROGRESS',
        ],
      );
      await this.nativeTasks.assert(
        manager,
        workspace,
        { memberId, userWorkspaceId },
        task.id,
        undefined,
        writeOperation,
      );
      const after = {
        ...planningActivity(details),
        state: details.state,
        assigneeId:
          command.action === 'edit'
            ? command.fields.assigneeId
            : task.assigneeId,
        reviewerId: details.reviewerId,
        dueAt: command.action === 'edit' ? command.fields.dueAt : before.dueAt,
        scheduledDate: details.scheduledDate,
        priority: details.priority,
        revision: String(deliveryTask.revision),
        submissionVersion: String(details.submissions.length),
        evidenceCount: String(details.evidence.length),
        checklistCount: String(details.checklist.length),
        checklistCompleted: String(
          details.checklist.filter((item) => item.done).length,
        ),
      };
      const activity = {
        plan: {
          action: 'TASK_PLANNING_UPDATED',
          summary: 'Updated remaining effort and review planning.',
        },
        edit: { action: 'TASK_UPDATED', summary: 'Updated a delivery task.' },
        progress: {
          action: 'TASK_PROGRESS',
          summary: 'Updated production progress.',
        },
        submit: {
          action: 'TASK_SUBMITTED',
          summary: 'Submitted a version for independent review.',
        },
        review: {
          action: 'TASK_REVIEWED',
          summary:
            command.action === 'review' && command.decision === 'APPROVED'
              ? 'Approved a submitted version.'
              : 'Requested changes to a submitted version.',
        },
        comment: { action: 'TASK_COMMENTED', summary: 'Added a task note.' },
      }[command.action];
      await recordOtogrowActivity(manager, {
        workspaceId: workspace.id,
        actorId: activityActor ? activityActor.actorId : memberId,
        actorType: activityActor?.actorType ?? 'HUMAN',
        subjectMemberId: after.assigneeId,
        category: 'DELIVERY',
        ...activity,
        outcome: command.action === 'review' ? command.decision : 'RECORDED',
        projectId: project.id,
        taskId: task.id,
        sourceType: 'task',
        sourceId: task.id,
        changes: (Object.keys(after) as (keyof typeof after)[])
          .filter((field) => before[field] !== after[field])
          .map((field) => ({
            field,
            before: before[field],
            after: after[field],
          })),
      });
    };
    if (transactionManager) {
      return apply(transactionManager);
    }
    await this.dataSource.transaction(apply);
    return this.snapshot(workspace, memberId, userWorkspaceId);
  }
}
