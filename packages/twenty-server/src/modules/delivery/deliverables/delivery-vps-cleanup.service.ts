import {
  ForbiddenException,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In, IsNull, LessThanOrEqual, Not } from 'typeorm';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { FileStorageDriverFactory } from 'src/engine/core-modules/file-storage/file-storage-driver.factory';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { DeliveryDriveService } from 'src/modules/delivery/deliverables/delivery-drive.service';
import { DeliveryDeliverableEntity } from 'src/modules/delivery/deliverables/entities/delivery-deliverable.entity';
import { DeliveryDriveConnectionEntity } from 'src/modules/delivery/deliverables/entities/delivery-drive-connection.entity';
import { DeliveryVideoHookProjectEntity } from 'src/modules/delivery/deliverables/entities/delivery-video-hook-project.entity';
import { DeliveryVideoHookVariationEntity } from 'src/modules/delivery/deliverables/entities/delivery-video-hook-variation.entity';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';

export type VpsCleanupResult = {
  workspaceId: string;
  dryRun: boolean;
  enabled: boolean;
  retentionHours: number;
  purgedDeliverables: number;
  purgedVariations: number;
  reclaimedBytes: number;
  skippedActiveRenders: number;
  skippedUnsynced: number;
};

const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000';

const isNotFoundStorageError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const record = error as { code?: unknown; name?: unknown; message?: unknown };
  const code = String(record.code ?? '').toUpperCase();
  const name = String(record.name ?? '').toUpperCase();
  const message = String(record.message ?? '').toUpperCase();
  return (
    code === 'ENOENT' ||
    code === 'FILE_NOT_FOUND' ||
    code === 'NOSUCHKEY' ||
    name === 'NOTFOUND' ||
    message.includes('ENOENT') ||
    message.includes('FILE_NOT_FOUND') ||
    message.includes('NO SUCH FILE')
  );
};

@Injectable()
export class DeliveryVpsCleanupService {
  private readonly logger = new Logger(DeliveryVpsCleanupService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly storage: FileStorageDriverFactory,
    private readonly delivery: DeliveryService,
    @Optional() private readonly driveService?: DeliveryDriveService,
  ) {}

  async runManualCleanup(
    auth: WorkspaceAuthContext,
    dryRun = false,
  ): Promise<VpsCleanupResult> {
    if (auth.type !== 'user' || !auth.workspaceMemberId) {
      throw new ForbiddenException('Workspace member authentication required.');
    }
    const actor = await this.dataSource.transaction(async (manager) => {
      const workspace = await manager
        .getRepository(WorkspaceEntity)
        .findOneByOrFail({ id: auth.workspace.id });
      return this.delivery.actor(
        workspace,
        auth.workspaceMemberId,
        auth.userWorkspaceId,
        manager,
      );
    });
    if (!actor.isManager) {
      throw new ForbiddenException(
        'Only delivery managers can trigger VPS video cleanup.',
      );
    }
    return this.purgeEligibleVpsVideosForWorkspace(auth.workspace.id, {
      dryRun,
      actorId: auth.workspaceMemberId,
    });
  }

  private async verifyDriveCopy(
    workspaceId: string,
    driveFileId: string,
  ): Promise<'ACTIVE' | 'MISSING' | 'UNAVAILABLE'> {
    if (!this.driveService) {
      return 'ACTIVE';
    }
    return this.driveService.isDriveFileActive(workspaceId, driveFileId);
  }

