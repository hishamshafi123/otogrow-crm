import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { escapeForIlike } from 'twenty-shared/utils';
import {
  PermissionsException,
  PermissionsExceptionCode,
} from 'src/engine/metadata-modules/permissions/permissions.exception';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { type OtogrowAccess } from 'src/modules/otogrow-access/otogrow-access.types';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { DeliveryTaskEntity } from 'src/modules/delivery/entities/delivery-task.entity';
import { readDeliverySnapshot } from 'src/modules/delivery/read-delivery-snapshot';
import {
  deliveryNativeTaskSchema,
  readDeliveryNativeTaskVisibility,
  type DeliveryNativeTaskVisibility,
} from 'src/modules/delivery/native-task-visibility';
import { creativeReviewTarget } from 'src/modules/delivery/creative/review/delivery-creative-review.policy';
import { advertisingHash } from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy';
import { DeliveryContentAccountEntity } from './entities/delivery-content-account.entity';
import { DeliveryContentPlanEntity } from './entities/delivery-content-plan.entity';
import { DeliveryContentVariantEntity } from './entities/delivery-content-variant.entity';
import { DeliveryContentVersionEntity } from './entities/delivery-content-version.entity';
import {
  contentContribution,
  contentManager,
  contentReviewer,
  validateContentPackage,
} from './delivery-content.policy';
import {
  type ContentAssetSelection,
  type ContentAssetSnapshot,
  type ContentBody,
  type ContentSavedBody,
  type ContentSave,
} from './delivery-content.types';

