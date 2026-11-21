import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { isValidUuid } from 'twenty-shared/utils';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { DeliveryNativeTaskAccessService } from 'src/modules/delivery/delivery-native-task-access.service';
import { type DeliveryNativeTaskVisibility } from 'src/modules/delivery/native-task-visibility';
import { canAccessDeliveryProject } from 'src/modules/delivery/delivery-policy';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { DeliveryTaskEntity } from 'src/modules/delivery/entities/delivery-task.entity';
import { OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { type OtogrowAccess } from 'src/modules/otogrow-access/otogrow-access.types';
import { readDeliverySnapshot } from 'src/modules/delivery/read-delivery-snapshot';
import { financeReviewToken } from 'src/modules/delivery/finance/delivery-finance-reconciliation.policy';
import { assertDeliveryCreativeReview } from 'src/modules/delivery/creative/assert-delivery-creative-review';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';
import { DeliveryOperationsEntity } from 'src/modules/delivery/entities/delivery-operations.entity';
import { DeliveryReminderOutboxEntity } from 'src/modules/delivery/entities/delivery-reminder-outbox.entity';
import {
  acknowledgeCurrentDeliveryReviewNotice,
  currentDeliveryReviewNotice,
  readDeliveryReviewNotice,
  recordDeliveryReviewNotice,
} from 'src/modules/delivery/reviews/delivery-review-notices';
import { DeliveryReviewAssignmentEntity } from 'src/modules/delivery/reviews/entities/delivery-review-assignment.entity';
import { DeliveryReviewAssignmentEventEntity } from 'src/modules/delivery/reviews/entities/delivery-review-assignment-event.entity';
import {
  deliveryReviewAuthority,
  readCurrentDeliveryReviewAssignments,
} from 'src/modules/delivery/reviews/delivery-review-authority';
import {
  DELIVERY_REVIEW_PAGE_SIZE,
  DELIVERY_REVIEW_SOURCE_LIMIT,
  deliveryReviewAge,
  deliveryReviewAssignmentSchema,
  deliveryReviewCursor,
  deliveryReviewHistorySchema,
  deliveryReviewHistoryCursor,
  readDeliveryReviewHistoryCursor,
  deliveryReviewOffset,
  deliveryReviewQueueSchema,
  deliveryTaskReviewSchema,
  deliveryReviewSeenSchema,
  parseDeliveryReview,
} from 'src/modules/delivery/reviews/delivery-reviews.policy';
import {
  type DeliveryReviewAssignmentDTO,
  type DeliveryReviewAssignmentHistoryDTO,
  type DeliveryReviewAssignmentHistoryInput,
  type DeliveryReviewAssignmentInput,
  type DeliveryReviewAssignmentResultDTO,
  type DeliveryReviewQueueInput,
  type DeliveryReviewQueueItemDTO,
  type DeliveryReviewQueueSnapshotDTO,
  type DeliveryTaskReviewInput,
  type DeliveryTaskReviewSnapshotDTO,
  type DeliveryReviewAssignmentSeenInput,
  type DeliveryReviewAssignmentAcknowledgeInput,
  type DeliveryReviewAssignmentAcknowledgementDTO,
} from 'src/modules/delivery/reviews/delivery-reviews.dto';
import { type DeliveryNotice } from 'src/modules/delivery/operations/delivery-operations.types';

type ReviewPeople = {
  members: Awaited<ReturnType<OtogrowAccessService['listActiveMembers']>>;
  access: OtogrowAccess[];
};
type NativeReviewCache = Map<
  string,
  Promise<DeliveryNativeTaskVisibility | null>
>;
type NativeReviewTasks = { fingerprint: string | null; taskIds: Set<string> };
type ReviewRow = {
  taskId: string;
  title: string;
  projectId: string;
  assigneeId: string | null;
  taskRevision: number;
  service: string;
  primaryReviewerId: string | null;
  allowSelfReview?: boolean;
  submissionVersion: unknown;
  submittedAt: unknown;
  creativeVersion: unknown;
  finalAssetId: unknown;
  requiredCheckCount: number | null;
};
const positiveVersion = (value: unknown) =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value > 0 &&
  value <= 2147483647
    ? value
    : null;

@Injectable()
export class DeliveryReviewsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly delivery: DeliveryService,
    private readonly access: OtogrowAccessService,
    private readonly nativeTasks: DeliveryNativeTaskAccessService,
  ) {}

  private async nativeReviewTasks(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    people: ReviewPeople,
    memberId: string,
    taskIds: string[],
    cache: NativeReviewCache,
  ): Promise<NativeReviewTasks> {
    const person = people.members.find(
      (member) => member.memberId === memberId,
    );
    if (!person) return { fingerprint: null, taskIds: new Set() };
    const key = `${person.memberId}:${person.userWorkspaceId}`;
    let pending = cache.get(key);
    if (!pending) {
      pending = this.nativeTasks
        .visibility(manager, workspace, person, undefined, {
          type: 'update',
          updatedColumns: ['status'],
        })
        .catch((error: unknown) => {
          if (
            error instanceof ForbiddenException ||
            error instanceof NotFoundException
          )
            return null;
          throw error;
        });
      cache.set(key, pending);
    }
    const visibility = await pending;
    if (!visibility) return { fingerprint: null, taskIds: new Set() };
    const rows = await this.nativeTasks.query<{ id: string }[]>(
      manager,
      `SELECT task.id FROM ${this.delivery.schema(workspace)}.task task WHERE task.id=ANY($1::uuid[]) AND ${this.nativeTasks.predicate(workspace, visibility, 'task.id')}`,
      [taskIds],
      visibility,
    );
    return {
      fingerprint: visibility.fingerprint,
      taskIds: new Set(rows.map((row) => row.id)),
    };
  }

  private withNativeReviewAccess(
    item: DeliveryReviewQueueItemDTO,
    access: Map<string, NativeReviewTasks>,
    memberId: string,
  ): DeliveryReviewQueueItemDTO {
    const unavailable =
      item.reviewerState === 'ACTIVE' &&
      Boolean(item.effectiveReviewerId) &&
      !access.get(item.effectiveReviewerId!)?.taskIds.has(item.taskId);
    if (!unavailable) return item;
    return {
      ...item,
      reviewerState: 'UNAVAILABLE',
      canReviewSubmission: false,
      warnings: [
        ...item.warnings,
        'REVIEWER_NATIVE_ACCESS_UNAVAILABLE',
        ...(item.effectiveReviewerId === memberId
          ? ['NATIVE_REVIEW_WRITE_UNAVAILABLE']
          : []),
      ],
    };
  }

  private async people(
    manager: EntityManager,
    workspaceId: string,
  ): Promise<ReviewPeople> {
    const members = await this.access.listActiveMembers(workspaceId, manager);
    if (members.length > DELIVERY_REVIEW_SOURCE_LIMIT)
      throw new BadRequestException(
        'The active reviewer directory exceeds its complete source limit.',
      );
    return {
      members,
      access: await this.access.listAccess(workspaceId, manager),
    };
  }
  private name(people: ReviewPeople, id: string | null) {
    return id
      ? people.members.find((member) => member.memberId === id)?.name ||
          'Former team member'
      : 'Unassigned';
  }
  private assignment(
    taskId: string,
    version: number,
    row: DeliveryReviewAssignmentEntity | null | undefined,
  ): DeliveryReviewAssignmentDTO {
    return {
      id: row?.id ?? null,
      taskId,
      submissionVersion: version,
      revision: row?.revision ?? 0,
      mode: row?.mode ?? 'PRIMARY',
      reviewerId: row?.reviewerId ?? null,
      reviewerName: row?.reviewerName ?? null,
      reason: row?.reason ?? null,
      changedByName: row?.changedByName ?? null,
      changedAt: row ? new Date(row.changedAt).toISOString() : null,
    };
  }
  private async scope(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    taskId: string,
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
      ['id', 'title', 'assigneeId'],
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
      throw new NotFoundException();
    const native: { assigneeId: string | null; title: string }[] =
      await manager.query(
        `SELECT "assigneeId",title FROM ${this.delivery.schema(workspace)}.task WHERE id=$1 AND "deletedAt" IS NULL`,
        [taskId],
      );
    if (!native[0]) throw new NotFoundException();
    return { actor, task, project, nativeVisibility, ...native[0] };
  }
  private item(
    row: ReviewRow,
    project: DeliveryProjectEntity,
    assignment: DeliveryReviewAssignmentEntity | undefined,
    people: ReviewPeople,
    memberId: string,
    now: Date,
  ): DeliveryReviewQueueItemDTO {
    const version = positiveVersion(row.submissionVersion);
    const requiredCheckCount = version === null ? null : row.requiredCheckCount;
    const authority = deliveryReviewAuthority({
      primaryReviewerId: row.primaryReviewerId,
      assigneeId: row.assigneeId,
      allowSelfReview: row.allowSelfReview,
      assignment,
      projectMemberIds: project.memberIds,
      access: people.access,
      actorId: memberId,
    });
    return {
      taskId: row.taskId,
      title: row.title,
      projectId: row.projectId,
      projectName: project.name,
      service: row.service,
      taskRevision: row.taskRevision,
      submissionVersion: version,
      ...deliveryReviewAge(row.submittedAt, now),
      primaryReviewerId: authority.primaryReviewerId,
      primaryReviewerName: this.name(people, authority.primaryReviewerId),
      effectiveReviewerId: authority.effectiveReviewerId,
      effectiveReviewerName: this.name(people, authority.effectiveReviewerId),
      reviewerState: authority.reviewerState,
      assignmentMode: authority.assignmentMode,
      assignmentRevision: authority.assignmentRevision,
      creativeVersion: positiveVersion(row.creativeVersion),
      finalAssetId:
        typeof row.finalAssetId === 'string' && isValidUuid(row.finalAssetId)
          ? row.finalAssetId
          : null,
      requiredCheckCount,
      canReviewSubmission: version !== null && authority.canReview,
      warnings: [
        ...(version === null ? ['SUBMISSION_IDENTITY_UNAVAILABLE'] : []),
        ...(requiredCheckCount === null
          ? ['WORKFLOW_REQUIREMENTS_UNAVAILABLE']
          : []),
      ],
    };
  }
  async queue(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: DeliveryReviewQueueInput,
    now = new Date(),
  ): Promise<DeliveryReviewQueueSnapshotDTO> {
    const query = parseDeliveryReview(deliveryReviewQueueSchema, input);
    return readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => {
        const actor = await this.delivery.actor(
          workspace,
          memberId,
          userWorkspaceId,
          manager,
        );
        if (!actor.isManager && !actor.capabilities.includes('delivery.review'))
          throw new ForbiddenException('Assigned review access is required.');
        const nativeVisibility = await this.nativeTasks.visibility(
          manager,
          workspace,
          { memberId, userWorkspaceId },
          ['id', 'title', 'assigneeId'],
        );
        const projectQuery = manager
          .getRepository(DeliveryProjectEntity)
          .createQueryBuilder('project')
          .where('project."workspaceId"=:workspaceId', {
            workspaceId: workspace.id,
          });
        if (!actor.isManager)
          projectQuery.andWhere(
            'project."memberIds" @> CAST(:memberIds AS jsonb)',
            {
              memberIds: JSON.stringify([memberId]),
            },
          );
        const projects = await projectQuery
          .orderBy('project.name', 'ASC')
          .addOrderBy('project.id', 'ASC')
          .take(DELIVERY_REVIEW_SOURCE_LIMIT + 1)
          .getMany();
        if (projects.length > DELIVERY_REVIEW_SOURCE_LIMIT)
          throw new BadRequestException(
            'The project directory exceeds its complete review limit.',
          );
        if (
          query.projectId &&
          !projects.some((project) => project.id === query.projectId)
        )
          throw new NotFoundException('This review project is unavailable.');
        const selectedProjects = projects.filter(
          (project) => !query.projectId || project.id === query.projectId,
        );
        const rows: ReviewRow[] = selectedProjects.length
          ? await this.nativeTasks.query<ReviewRow[]>(
              manager,
              `SELECT task.id AS "taskId",task.title,task."assigneeId",delivery."projectId",delivery.revision AS "taskRevision",COALESCE(delivery.details->>'service','') AS service,delivery.details->>'reviewerId' AS "primaryReviewerId",COALESCE(delivery.details->'allowSelfReview','false'::jsonb) AS "allowSelfReview",delivery.details->'submissions'->-1->'version' AS "submissionVersion",delivery.details->'submissions'->-1->'submittedAt' AS "submittedAt",delivery.details->'submissions'->-1->'creativeVersion' AS "creativeVersion",delivery.details->'submissions'->-1->'finalAssetId' AS "finalAssetId",CASE WHEN delivery.details->'submissions'->-1->'workflow' IS NULL THEN 0 WHEN jsonb_typeof(delivery.details->'submissions'->-1->'workflow'->'definition'->'reviewChecks')='array' THEN (SELECT count(*)::integer FROM jsonb_array_elements(delivery.details->'submissions'->-1->'workflow'->'definition'->'reviewChecks') requirement WHERE requirement->>'required'='true') ELSE NULL END AS "requiredCheckCount" FROM core."deliveryTask" delivery JOIN ${this.delivery.schema(workspace)}.task task ON task.id=delivery."taskId" AND task."deletedAt" IS NULL WHERE delivery."workspaceId"=$1 AND delivery."projectId"=ANY($2::uuid[]) AND delivery.details->>'state'='IN_REVIEW' AND ${this.nativeTasks.predicate(workspace, nativeVisibility, 'task.id')} ORDER BY task.id LIMIT $3`,
              [
                workspace.id,
                selectedProjects.map((project) => project.id),
                DELIVERY_REVIEW_SOURCE_LIMIT + 1,
              ],
              nativeVisibility,
            )
          : [];
        if (rows.length > DELIVERY_REVIEW_SOURCE_LIMIT)
          throw new BadRequestException(
            'The pending review queue exceeds its complete source limit. Select a narrower project.',
          );
        const assignments = await readCurrentDeliveryReviewAssignments(
          manager,
          workspace.id,
          rows.flatMap((row) => {
            const version = positiveVersion(row.submissionVersion);
            return version === null
              ? []
              : [{ taskId: row.taskId, submissionVersion: version }];
          }),
        );
        const people = await this.people(manager, workspace.id);
        const businessItems = rows.map((row) =>
          this.item(
            row,
            selectedProjects.find((project) => project.id === row.projectId)!,
            assignments.get(row.taskId),
            people,
            memberId,
            now,
          ),
        );
        const reviewerTasks = new Map<string, string[]>();
        for (const item of businessItems) {
          if (item.reviewerState !== 'ACTIVE' || !item.effectiveReviewerId)
            continue;
          const tasks = reviewerTasks.get(item.effectiveReviewerId) ?? [];
          tasks.push(item.taskId);
          reviewerTasks.set(item.effectiveReviewerId, tasks);
        }
        const nativeReviews = new Map<string, NativeReviewTasks>();
        const nativeCache: NativeReviewCache = new Map();
        for (const [reviewerId, taskIds] of reviewerTasks)
          nativeReviews.set(
            reviewerId,
            await this.nativeReviewTasks(
              manager,
              workspace,
              people,
              reviewerId,
              taskIds,
              nativeCache,
            ),
          );
        const all = businessItems.map((item) =>
          this.withNativeReviewAccess(item, nativeReviews, memberId),
        );
        const items = all
          .filter(
            (item) =>
              (!query.reviewerId ||
                item.effectiveReviewerId === query.reviewerId) &&
              (!query.mine || item.effectiveReviewerId === memberId),
          )
          .sort((left, right) => {
            const leftDate =
                left.ageState === 'VALID'
                  ? Date.parse(left.submittedAt!)
                  : Infinity,
              rightDate =
                right.ageState === 'VALID'
                  ? Date.parse(right.submittedAt!)
                  : Infinity;
            return (
              leftDate - rightDate || left.taskId.localeCompare(right.taskId)
            );
          });
        const filter = {
          projectId: query.projectId,
          reviewerId: query.reviewerId,
          mine: query.mine,
          memberId,
          userWorkspaceId,
          nativeAccess: nativeVisibility.fingerprint,
          reviewerAccess: [...nativeReviews]
            .map(([id, access]) => [id, access.fingerprint])
            .sort(([left], [right]) =>
              String(left).localeCompare(String(right)),
            ),
        };
        const sources = items.map(
          ({ ageSeconds: _ageSeconds, ...item }) => item,
        );
        const offset = deliveryReviewOffset(
          query.after,
          workspace.id,
          filter,
          sources,
        );
        if (offset > items.length)
          throw new BadRequestException(
            'This review queue page is unavailable.',
          );
        const page = items.slice(offset, offset + query.limit);
        const reviewerIds = new Set(
          all.flatMap((item) =>
            [item.effectiveReviewerId, item.primaryReviewerId].filter(
              (id): id is string => id !== null,
            ),
          ),
        );
        return {
          workspaceId: workspace.id,
          memberId,
          userWorkspaceId,
          observedAt: now.toISOString(),
          canManage: actor.isManager,
          canReviewAssigned:
            actor.isManager || actor.capabilities.includes('delivery.review'),
          projects: projects.map((project) => ({
            id: project.id,
            name: project.name,
          })),
          reviewers: people.members
            .filter((member) => reviewerIds.has(member.memberId))
            .map((member) => ({ id: member.memberId, name: member.name })),
          totalCount: items.length,
          unknownAgeCount: items.filter((item) => item.ageState !== 'VALID')
            .length,
          unavailableReviewerCount: items.filter(
            (item) => item.reviewerState !== 'ACTIVE',
          ).length,
          items: page,
          nextCursor:
            offset + page.length < items.length
              ? deliveryReviewCursor(
                  workspace.id,
                  filter,
                  sources,
                  offset + page.length,
                )
              : null,
        };
      },
    );
  }
  private async readTask(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    taskId: string,
    now: Date,
    nativeCache: NativeReviewCache = new Map(),
  ): Promise<DeliveryTaskReviewSnapshotDTO> {
    const scope = await this.scope(
      manager,
      workspace,
      memberId,
      userWorkspaceId,
      taskId,
    );
    const people = await this.people(manager, workspace.id);
    const submissions = scope.task.details.submissions;
    if (submissions.length > DELIVERY_REVIEW_SOURCE_LIMIT)
      throw new BadRequestException(
        'This task exceeds its complete review source limit.',
      );
    const latest = submissions[submissions.length - 1];
    const version = positiveVersion(latest?.version);
    const row =
      version === null
        ? undefined
        : (
            await readCurrentDeliveryReviewAssignments(manager, workspace.id, [
              { taskId, submissionVersion: version },
            ])
          ).get(taskId);
    const checks = latest?.workflow?.definition.reviewChecks;
    const businessPending =
      scope.task.details.state === 'IN_REVIEW'
        ? this.item(
            {
              taskId,
              title: scope.title,
              projectId: scope.project.id,
              assigneeId: scope.assigneeId,
              taskRevision: scope.task.revision,
              service: scope.task.details.service,
              primaryReviewerId: scope.task.details.reviewerId,
              submissionVersion: version,
              submittedAt: latest?.submittedAt,
              creativeVersion: latest?.creativeVersion,
              finalAssetId: latest?.finalAssetId,
              requiredCheckCount: latest?.workflow
                ? Array.isArray(checks)
                  ? checks.filter((check) => check.required).length
                  : null
                : 0,
            },
            scope.project,
            row,
            people,
            memberId,
            now,
          )
        : null;
    const eligibleMembers = scope.actor.isManager
      ? people.members.filter(
          (member) =>
            scope.project.memberIds.includes(member.memberId) &&
            member.memberId !== scope.assigneeId &&
            people.access.some(
              (access) =>
                access.memberId === member.memberId &&
                access.capabilities.some((capability) =>
                  [
                    'workspace.admin',
                    'delivery.manage',
                    'delivery.review',
                  ].includes(capability),
                ),
            ),
        )
      : [];
    const reviewerIds = new Set(
      eligibleMembers.map((member) => member.memberId),
    );
    if (
      businessPending?.reviewerState === 'ACTIVE' &&
      businessPending.effectiveReviewerId
    )
      reviewerIds.add(businessPending.effectiveReviewerId);
    const nativeReviews = new Map<string, NativeReviewTasks>();
    for (const reviewerId of reviewerIds)
      nativeReviews.set(
        reviewerId,
        await this.nativeReviewTasks(
          manager,
          workspace,
          people,
          reviewerId,
          [taskId],
          nativeCache,
        ),
      );
    const pending = businessPending
      ? this.withNativeReviewAccess(businessPending, nativeReviews, memberId)
      : null;
    let canApprove = pending?.canReviewSubmission ?? false;
    if (canApprove && latest) {
      try {
        assertDeliveryCreativeReview(scope.task.details, {
          action: 'review',
          taskId,
          revision: scope.task.revision,
          decision: 'APPROVED',
          feedback: '',
          selectedSubmissionVersion: latest.version,
          creativeVersion: latest.creativeVersion,
          finalAssetId: latest.finalAssetId,
        });
      } catch {
        canApprove = false;
      }
    }
    const eligibleReviewers = eligibleMembers
      .filter((member) =>
        nativeReviews.get(member.memberId)?.taskIds.has(taskId),
      )
      .map((member) => ({ id: member.memberId, name: member.name }));
    return {
      workspaceId: workspace.id,
      memberId,
      userWorkspaceId,
      observedAt: now.toISOString(),
      taskId,
      taskRevision: scope.task.revision,
      state: scope.task.details.state,
      pending,
      assignment:
        version === null ? null : this.assignment(taskId, version, row),
      canManageAssignment:
        scope.actor.isManager && pending !== null && version !== null,
      canReviewSubmission: pending?.canReviewSubmission ?? false,
      canApprove,
      eligibleReviewers,
      assignmentNotice:
        pending &&
        version !== null &&
        businessPending?.reviewerState === 'ACTIVE' &&
        pending.effectiveReviewerId &&
        (scope.actor.isManager || pending.effectiveReviewerId === memberId)
          ? await readDeliveryReviewNotice(manager, workspace.id, {
              taskId,
              submissionVersion: version,
              assignmentId: row?.id ?? null,
              assignmentRevision: row?.revision ?? 0,
              recipientId: pending.effectiveReviewerId,
            })
          : null,
    };
  }
  async task(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: DeliveryTaskReviewInput,
    now = new Date(),
  ) {
    const query = parseDeliveryReview(deliveryTaskReviewSchema, input);
    return readDeliverySnapshot(this.dataSource, workspace.id, (manager) =>
      this.readTask(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        query.taskId,
        now,
      ),
    );
  }
  async assign(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: DeliveryReviewAssignmentInput,
    now = new Date(),
  ): Promise<DeliveryReviewAssignmentResultDTO> {
    const command = parseDeliveryReview(deliveryReviewAssignmentSchema, input),
      requestHash = financeReviewToken(command);
    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`delivery:${workspace.id}`],
      );
      const scope = await this.scope(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        command.taskId,
      );
      if (!scope.actor.isManager)
        throw new ForbiddenException(
          'Only a delivery manager can assign a backup reviewer.',
        );
      const events = manager.getRepository(DeliveryReviewAssignmentEventEntity),
        repository = manager.getRepository(DeliveryReviewAssignmentEntity);
      const previous = await events.findOneBy({
        workspaceId: workspace.id,
        commandId: command.commandId,
      });
      if (previous) {
        if (
          previous.requestHash !== requestHash ||
          previous.actorId !== memberId ||
          previous.taskId !== command.taskId
        )
          throw new ConflictException(
            'This review assignment command was used for another request.',
          );
        const saved = await repository.findOneBy({
          workspaceId: workspace.id,
          taskId: command.taskId,
          id: previous.assignmentId,
        });
        if (!saved)
          throw new ConflictException(
            'The earlier review assignment is unavailable.',
          );
        return {
          assignment: this.assignment(
            command.taskId,
            previous.submissionVersion,
            saved,
          ),
          taskReview: await this.readTask(
            manager,
            workspace,
            memberId,
            userWorkspaceId,
            command.taskId,
            now,
          ),
          replayed: true,
        };
      }
      const latest =
        scope.task.details.submissions[
          scope.task.details.submissions.length - 1
        ];
      if (
        scope.task.revision !== command.taskRevision ||
        scope.task.details.state !== 'IN_REVIEW' ||
        latest?.version !== command.submissionVersion
      )
        throw new ConflictException(
          'The pending submission changed. Refresh its exact review before reassigning.',
        );
      const current = await repository.findOne({
        where: {
          workspaceId: workspace.id,
          taskId: command.taskId,
          submissionVersion: command.submissionVersion,
        },
        lock: { mode: 'pessimistic_write' },
      });
      if ((current?.revision ?? 0) !== command.assignmentRevision)
        throw new ConflictException(
          'The backup review assignment changed. Refresh before saving.',
        );
      const people = await this.people(manager, workspace.id);
      const nativeCache: NativeReviewCache = new Map();
      const actorName = this.name(people, memberId),
        reviewerName = command.reviewerId
          ? this.name(people, command.reviewerId)
          : null;
      if (command.mode === 'BACKUP') {
        const authority = deliveryReviewAuthority({
          primaryReviewerId: scope.task.details.reviewerId,
          assigneeId: scope.assigneeId,
          allowSelfReview: scope.task.details.allowSelfReview,
          assignment: {
            mode: 'BACKUP',
            reviewerId: command.reviewerId,
            revision: 1,
          },
          projectMemberIds: scope.project.memberIds,
          access: people.access,
          actorId: command.reviewerId!,
        });
        if (!authority.canReview)
          throw new BadRequestException(
            'Choose an active independent reviewer with review access who already belongs to this project.',
          );
        const native = await this.nativeReviewTasks(
          manager,
          workspace,
          people,
          command.reviewerId!,
          [command.taskId],
          nativeCache,
        );
        if (!native.taskIds.has(command.taskId))
          throw new BadRequestException(
            'Choose a reviewer whose current CRM task access allows this review.',
          );
      }
      const saved = await repository.save({
        ...current,
        workspaceId: workspace.id,
        taskId: command.taskId,
        submissionVersion: command.submissionVersion,
        revision: (current?.revision ?? 0) + 1,
        mode: command.mode,
        reviewerId: command.reviewerId,
        reviewerName,
        reason: command.reason,
        changedBy: memberId,
        changedByName: actorName,
        changedAt: now,
      });
      await events.insert({
        workspaceId: workspace.id,
        taskId: command.taskId,
        assignmentId: saved.id,
        submissionVersion: command.submissionVersion,
        commandId: command.commandId,
        requestHash,
        revision: saved.revision,
        mode: command.mode,
        reviewerId: command.reviewerId,
        reviewerName,
        primaryReviewerName: this.name(people, scope.task.details.reviewerId),
        primaryReviewerId: isValidUuid(scope.task.details.reviewerId)
          ? scope.task.details.reviewerId
          : null,
        previousMode: current?.mode ?? 'PRIMARY',
        previousReviewerId:
          current?.mode === 'BACKUP'
            ? current.reviewerId
            : isValidUuid(scope.task.details.reviewerId)
              ? scope.task.details.reviewerId
              : null,
        previousReviewerName:
          current?.reviewerName ??
          this.name(people, scope.task.details.reviewerId),
        reason: command.reason,
        actorId: memberId,
        actorName,
        createdAt: now,
      });
      const assignedAuthority = deliveryReviewAuthority({
        primaryReviewerId: scope.task.details.reviewerId,
        assigneeId: scope.assigneeId,
        assignment: saved,
        projectMemberIds: scope.project.memberIds,
        access: people.access,
        actorId:
          saved.mode === 'BACKUP'
            ? (saved.reviewerId ?? '')
            : scope.task.details.reviewerId,
      });
      const assignedNative =
        assignedAuthority.reviewerState === 'ACTIVE' &&
        assignedAuthority.effectiveReviewerId
          ? await this.nativeReviewTasks(
              manager,
              workspace,
              people,
              assignedAuthority.effectiveReviewerId,
              [command.taskId],
              nativeCache,
            )
          : null;
      await recordDeliveryReviewNotice(manager, workspace.id, {
        taskId: command.taskId,
        submissionVersion: command.submissionVersion,
        assignmentId: saved.id,
        assignmentRevision: saved.revision,
        previousRecipientId:
          current?.mode === 'BACKUP'
            ? current.reviewerId
            : scope.task.details.reviewerId,
        recipientId: assignedAuthority.effectiveReviewerId,
        eligible: assignedNative?.taskIds.has(command.taskId) === true,
        senderId: memberId,
        now,
      });
      await recordOtogrowActivity(manager, {
        workspaceId: workspace.id,
        actorId: memberId,
        category: 'DELIVERY',
        action:
          command.mode === 'BACKUP'
            ? 'REVIEW_BACKUP_ASSIGNED'
            : 'REVIEW_PRIMARY_RESTORED',
        outcome: 'RECORDED',
        summary:
          command.mode === 'BACKUP'
            ? 'Assigned an independent backup for the current submission.'
            : 'Restored the primary reviewer for the current submission.',
        projectId: scope.project.id,
        taskId: command.taskId,
        sourceType: 'task',
        sourceId: command.taskId,
        changes: [
          {
            field: 'reviewerId',
            before:
              current?.mode === 'BACKUP'
                ? current.reviewerId
                : scope.task.details.reviewerId,
            after:
              command.mode === 'BACKUP'
                ? command.reviewerId
                : scope.task.details.reviewerId,
          },
          {
            field: 'submissionVersion',
            before: null,
            after: String(command.submissionVersion),
          },
        ],
      });
      return {
        assignment: this.assignment(
          command.taskId,
          command.submissionVersion,
          saved,
        ),
        taskReview: await this.readTask(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          command.taskId,
          now,
          nativeCache,
        ),
        replayed: false,
      };
    });
  }
  async history(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: DeliveryReviewAssignmentHistoryInput,
  ): Promise<DeliveryReviewAssignmentHistoryDTO> {
    const query = parseDeliveryReview(deliveryReviewHistorySchema, input);
    return readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) => {
        const scope = await this.scope(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          query.taskId,
        );
        const historyScope = {
          workspaceId: workspace.id,
          memberId,
          userWorkspaceId,
          taskId: query.taskId,
          submissionVersion: query.submissionVersion,
          nativeAccess: scope.nativeVisibility.fingerprint,
          projectId: scope.project.id,
          projectRevision: scope.project.revision,
          projectMembers: [...scope.project.memberIds].sort(),
          capabilities: [...scope.actor.capabilities].sort(),
          roleIds: [...scope.actor.roleIds].sort(),
        };
        const beforeId = readDeliveryReviewHistoryCursor(
          query.beforeId,
          historyScope,
        );
        const events = manager
          .getRepository(DeliveryReviewAssignmentEventEntity)
          .createQueryBuilder('event')
          .where(
            'event."workspaceId"=:workspaceId AND event."taskId"=:taskId AND event."submissionVersion"=:submissionVersion',
            {
              workspaceId: workspace.id,
              taskId: query.taskId,
              submissionVersion: query.submissionVersion,
            },
          );
        if (beforeId) {
          const cursor = await events
            .clone()
            .andWhere('event.id=:cursorId', { cursorId: beforeId })
            .getOne();
          if (!cursor)
            throw new NotFoundException(
              'This review assignment history cursor is unavailable.',
            );
          events.andWhere(
            '(event."createdAt",event.id)<(SELECT "createdAt",id FROM core."deliveryReviewAssignmentEvent" WHERE "workspaceId"=:workspaceId AND "taskId"=:taskId AND "submissionVersion"=:submissionVersion AND id=:cursorId)',
            { cursorId: cursor.id },
          );
        }
        const rows = await events
            .orderBy('event.createdAt', 'DESC')
            .addOrderBy('event.id', 'DESC')
            .take(DELIVERY_REVIEW_PAGE_SIZE + 1)
            .getMany(),
          page = rows.slice(0, DELIVERY_REVIEW_PAGE_SIZE);
        return {
          workspaceId: workspace.id,
          memberId,
          userWorkspaceId,
          taskId: query.taskId,
          submissionVersion: query.submissionVersion,
          events: page.map((event) => ({
            id: event.id,
            revision: event.revision,
            mode: event.mode,
            reviewerId: event.reviewerId,
            reviewerName: event.reviewerName,
            primaryReviewerName: event.primaryReviewerName,
            primaryReviewerId: event.primaryReviewerId,
            previousReviewerId: event.previousReviewerId,
            previousMode: event.previousMode,
            previousReviewerName: event.previousReviewerName,
            reason: event.reason,
            actorName: event.actorName,
            createdAt: event.createdAt.toISOString(),
          })),
          nextBeforeId:
            rows.length > DELIVERY_REVIEW_PAGE_SIZE
              ? deliveryReviewHistoryCursor(
                  historyScope,
                  page[page.length - 1].id,
                )
              : null,
        };
      },
    );
  }
  private async assignmentReceipt<TResult>(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: DeliveryReviewAssignmentSeenInput,
    action: 'SEEN' | 'ACKNOWLEDGED',
    now: Date,
    result: (
      manager: EntityManager,
      notice: DeliveryNotice,
      command: DeliveryReviewAssignmentSeenInput,
    ) => Promise<TResult>,
  ): Promise<TResult> {
    const command = parseDeliveryReview(deliveryReviewSeenSchema, input);
    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`delivery:${workspace.id}`],
      );
      const scope = await this.scope(
        manager,
        workspace,
        memberId,
        userWorkspaceId,
        command.taskId,
      );
      if (scope.task.revision !== command.taskRevision)
        throw new ConflictException(
          'The review source changed. Refresh before marking its assignment seen.',
        );
      const latest =
        scope.task.details.submissions[
          scope.task.details.submissions.length - 1
        ];
      if (
        scope.task.details.state !== 'IN_REVIEW' ||
        latest?.version !== command.submissionVersion
      )
        throw new ConflictException(
          'This exact pending review is no longer current.',
        );
      const assignment = (
        await readCurrentDeliveryReviewAssignments(manager, workspace.id, [
          {
            taskId: command.taskId,
            submissionVersion: command.submissionVersion,
          },
        ])
      ).get(command.taskId);
      if ((assignment?.revision ?? 0) !== command.assignmentRevision)
        throw new ConflictException(
          'The review assignment changed. Refresh before marking it seen.',
        );
      const repository = manager.getRepository(DeliveryOperationsEntity),
        record = await repository.findOne({
          where: { workspaceId: workspace.id },
          lock: { mode: 'pessimistic_write' },
        });
      const notice = record?.state.notices.find(
        (item) =>
          item.id === command.noticeId &&
          item.kind === 'REVIEW_ASSIGNMENT' &&
          item.taskId === command.taskId &&
          item.recipientId === memberId,
      );
      if (!record || !notice)
        throw new ForbiddenException(
          'Only the current eligible review recipient can record this exact notice receipt.',
        );
      if (action === 'ACKNOWLEDGED') {
        if (
          await acknowledgeCurrentDeliveryReviewNotice(
            manager,
            workspace.id,
            notice,
            scope,
            now,
          )
        )
          await repository.save(record);
      } else {
        if (
          !(await currentDeliveryReviewNotice(
            manager,
            workspace.id,
            notice,
            scope,
          ))
        )
          throw new ForbiddenException(
            'Only the current eligible review recipient can mark this exact notice seen.',
          );
        if (!notice.seenAt) {
          notice.seenAt = now.toISOString();
          await manager.getRepository(DeliveryReminderOutboxEntity).update(
            {
              workspaceId: workspace.id,
              noticeId: notice.id,
              status: 'QUEUED',
            },
            { status: 'SUPPRESSED', finishedAt: now, error: null },
          );
          if (notice.sendState === 'QUEUED') notice.sendState = 'SUPPRESSED';
          await repository.save(record);
        }
      }
      return result(manager, notice, command);
    });
  }

  async seen(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: DeliveryReviewAssignmentSeenInput,
    now = new Date(),
  ): Promise<DeliveryTaskReviewSnapshotDTO> {
    return this.assignmentReceipt(
      workspace,
      memberId,
      userWorkspaceId,
      input,
      'SEEN',
      now,
      (manager, _notice, command) =>
        this.readTask(
          manager,
          workspace,
          memberId,
          userWorkspaceId,
          command.taskId,
          now,
        ),
    );
  }

  async acknowledge(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: DeliveryReviewAssignmentAcknowledgeInput,
    now = new Date(),
  ): Promise<DeliveryReviewAssignmentAcknowledgementDTO> {
    return this.assignmentReceipt(
      workspace,
      memberId,
      userWorkspaceId,
      input,
      'ACKNOWLEDGED',
      now,
      async (_manager, notice, command) => ({
        workspaceId: workspace.id,
        memberId,
        userWorkspaceId,
        taskId: command.taskId,
        taskRevision: command.taskRevision,
        submissionVersion: command.submissionVersion,
        assignmentRevision: command.assignmentRevision,
        noticeId: notice.id,
        acknowledgedAt: notice.acknowledgedAt!,
      }),
    );
  }
}