  async purgeEligibleVpsVideosForWorkspace(
    workspaceId: string,
    options?: { dryRun?: boolean; actorId?: string; now?: Date },
  ): Promise<VpsCleanupResult> {
    const dryRun = Boolean(options?.dryRun);
    const now = options?.now ?? new Date();
    const actorId = options?.actorId ?? SYSTEM_ACTOR_ID;

    const connection = await this.dataSource
      .getRepository(DeliveryDriveConnectionEntity)
      .findOne({ where: { workspaceId, revokedAt: IsNull() } });

    if (!connection || !connection.autoPurgeVpsEnabled) {
      return {
        workspaceId,
        dryRun,
        enabled: false,
        retentionHours: connection?.autoPurgeVpsAfterHours ?? 24,
        purgedDeliverables: 0,
        purgedVariations: 0,
        reclaimedBytes: 0,
        skippedActiveRenders: 0,
        skippedUnsynced: 0,
      };
    }

    const retentionHours = Math.max(1, connection.autoPurgeVpsAfterHours || 24);
    const cutoff = new Date(now.getTime() - retentionHours * 60 * 60 * 1000);

    const deliverableRepo = this.dataSource.getRepository(
      DeliveryDeliverableEntity,
    );
    const variationRepo = this.dataSource.getRepository(
      DeliveryVideoHookVariationEntity,
    );
    const hookProjectRepo = this.dataSource.getRepository(
      DeliveryVideoHookProjectEntity,
    );

    let purgedDeliverables = 0;
    let purgedVariations = 0;
    let reclaimedBytes = 0;
    let skippedActiveRenders = 0;
    let skippedUnsynced = 0;

    // 1) Purge eligible variation videos first (only when READY + SYNCED + verified active in Drive + >= retentionHours old)
    const candidateVariations = await variationRepo.find({
      where: {
        workspaceId,
        storageState: 'LOCAL',
        outputStorageKey: Not(IsNull()),
        renderStatus: 'READY',
        driveSyncStatus: 'SYNCED',
        driveFileId: Not(IsNull()),
        driveSyncedAt: LessThanOrEqual(cutoff),
      },
      take: 250,
    });

    const driver = this.storage.getCurrentDriver();

    for (const variation of candidateVariations) {
      if (!variation.outputStorageKey || !variation.driveFileId?.trim()) {
        skippedUnsynced += 1;
        continue;
      }

      const driveState = await this.verifyDriveCopy(
        workspaceId,
        variation.driveFileId,
      );
      if (driveState === 'MISSING') {
        skippedUnsynced += 1;
        if (!dryRun) {
          await variationRepo.update(
            { workspaceId, id: variation.id },
            {
              driveSyncStatus: 'FAILED',
              driveSyncError:
                'Variation file missing or trashed in Google Drive; local VPS copy preserved.',
            },
          );
        }
        continue;
      }
      if (driveState === 'UNAVAILABLE') {
        skippedUnsynced += 1;
        continue;
      }

      const sizeBytes = Number(variation.outputSizeBytes ?? 0);
      if (!dryRun) {
        // Re-verify conditional state before removing bytes to avoid TOCTOU races with re-renders or re-syncs.
        const fresh = await variationRepo.findOne({
          where: {
            workspaceId,
            id: variation.id,
            storageState: 'LOCAL',
            renderStatus: 'READY',
            driveSyncStatus: 'SYNCED',
          },
        });
        if (
          !fresh ||
          !fresh.outputStorageKey ||
          !fresh.driveSyncedAt ||
          fresh.driveSyncedAt > cutoff
        ) {
          skippedUnsynced += 1;
          continue;
        }

        try {
          await driver.delete({ folderPath: fresh.outputStorageKey });
        } catch (error) {
          if (!isNotFoundStorageError(error)) {
            this.logger.warn(
              `Skipping VPS purge for variation ${variation.id}: delete failed (${error instanceof Error ? error.message : String(error)})`,
            );
            continue;
          }
        }

        const updateResult = await variationRepo.update(
          {
            workspaceId,
            id: variation.id,
            storageState: 'LOCAL',
            renderStatus: 'READY',
            driveSyncStatus: 'SYNCED',
          },
          {
            storageState: 'DRIVE_ONLY',
            outputStorageKey: null,
            localFilePurgedAt: now,
          },
        );
        if (updateResult.affected === 0) {
          continue;
        }
      }
      purgedVariations += 1;
      if (Number.isFinite(sizeBytes) && sizeBytes > 0) {
        reclaimedBytes += sizeBytes;
      }
    }

    // 2) Purge eligible master deliverable videos (NEVER delete thumbnailKey!)
    const candidateDeliverables = await deliverableRepo.find({
      where: {
        workspaceId,
        assetKind: 'VIDEO',
        storageState: 'LOCAL',
        storageKey: Not(IsNull()),
        driveSyncStatus: 'SYNCED',
        driveSyncedAt: LessThanOrEqual(cutoff),
      },
      take: 250,
    });

    const deliverableIds = candidateDeliverables.map((d) => d.id);
    const activeRenderDeliverableIds = new Set<string>();

    if (deliverableIds.length > 0) {
      const relatedVariations = await variationRepo.find({
        where: { workspaceId, deliverableId: In(deliverableIds) },
      });
      for (const variation of relatedVariations) {
        if (
          variation.renderStatus === 'PENDING' ||
          variation.renderStatus === 'QUEUED' ||
          variation.renderStatus === 'RENDERING'
        ) {
          activeRenderDeliverableIds.add(variation.deliverableId);
        }
      }

      const activeHookProjects = await hookProjectRepo.find({
        where: {
          workspaceId,
          deliverableId: In(deliverableIds),
          status: In(['ANALYZING', 'RENDERING']),
        },
      });
      for (const project of activeHookProjects) {
        activeRenderDeliverableIds.add(project.deliverableId);
      }
    }

    for (const deliverable of candidateDeliverables) {
      if (!deliverable.storageKey) continue;

      if (activeRenderDeliverableIds.has(deliverable.id)) {
        skippedActiveRenders += 1;
        continue;
      }

      const hasDirectDriveFile = Boolean(deliverable.driveFileId?.trim());
      if (!hasDirectDriveFile) {
        // Never purge the local master video if there is no direct Drive backup of the master itself
        // (e.g. when standalone 3.mp4 was promoted into 3/v1.mp4 without original.mp4).
        // Keeping the master locally ensures Text-Hook Studio can always re-edit or add v4 later.
        skippedUnsynced += 1;
        continue;
      }

      const driveState = await this.verifyDriveCopy(
        workspaceId,
        deliverable.driveFileId!,
      );
      if (driveState === 'MISSING') {
        skippedUnsynced += 1;
        if (!dryRun) {
          await deliverableRepo.update(
            { workspaceId, id: deliverable.id },
            {
              driveSyncStatus: 'FAILED',
              driveSyncError:
                'Video missing or trashed in Google Drive; local VPS copy preserved.',
            },
          );
        }
        continue;
      }
      if (driveState === 'UNAVAILABLE') {
        skippedUnsynced += 1;
        continue;
      }

      const sizeBytes = Number(deliverable.sizeBytes ?? 0);
      if (!dryRun) {
        // Re-check fresh state immediately before deletion to prevent TOCTOU races with new renders or Drive re-syncs.
        const freshDeliverable = await deliverableRepo.findOne({
          where: {
            workspaceId,
            id: deliverable.id,
            storageState: 'LOCAL',
            driveSyncStatus: 'SYNCED',
          },
        });
        if (
          !freshDeliverable ||
          !freshDeliverable.storageKey ||
          !freshDeliverable.driveFileId?.trim() ||
          !freshDeliverable.driveSyncedAt ||
          freshDeliverable.driveSyncedAt > cutoff
        ) {
          skippedUnsynced += 1;
          continue;
        }
        const liveInFlightVariation = await variationRepo.findOne({
          where: {
            workspaceId,
            deliverableId: deliverable.id,
            renderStatus: In(['PENDING', 'QUEUED', 'RENDERING']),
          },
        });
        if (liveInFlightVariation) {
          skippedActiveRenders += 1;
          continue;
        }

        try {
          await driver.delete({ folderPath: freshDeliverable.storageKey });
        } catch (error) {
          if (!isNotFoundStorageError(error)) {
            this.logger.warn(
              `Skipping VPS purge for deliverable ${deliverable.id}: delete failed (${error instanceof Error ? error.message : String(error)})`,
            );
            continue;
          }
        }

        const updateResult = await deliverableRepo.update(
          {
            workspaceId,
            id: deliverable.id,
            storageState: 'LOCAL',
            driveSyncStatus: 'SYNCED',
          },
          {
            storageState: 'DRIVE_ONLY',
            storageKey: null,
            localFilePurgedAt: now,
          },
        );
        if (updateResult.affected === 0) {
          continue;
        }
      }
      purgedDeliverables += 1;
      if (Number.isFinite(sizeBytes) && sizeBytes > 0) {
        reclaimedBytes += sizeBytes;
      }
    }

    if (!dryRun && (purgedDeliverables > 0 || purgedVariations > 0)) {
      const reclaimedMb = (reclaimedBytes / (1024 * 1024)).toFixed(1);
      await this.dataSource.transaction(async (manager) => {
        await recordOtogrowActivity(manager, {
          workspaceId,
          actorId,
          category: 'DELIVERY',
          action: 'VPS_VIDEO_AUTO_PURGE',
          outcome: 'RECORDED',
          summary: `Auto-cleaned ${purgedDeliverables} deliverable video(s) and ${purgedVariations} variation(s) from VPS (${reclaimedMb} MB reclaimed; archived safely in Google Drive).`,
          sourceType: 'drive-connection',
          sourceId: connection.id,
          changes: [
            {
              field: 'purgedDeliverables',
              before: null,
              after: String(purgedDeliverables),
            },
            {
              field: 'purgedVariations',
              before: null,
              after: String(purgedVariations),
            },
            {
              field: 'reclaimedBytes',
              before: null,
              after: String(reclaimedBytes),
            },
          ],
        });
      });
    }

    return {
      workspaceId,
      dryRun,
      enabled: true,
      retentionHours,
      purgedDeliverables,
      purgedVariations,
      reclaimedBytes,
      skippedActiveRenders,
      skippedUnsynced,
    };
  }
}
