import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { type EntityManager } from 'typeorm';
import { z } from 'zod';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { DeliveryTaskEntity } from 'src/modules/delivery/entities/delivery-task.entity';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { DeliveryReviewAssignmentEntity } from 'src/modules/delivery/reviews/entities/delivery-review-assignment.entity';
import { OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import {
  deliveryReviewAuthority,
  readCurrentDeliveryReviewAssignments,
} from 'src/modules/delivery/reviews/delivery-review-authority';
import { advertisingTimestampSql } from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy';
import {
  activityAuthority,
  type ActivityIdentity,
} from 'src/modules/otogrow-activity/otogrow-activity.reads';
import {
  ACTIVITY_CURRENT_WORK_MAX_TASKS,
  boundCurrentTask,
  currentTaskSelectionSchema,
  finishCurrentWorkSnapshot,
  parseCurrentWorkScope,
} from './activity-current-work.policy';
import {
  type ActivityCurrentTask,
  type ActivityCurrentTaskRead,
  type ActivityCurrentWorkScope,
  type ActivityCurrentWorkSnapshot,
} from './activity-current-work.types';
import {
  currentWorkSchema,
  readActivityCurrentWorkVisibility,
  type ActivityCurrentWorkVisibility,
} from './activity-current-work.visibility';

const SUBMISSION_VERSION_SQL = `CASE WHEN managed.details->'submissions'->-1->>'version' ~ '^[1-9][0-9]{0,9}$' THEN CASE WHEN (managed.details->'submissions'->-1->>'version')::numeric <= 2147483647 THEN (managed.details->'submissions'->-1->>'version')::integer ELSE NULL END ELSE NULL END`;
const PRIMARY_REVIEWER_SQL = `CASE WHEN managed.details->>'reviewerId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (managed.details->>'reviewerId')::uuid ELSE NULL END`;
const EFFECTIVE_REVIEWER_SQL = `CASE WHEN assignment.mode='BACKUP' THEN assignment."reviewerId" ELSE ${PRIMARY_REVIEWER_SQL} END`;
const CURRENT_STATES = new Set([
  'PLANNED',
  'IN_PROGRESS',
  'BLOCKED',
  'IN_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
]);
type CurrentTaskRow = {
  taskId: string;
  title: string;
  titleBytes: number;
  projectId: string;
  projectName: string;
  projectNameBytes: number;
  clientId: string | null;
  taskRevision: number;
  state: string | null;
  blocker: string | null;
  blockerBytes: number;
  ownerId: string | null;
  dueAt: string | null;
  submissionVersion: number | null;
  submittedAt: string | null;
  primaryReviewerId: string | null;
  selectedReviewerId: string | null;
  reviewerIsProjectMember: boolean;
  hasSubmission: boolean;
};
type CurrentMemberName = { id: string; name: string; nameBytes: number };

@Injectable()
export class OtogrowActivityCurrentWorkService {
  constructor(
    private readonly workspaceOrm: GlobalWorkspaceOrmManager,
    private readonly access: OtogrowAccessService,
    private readonly cache: WorkspaceCacheService,
  ) {}

  private async authority(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    identity?: ActivityIdentity,
  ) {
    if (!manager.queryRunner?.isTransactionActive)
      throw new Error('Current work requires an authorized transaction.');
    if (identity) {
      if (
        identity.workspaceId !== workspace.id ||
        identity.memberId !== memberId ||
        identity.userWorkspaceId !== userWorkspaceId ||
        !identity.actor.capabilities.includes('workspace.admin')
      )
        throw new ForbiddenException(
          'Current administrator access is required.',
        );
      return identity;
    }
    return activityAuthority(
      manager,
      this.access,
      workspace,
      memberId,
      userWorkspaceId,
    );
  }
  private baseQuery(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    visibility: ActivityCurrentWorkVisibility,
  ) {
    // Managed tasks need this read-only adapter; generic task CRUD deliberately hides them to protect delivery reviews.
    return manager
      .createQueryBuilder()
      .from(`${currentWorkSchema(workspace)}.task`, 'activityNativeTask')
      .innerJoin(
        DeliveryTaskEntity,
        'managed',
        'managed."taskId"="activityNativeTask".id AND managed."workspaceId"=:activityNativeWorkspaceId',
      )
      .innerJoin(
        DeliveryProjectEntity,
        'project',
        'project.id=managed."projectId" AND project."workspaceId"=managed."workspaceId"',
      )
      .leftJoin(
        DeliveryReviewAssignmentEntity,
        'assignment',
        `assignment."taskId"=managed."taskId" AND assignment."workspaceId"=managed."workspaceId" AND assignment."submissionVersion"=(${SUBMISSION_VERSION_SQL})`,
      )
      .where('"activityNativeTask"."deletedAt" IS NULL')
      .andWhere(`(${visibility.sql})`)
      .setParameters({
        ...visibility.parameters,
        activityNativeWorkspaceId: workspace.id,
      });
  }
  private scopedQuery(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    visibility: ActivityCurrentWorkVisibility,
    scope: ActivityCurrentWorkScope,
    taskId?: string,
  ) {
    const query = this.baseQuery(manager, workspace, visibility);
    if (scope.projectId)
      query.andWhere('project.id=:activityCurrentProjectId', {
        activityCurrentProjectId: scope.projectId,
      });
    if (scope.clientId)
      query.andWhere('project."companyId"=:activityCurrentClientId', {
        activityCurrentClientId: scope.clientId,
      });
    if (scope.personId)
      query.andWhere(
        `("activityNativeTask"."assigneeId"=:activityCurrentPersonId OR (${EFFECTIVE_REVIEWER_SQL})=:activityCurrentPersonId)`,
        { activityCurrentPersonId: scope.personId },
      );
    if (taskId)
      query.andWhere('"activityNativeTask".id=:activityCurrentTaskId', {
        activityCurrentTaskId: taskId,
      });
    return query;
  }
  private async rows(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    visibility: ActivityCurrentWorkVisibility,
    scope: ActivityCurrentWorkScope,
    taskId?: string,
  ) {
    const query = this.scopedQuery(
      manager,
      workspace,
      visibility,
      scope,
      taskId,
    );
    const count = await query
      .clone()
      .select('COUNT(*)', 'count')
      .getRawOne<{ count: string }>();
    const totalCount = Number(count?.count ?? '0');
    if (!Number.isSafeInteger(totalCount))
      throw new BadRequestException(
        'Narrow current work to a smaller project or person scope.',
      );
    const rows = await query
      .select([
        '"activityNativeTask".id AS "taskId"',
        'left("activityNativeTask".title,200) AS title',
        'octet_length("activityNativeTask".title) AS "titleBytes"',
        'project.id AS "projectId"',
        'left(project.name,200) AS "projectName"',
        'octet_length(project.name) AS "projectNameBytes"',
        'project."companyId" AS "clientId"',
        'managed.revision AS "taskRevision"',
        `left(managed.details->>'state',40) AS state`,
        `left(NULLIF(managed.details->>'blocker',''),512) AS blocker`,
        `COALESCE(octet_length(managed.details->>'blocker'),0) AS "blockerBytes"`,
        '"activityNativeTask"."assigneeId" AS "ownerId"',
        `${advertisingTimestampSql('"activityNativeTask"."dueAt"')} AS "dueAt"`,
        `(${SUBMISSION_VERSION_SQL}) AS "submissionVersion"`,
        `left(managed.details->'submissions'->-1->>'submittedAt',40) AS "submittedAt"`,
        `(${PRIMARY_REVIEWER_SQL}) AS "primaryReviewerId"`,
        `(${EFFECTIVE_REVIEWER_SQL}) AS "selectedReviewerId"`,
        `COALESCE(project."memberIds" ? (${EFFECTIVE_REVIEWER_SQL})::text,false) AS "reviewerIsProjectMember"`,
        `(managed.details->'submissions'->-1 IS NOT NULL) AS "hasSubmission"`,
      ])
      .orderBy('"activityNativeTask".id', 'ASC')
      .limit(taskId ? 1 : ACTIVITY_CURRENT_WORK_MAX_TASKS)
      .getRawMany<CurrentTaskRow>();
    return { rows, totalCount };
  }
  private async projectRows(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    identity: ActivityIdentity,
    rows: CurrentTaskRow[],
  ) {
    if (!rows.length) return [];
    const assignments = await readCurrentDeliveryReviewAssignments(
      manager,
      workspace.id,
      rows.flatMap((row) =>
        row.submissionVersion === null
          ? []
          : [{ taskId: row.taskId, submissionVersion: row.submissionVersion }],
      ),
    );
    const currentAccess = await this.access.listAccess(workspace.id, manager);
    const memberIds = [
      ...new Set(
        rows
          .flatMap((row) => [
            row.ownerId,
            row.primaryReviewerId,
            row.selectedReviewerId,
          ])
          .filter((id): id is string => id !== null),
      ),
    ];
    const names: CurrentMemberName[] = memberIds.length
      ? await manager.query(
          `SELECT member.id, left(trim(concat_ws(' ',member."nameFirstName",member."nameLastName")),200) AS name, octet_length(trim(concat_ws(' ',member."nameFirstName",member."nameLastName"))) AS "nameBytes" FROM "${currentWorkSchema(workspace)}"."workspaceMember" member JOIN core."userWorkspace" membership ON membership."userId"=member."userId" AND membership."workspaceId"=$1 AND membership."deletedAt" IS NULL JOIN core."user" account ON account.id=membership."userId" AND account."deletedAt" IS NULL AND NOT account.disabled WHERE member.id=ANY($2::uuid[]) AND member."deletedAt" IS NULL`,
          [workspace.id, memberIds],
        )
      : [];
    const namesById = new Map(names.map((member) => [member.id, member]));
    return rows.map((row) => {
      const review = deliveryReviewAuthority({
        primaryReviewerId: row.primaryReviewerId,
        assigneeId: row.ownerId,
        assignment: assignments.get(row.taskId),
        projectMemberIds:
          row.reviewerIsProjectMember && row.selectedReviewerId
            ? [row.selectedReviewerId]
            : [],
        access: currentAccess,
        actorId: identity.memberId,
      });
      const warnings: string[] = [];
      const submissionUnknown =
        row.hasSubmission && row.submissionVersion === null;
      if (submissionUnknown)
        warnings.push(
          'The latest submission identity is unavailable; reviewer assignment cannot be verified.',
        );
      if (!CURRENT_STATES.has(row.state ?? ''))
        warnings.push('The task has no recognized current delivery status.');
      if (review.reviewerState !== 'ACTIVE')
        warnings.push(
          'The effective reviewer is not currently eligible to approve this task.',
        );
      if (
        row.ownerId &&
        !currentAccess.some((access) => access.memberId === row.ownerId)
      )
        warnings.push(
          'The assigned owner is not currently an active workspace member.',
        );
      const submittedAt =
        row.submittedAt &&
        z.string().datetime({ offset: true }).safeParse(row.submittedAt).success
          ? row.submittedAt
          : null;
      if (row.submittedAt && !submittedAt)
        warnings.push('The recorded submission timestamp is unavailable.');
      const task: ActivityCurrentTask = {
        taskId: row.taskId,
        title: row.title,
        projectId: row.projectId,
        projectName: row.projectName,
        clientId: row.clientId,
        clientName: null,
        taskRevision: row.taskRevision,
        state: CURRENT_STATES.has(row.state ?? '') ? row.state! : 'UNKNOWN',
        blocker: row.blocker,
        ownerId: row.ownerId,
        ownerName: row.ownerId
          ? (namesById.get(row.ownerId)?.name ?? null)
          : null,
        dueAt: row.dueAt,
        submissionVersion: row.submissionVersion,
        submittedAt,
        primaryReviewerId: review.primaryReviewerId,
        primaryReviewerName: review.primaryReviewerId
          ? (namesById.get(review.primaryReviewerId)?.name ?? null)
          : null,
        effectiveReviewerId: review.effectiveReviewerId,
        effectiveReviewerName: review.effectiveReviewerId
          ? (namesById.get(review.effectiveReviewerId)?.name ?? null)
          : null,
        reviewerState: submissionUnknown
          ? 'UNKNOWN'
          : z
              .enum(['ACTIVE', 'UNASSIGNED', 'SELF_REVIEW', 'UNAVAILABLE'])
              .parse(review.reviewerState),
        assignmentMode: review.assignmentMode,
        assignmentRevision: review.assignmentRevision,
        warnings,
        detailsTruncated: false,
        href: `/delivery?view=mine&task=${row.taskId}&panel=task`,
      };
      return boundCurrentTask(task, {
        title: row.titleBytes,
        projectName: row.projectNameBytes,
        blocker: row.blockerBytes,
        ownerName: row.ownerId
          ? namesById.get(row.ownerId)?.nameBytes
          : undefined,
        primaryReviewerName: review.primaryReviewerId
          ? namesById.get(review.primaryReviewerId)?.nameBytes
          : undefined,
        effectiveReviewerName: review.effectiveReviewerId
          ? namesById.get(review.effectiveReviewerId)?.nameBytes
          : undefined,
      });
    });
  }
  async snapshot(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    scopeInput: unknown,
    capturedAt?: string,
    suppliedIdentity?: ActivityIdentity,
  ): Promise<ActivityCurrentWorkSnapshot> {
    const scope = parseCurrentWorkScope(scopeInput);
    const identity = await this.authority(
      manager,
      workspace,
      memberId,
      userWorkspaceId,
      suppliedIdentity,
    );
    const visibility = await readActivityCurrentWorkVisibility(
      manager,
      workspace,
      identity,
      this.workspaceOrm,
      this.cache,
    );
    const { rows, totalCount } = await this.rows(
      manager,
      workspace,
      visibility,
      scope,
    );
    const tasks = await this.projectRows(manager, workspace, identity, rows);
    await this.assertVisibilityUnchanged(
      manager,
      workspace,
      identity,
      visibility.fingerprint,
    );
    const at = await this.captureTime(manager, capturedAt);
    return finishCurrentWorkSnapshot({
      capturedAt: at,
      scope,
      totalCount,
      tasks,
      nativeVisibilityFingerprint: visibility.fingerprint,
    });
  }
  async task(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: unknown,
    suppliedIdentity?: ActivityIdentity,
  ): Promise<ActivityCurrentTaskRead> {
    const parsed = currentTaskSelectionSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException('Choose a valid current task and scope.');
    const identity = await this.authority(
      manager,
      workspace,
      memberId,
      userWorkspaceId,
      suppliedIdentity,
    );
    const visibility = await readActivityCurrentWorkVisibility(
      manager,
      workspace,
      identity,
      this.workspaceOrm,
      this.cache,
    );
    const { rows } = await this.rows(
      manager,
      workspace,
      visibility,
      parsed.data.scope,
      parsed.data.taskId,
    );
    const projected = await this.projectRows(
      manager,
      workspace,
      identity,
      rows,
    );
    await this.assertVisibilityUnchanged(
      manager,
      workspace,
      identity,
      visibility.fingerprint,
    );
    const task = projected[0]?.task ?? null;
    return {
      capturedAt: await this.captureTime(manager),
      scope: parsed.data.scope,
      task,
      unavailableReason: task ? null : 'NOT_AVAILABLE_IN_SCOPE',
    };
  }
  async nativeHistoryVisibility(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    suppliedIdentity?: ActivityIdentity,
  ) {
    const identity = await this.authority(
      manager,
      workspace,
      memberId,
      userWorkspaceId,
      suppliedIdentity,
    );
    const visibility = await readActivityCurrentWorkVisibility(
      manager,
      workspace,
      identity,
      this.workspaceOrm,
      this.cache,
    );
    const query = this.baseQuery(manager, workspace, visibility).select(
      '"activityNativeTask".id',
      'taskId',
    );
    return {
      fingerprint: visibility.fingerprint,
      taskIdsSql: query.getQuery(),
      parameters: query.getParameters(),
    };
  }
  private async assertVisibilityUnchanged(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    identity: ActivityIdentity,
    fingerprint: string,
  ) {
    const current = await readActivityCurrentWorkVisibility(
      manager,
      workspace,
      identity,
      this.workspaceOrm,
      this.cache,
    );
    if (current.fingerprint !== fingerprint)
      throw new ConflictException(
        'Native task permissions changed during this capture. Refresh current work.',
      );
  }
  private async captureTime(
    manager: EntityManager,
    capturedAt?: string,
  ): Promise<string> {
    if (capturedAt) {
      if (
        !z
          .string()
          .datetime()
          .regex(/\.\d{6}Z$/)
          .safeParse(capturedAt).success
      )
        throw new BadRequestException(
          'Choose a valid reviewed UTC capture time.',
        );
      return capturedAt;
    }
    const [row]: { capturedAt: string }[] = await manager.query(
      `SELECT ${advertisingTimestampSql('clock_timestamp()')} AS "capturedAt"`,
    );
    return row.capturedAt;
  }
}
