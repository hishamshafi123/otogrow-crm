import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In, type EntityManager } from 'typeorm';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { DeliveryContentVariantEntity } from 'src/modules/delivery/content/entities/delivery-content-variant.entity';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import {
  DeliveryDeliverableEntity,
  type DeliverableAssetKind,
  type DeliverableMediaMeta,
} from 'src/modules/delivery/deliverables/entities/delivery-deliverable.entity';
import { DeliveryContentMetricSnapshotEntity } from 'src/modules/delivery/deliverables/entities/delivery-content-metric-snapshot.entity';
import { DeliveryDeliverableReviewEntity } from 'src/modules/delivery/deliverables/entities/delivery-deliverable-review.entity';
import { DeliveryDriveConnectionEntity } from 'src/modules/delivery/deliverables/entities/delivery-drive-connection.entity';
import { DeliveryVideoHookVariationEntity } from 'src/modules/delivery/deliverables/entities/delivery-video-hook-variation.entity';
import { DeliveryDriveService } from 'src/modules/delivery/deliverables/delivery-drive.service';
import {
  contentMetricSnapshotFilterSchema,
  createLinkDeliverableSchema,
  deliverableListFilterSchema,
  isUuidString,
  MONTH_KEY_REGEX,
  normalizeServiceScope,
  reviewDeliverableSchema,
  signDeliverableMediaToken,
  updateDeliverableSchema,
  upsertContentMetricSnapshotSchema,
} from 'src/modules/delivery/deliverables/delivery-deliverables.policy';
import { DeliveryClientSetupSourceService } from 'src/modules/delivery/onboarding/delivery-client-setup-source.service';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';

export type DeliverableVariationSummaryDTO = {
  id: string;
  variationNumber: number;
  label: string;
  hookText: string;
  angleTag: string;
  startSec: number;
  endSec: number;
  renderStatus: string;
  renderProgress: number;
  renderError: string | null;
  outputSizeBytes: number;
  hasThumbnail: boolean;
  streamPath: string | null;
  thumbnailPath: string | null;
  driveFileId: string | null;
  driveWebUrl: string | null;
  driveSyncStatus: string;
  driveSyncedAt: string | null;
  storageState: string;
  localFilePurgedAt: string | null;
  clientVisibility: string;
  clientApprovalStatus: string;
};

export type DeliverableReviewDTO = {
  id: string;
  deliverableId: string;
  variationId: string | null;
  authorType: string;
  authorName: string;
  decision: string;
  comment: string;
  timestampSec: number | null;
  createdAt: string;
};

export type DeliverableDTO = {
  id: string;
  companyId: string;
  projectId: string | null;
  engagementId: string | null;
  serviceKey: string;
  serviceScope: string;
  monthKey: string;
  sequenceNumber: number;
  title: string;
  description: string;
  assetKind: DeliverableAssetKind;
  originalFileName: string | null;
  externalUrl: string | null;
  mimeType: string | null;
  sizeBytes: number;
  mediaMeta: DeliverableMediaMeta;
  hasFile: boolean;
  hasThumbnail: boolean;
  streamPath: string | null;
  thumbnailPath: string | null;
  status: string;
  clientVisibility: string;
  clientApprovalStatus: string;
  hasVariations: boolean;
  driveFileId: string | null;
  driveFolderId: string | null;
  driveWebUrl: string | null;
  driveSyncStatus: string;
  driveSyncedAt: string | null;
  driveSyncError: string | null;
  storageState: string;
  localFilePurgedAt: string | null;
  linkedTaskId: string | null;
  submittedById: string;
  approvedById: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  variations: DeliverableVariationSummaryDTO[];
  reviewsCount: number;
  reviews?: DeliverableReviewDTO[];
};

export type UploadDeliverableInput = {
  companyId: string;
  projectId?: string | null;
  engagementId?: string | null;
  serviceKey: string;
  monthKey: string;
  sequenceNumber?: number;
  title?: string;
  description?: string;
  assetKind: DeliverableAssetKind;
  originalFileName: string;
  storageKey: string;
  thumbnailKey: string | null;
  mimeType: string;
  sizeBytes: number;
  mediaMeta: DeliverableMediaMeta;
  publishImmediately?: boolean;
  linkedTaskId?: string | null;
};

