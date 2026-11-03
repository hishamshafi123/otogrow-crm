import {
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { advertisingHash } from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { DeliveryReleaseEntity } from './entities/delivery-release.entity';
import { DeliveryReleaseVersionEntity } from './entities/delivery-release-version.entity';
import {
  managerAccess,
  editable,
  type ReleaseAccess,
} from './delivery-release.access';
import { InjectDataSource } from '@nestjs/typeorm';
import { escapeForIlike } from 'twenty-shared/utils';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { DeliveryTaskEntity } from 'src/modules/delivery/entities/delivery-task.entity';
import { readDeliverySnapshot } from 'src/modules/delivery/read-delivery-snapshot';
import {
  deliveryNativeTaskSchema,
  readDeliveryNativeTaskVisibility,
  type DeliveryNativeTaskVisibility,
} from 'src/modules/delivery/native-task-visibility';
import {
  type ReleaseTaskSnapshot,
  type ReleaseSave,
  type ReleaseSavedBody,
} from './delivery-release.types';
import { validateReleaseDependencies } from './delivery-release.policy';
type ReleaseTaskRow = {
  taskId: string;
  revision: number;
  title: string;
  titleHash: string;
  assigneeId: string | null;
  state: string;
  submissionVersion: number | null;
  submittedBy: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  decision: string | null;
};
@Injectable()
export class DeliveryReleaseSourceService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    readonly access: OtogrowAccessService,
    private readonly workspaceOrm: GlobalWorkspaceOrmManager,
    private readonly cache: WorkspaceCacheService,
  ) {}

  identity(
    workspace: WorkspaceEntity,
    access: ReleaseAccess,
    visibility?: DeliveryNativeTaskVisibility,
  ) {
    return {
      workspaceId: workspace.id,
      memberId: access.memberId,
      userWorkspaceId: access.userWorkspaceId,
      observedAt: new Date().toISOString(),
      isManager: managerAccess(access),
      scope: advertisingHash([
        workspace.id,
        access.memberId,
        access.userWorkspaceId,
        [...access.roleIds].sort(),
        [...access.capabilities].sort(),
        visibility?.fingerprint ?? null,
      ]),
    };
  }

  read<TResult>(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    operation: (
      manager: EntityManager,
      access: ReleaseAccess,
    ) => Promise<TResult>,
    transactionManager?: EntityManager,
  ) {
    return readDeliverySnapshot(
      this.dataSource,
      workspace.id,
      async (manager) =>
        operation(
          manager,
          await this.access.accessForUser(
            workspace.id,
            memberId,
            userWorkspaceId,
            manager,
          ),
        ),
      transactionManager,
    );
  }

  async project(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    access: ReleaseAccess,
    projectId: string,
  ) {
    const project = await manager
      .getRepository(DeliveryProjectEntity)
      .findOneBy({ workspaceId: workspace.id, id: projectId });
    if (
      !project ||
      (!managerAccess(access) && !project.memberIds.includes(access.memberId))
    )
      throw new ForbiddenException('This development project is unavailable.');
    if (project.companyId) {
      const clients: { id: string }[] = await manager.query(
        `SELECT id FROM "${deliveryNativeTaskSchema(workspace)}".company WHERE id=$1 AND "deletedAt" IS NULL`,
        [project.companyId],
      );
      if (!clients.length)
        throw new ForbiddenException('This development client is unavailable.');
    }
    return project;
  }

  async visibility(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    access: ReleaseAccess,
  ) {
    return readDeliveryNativeTaskVisibility(
      manager,
      workspace,
      access,
      this.workspaceOrm,
      this.cache,
      ['id', 'title', 'assigneeId'],
    );
  }

  tasksQuery(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    projectId: string,
    visibility: DeliveryNativeTaskVisibility,
  ) {
    return manager
      .createQueryBuilder()
      .from(`${deliveryNativeTaskSchema(workspace)}.task`, 'activityNativeTask')
      .innerJoin(
        DeliveryTaskEntity,
        'managed',
        'managed."taskId"="activityNativeTask".id AND managed."workspaceId"=:releaseWorkspaceId AND managed."projectId"=:releaseProjectId',
      )
      .where('"activityNativeTask"."deletedAt" IS NULL')
      .andWhere(`(${visibility.sql})`)
      .setParameters({
        ...visibility.parameters,
        releaseWorkspaceId: workspace.id,
        releaseProjectId: projectId,
      });
  }

  async tasks(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    projectId: string,
    visibility: DeliveryNativeTaskVisibility,
    options: {
      ids?: string[];
      afterId?: string | null;
      search?: string | null;
      paged?: boolean;
    } = {},
  ) {
    const query = this.tasksQuery(manager, workspace, projectId, visibility);
    if (options.ids)
      query.andWhere('"activityNativeTask".id = ANY(:releaseTaskIds::uuid[])', {
        releaseTaskIds: options.ids,
      });
    if (options.search)
      query.andWhere('"activityNativeTask".title ILIKE :releaseTaskSearch', {
        releaseTaskSearch: `%${escapeForIlike(options.search)}%`,
      });
    const count = await query
      .clone()
      .select('COUNT(*)::integer', 'count')
      .getRawOne<{ count: number }>();
    if (options.afterId)
      query.andWhere('"activityNativeTask".id > :releaseTaskAfter', {
        releaseTaskAfter: options.afterId,
      });
    const rows = await query
      .select([
        '"activityNativeTask".id AS "taskId"',
        'managed.revision AS revision',
        'left("activityNativeTask".title,240) AS title',
        'md5("activityNativeTask".title) AS "titleHash"',
        '"activityNativeTask"."assigneeId" AS "assigneeId"',
        "COALESCE(managed.details->>'state','UNKNOWN') AS state",
        `CASE WHEN managed.details->'submissions'->-1->>'version' ~ '^[1-9][0-9]{0,8}$' THEN (managed.details->'submissions'->-1->>'version')::integer ELSE NULL END AS "submissionVersion"`,
        `managed.details->'submissions'->-1->>'submittedBy' AS "submittedBy"`,
        `managed.details->'submissions'->-1->>'reviewedBy' AS "reviewedBy"`,
        `managed.details->'submissions'->-1->>'reviewedAt' AS "reviewedAt"`,
        `managed.details->'submissions'->-1->>'decision' AS decision`,
      ])
      .orderBy('"activityNativeTask".id', 'ASC')
      .limit(options.paged ? 26 : 31)
      .getRawMany<ReleaseTaskRow>();
    const items: ReleaseTaskSnapshot[] = rows.map((row) => ({
      taskId: row.taskId,
      revision: row.revision,
      title: row.title,
      assigneeId: row.assigneeId,
      state: row.state,
      submissionVersion: row.submissionVersion,
      submittedBy: row.submittedBy,
      reviewedBy: row.reviewedBy,
      reviewedAt: row.reviewedAt,
      approved:
        row.state === 'APPROVED' &&
        row.decision === 'APPROVED' &&
        row.submissionVersion !== null &&
        Boolean(
          row.submittedBy &&
          row.reviewedBy &&
          row.reviewedAt &&
          row.reviewedBy !== row.submittedBy &&
          row.reviewedBy !== row.assigneeId,
        ),
      sourceHash: advertisingHash(row),
    }));
    return {
      items: options.paged ? items.slice(0, 25) : items,
      totalCount: count?.count ?? 0,
      nextId: options.paged && items.length > 25 ? items[24].taskId : null,
    };
  }

  async selected(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    access: ReleaseAccess,
    id: string,
    versionNumber?: number | null,
  ) {
    const release = await manager
      .getRepository(DeliveryReleaseEntity)
      .findOneBy({ workspaceId: workspace.id, id });
    if (!release) throw new NotFoundException('This release is unavailable.');
    const project = await this.project(
      manager,
      workspace,
      access,
      release.projectId,
    );
    if (project.companyId !== release.companyId)
      throw new ForbiddenException(
        'The project client changed. Its earlier release evidence is withheld.',
      );
    const version = await manager
      .getRepository(DeliveryReleaseVersionEntity)
      .findOneBy({
        workspaceId: workspace.id,
        releaseId: id,
        version: versionNumber ?? release.currentVersion,
      });
    if (!version)
      throw new NotFoundException('This release version is unavailable.');
    const visibility = await this.visibility(manager, workspace, access);
    const currentTasks = await this.tasks(
      manager,
      workspace,
      project.id,
      visibility,
      { ids: version.body.work.map((work) => work.taskId) },
    );
    if (currentTasks.items.length !== version.body.work.length)
      throw new ForbiddenException(
        'One or more linked native tasks are unavailable under your current permissions.',
      );
    const sourceFingerprint = advertisingHash([
      project.id,
      project.revision,
      project.companyId,
      currentTasks.items,
    ]);
    return {
      release,
      project,
      version,
      visibility,
      currentTasks: currentTasks.items,
      sourceFingerprint,
    };
  }

  async owners(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    project: DeliveryProjectEntity,
  ) {
    const members = await this.access.listActiveMembers(workspace.id, manager);
    const grants = await this.access.listAccess(workspace.id, manager);
    return members
      .filter(
        (member) =>
          project.memberIds.includes(member.memberId) ||
          grants.some(
            (grant) =>
              grant.memberId === member.memberId && managerAccess(grant),
          ),
      )
      .map((member) => ({ id: member.memberId, name: member.name }));
  }

  async prepare(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    access: ReleaseAccess,
    input: ReleaseSave,
  ) {
    validateReleaseDependencies(input.body);
    const project = await this.project(
      manager,
      workspace,
      access,
      input.projectId,
    );
    if (
      project.revision !== input.projectRevision ||
      project.companyId !== input.expectedCompanyId
    )
      throw new ConflictException(
        'The project or client changed. Review its current scope before saving.',
      );
    const owner = (await this.owners(manager, workspace, project)).find(
      (candidate) => candidate.id === input.body.ownerId,
    );
    if (!owner)
      throw new BadRequestException(
        'Choose a currently eligible release owner.',
      );
    const release = await manager
      .getRepository(DeliveryReleaseEntity)
      .findOneBy({ workspaceId: workspace.id, id: input.id });
    if (release) {
      await this.selected(manager, workspace, access, release.id);
      if (
        release.projectId !== project.id ||
        release.revision !== input.revision ||
        !editable(release, access)
      )
        throw new ConflictException(
          'This release changed or is no longer editable.',
        );
    } else if (input.revision !== 0)
      throw new ConflictException('The original release is unavailable.');
    const visibility = await this.visibility(manager, workspace, access);
    const tasks = await this.tasks(manager, workspace, project.id, visibility, {
      ids: input.body.work.map((work) => work.taskId),
    });
    if (tasks.items.length !== input.body.work.length)
      throw new ForbiddenException(
        'A selected native task is unavailable in this project.',
      );
    if (
      input.body.work.some(
        (work) =>
          !tasks.items.some(
            (task) =>
              task.taskId === work.taskId && task.revision === work.revision,
          ),
      )
    )
      throw new ConflictException(
        'A selected task changed. Refresh the task evidence before saving.',
      );
    const body: ReleaseSavedBody = {
      ...input.body,
      tasks: tasks.items,
      sourceFingerprint: advertisingHash([
        project.id,
        project.revision,
        project.companyId,
        tasks.items,
      ]),
    };
    return { project, owner, release, body, visibility };
  }
}
