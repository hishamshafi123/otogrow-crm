import { DeliveryDeliverableEntity } from 'src/modules/delivery/deliverables/entities/delivery-deliverable.entity';
import { DeliveryDriveConnectionEntity } from 'src/modules/delivery/deliverables/entities/delivery-drive-connection.entity';
import { DeliveryVideoHookProjectEntity } from 'src/modules/delivery/deliverables/entities/delivery-video-hook-project.entity';
import { DeliveryVideoHookVariationEntity } from 'src/modules/delivery/deliverables/entities/delivery-video-hook-variation.entity';
import { DeliveryVpsCleanupService } from 'src/modules/delivery/deliverables/delivery-vps-cleanup.service';

describe('DeliveryVpsCleanupService (24-hour post-Drive-sync auto-cleanup)', () => {
  const workspaceId = '11111111-1111-4111-8111-111111111111';
  const now = new Date('2026-11-26T12:00:00.000Z');
  const olderThan24h = new Date('2026-11-25T10:00:00.000Z');

  const createHarness = (opts: {
    connection: Partial<DeliveryDriveConnectionEntity> | null;
    candidateDeliverables?: Partial<DeliveryDeliverableEntity>[];
    candidateVariations?: Partial<DeliveryVideoHookVariationEntity>[];
    relatedVariations?: Partial<DeliveryVideoHookVariationEntity>[];
    activeHookProjects?: Partial<DeliveryVideoHookProjectEntity>[];
    driveFileStatus?: 'ACTIVE' | 'MISSING' | 'UNAVAILABLE';
    deleteError?: Error | null;
  }) => {
    const deletedPaths: string[] = [];
    const updatedDeliverables: Array<{ where: unknown; patch: unknown }> = [];
    const updatedVariations: Array<{ where: unknown; patch: unknown }> = [];

    const connectionRepo = {
      findOne: jest.fn().mockResolvedValue(opts.connection),
    };
    const deliverableRepo = {
      find: jest.fn().mockResolvedValue(opts.candidateDeliverables ?? []),
      findOne: jest.fn().mockImplementation(async ({ where }) =>
        (opts.candidateDeliverables ?? []).find((d) => d.id === where.id) ??
        null,
      ),
      update: jest.fn().mockImplementation(async (where, patch) => {
        updatedDeliverables.push({ where, patch });
        return { affected: 1 };
      }),
    };
    let variationFindCall = 0;
    const variationRepo = {
      find: jest.fn().mockImplementation(async () => {
        variationFindCall += 1;
        return variationFindCall === 1
          ? (opts.candidateVariations ?? [])
          : (opts.relatedVariations ?? []);
      }),
      findOne: jest.fn().mockImplementation(async ({ where }) => {
        if (where.id) {
          return (
            (opts.candidateVariations ?? []).find((v) => v.id === where.id) ??
            null
          );
        }
        return (
          (opts.relatedVariations ?? []).find(
            (v) =>
              v.deliverableId === where.deliverableId &&
              ['PENDING', 'QUEUED', 'RENDERING'].includes(
                String(v.renderStatus),
              ),
          ) ?? null
        );
      }),
      update: jest.fn().mockImplementation(async (where, patch) => {
        updatedVariations.push({ where, patch });
        return { affected: 1 };
      }),
    };
    const hookProjectRepo = {
      find: jest.fn().mockResolvedValue(opts.activeHookProjects ?? []),
    };

    const dataSource = {
      getRepository: jest.fn().mockImplementation((entity) => {
        if (entity === DeliveryDriveConnectionEntity) return connectionRepo;
        if (entity === DeliveryDeliverableEntity) return deliverableRepo;
        if (entity === DeliveryVideoHookVariationEntity) return variationRepo;
        if (entity === DeliveryVideoHookProjectEntity) return hookProjectRepo;
        throw new Error(`Unexpected repo: ${String(entity)}`);
      }),
      transaction: jest.fn().mockImplementation(async (fn) =>
        fn({
          queryRunner: { isTransactionActive: true },
          query: jest.fn().mockResolvedValue([]),
          getRepository: jest.fn().mockReturnValue({
            insert: jest.fn().mockResolvedValue({}),
            save: jest.fn().mockResolvedValue({}),
            create: jest.fn().mockImplementation((x) => x),
            findOneByOrFail: jest.fn().mockResolvedValue({
              id: workspaceId,
              databaseSchema: 'workspace_test',
            }),
          }),
        }),
      ),
    };

    const storage = {
      getCurrentDriver: jest.fn().mockReturnValue({
        delete: jest.fn().mockImplementation(async ({ folderPath }) => {
          if (opts.deleteError) {
            throw opts.deleteError;
          }
          deletedPaths.push(folderPath);
        }),
      }),
    };

    const delivery = {
      actor: jest.fn().mockResolvedValue({ isManager: true }),
    };

    const driveService = {
      isDriveFileActive: jest
        .fn()
        .mockResolvedValue(opts.driveFileStatus ?? 'ACTIVE'),
    };

    const service = new DeliveryVpsCleanupService(
      dataSource as never,
      storage as never,
      delivery as never,
      driveService as never,
    );

    return {
      service,
      deletedPaths,
      updatedDeliverables,
      updatedVariations,
    };
  };

  it('purges local video after 24h post-Drive-sync while keeping thumbnail intact', async () => {
    const { service, deletedPaths, updatedDeliverables, updatedVariations } =
      createHarness({
        connection: {
          id: 'conn-1',
          workspaceId,
          autoPurgeVpsEnabled: true,
          autoPurgeVpsAfterHours: 24,
        },
        candidateDeliverables: [
          {
            id: 'deliv-1',
            workspaceId,
            assetKind: 'VIDEO',
            storageState: 'LOCAL',
            storageKey: 'ws/delivery-deliverables/c1/video1.mp4',
            thumbnailKey: 'ws/delivery-deliverables/c1/video1.thumb.jpg',
            sizeBytes: '52428800',
            driveSyncStatus: 'SYNCED',
            driveFileId: 'drive-file-1',
            driveSyncedAt: olderThan24h,
            hasVariations: false,
          },
        ],
        candidateVariations: [
          {
            id: 'var-1',
            workspaceId,
            deliverableId: 'deliv-other',
            renderStatus: 'READY',
            storageState: 'LOCAL',
            outputStorageKey: 'ws/delivery-deliverables/c1/v1.mp4',
            thumbnailKey: 'ws/delivery-deliverables/c1/v1.thumb.jpg',
            outputSizeBytes: '10485760',
            driveSyncStatus: 'SYNCED',
            driveFileId: 'drive-var-1',
            driveSyncedAt: olderThan24h,
          },
        ],
      });

    const result = await service.purgeEligibleVpsVideosForWorkspace(
      workspaceId,
      { now },
    );

    expect(result.purgedDeliverables).toBe(1);
    expect(result.purgedVariations).toBe(1);
    expect(result.reclaimedBytes).toBe(52428800 + 10485760);
    expect(deletedPaths).toEqual([
      'ws/delivery-deliverables/c1/v1.mp4',
      'ws/delivery-deliverables/c1/video1.mp4',
    ]);
    // Thumbnail keys must NEVER be deleted
    expect(deletedPaths.some((p) => p.includes('.thumb.jpg'))).toBe(false);
    expect(updatedDeliverables[0]?.patch).toMatchObject({
      storageState: 'DRIVE_ONLY',
      storageKey: null,
    });
    expect(updatedVariations[0]?.patch).toMatchObject({
      storageState: 'DRIVE_ONLY',
      outputStorageKey: null,
    });
  });

  it('skips deliverable master when an active render job is QUEUED or RENDERING', async () => {
    const { service, deletedPaths, updatedDeliverables } = createHarness({
      connection: {
        id: 'conn-1',
        workspaceId,
        autoPurgeVpsEnabled: true,
        autoPurgeVpsAfterHours: 24,
      },
      candidateDeliverables: [
        {
          id: 'deliv-rendering',
          workspaceId,
          assetKind: 'VIDEO',
          storageState: 'LOCAL',
          storageKey: 'ws/delivery-deliverables/c1/master.mp4',
          sizeBytes: '40000000',
          driveSyncStatus: 'SYNCED',
          driveFileId: 'drive-master-1',
          driveSyncedAt: olderThan24h,
          hasVariations: true,
        },
      ],
      relatedVariations: [
        {
          id: 'var-active',
          deliverableId: 'deliv-rendering',
          renderStatus: 'RENDERING',
        },
      ],
    });

    const result = await service.purgeEligibleVpsVideosForWorkspace(
      workspaceId,
      { now },
    );

    expect(result.purgedDeliverables).toBe(0);
    expect(result.skippedActiveRenders).toBe(1);
    expect(deletedPaths).toHaveLength(0);
    expect(updatedDeliverables).toHaveLength(0);
  });

  it('never purges master video when driveFileId is null, even if all variations are synced for 24h', async () => {
    const { service, deletedPaths, updatedDeliverables } = createHarness({
      connection: {
        id: 'conn-1',
        workspaceId,
        autoPurgeVpsEnabled: true,
        autoPurgeVpsAfterHours: 24,
      },
      candidateDeliverables: [
        {
          id: 'deliv-var-only',
          workspaceId,
          assetKind: 'VIDEO',
          storageState: 'LOCAL',
          storageKey: 'ws/delivery-deliverables/c1/master.mp4',
          sizeBytes: '40000000',
          driveSyncStatus: 'SYNCED',
          driveFileId: null,
          driveFolderId: 'drive-folder-3',
          driveSyncedAt: olderThan24h,
          hasVariations: true,
        },
      ],
      relatedVariations: [
        {
          id: 'var-synced-old',
          deliverableId: 'deliv-var-only',
          renderStatus: 'READY',
          driveSyncStatus: 'SYNCED',
          driveFileId: 'drive-var-old',
          driveSyncedAt: olderThan24h,
        },
      ],
    });

    const result = await service.purgeEligibleVpsVideosForWorkspace(
      workspaceId,
      { now },
    );

    expect(result.purgedDeliverables).toBe(0);
    expect(result.skippedUnsynced).toBe(1);
    expect(deletedPaths).toHaveLength(0);
    expect(updatedDeliverables).toHaveLength(0);
  });

  it('preserves local VPS file and flags driveSyncStatus FAILED if Drive file was trashed/deleted', async () => {
    const { service, deletedPaths, updatedDeliverables } = createHarness({
      connection: {
        id: 'conn-1',
        workspaceId,
        autoPurgeVpsEnabled: true,
        autoPurgeVpsAfterHours: 24,
      },
      driveFileStatus: 'MISSING',
      candidateDeliverables: [
        {
          id: 'deliv-missing-in-drive',
          workspaceId,
          assetKind: 'VIDEO',
          storageState: 'LOCAL',
          storageKey: 'ws/delivery-deliverables/c1/safe.mp4',
          sizeBytes: '30000000',
          driveSyncStatus: 'SYNCED',
          driveFileId: 'drive-deleted-1',
          driveSyncedAt: olderThan24h,
          hasVariations: false,
        },
      ],
    });

    const result = await service.purgeEligibleVpsVideosForWorkspace(
      workspaceId,
      { now },
    );

    expect(result.purgedDeliverables).toBe(0);
    expect(result.skippedUnsynced).toBe(1);
    expect(deletedPaths).toHaveLength(0);
    expect(updatedDeliverables[0]?.patch).toMatchObject({
      driveSyncStatus: 'FAILED',
    });
  });

  it('does not mark DRIVE_ONLY when storage delete fails with a non-ENOENT I/O error', async () => {
    const { service, updatedDeliverables } = createHarness({
      connection: {
        id: 'conn-1',
        workspaceId,
        autoPurgeVpsEnabled: true,
        autoPurgeVpsAfterHours: 24,
      },
      deleteError: new Error('EACCES: permission denied'),
      candidateDeliverables: [
        {
          id: 'deliv-io-err',
          workspaceId,
          assetKind: 'VIDEO',
          storageState: 'LOCAL',
          storageKey: 'ws/delivery-deliverables/c1/locked.mp4',
          sizeBytes: '15000000',
          driveSyncStatus: 'SYNCED',
          driveFileId: 'drive-ok-1',
          driveSyncedAt: olderThan24h,
          hasVariations: false,
        },
      ],
    });

    const result = await service.purgeEligibleVpsVideosForWorkspace(
      workspaceId,
      { now },
    );

    expect(result.purgedDeliverables).toBe(0);
    expect(updatedDeliverables).toHaveLength(0);
  });

  it('supports dryRun without deleting files or mutating records', async () => {
    const { service, deletedPaths, updatedDeliverables } = createHarness({
      connection: {
        id: 'conn-1',
        workspaceId,
        autoPurgeVpsEnabled: true,
        autoPurgeVpsAfterHours: 24,
      },
      candidateDeliverables: [
        {
          id: 'deliv-dry',
          workspaceId,
          assetKind: 'VIDEO',
          storageState: 'LOCAL',
          storageKey: 'ws/delivery-deliverables/c1/dry.mp4',
          sizeBytes: '20000000',
          driveSyncStatus: 'SYNCED',
          driveFileId: 'drive-dry-1',
          driveSyncedAt: olderThan24h,
          hasVariations: false,
        },
      ],
    });

    const result = await service.purgeEligibleVpsVideosForWorkspace(
      workspaceId,
      { dryRun: true, now },
    );

    expect(result.dryRun).toBe(true);
    expect(result.purgedDeliverables).toBe(1);
    expect(result.reclaimedBytes).toBe(20000000);
    expect(deletedPaths).toHaveLength(0);
    expect(updatedDeliverables).toHaveLength(0);
  });

  it('returns zero counts when autoPurgeVpsEnabled is disabled', async () => {
    const { service, deletedPaths } = createHarness({
      connection: {
        id: 'conn-1',
        workspaceId,
        autoPurgeVpsEnabled: false,
        autoPurgeVpsAfterHours: 24,
      },
    });

    const result = await service.purgeEligibleVpsVideosForWorkspace(
      workspaceId,
      { now },
    );

    expect(result.enabled).toBe(false);
    expect(result.purgedDeliverables).toBe(0);
    expect(deletedPaths).toHaveLength(0);
  });
});