@Injectable()
export class DeliveryDeliverablesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly delivery: DeliveryService,
    private readonly companies: DeliveryClientSetupSourceService,
    private readonly twentyConfigService: TwentyConfigService,
    @Optional() private readonly driveService?: DeliveryDriveService,
  ) {}

  private identity(auth: WorkspaceAuthContext) {
    if (auth.type !== 'user') {
      throw new ForbiddenException('Sign in to access deliverables.');
    }
    return {
      workspaceId: auth.workspace.id,
      memberId: auth.workspaceMemberId,
      userWorkspaceId: auth.userWorkspaceId,
    };
  }

  async authorizeStaff(
    workspaceId: string,
    memberId: string,
    userWorkspaceId: string,
    manager: EntityManager,
  ) {
    const workspace = await manager
      .getRepository(WorkspaceEntity)
      .findOneByOrFail({ id: workspaceId });
    const actor = await this.delivery.actor(
      workspace,
      memberId,
      userWorkspaceId,
      manager,
    );
    return { workspace, actor };
  }

  async verifyStaffAccess(
    workspaceId: string,
    memberId: string,
    userWorkspaceId: string,
  ) {
    return this.dataSource.transaction(async (manager) =>
      this.authorizeStaff(workspaceId, memberId, userWorkspaceId, manager),
    );
  }

  private async accessibleCompanyScope(
    workspaceId: string,
    memberId: string,
    isManager: boolean,
    manager: EntityManager,
  ): Promise<{
    allAllowed: boolean;
    companyIds: string[];
    fallbackNames: Map<string, string>;
  }> {
    const projects = await manager.getRepository(DeliveryProjectEntity).find({
      where: { workspaceId },
    });
    const fallbackNames = new Map<string, string>();
    const companyIds = new Set<string>();

    for (const project of projects) {
      if (!project.companyId) continue;
      const assigned =
        isManager ||
        (Array.isArray(project.memberIds) &&
          project.memberIds.includes(memberId));
      if (!assigned) continue;
      companyIds.add(project.companyId);
      if (!fallbackNames.has(project.companyId)) {
        fallbackNames.set(project.companyId, project.name);
      }
    }

    return {
      allAllowed: isManager,
      companyIds: Array.from(companyIds),
      fallbackNames,
    };
  }

  private assertCompanyAccess(
    scope: { allAllowed: boolean; companyIds: string[] },
    companyId: string,
  ) {
    if (!scope.allAllowed && !scope.companyIds.includes(companyId)) {
      throw new ForbiddenException(
        'You do not have access to deliverables for this client.',
      );
    }
  }

  async verifyStaffCompanyAccess(
    workspaceId: string,
    memberId: string,
    userWorkspaceId: string,
    companyId: string,
    projectId: string | null = null,
  ) {
    if (!isUuidString(companyId)) {
      throw new BadRequestException('Invalid client company ID.');
    }
    return this.dataSource.transaction(async (manager) => {
      const { workspace, actor } = await this.authorizeStaff(
        workspaceId,
        memberId,
        userWorkspaceId,
        manager,
      );
      const scope = await this.accessibleCompanyScope(
        workspaceId,
        memberId,
        actor.isManager,
        manager,
      );
      this.assertCompanyAccess(scope, companyId);

      if (projectId) {
        if (!isUuidString(projectId)) {
          throw new BadRequestException('Invalid project ID.');
        }
        const project = await manager
          .getRepository(DeliveryProjectEntity)
          .findOne({ where: { id: projectId, workspaceId } });
        if (!project || (project.companyId && project.companyId !== companyId)) {
          throw new NotFoundException(
            'Delivery project was not found for this client.',
          );
        }
      }
      return { workspace, actor };
    });
  }

  private mediaSecret(): string {
    return this.twentyConfigService.get('APP_SECRET') || '';
  }

  private signedMediaPath(
    workspaceId: string,
    kind: 'deliverable' | 'thumbnail' | 'variation' | 'variation-thumbnail',
    id: string,
  ): string {
    const token = signDeliverableMediaToken(this.mediaSecret(), {
      w: workspaceId,
      t: kind,
      id,
    });
    const encodedToken = encodeURIComponent(token);
    switch (kind) {
      case 'deliverable':
        return `/delivery-deliverables/media/${id}/stream?token=${encodedToken}`;
      case 'thumbnail':
        return `/delivery-deliverables/media/${id}/thumbnail?token=${encodedToken}`;
      case 'variation':
        return `/delivery-deliverables/media/variations/${id}/stream?token=${encodedToken}`;
      case 'variation-thumbnail':
        return `/delivery-deliverables/media/variations/${id}/thumbnail?token=${encodedToken}`;
    }
  }

  private mapVariation(
    variation: DeliveryVideoHookVariationEntity,
  ): DeliverableVariationSummaryDTO {
    const hasFile = Boolean(
      variation.outputStorageKey || variation.driveFileId,
    );
    const hasThumbnail = Boolean(variation.thumbnailKey);
    return {
      id: variation.id,
      variationNumber: variation.variationNumber,
      label: `v${variation.variationNumber}`,
      hookText: variation.hookText,
      angleTag: variation.angleTag,
      startSec: variation.startSec,
      endSec: variation.endSec,
      renderStatus: variation.renderStatus,
      renderProgress: variation.renderProgress,
      renderError: variation.renderError,
      outputSizeBytes: Number(variation.outputSizeBytes ?? 0),
      hasThumbnail,
      streamPath: hasFile
        ? this.signedMediaPath(variation.workspaceId, 'variation', variation.id)
        : null,
      thumbnailPath: hasThumbnail
        ? this.signedMediaPath(
            variation.workspaceId,
            'variation-thumbnail',
            variation.id,
          )
        : null,
      driveFileId: variation.driveFileId,
      driveWebUrl: variation.driveWebUrl,
      driveSyncStatus: variation.driveSyncStatus,
      driveSyncedAt: variation.driveSyncedAt
        ? variation.driveSyncedAt.toISOString()
        : null,
      storageState: variation.storageState,
      localFilePurgedAt: variation.localFilePurgedAt
        ? variation.localFilePurgedAt.toISOString()
        : null,
      clientVisibility: variation.clientVisibility,
      clientApprovalStatus: variation.clientApprovalStatus,
    };
  }

  private mapReview(
    review: DeliveryDeliverableReviewEntity,
  ): DeliverableReviewDTO {
    return {
      id: review.id,
      deliverableId: review.deliverableId,
      variationId: review.variationId,
      authorType: review.authorType,
      authorName: review.authorName,
      decision: review.decision,
      comment: review.comment,
      timestampSec: review.timestampSec,
      createdAt: review.createdAt.toISOString(),
    };
  }

  private mapDeliverable(
    row: DeliveryDeliverableEntity,
    variations: DeliveryVideoHookVariationEntity[],
    reviewsCount: number,
    reviews?: DeliveryDeliverableReviewEntity[],
  ): DeliverableDTO {
    const hasFile = Boolean(row.storageKey || row.driveFileId);
    const hasThumbnail = Boolean(row.thumbnailKey);
    return {
      id: row.id,
      companyId: row.companyId,
      projectId: row.projectId,
      engagementId: row.engagementId,
      serviceKey: row.serviceKey,
      serviceScope: row.serviceScope,
      monthKey: row.monthKey,
      sequenceNumber: row.sequenceNumber,
      title: row.title,
      description: row.description,
      assetKind: row.assetKind,
      originalFileName: row.originalFileName,
      externalUrl: row.externalUrl,
      mimeType: row.mimeType,
      sizeBytes: Number(row.sizeBytes ?? 0),
      mediaMeta: row.mediaMeta ?? {},
      hasFile,
      hasThumbnail,
      streamPath: hasFile
        ? this.signedMediaPath(row.workspaceId, 'deliverable', row.id)
        : null,
      thumbnailPath: hasThumbnail
        ? this.signedMediaPath(row.workspaceId, 'thumbnail', row.id)
        : null,
      status: row.status,
      clientVisibility: row.clientVisibility,
      clientApprovalStatus: row.clientApprovalStatus,
      hasVariations: row.hasVariations || variations.length > 0,
      driveFileId: row.driveFileId,
      driveFolderId: row.driveFolderId,
      driveWebUrl: row.driveWebUrl,
      driveSyncStatus: row.driveSyncStatus,
      driveSyncedAt: row.driveSyncedAt ? row.driveSyncedAt.toISOString() : null,
      driveSyncError: row.driveSyncError,
      storageState: row.storageState,
      localFilePurgedAt: row.localFilePurgedAt
        ? row.localFilePurgedAt.toISOString()
        : null,
      linkedTaskId: row.linkedTaskId,
      submittedById: row.submittedById,
      approvedById: row.approvedById,
      publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      variations: variations.map((item) => this.mapVariation(item)),
      reviewsCount,
      ...(reviews ? { reviews: reviews.map((r) => this.mapReview(r)) } : {}),
    };
  }

  private async resolveServiceScope(
    manager: EntityManager,
    workspaceId: string,
    serviceKey: string,
  ): Promise<string> {
    const driveConn = await manager
      .getRepository(DeliveryDriveConnectionEntity)
      .findOne({ where: { workspaceId } });
    return normalizeServiceScope(serviceKey, driveConn?.folderMode ?? 'FLAT');
  }

  private async allocateSequenceNumber(
    manager: EntityManager,
    workspaceId: string,
    companyId: string,
    monthKey: string,
    serviceScope: string,
    requestedSequence?: number,
    excludeDeliverableId?: string,
  ): Promise<number> {
    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [
        `delivery-deliverable-seq:${workspaceId}:${companyId}:${monthKey}:${serviceScope}`,
      ],
    );
    const repo = manager.getRepository(DeliveryDeliverableEntity);

    if (requestedSequence !== undefined) {
      const conflictQb = repo
        .createQueryBuilder('d')
        .where(
          'd.workspaceId = :workspaceId AND d.companyId = :companyId AND d.monthKey = :monthKey AND d.serviceScope = :serviceScope AND d.sequenceNumber = :seq AND d.status <> :archived',
          {
            workspaceId,
            companyId,
            monthKey,
            serviceScope,
            seq: requestedSequence,
            archived: 'ARCHIVED',
          },
        );
      if (excludeDeliverableId) {
        conflictQb.andWhere('d.id <> :excludeId', {
          excludeId: excludeDeliverableId,
        });
      }
      const conflict = await conflictQb.getOne();
      if (conflict) {
        throw new ConflictException(
          `Deliverable #${requestedSequence} already exists for ${monthKey}. Choose another number or leave blank to auto-assign.`,
        );
      }
      return requestedSequence;
    }

    const result = await repo
      .createQueryBuilder('d')
      .select('COALESCE(MAX(d.sequenceNumber), 0)', 'maxSeq')
      .where(
        'd.workspaceId = :workspaceId AND d.companyId = :companyId AND d.monthKey = :monthKey AND d.serviceScope = :serviceScope AND d.status <> :archived',
        {
          workspaceId,
          companyId,
          monthKey,
          serviceScope,
          archived: 'ARCHIVED',
        },
      )
      .getRawOne<{ maxSeq: string | number }>();

    return Number(result?.maxSeq ?? 0) + 1;
  }

  async createUploadedDeliverable(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    input: UploadDeliverableInput,
  ): Promise<DeliverableDTO> {
    if (!MONTH_KEY_REGEX.test(input.monthKey)) {
      throw new BadRequestException('Choose a valid delivery month (YYYY-MM).');
    }
    const created = await this.dataSource.transaction(async (manager) => {
      const { actor } = await this.authorizeStaff(
        workspace.id,
        memberId,
        userWorkspaceId,
        manager,
      );
      const scope = await this.accessibleCompanyScope(
        workspace.id,
        memberId,
        actor.isManager,
        manager,
      );
      this.assertCompanyAccess(scope, input.companyId);
      const serviceScope = await this.resolveServiceScope(
        manager,
        workspace.id,
        input.serviceKey,
      );
      const sequenceNumber = await this.allocateSequenceNumber(
        manager,
        workspace.id,
        input.companyId,
        input.monthKey,
        serviceScope,
        input.sequenceNumber,
      );
      const canAutoPublish = Boolean(
        input.publishImmediately && actor.isManager,
      );
      const title =
        input.title?.trim() ||
        `${input.serviceKey} #${sequenceNumber}`;

      const repo = manager.getRepository(DeliveryDeliverableEntity);
      const saved = await repo.save(
        repo.create({
          workspaceId: workspace.id,
          companyId: input.companyId,
          projectId: input.projectId ?? null,
          engagementId: input.engagementId ?? null,
          serviceKey: input.serviceKey.trim(),
          serviceScope,
          monthKey: input.monthKey,
          sequenceNumber,
          title: title.slice(0, 200),
          description: (input.description ?? '').trim().slice(0, 4000),
          assetKind: input.assetKind,
          originalFileName: input.originalFileName.slice(0, 240),
          storageKey: input.storageKey,
          thumbnailKey: input.thumbnailKey,
          mimeType: input.mimeType,
          sizeBytes: String(input.sizeBytes),
          mediaMeta: input.mediaMeta,
          status: canAutoPublish ? 'APPROVED' : 'PENDING_REVIEW',
          clientVisibility: canAutoPublish ? 'PUBLISHED' : 'INTERNAL',
          clientApprovalStatus: 'PENDING',
          hasVariations: false,
          driveSyncStatus: 'NOT_SYNCED',
          storageState: 'LOCAL',
          linkedTaskId: input.linkedTaskId ?? null,
          submittedById: memberId,
          approvedById: canAutoPublish ? memberId : null,
          publishedAt: canAutoPublish ? new Date() : null,
        }),
      );

      await recordOtogrowActivity(manager, {
        workspaceId: workspace.id,
        actorId: memberId,
        category: 'CLIENT',
        action: 'DELIVERABLE_SUBMITTED',
        outcome: 'RECORDED',
        summary: `Submitted ${saved.assetKind.toLowerCase()} deliverable #${saved.sequenceNumber} for ${saved.monthKey}.`,
        sourceType: 'deliverable',
        sourceId: saved.id,
        changes: [
          { field: 'sequenceNumber', before: null, after: String(saved.sequenceNumber) },
          { field: 'monthKey', before: null, after: saved.monthKey },
          { field: 'clientVisibility', before: null, after: saved.clientVisibility },
        ],
      });

      return this.mapDeliverable(saved, [], 0, []);
    });

    if (this.driveService) {
      const queued = await this.driveService
        .enqueueDeliverableSyncIfConnected(workspace.id, created.id)
        .catch(() => false);
      if (queued) {
        created.driveSyncStatus = 'QUEUED';
      }
    }
    return created;
  }

  async createLinkDeliverable(
    auth: WorkspaceAuthContext,
    rawInput: unknown,
  ): Promise<DeliverableDTO> {
    const parsed = createLinkDeliverableSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid link deliverable input.',
      );
    }
    const input = parsed.data;
    const identity = this.identity(auth);

    return this.dataSource.transaction(async (manager) => {
      const { actor } = await this.authorizeStaff(
        identity.workspaceId,
        identity.memberId,
        identity.userWorkspaceId,
        manager,
      );
      const scope = await this.accessibleCompanyScope(
        identity.workspaceId,
        identity.memberId,
        actor.isManager,
        manager,
      );
      this.assertCompanyAccess(scope, input.companyId);
      const serviceScope = await this.resolveServiceScope(
        manager,
        identity.workspaceId,
        input.serviceKey,
      );
      const sequenceNumber = await this.allocateSequenceNumber(
        manager,
        identity.workspaceId,
        input.companyId,
        input.monthKey,
        serviceScope,
        input.sequenceNumber,
      );
      const canAutoPublish = Boolean(
        input.publishImmediately && actor.isManager,
      );
      const repo = manager.getRepository(DeliveryDeliverableEntity);
      const saved = await repo.save(
        repo.create({
          workspaceId: identity.workspaceId,
          companyId: input.companyId,
          projectId: input.projectId ?? null,
          engagementId: input.engagementId ?? null,
          serviceKey: input.serviceKey,
          serviceScope,
          monthKey: input.monthKey,
          sequenceNumber,
          title: input.title,
          description: input.description ?? '',
          assetKind: 'LINK',
          externalUrl: input.externalUrl,
          sizeBytes: '0',
          mediaMeta: {},
          status: canAutoPublish ? 'APPROVED' : 'PENDING_REVIEW',
          clientVisibility: canAutoPublish ? 'PUBLISHED' : 'INTERNAL',
          clientApprovalStatus: 'PENDING',
          hasVariations: false,
          driveSyncStatus: 'NOT_SYNCED',
          storageState: 'EXTERNAL',
          linkedTaskId: input.linkedTaskId ?? null,
          submittedById: identity.memberId,
          approvedById: canAutoPublish ? identity.memberId : null,
          publishedAt: canAutoPublish ? new Date() : null,
        }),
      );
      return this.mapDeliverable(saved, [], 0, []);
    });
  }

  async list(
    auth: WorkspaceAuthContext,
    rawFilter?: unknown,
  ): Promise<{
    deliverables: DeliverableDTO[];
    clients: { id: string; name: string }[];
    summary: {
      total: number;
      videos: number;
      variations: number;
      published: number;
      pendingReview: number;
      syncedToDrive: number;
      vpsPurged: number;
    };
  }> {
    const parsed = deliverableListFilterSchema.safeParse(rawFilter ?? {});
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid deliverable filter.',
      );
    }
    const filter = parsed.data;
    const identity = this.identity(auth);

    const { rows, variationsByDeliverable, reviewCounts, scope } =
      await this.dataSource.transaction(async (manager) => {
        const { actor } = await this.authorizeStaff(
          identity.workspaceId,
          identity.memberId,
          identity.userWorkspaceId,
          manager,
        );
        const companyScope = await this.accessibleCompanyScope(
          identity.workspaceId,
          identity.memberId,
          actor.isManager,
          manager,
        );

        if (!companyScope.allAllowed && companyScope.companyIds.length === 0) {
          return {
            rows: [] as DeliveryDeliverableEntity[],
            variationsByDeliverable: new Map<
              string,
              DeliveryVideoHookVariationEntity[]
            >(),
            reviewCounts: new Map<string, number>(),
            scope: companyScope,
          };
        }

        if (filter.companyId) {
          this.assertCompanyAccess(companyScope, filter.companyId);
        }

        const qb = manager
          .getRepository(DeliveryDeliverableEntity)
          .createQueryBuilder('d')
          .where('d.workspaceId = :workspaceId', {
            workspaceId: identity.workspaceId,
          });

        if (!companyScope.allAllowed) {
          qb.andWhere('d.companyId IN (:...allowedCompanyIds)', {
            allowedCompanyIds: companyScope.companyIds,
          });
        }

        if (!filter.includeArchived) {
          qb.andWhere('d.status <> :archived', { archived: 'ARCHIVED' });
        }
        if (filter.companyId) {
          qb.andWhere('d.companyId = :companyId', {
            companyId: filter.companyId,
          });
        }
        if (filter.monthKey) {
          qb.andWhere('d.monthKey = :monthKey', { monthKey: filter.monthKey });
        }
        if (filter.serviceKey) {
          qb.andWhere('d.serviceKey = :serviceKey', {
            serviceKey: filter.serviceKey,
          });
        }
        if (filter.assetKind) {
          qb.andWhere('d.assetKind = :assetKind', {
            assetKind: filter.assetKind,
          });
        }
        if (filter.status) {
          qb.andWhere('d.status = :status', { status: filter.status });
        }
        if (filter.clientVisibility) {
          qb.andWhere('d.clientVisibility = :clientVisibility', {
            clientVisibility: filter.clientVisibility,
          });
        }
        if (filter.search) {
          qb.andWhere(
            '(d.title ILIKE :search OR d.description ILIKE :search OR d.originalFileName ILIKE :search)',
            { search: `%${filter.search}%` },
          );
        }

        const fetchedRows = await qb
          .orderBy('d.monthKey', 'DESC')
          .addOrderBy('d.sequenceNumber', 'ASC')
          .addOrderBy('d.createdAt', 'DESC')
          .take(filter.limit ?? 500)
          .getMany();

        const ids = fetchedRows.map((row) => row.id);
        const variationsMap = new Map<
          string,
          DeliveryVideoHookVariationEntity[]
        >();
        const countsMap = new Map<string, number>();

        if (ids.length) {
          const variations = await manager
            .getRepository(DeliveryVideoHookVariationEntity)
            .find({
              where: {
                workspaceId: identity.workspaceId,
                deliverableId: In(ids),
              },
              order: { variationNumber: 'ASC' },
            });
          for (const variation of variations) {
            const list = variationsMap.get(variation.deliverableId) ?? [];
            list.push(variation);
            variationsMap.set(variation.deliverableId, list);
          }

          const counts = await manager
            .getRepository(DeliveryDeliverableReviewEntity)
            .createQueryBuilder('r')
            .select('r.deliverableId', 'deliverableId')
            .addSelect('COUNT(*)', 'count')
            .where(
              'r.workspaceId = :workspaceId AND r.deliverableId IN (:...ids)',
              { workspaceId: identity.workspaceId, ids },
            )
            .groupBy('r.deliverableId')
            .getRawMany<{ deliverableId: string; count: string }>();
          for (const entry of counts) {
            countsMap.set(entry.deliverableId, Number(entry.count));
          }
        }

        return {
          rows: fetchedRows,
          variationsByDeliverable: variationsMap,
          reviewCounts: countsMap,
          scope: companyScope,
        };
      });

    const companyIdsToResolve = Array.from(
      new Set([
        ...scope.companyIds,
        ...rows.map((row) => row.companyId),
      ]),
    );
    const crmNameById = new Map<string, string>();
    if (companyIdsToResolve.length > 0) {
      try {
        const crmCompanies = await this.companies.listByIds(
          auth,
          companyIdsToResolve,
        );
        for (const company of crmCompanies) {
          crmNameById.set(company.id, company.name);
        }
      } catch {
        // Non-managers without CRM company read access fall back to assigned project names.
      }
    }

    const clients = companyIdsToResolve
      .map((id) => ({
        id,
        name: crmNameById.get(id) ?? scope.fallbackNames.get(id) ?? 'Client',
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const deliverables = rows.map((row) =>
      this.mapDeliverable(
        row,
        variationsByDeliverable.get(row.id) ?? [],
        reviewCounts.get(row.id) ?? 0,
      ),
    );

    let totalVariations = 0;
    for (const item of deliverables) {
      totalVariations += item.variations.length;
    }

    return {
      deliverables,
      clients,
      summary: {
        total: deliverables.length,
        videos: deliverables.filter((d) => d.assetKind === 'VIDEO').length,
        variations: totalVariations,
        published: deliverables.filter(
          (d) => d.clientVisibility === 'PUBLISHED',
        ).length,
        pendingReview: deliverables.filter(
          (d) => d.status === 'PENDING_REVIEW',
        ).length,
        syncedToDrive: deliverables.filter(
          (d) => d.driveSyncStatus === 'SYNCED',
        ).length,
        vpsPurged: deliverables.filter((d) => d.storageState === 'DRIVE_ONLY')
          .length,
      },
    };
  }

  async read(auth: WorkspaceAuthContext, id: string): Promise<DeliverableDTO> {
    if (!isUuidString(id)) {
      throw new BadRequestException('Invalid deliverable ID.');
    }
    const identity = this.identity(auth);
    return this.dataSource.transaction(async (manager) => {
      const { actor } = await this.authorizeStaff(
        identity.workspaceId,
        identity.memberId,
        identity.userWorkspaceId,
        manager,
      );
      const scope = await this.accessibleCompanyScope(
        identity.workspaceId,
        identity.memberId,
        actor.isManager,
        manager,
      );
      const row = await manager
        .getRepository(DeliveryDeliverableEntity)
        .findOne({
          where: { id, workspaceId: identity.workspaceId },
        });
      if (!row) {
        throw new NotFoundException('Deliverable not found.');
      }
      this.assertCompanyAccess(scope, row.companyId);
      const [variations, reviews] = await Promise.all([
        manager.getRepository(DeliveryVideoHookVariationEntity).find({
          where: { workspaceId: identity.workspaceId, deliverableId: row.id },
          order: { variationNumber: 'ASC' },
        }),
        manager.getRepository(DeliveryDeliverableReviewEntity).find({
          where: { workspaceId: identity.workspaceId, deliverableId: row.id },
          order: { createdAt: 'ASC' },
        }),
      ]);
      return this.mapDeliverable(row, variations, reviews.length, reviews);
    });
  }

  async update(
    auth: WorkspaceAuthContext,
    rawInput: unknown,
  ): Promise<DeliverableDTO> {
    const parsed = updateDeliverableSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid deliverable update.',
      );
    }
    const input = parsed.data;
    const identity = this.identity(auth);

    const result = await this.dataSource.transaction(async (manager) => {
      const { actor } = await this.authorizeStaff(
        identity.workspaceId,
        identity.memberId,
        identity.userWorkspaceId,
        manager,
      );
      const scope = await this.accessibleCompanyScope(
        identity.workspaceId,
        identity.memberId,
        actor.isManager,
        manager,
      );
      const repo = manager.getRepository(DeliveryDeliverableEntity);
      const existing = await repo.findOne({
        where: { id: input.id, workspaceId: identity.workspaceId },
      });
      if (!existing) {
        throw new NotFoundException('Deliverable not found.');
      }
      this.assertCompanyAccess(scope, existing.companyId);

      if (!actor.isManager) {
        if (input.clientVisibility !== undefined) {
          throw new ForbiddenException(
            'Delivery management access is required to publish or unpublish deliverables.',
          );
        }
        if (
          input.status !== undefined &&
          !['DRAFT', 'PENDING_REVIEW'].includes(input.status)
        ) {
          throw new ForbiddenException(
            'Delivery management access is required to approve, archive, or request changes on deliverables.',
          );
        }
        if (
          existing.submittedById !== identity.memberId ||
          existing.status === 'APPROVED' ||
          existing.status === 'ARCHIVED' ||
          existing.clientVisibility === 'PUBLISHED'
        ) {
          throw new ForbiddenException(
            'Only managers can edit approved, published, or archived deliverables.',
          );
        }
      }

      const nextMonthKey = input.monthKey ?? existing.monthKey;
      const nextServiceKey = input.serviceKey ?? existing.serviceKey;
      const nextServiceScope =
        input.serviceKey !== undefined
          ? await this.resolveServiceScope(
              manager,
              identity.workspaceId,
              nextServiceKey,
            )
          : existing.serviceScope;
      const isUnarchiving =
        existing.status === 'ARCHIVED' &&
        input.status !== undefined &&
        input.status !== 'ARCHIVED';

      const sequenceScopeChanged =
        isUnarchiving ||
        nextMonthKey !== existing.monthKey ||
        nextServiceScope !== existing.serviceScope ||
        (input.sequenceNumber !== undefined &&
          input.sequenceNumber !== existing.sequenceNumber);

      if (sequenceScopeChanged && input.status !== 'ARCHIVED') {
        const requestedSeq =
          input.sequenceNumber !== undefined
            ? input.sequenceNumber
            : isUnarchiving
              ? undefined
              : existing.sequenceNumber;
        existing.sequenceNumber = await this.allocateSequenceNumber(
          manager,
          identity.workspaceId,
          existing.companyId,
          nextMonthKey,
          nextServiceScope,
          requestedSeq,
          existing.id,
        );
      }

      existing.monthKey = nextMonthKey;
      existing.serviceKey = nextServiceKey;
      existing.serviceScope = nextServiceScope;
      if (input.title !== undefined) existing.title = input.title;
      if (input.description !== undefined)
        existing.description = input.description;
      if (input.linkedTaskId !== undefined)
        existing.linkedTaskId = input.linkedTaskId;
      if (input.status !== undefined) {
        existing.status = input.status;
        if (input.status === 'APPROVED') {
          existing.approvedById = identity.memberId;
        } else {
          existing.clientVisibility = 'INTERNAL';
        }
      }
      if (input.clientVisibility !== undefined && existing.status !== 'ARCHIVED') {
        existing.clientVisibility = input.clientVisibility;
        if (input.clientVisibility === 'PUBLISHED') {
          if (existing.status !== 'APPROVED') {
            existing.status = 'APPROVED';
            existing.approvedById = identity.memberId;
          }
          existing.publishedAt = existing.publishedAt ?? new Date();
        }
      }

      const saved = await repo.save(existing);
      const [variations, reviews] = await Promise.all([
        manager.getRepository(DeliveryVideoHookVariationEntity).find({
          where: { workspaceId: identity.workspaceId, deliverableId: saved.id },
          order: { variationNumber: 'ASC' },
        }),
        manager.getRepository(DeliveryDeliverableReviewEntity).find({
          where: { workspaceId: identity.workspaceId, deliverableId: saved.id },
          order: { createdAt: 'ASC' },
        }),
      ]);
      return {
        dto: this.mapDeliverable(saved, variations, reviews.length, reviews),
        shouldSyncDrive:
          saved.assetKind !== 'LINK' &&
          saved.status !== 'ARCHIVED' &&
          (sequenceScopeChanged ||
            (input.clientVisibility === 'PUBLISHED' &&
              saved.driveSyncStatus !== 'SYNCED')),
      };
    });

    if (result.shouldSyncDrive && this.driveService) {
      const queued = await this.driveService
        .enqueueDeliverableSyncIfConnected(identity.workspaceId, result.dto.id)
        .catch(() => false);
      if (queued) {
        result.dto.driveSyncStatus = 'QUEUED';
      }
    }
    return result.dto;
  }

  async addStaffReview(
    auth: WorkspaceAuthContext,
    rawInput: unknown,
  ): Promise<DeliverableReviewDTO> {
    const parsed = reviewDeliverableSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid review input.',
      );
    }
    const input = parsed.data;
    const identity = this.identity(auth);

    return this.dataSource.transaction(async (manager) => {
      const { actor } = await this.authorizeStaff(
        identity.workspaceId,
        identity.memberId,
        identity.userWorkspaceId,
        manager,
      );
      if (!actor.isManager && input.decision !== 'COMMENT') {
        throw new ForbiddenException(
          'Delivery management access is required to approve or request changes on deliverables.',
        );
      }
      const scope = await this.accessibleCompanyScope(
        identity.workspaceId,
        identity.memberId,
        actor.isManager,
        manager,
      );
      const deliverableRepo = manager.getRepository(DeliveryDeliverableEntity);
      const deliverable = await deliverableRepo.findOne({
        where: { id: input.deliverableId, workspaceId: identity.workspaceId },
      });
      if (!deliverable) {
        throw new NotFoundException('Deliverable not found.');
      }
      this.assertCompanyAccess(scope, deliverable.companyId);

      if (input.variationId) {
        const variation = await manager
          .getRepository(DeliveryVideoHookVariationEntity)
          .findOne({
            where: {
              id: input.variationId,
              workspaceId: identity.workspaceId,
              deliverableId: deliverable.id,
            },
          });
        if (!variation) {
          throw new NotFoundException('Variation not found for deliverable.');
        }
      }

      const reviewRepo = manager.getRepository(DeliveryDeliverableReviewEntity);
      const saved = await reviewRepo.save(
        reviewRepo.create({
          workspaceId: identity.workspaceId,
          deliverableId: deliverable.id,
          variationId: input.variationId ?? null,
          authorType: 'STAFF',
          authorId: identity.memberId,
          authorName: actor.isManager ? 'PM / Manager' : 'Team Member',
          decision: input.decision,
          comment: input.comment ?? '',
          timestampSec: input.timestampSec ?? null,
        }),
      );

      if (input.decision === 'APPROVED') {
        deliverable.status = 'APPROVED';
        deliverable.approvedById = identity.memberId;
        await deliverableRepo.save(deliverable);
      } else if (input.decision === 'CHANGES_REQUESTED') {
        deliverable.status = 'CHANGES_REQUESTED';
        deliverable.clientVisibility = 'INTERNAL';
        await deliverableRepo.save(deliverable);
      }

      return this.mapReview(saved);
    });
  }

  async authorizeMediaRead(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    deliverableId: string,
  ): Promise<DeliveryDeliverableEntity> {
    if (!isUuidString(deliverableId)) {
      throw new BadRequestException('Invalid deliverable ID.');
    }
    return this.dataSource.transaction(async (manager) => {
      const { actor } = await this.authorizeStaff(
        workspace.id,
        memberId,
        userWorkspaceId,
        manager,
      );
      const scope = await this.accessibleCompanyScope(
        workspace.id,
        memberId,
        actor.isManager,
        manager,
      );
      const deliverable = await manager
        .getRepository(DeliveryDeliverableEntity)
        .findOne({
          where: { id: deliverableId, workspaceId: workspace.id },
        });
      if (!deliverable) {
        throw new NotFoundException('Deliverable not found.');
      }
      this.assertCompanyAccess(scope, deliverable.companyId);
      return deliverable;
    });
  }

  async authorizeVariationMediaRead(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    variationId: string,
  ): Promise<DeliveryVideoHookVariationEntity> {
    if (!isUuidString(variationId)) {
      throw new BadRequestException('Invalid variation ID.');
    }
    return this.dataSource.transaction(async (manager) => {
      const { actor } = await this.authorizeStaff(
        workspace.id,
        memberId,
        userWorkspaceId,
        manager,
      );
      const scope = await this.accessibleCompanyScope(
        workspace.id,
        memberId,
        actor.isManager,
        manager,
      );
      const variation = await manager
        .getRepository(DeliveryVideoHookVariationEntity)
        .findOne({
          where: { id: variationId, workspaceId: workspace.id },
        });
      if (!variation) {
        throw new NotFoundException('Variation not found.');
      }
      const deliverable = await manager
        .getRepository(DeliveryDeliverableEntity)
        .findOne({
          where: { id: variation.deliverableId, workspaceId: workspace.id },
        });
      if (!deliverable) {
        throw new NotFoundException('Deliverable not found.');
      }
      this.assertCompanyAccess(scope, deliverable.companyId);
      return variation;
    });
  }

  async readDeliverableByWorkspaceId(
    workspaceId: string,
    deliverableId: string,
  ): Promise<DeliveryDeliverableEntity> {
    if (!isUuidString(deliverableId) || !isUuidString(workspaceId)) {
      throw new BadRequestException('Invalid media identifier.');
    }
    const deliverable = await this.dataSource
      .getRepository(DeliveryDeliverableEntity)
      .findOne({
        where: { id: deliverableId, workspaceId },
      });
    if (!deliverable) {
      throw new NotFoundException('Deliverable not found.');
    }
    return deliverable;
  }

  async readVariationByWorkspaceId(
    workspaceId: string,
    variationId: string,
  ): Promise<DeliveryVideoHookVariationEntity> {
    if (!isUuidString(variationId) || !isUuidString(workspaceId)) {
      throw new BadRequestException('Invalid media identifier.');
    }
    const variation = await this.dataSource
      .getRepository(DeliveryVideoHookVariationEntity)
      .findOne({
        where: { id: variationId, workspaceId },
      });
    if (!variation) {
      throw new NotFoundException('Variation not found.');
    }
    return variation;
  }

  async listContentMetricSnapshots(
    auth: WorkspaceAuthContext,
    rawFilter?: unknown,
  ) {
    const parsed = contentMetricSnapshotFilterSchema.safeParse(rawFilter);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid metric filter.',
      );
    }
    const filter = parsed.data ?? {};
    const identity = this.identity(auth);

    return this.dataSource.transaction(async (manager) => {
      const { actor } = await this.authorizeStaff(
        identity.workspaceId,
        identity.memberId,
        identity.userWorkspaceId,
        manager,
      );
      const scope = await this.accessibleCompanyScope(
        identity.workspaceId,
        identity.memberId,
        actor.isManager,
        manager,
      );
      if (filter.companyId) {
        this.assertCompanyAccess(scope, filter.companyId);
      }
      if (!actor.isManager && scope.companyIds.length === 0) {
        return { snapshots: [] };
      }

      const qb = manager
        .getRepository(DeliveryContentMetricSnapshotEntity)
        .createQueryBuilder('m')
        .where('m.workspaceId = :workspaceId', {
          workspaceId: identity.workspaceId,
        });

      if (filter.companyId) {
        qb.andWhere('m.companyId = :companyId', {
          companyId: filter.companyId,
        });
      } else if (!actor.isManager) {
        qb.andWhere('m.companyId IN (:...companyIds)', {
          companyIds: scope.companyIds,
        });
      }
      if (filter.monthKey) {
        qb.andWhere('m.monthKey = :monthKey', { monthKey: filter.monthKey });
      }
      if (filter.platform) {
        qb.andWhere('m.platform = :platform', { platform: filter.platform });
      }

      const rows = await qb
        .orderBy('m.observedAt', 'DESC')
        .addOrderBy('m.createdAt', 'DESC')
        .take(200)
        .getMany();

      return {
        snapshots: rows.map((row) => ({
          id: row.id,
          companyId: row.companyId,
          projectId: row.projectId,
          contentVariantId: row.contentVariantId,
          monthKey: row.monthKey,
          platform: row.platform,
          postTitle: row.postTitle,
          postUrl: row.postUrl,
          views: row.views,
          impressions: row.impressions,
          reach: row.reach,
          likes: row.likes,
          comments: row.comments,
          shares: row.shares,
          saves: row.saves,
          clicks: row.clicks,
          followerDelta: row.followerDelta,
          source: row.source,
          observedAt: row.observedAt.toISOString(),
        })),
      };
    });
  }

  async upsertContentMetricSnapshot(
    auth: WorkspaceAuthContext,
    rawInput: unknown,
  ) {
    const parsed = upsertContentMetricSnapshotSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid social metric payload.',
      );
    }
    const input = parsed.data;
    const identity = this.identity(auth);

    // Authorize manager before querying CRM companies to avoid existence oracles.
    await this.dataSource.transaction(async (manager) => {
      const { actor } = await this.authorizeStaff(
        identity.workspaceId,
        identity.memberId,
        identity.userWorkspaceId,
        manager,
      );
      if (!actor.isManager) {
        throw new ForbiddenException(
          'Manager access is required to record or edit social metric snapshots.',
        );
      }
    });

    const companies = await this.companies.listByIds(auth, [input.companyId]);
    const companyKnown = companies.length > 0;

    return this.dataSource.transaction(async (manager) => {
      const { actor } = await this.authorizeStaff(
        identity.workspaceId,
        identity.memberId,
        identity.userWorkspaceId,
        manager,
      );
      if (!actor.isManager) {
        throw new ForbiddenException(
          'Manager access is required to record or edit social metric snapshots.',
        );
      }

      if (!companyKnown) {
        const hasProject = await manager
          .getRepository(DeliveryProjectEntity)
          .findOne({
            where: {
              workspaceId: identity.workspaceId,
              companyId: input.companyId,
            },
          });
        if (!hasProject) {
          throw new NotFoundException(
            'Client company was not found in this workspace.',
          );
        }
      }

      if (input.projectId) {
        const project = await manager
          .getRepository(DeliveryProjectEntity)
          .findOne({
            where: {
              id: input.projectId,
              workspaceId: identity.workspaceId,
            },
          });
        if (!project || (project.companyId && project.companyId !== input.companyId)) {
          throw new NotFoundException(
            'Delivery project was not found for this client.',
          );
        }
      }

      if (input.contentVariantId) {
        const variant = await manager
          .getRepository(DeliveryContentVariantEntity)
          .findOne({
            where: {
              id: input.contentVariantId,
              workspaceId: identity.workspaceId,
            },
          });
        if (!variant) {
          throw new NotFoundException('Content variant was not found.');
        }
        if (variant.companyId && variant.companyId !== input.companyId) {
          throw new NotFoundException(
            'Content variant does not belong to this client.',
          );
        }
        if (!variant.companyId && variant.projectId) {
          const variantProject = await manager
            .getRepository(DeliveryProjectEntity)
            .findOne({
              where: {
                id: variant.projectId,
                workspaceId: identity.workspaceId,
              },
            });
          if (!variantProject || variantProject.companyId !== input.companyId) {
            throw new NotFoundException(
              'Content variant does not belong to this client.',
            );
          }
        }
      }

      const normalizedPostUrl = input.postUrl?.trim() || null;
      const normalizedPostTitle = input.postTitle?.trim() || null;
      const repo = manager.getRepository(DeliveryContentMetricSnapshotEntity);
      let row: DeliveryContentMetricSnapshotEntity;
      if (input.id) {
        const existing = await repo.findOne({
          where: { id: input.id, workspaceId: identity.workspaceId },
        });
        if (!existing) {
          throw new NotFoundException('Metric snapshot not found.');
        }
        existing.companyId = input.companyId;
        if (input.projectId !== undefined) {
          existing.projectId = input.projectId;
        }
        if (input.contentVariantId !== undefined) {
          existing.contentVariantId = input.contentVariantId;
        }
        existing.monthKey = input.monthKey;
        existing.platform = input.platform;
        existing.postTitle = normalizedPostTitle;
        existing.postUrl = normalizedPostUrl;
        existing.views = input.views;
        existing.impressions = input.impressions;
        existing.reach = input.reach;
        existing.likes = input.likes;
        existing.comments = input.comments;
        existing.shares = input.shares;
        existing.saves = input.saves;
        existing.clicks = input.clicks;
        existing.followerDelta = input.followerDelta;
        existing.observedAt = input.observedAt
          ? new Date(input.observedAt)
          : new Date();
        existing.recordedById = identity.memberId;
        row = await repo.save(existing);
      } else {
        row = await repo.save(
          repo.create({
            workspaceId: identity.workspaceId,
            companyId: input.companyId,
            projectId: input.projectId ?? null,
            contentVariantId: input.contentVariantId ?? null,
            monthKey: input.monthKey,
            platform: input.platform,
            postTitle: normalizedPostTitle,
            postUrl: normalizedPostUrl,
            views: input.views,
            impressions: input.impressions,
            reach: input.reach,
            likes: input.likes,
            comments: input.comments,
            shares: input.shares,
            saves: input.saves,
            clicks: input.clicks,
            followerDelta: input.followerDelta,
            source: 'MANUAL',
            recordedById: identity.memberId,
            observedAt: input.observedAt
              ? new Date(input.observedAt)
              : new Date(),
          }),
        );
      }

      return {
        id: row.id,
        companyId: row.companyId,
        projectId: row.projectId,
        contentVariantId: row.contentVariantId,
        monthKey: row.monthKey,
        platform: row.platform,
        postTitle: row.postTitle,
        postUrl: row.postUrl,
        views: row.views,
        impressions: row.impressions,
        reach: row.reach,
        likes: row.likes,
        comments: row.comments,
        shares: row.shares,
        saves: row.saves,
        clicks: row.clicks,
        followerDelta: row.followerDelta,
        source: row.source,
        observedAt: row.observedAt.toISOString(),
      };
    });
  }

  async deleteContentMetricSnapshot(auth: WorkspaceAuthContext, id: string) {
    if (!isUuidString(id)) {
      throw new BadRequestException('Invalid metric snapshot ID.');
    }
    const identity = this.identity(auth);
    return this.dataSource.transaction(async (manager) => {
      const { actor } = await this.authorizeStaff(
        identity.workspaceId,
        identity.memberId,
        identity.userWorkspaceId,
        manager,
      );
      if (!actor.isManager) {
        throw new ForbiddenException(
          'Manager access is required to delete social metric snapshots.',
        );
      }
      const repo = manager.getRepository(DeliveryContentMetricSnapshotEntity);
      const existing = await repo.findOne({
        where: { id, workspaceId: identity.workspaceId },
      });
      if (!existing) {
        throw new NotFoundException('Metric snapshot not found.');
      }
      await repo.delete({ id: existing.id, workspaceId: identity.workspaceId });
      return { deleted: true, id: existing.id };
    });
  }
}