@Injectable()
export class DeliveryContentSourceService {
  constructor(
    @InjectDataSource() readonly dataSource: DataSource,
    readonly access: OtogrowAccessService,
    private readonly workspaceOrm: GlobalWorkspaceOrmManager,
    private readonly cache: WorkspaceCacheService,
  ) {}
  identity(
    workspace: WorkspaceEntity,
    access: OtogrowAccess,
    visibility?: DeliveryNativeTaskVisibility,
  ) {
    return {
      workspaceId: workspace.id,
      memberId: access.memberId,
      userWorkspaceId: access.userWorkspaceId,
      isManager: contentManager(access),
      observedAt: new Date().toISOString(),
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
      access: OtogrowAccess,
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
    access: OtogrowAccess,
    id: string,
  ) {
    const project = await manager
      .getRepository(DeliveryProjectEntity)
      .findOneBy({ workspaceId: workspace.id, id });
    if (
      !project ||
      (!contentManager(access) && !project.memberIds.includes(access.memberId))
    )
      throw new ForbiddenException('This content project is unavailable.');
    if (project.companyId) {
      const rows: { id: string }[] = await manager.query(
        `SELECT id FROM "${deliveryNativeTaskSchema(workspace)}".company WHERE id=$1 AND "deletedAt" IS NULL`,
        [project.companyId],
      );
      if (!rows.length)
        throw new ForbiddenException('This content client is unavailable.');
    }
    return project;
  }
  async plan(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    access: OtogrowAccess,
    id: string,
  ) {
    const plan = await manager
      .getRepository(DeliveryContentPlanEntity)
      .findOneBy({ workspaceId: workspace.id, id });
    if (!plan) throw new NotFoundException('This content plan is unavailable.');
    const project = await this.project(
      manager,
      workspace,
      access,
      plan.projectId,
    );
    if (plan.companyId !== project.companyId)
      throw new ForbiddenException(
        'The project client changed. Earlier content is withheld.',
      );
    return { plan, project };
  }
  async engagements(
    manager: EntityManager,
    workspaceId: string,
    project: DeliveryProjectEntity,
    options: {
      ids?: string[];
      afterId?: string | null;
      search?: string | null;
    } = {},
  ) {
    return manager.query(
      `SELECT item->>'id' AS id,left(item->>'name',6000) AS name,item->'services' AS services
      FROM core."deliveryOperations" operations, jsonb_array_elements(COALESCE(operations.state->'clients'->'engagements','[]'::jsonb)) item
      WHERE operations."workspaceId"=$1 AND item->>'projectId'=$2 AND item->>'companyId' IS NOT DISTINCT FROM $3
      AND ($4::text[] IS NULL OR item->>'id'=ANY($4::text[])) AND ($5::text IS NULL OR item->>'id'>$5)
      AND ($6::text IS NULL OR item->>'name' ILIKE $6) ORDER BY item->>'id' LIMIT 26`,
      [
        workspaceId,
        project.id,
        project.companyId,
        options.ids ?? null,
        options.afterId ?? null,
        options.search ? `%${escapeForIlike(options.search)}%` : null,
      ],
    ) as Promise<{ id: string; name: string; services: string[] }[]>;
  }
  async assertService(
    manager: EntityManager,
    workspaceId: string,
    project: DeliveryProjectEntity,
    plan: { engagementId: string | null; service: string | null },
  ) {
    if (!plan.engagementId && !plan.service) return;
    const engagement = (
      await this.engagements(manager, workspaceId, project, {
        ids: plan.engagementId ? [plan.engagementId] : [],
      })
    ).find((item) => item.id === plan.engagementId);
    if (
      !engagement ||
      !plan.service ||
      !engagement.services.includes(plan.service)
    )
      throw new ConflictException(
        'Choose a current service from this client engagement before preparing or posting content.',
      );
  }
  visibility(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    access: OtogrowAccess,
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
  nativeQuery(
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
        'managed."taskId"="activityNativeTask".id AND managed."workspaceId"=:contentWorkspaceId AND managed."projectId"=:contentProjectId',
      )
      .where('"activityNativeTask"."deletedAt" IS NULL')
      .andWhere(`(${visibility.sql})`)
      .setParameters({
        ...visibility.parameters,
        contentWorkspaceId: workspace.id,
        contentProjectId: projectId,
      });
  }
  async assertTaskVisible(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    projectId: string,
    access: OtogrowAccess,
    taskId: string,
  ) {
    const visibility = await this.visibility(manager, workspace, access);
    const row = await this.nativeQuery(
      manager,
      workspace,
      projectId,
      visibility,
    )
      .andWhere('"activityNativeTask".id=:contentTaskId', {
        contentTaskId: taskId,
      })
      .select([
        '"activityNativeTask".id AS id',
        'left("activityNativeTask".title,200) AS title',
      ])
      .getRawOne<{ id: string; title: string }>();
    if (!row)
      throw new ForbiddenException(
        'The linked native task is unavailable under your current permissions.',
      );
    return row;
  }
  async asset(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    access: OtogrowAccess,
    project: DeliveryProjectEntity,
    selection: ContentAssetSelection,
  ): Promise<ContentAssetSnapshot> {
    const native = await this.assertTaskVisible(
      manager,
      workspace,
      project.id,
      access,
      selection.taskId,
    );
    const [task]: Pick<DeliveryTaskEntity, 'details'>[] = await manager.query(
      `SELECT
      (details-'events'-'submissions'-'creative') || jsonb_build_object('events','[]'::jsonb,
      'submissions',COALESCE((SELECT jsonb_agg(item) FROM (SELECT item FROM jsonb_array_elements(COALESCE(details->'submissions','[]'::jsonb)) item WHERE item->>'version'=$4 LIMIT 2) selected),'[]'::jsonb),
      'creative',((details->'creative')-'assets'-'mediaRuns'-'briefHistory'-'referenceHistory') || jsonb_build_object('assets',COALESCE((SELECT jsonb_agg(item) FROM (SELECT item FROM jsonb_array_elements(COALESCE(details->'creative'->'assets','[]'::jsonb)) item WHERE item->>'id'=$5 LIMIT 2) selected),'[]'::jsonb))) AS details
      FROM core."deliveryTask" WHERE "workspaceId"=$1 AND "projectId"=$2 AND "taskId"=$3`,
      [
        workspace.id,
        project.id,
        selection.taskId,
        String(selection.submissionVersion),
        selection.assetId,
      ],
    );
    if (!task)
      throw new ForbiddenException('This approved creative is unavailable.');
    const submissions = task.details.submissions.filter(
      (item) => item.version === selection.submissionVersion,
    );
    const submission = submissions.length === 1 ? submissions[0] : null;
    if (
      !submission ||
      submission.decision !== 'APPROVED' ||
      !submission.reviewedBy ||
      !submission.reviewedAt ||
      submission.reviewedBy === submission.submittedBy ||
      submission.finalAssetId !== selection.assetId
    )
      throw new ConflictException(
        'Select an exact independently approved final creative submission.',
      );
    const learning = submission.creativeLearning;
    if (
      !learning ||
      learning.projectId !== project.id ||
      learning.companyId !== project.companyId ||
      learning.finalAssetId !== selection.assetId ||
      learning.creativeVersion !== submission.creativeVersion
    )
      throw new ConflictException(
        'This creative needs a frozen approval for the current brand before it can be reused in a new post.',
      );
    const target = creativeReviewTarget(selection.taskId, task.details, {
      targetKind: 'SUBMISSION',
      submissionVersion: selection.submissionVersion,
      assetId: selection.assetId,
    });
    if (
      target.availability !== 'AVAILABLE' ||
      !target.asset ||
      !target.targetToken ||
      !target.creativeVersion
    )
      throw new ConflictException(
        'The exact approved final asset is unavailable.',
      );
    return {
      ...selection,
      title: native.title,
      name: target.asset.name,
      mimeType: target.asset.mimeType,
      creativeVersion: target.creativeVersion,
      reviewedBy: submission.reviewedBy,
      reviewedAt: submission.reviewedAt,
      sourceHash: advertisingHash([
        project.id,
        project.companyId,
        native.title,
        submission,
        target.targetToken,
      ]),
    };
  }
  async member(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    project: DeliveryProjectEntity,
    memberId: string,
  ) {
    const rows: { id: string; name: string }[] = await manager.query(
      `SELECT m.id,trim(concat_ws(' ',m."nameFirstName",m."nameLastName")) AS name FROM "${deliveryNativeTaskSchema(workspace)}"."workspaceMember" m JOIN core."userWorkspace" u ON u."userId"=m."userId" AND u."workspaceId"=$1 JOIN core."user" person ON person.id=u."userId" WHERE m.id=$2 AND m."deletedAt" IS NULL AND u."deletedAt" IS NULL AND person."deletedAt" IS NULL AND NOT person.disabled LIMIT 1`,
      [workspace.id, memberId],
    );
    if (!rows[0])
      throw new ConflictException('This selected person is no longer active.');
    const access = await this.access.getAccess(workspace.id, memberId, manager);
    if (!project.memberIds.includes(memberId) && !contentManager(access))
      throw new ConflictException(
        'Choose a person currently assigned to this project.',
      );
    return { ...rows[0], canReview: contentReviewer(access), access };
  }
  async optionalVisibility(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    access: OtogrowAccess,
  ) {
    try {
      return await this.visibility(manager, workspace, access);
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        (error instanceof PermissionsException &&
          error.code === PermissionsExceptionCode.PERMISSION_DENIED)
      )
        return null;
      throw error;
    }
  }
  async body(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    access: OtogrowAccess,
    project: DeliveryProjectEntity,
    plan: DeliveryContentPlanEntity,
    body: ContentBody,
    contributorIds: string[],
  ): Promise<ContentSavedBody> {
    await this.assertService(manager, workspace.id, project, plan);
    const account = await manager
      .getRepository(DeliveryContentAccountEntity)
      .findOne({
        where: {
          workspaceId: workspace.id,
          id: body.accountId,
          projectId: project.id,
        },
        lock: { mode: 'pessimistic_read' },
      });
    if (!account || account.companyId !== project.companyId)
      throw new ForbiddenException(
        'Choose an account belonging to this exact brand and project.',
      );
    if (account.archived || account.revision !== body.accountRevision)
      throw new ConflictException(
        'This posting account changed or was archived. Refresh it before continuing.',
      );
    const owner = await this.member(manager, workspace, project, body.ownerId);
    const reviewer = await this.member(
      manager,
      workspace,
      project,
      body.reviewerId,
    );
    if (!reviewer.canReview)
      throw new ConflictException(
        'Choose a currently eligible owner and separate posting reviewer.',
      );
    const assetSnapshot = body.asset
      ? await this.asset(manager, workspace, access, project, body.asset)
      : null;
    if (body.asset) {
      try {
        await this.assertTaskVisible(
          manager,
          workspace,
          project.id,
          owner.access,
          body.asset.taskId,
        );
        await this.assertTaskVisible(
          manager,
          workspace,
          project.id,
          reviewer.access,
          body.asset.taskId,
        );
      } catch (error) {
        if (
          !(error instanceof ForbiddenException) &&
          !(error instanceof PermissionsException)
        )
          throw error;
        throw new ConflictException(
          'The selected owner or reviewer cannot access this exact creative. Choose people with current native task access.',
        );
      }
    }
    validateContentPackage(
      body,
      account.platform,
      assetSnapshot?.mimeType ?? null,
    );
    const snapshot = {
      id: account.id,
      projectId: account.projectId,
      companyId: account.companyId,
      revision: account.revision,
      name: account.name,
      handle: account.handle,
      profileUrl: account.profileUrl,
      platform: account.platform,
      archived: account.archived,
    };
    return {
      ...body,
      account: snapshot,
      assetSnapshot,
      ownerName: owner.name,
      reviewerName: reviewer.name,
      contributorIds,
      sourceFingerprint: advertisingHash([
        plan.id,
        plan.revision,
        project.id,
        project.revision,
        project.companyId,
        plan.engagementId,
        plan.service,
        snapshot,
        assetSnapshot?.sourceHash ?? null,
        owner.id,
        reviewer.id,
      ]),
    };
  }
  async selected(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    access: OtogrowAccess,
    id: string,
    versionNumber?: number | null,
  ) {
    const variant = await manager
      .getRepository(DeliveryContentVariantEntity)
      .findOneBy({ workspaceId: workspace.id, id });
    if (!variant) throw new NotFoundException('This post is unavailable.');
    const { project, plan } = await this.plan(
      manager,
      workspace,
      access,
      variant.planId,
    );
    if (
      variant.projectId !== project.id ||
      variant.companyId !== project.companyId
    )
      throw new ForbiddenException('This post belongs to its original brand.');
    const version = await manager
      .getRepository(DeliveryContentVersionEntity)
      .findOneBy({
        workspaceId: workspace.id,
        variantId: id,
        version: versionNumber ?? variant.currentVersion,
      });
    if (!version)
      throw new NotFoundException('This exact post version is unavailable.');
    if (version.body.asset)
      await this.assertTaskVisible(
        manager,
        workspace,
        project.id,
        access,
        version.body.asset.taskId,
      );
    return { variant, version, plan, project };
  }
  async prepare(
    manager: EntityManager,
    workspace: WorkspaceEntity,
    access: OtogrowAccess,
    input: ContentSave,
  ) {
    const { plan, project } = await this.plan(
      manager,
      workspace,
      access,
      input.planId,
    );
    if (plan.revision !== input.planRevision)
      throw new ConflictException(
        'The content plan changed. Refresh before saving.',
      );
    const previous = await manager
      .getRepository(DeliveryContentVariantEntity)
      .findOneBy({ workspaceId: workspace.id, id: input.id });
    let oldBody: ContentSavedBody | null = null;
    if (previous) {
      const selected = await this.selected(
        manager,
        workspace,
        access,
        input.id,
      );
      if (
        previous.planId !== input.planId ||
        previous.revision !== input.revision ||
        ['REVIEW', 'PUBLISHED'].includes(previous.status)
      )
        throw new ConflictException(
          'This post changed or is locked. Refresh its current version.',
        );
      if (!contentManager(access) && previous.ownerId !== access.memberId)
        throw new ForbiddenException(
          'Only the posting owner or a manager can edit this package.',
        );
      oldBody = selected.version.body;
    } else if (input.revision !== 0)
      throw new ConflictException('The original post is unavailable.');
    if (!contentManager(access) && input.body.ownerId !== access.memberId)
      throw new ForbiddenException(
        'Only a manager can assign another posting owner.',
      );
    const changed =
      !oldBody ||
      advertisingHash(contentContribution(oldBody)) !==
        advertisingHash(contentContribution(input.body));
    const contributorIds = [
      ...new Set([
        ...(oldBody?.contributorIds ?? []),
        ...(changed ? [access.memberId] : []),
      ]),
    ];
    if (contributorIds.length > 50)
      throw new BadRequestException(
        'Start a new post after this many preparation handoffs.',
      );
    if (contributorIds.includes(input.body.reviewerId))
      throw new BadRequestException(
        'Choose a reviewer who did not prepare this posting package.',
      );
    const body = await this.body(
      manager,
      workspace,
      access,
      project,
      plan,
      input.body,
      contributorIds,
    );
    return { plan, project, previous, body };
  }
}
