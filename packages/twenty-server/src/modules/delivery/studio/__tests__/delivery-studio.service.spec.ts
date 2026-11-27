import { ForbiddenException } from '@nestjs/common';
import { type DataSource, type EntityManager } from 'typeorm';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryStudioService } from 'src/modules/delivery/studio/delivery-studio.service';
import { DeliveryStudioAssetEntity } from 'src/modules/delivery/studio/entities/delivery-studio-asset.entity';
import { DeliveryStudioJobEntity } from 'src/modules/delivery/studio/entities/delivery-studio-job.entity';
import { DeliveryStudioPresetEntity } from 'src/modules/delivery/studio/entities/delivery-studio-preset.entity';
import { DeliveryStudioProductKitEntity } from 'src/modules/delivery/studio/entities/delivery-studio-product-kit.entity';
import { DeliveryStudioProviderConfigEntity } from 'src/modules/delivery/studio/entities/delivery-studio-provider-config.entity';
import { DeliveryStudioReferenceVideoEntity } from 'src/modules/delivery/studio/entities/delivery-studio-reference-video.entity';

jest.mock(
  'src/modules/otogrow-activity/record-otogrow-activity',
  () => ({
    recordOtogrowActivity: jest.fn().mockResolvedValue(undefined),
  }),
);

jest.mock(
  'src/modules/delivery/knowledge/delivery-knowledge-context',
  () => ({
    readDeliveryKnowledgeContext: jest.fn().mockResolvedValue({
      sources: [
        {
          title: 'Hokuro Brand Guide',
          knowledge: 'Luxury minimalist streetwear from Tokyo, clean editorial tone.',
        },
      ],
    }),
  }),
);

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_ID = '22222222-2222-4222-8222-222222222222';
const USER_WS_ID = '33333333-3333-4333-8333-333333333333';
const COMPANY_ID = '44444444-4444-4444-8444-444444444444';
const PROJECT_ID = '55555555-5555-4555-8555-555555555555';
const REF_VIDEO_ID = '66666666-6666-4666-8666-666666666666';
const KIT_ID = '77777777-7777-4777-8777-777777777777';
const CHAR_ASSET_ID = '88888888-8888-4888-8888-888888888888';
const VID_ASSET_ID = '99999999-9999-4999-8999-999999999999';
const DELIVERABLE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const HOOK_PRESET_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const makeAuth = (): WorkspaceAuthContext =>
  ({
    type: 'user',
    workspace: { id: WORKSPACE_ID },
    workspaceMemberId: MEMBER_ID,
    userWorkspaceId: USER_WS_ID,
  }) as unknown as WorkspaceAuthContext;

const makeRepo = (initial: unknown[] = []) => {
  const store = [...initial];
  const qb = {
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn(async () => store[0] ?? null),
  };
  return {
    store,
    create: jest.fn((data: Record<string, unknown>) => ({
      id: data.id ?? `gen-${Math.random().toString(36).slice(2, 10)}`,
      createdAt: new Date('2026-11-27T00:00:00.000Z'),
      updatedAt: new Date('2026-11-27T00:00:00.000Z'),
      ...data,
    })),
    save: jest.fn(async (entity: Record<string, unknown>) => {
      const saved: Record<string, unknown> = {
        createdAt: new Date('2026-11-27T00:00:00.000Z'),
        updatedAt: new Date('2026-11-27T00:00:00.000Z'),
        ...entity,
      };
      const idx = store.findIndex(
        (item) => (item as Record<string, unknown>).id === saved.id,
      );
      if (idx >= 0) {
        store[idx] = saved;
      } else {
        store.push(saved);
      }
      return saved;
    }),
    findOne: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
      return (
        store.find((item) =>
          Object.entries(where).every(
            ([k, v]) => (item as Record<string, unknown>)[k] === v,
          ),
        ) ?? null
      );
    }),
    findOneByOrFail: jest.fn(async () => ({ id: WORKSPACE_ID })),
    find: jest.fn(async () => [...store]),
    count: jest.fn(async () => store.length),
    update: jest.fn(async () => ({ affected: 1 })),
    createQueryBuilder: jest.fn(() => qb),
  };
};

describe('DeliveryStudioService', () => {
  const buildHarness = (actorRole = { isManager: true, isAdmin: true }) => {
    const repos = new Map<unknown, ReturnType<typeof makeRepo>>([
      [WorkspaceEntity, makeRepo([{ id: WORKSPACE_ID }])],
      [DeliveryStudioProviderConfigEntity, makeRepo()],
      [DeliveryStudioPresetEntity, makeRepo()],
      [
        DeliveryStudioReferenceVideoEntity,
        makeRepo([
          {
            id: REF_VIDEO_ID,
            workspaceId: WORKSPACE_ID,
            companyId: COMPANY_ID,
            projectId: PROJECT_ID,
            title: 'Viral Walk Hook Ref',
            notes: 'Slow zoom tracking walk in sunlit street',
            mediaMeta: { durationSec: 8 },
            storageKey: 'ref/1.mp4',
            mimeType: 'video/mp4',
            sizeBytes: '1000',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      ],
      [
        DeliveryStudioProductKitEntity,
        makeRepo([
          {
            id: KIT_ID,
            workspaceId: WORKSPACE_ID,
            companyId: COMPANY_ID,
            projectId: PROJECT_ID,
            name: 'Hokuro Heavyweight Jacket',
            notes: 'Matte black Japanese nylon shell with matte zip',
            assetsJson: [],
            archived: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      ],
      [
        DeliveryStudioAssetEntity,
        makeRepo([
          {
            id: CHAR_ASSET_ID,
            workspaceId: WORKSPACE_ID,
            companyId: COMPANY_ID,
            projectId: PROJECT_ID,
            kind: 'CHARACTER_SHEET',
            title: 'Hokuro 4-Angle Talent',
            modelKey: 'nano-banana-2.1',
            providerUsed: 'wavespeed',
            storageKey: 'out/char.png',
            mimeType: 'image/png',
            sizeBytes: '500',
            mediaMeta: {},
            approved: true,
            archived: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: VID_ASSET_ID,
            workspaceId: WORKSPACE_ID,
            companyId: COMPANY_ID,
            projectId: PROJECT_ID,
            kind: 'GENERATED_VIDEO',
            title: 'Hokuro Street Walk V1',
            modelKey: 'seedance-2.5',
            providerUsed: 'wavespeed',
            storageKey: 'out/vid1.mp4',
            thumbnailKey: 'out/vid1.jpg',
            mimeType: 'video/mp4',
            sizeBytes: '45000',
            mediaMeta: { durationSec: 8.5, width: 1080, height: 1920 },
            approved: false,
            deliverableId: null,
            hookProjectId: null,
            archived: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      ],
      [DeliveryStudioJobEntity, makeRepo()],
    ]);

    const getRepository = jest.fn((entity: unknown) => {
      const repo = repos.get(entity);
      if (!repo) {
        const created = makeRepo();
        repos.set(entity, created);
        return created;
      }
      return repo;
    });

    const manager = { getRepository } as unknown as EntityManager;
    const dataSource = {
      getRepository,
      transaction: jest.fn(async (fn: (m: EntityManager) => Promise<unknown>) =>
        fn(manager),
      ),
    } as unknown as DataSource;

    const delivery = {
      actor: jest.fn().mockResolvedValue(actorRole),
    };
    const companies = {
      list: jest.fn().mockResolvedValue({ companies: [] }),
    };
    const encryption = {
      encryptVersioned: jest.fn((plain: string) => `enc:v2:${plain}`),
      decryptVersionedOrThrow: jest.fn((enc: string) =>
        enc.replace(/^enc:v2:/, ''),
      ),
    };
    const twentyConfig = {
      get: jest.fn(() => 'test-app-secret-for-studio'),
    };
    const storage = {
      getCurrentDriver: jest.fn(),
    };
    const probe = {
      probeMedia: jest.fn(),
      extractVideoThumbnail: jest.fn(),
    };
    const router = {
      verifyProviderKey: jest.fn().mockResolvedValue({
        ok: true,
        message: 'Connected',
      }),
      execute: jest.fn(),
      downloadOutput: jest.fn(),
    };
    const deliverables = {
      createUploadedDeliverable: jest.fn().mockResolvedValue({
        id: DELIVERABLE_ID,
      }),
    };
    const videoHooks = {
      analyzeContext: jest.fn().mockResolvedValue({ id: 'hp-1' }),
      generateSuggestions: jest.fn().mockResolvedValue({
        id: 'hp-1',
        deliverableId: DELIVERABLE_ID,
        aiSuggestions: [
          {
            hookText: 'Stop scrolling if your jacket fits boxy',
            angleTag: 'Curiosity',
            rationale: 'Matches opening jacket close-up',
          },
        ],
        variations: [],
      }),
      saveProject: jest.fn(async (_auth, payload) => ({
        id: 'hp-1',
        deliverableId: payload.deliverableId,
        variations: payload.variations.map(
          (v: { hookText: string; variationNumber: number }, idx: number) => ({
            id: `var-${idx + 1}`,
            ...v,
          }),
        ),
      })),
      queueRender: jest.fn(async (_auth, payload) => ({
        id: 'hp-1',
        deliverableId: payload.deliverableId,
        status: 'RENDERING',
        variations: payload.variationIds.map((vid: string, idx: number) => ({
          id: vid,
          variationNumber: idx + 1,
          renderStatus: 'QUEUED',
        })),
      })),
      getOrCreateProject: jest.fn().mockResolvedValue({ id: 'hp-1' }),
    };
    const aiQueue = {
      add: jest.fn().mockResolvedValue(undefined),
    };
    const driveService = {
      enqueueDeliverableSyncIfConnected: jest.fn().mockResolvedValue(true),
    };

    const service = new DeliveryStudioService(
      dataSource,
      delivery as never,
      companies as never,
      encryption as never,
      twentyConfig as never,
      storage as never,
      probe as never,
      router as never,
      deliverables as never,
      videoHooks as never,
      aiQueue as never,
      driveService as never,
    );

    return {
      service,
      repos,
      encryption,
      deliverables,
      videoHooks,
      aiQueue,
      driveService,
    };
  };

  it('encrypts provider API keys, returns only last4, and blocks non-managers', async () => {
    const { service, encryption } = buildHarness({
      isManager: true,
      isAdmin: false,
    });

    const dto = await service.saveProviderConfig(makeAuth(), {
      wavespeedApiKey: 'ws_live_secret_token_9876',
      kieApiKey: 'kie_live_secret_token_4321',
      defaultRoutingMode: 'AUTO_FAILOVER',
      defaultImageModel: 'nano-banana-pro',
      defaultVideoModel: 'seedance-2.5',
    });

    expect(encryption.encryptVersioned).toHaveBeenCalledTimes(2);
    expect(dto.wavespeedConfigured).toBe(true);
    expect(dto.wavespeedKeyLast4).toBe('9876');
    expect(dto.kieConfigured).toBe(true);
    expect(dto.kieKeyLast4).toBe('4321');
    expect(JSON.stringify(dto)).not.toContain('ws_live_secret_token_9876');
    expect(JSON.stringify(dto)).not.toContain('kie_live_secret_token_4321');

    const nonManagerHarness = buildHarness({
      isManager: false,
      isAdmin: false,
    });
    await expect(
      nonManagerHarness.service.saveProviderConfig(makeAuth(), {
        wavespeedApiKey: 'ws_unauthorized_1234',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('supports dynamic 4-angle SEPARATE_FRAMES character sheets and variable compilation', async () => {
    const { service, aiQueue } = buildHarness();

    const result = await service.queueCharacterSheetGeneration(makeAuth(), {
      companyId: COMPANY_ID,
      projectId: PROJECT_ID,
      productKitId: KIT_ID,
      modelKey: 'nano-banana-2.1',
      angleLayout: 'SEPARATE_FRAMES',
      angles: [
        'Front Full-Body',
        'Back Full-Body',
        'Left 3/4 Profile',
        'Garment Detail Close-Up',
      ],
      masterPrompt:
        'Editorial model wearing {{product_name}} ({{angle_count}} angles: {{angles}}). Talent: {{talent}}.',
      talentDescription: 'Japanese male streetwear model, 24',
    });

    expect(result.jobs).toHaveLength(4);
    expect(aiQueue.add).toHaveBeenCalledTimes(4);
    expect(result.jobs[0].title).toContain('Front Full-Body');
    expect(result.jobs[3].title).toContain('Garment Detail Close-Up');
  });

  it('queues multi-model Video Compare jobs sharing a single batchId', async () => {
    const { service, aiQueue } = buildHarness();

    const res = await service.queueVideoGeneration(makeAuth(), {
      companyId: COMPANY_ID,
      projectId: PROJECT_ID,
      referenceVideoId: REF_VIDEO_ID,
      characterAssetId: CHAR_ASSET_ID,
      productKitId: KIT_ID,
      modelKeys: ['seedance-2.5', 'wan-3.0-prime'],
      environmentOverride: 'Neon rain-slicked Tokyo crosswalk at dusk',
      resolution: '1080p',
    });

    expect(res.batchId).toBeTruthy();
    expect(res.jobs).toHaveLength(2);
    expect(res.jobs[0].modelKey).toBe('seedance-2.5');
    expect(res.jobs[1].modelKey).toBe('wan-3.0-prime');
    expect(res.jobs[0].batchId).toBe(res.batchId);
    expect(aiQueue.add).toHaveBeenCalledTimes(2);
  });

  it('queues an N-item Batch Matrix and sums estimated USD cost', async () => {
    const { service } = buildHarness();

    const batch = await service.queueBatchVideoGeneration(makeAuth(), {
      companyId: COMPANY_ID,
      projectId: PROJECT_ID,
      modelKey: 'seedance-2.5-flash',
      resolution: '720p',
      items: [
        {
          referenceVideoId: REF_VIDEO_ID,
          characterAssetId: CHAR_ASSET_ID,
          productKitId: KIT_ID,
          title: 'Batch Cut 1',
        },
        {
          referenceVideoId: REF_VIDEO_ID,
          characterAssetId: CHAR_ASSET_ID,
          productKitId: KIT_ID,
          title: 'Batch Cut 2',
          environmentOverride: 'Sunlit concrete loft',
        },
        {
          referenceVideoId: REF_VIDEO_ID,
          characterAssetId: CHAR_ASSET_ID,
          productKitId: KIT_ID,
          title: 'Batch Cut 3',
        },
      ],
    });

    expect(batch.count).toBe(3);
    expect(batch.batchId).toBeTruthy();
    expect(Number(batch.totalEstimatedCostUsd)).toBeGreaterThan(0);
    expect(batch.jobs.every((j) => j.batchId === batch.batchId)).toBe(true);
  });

  it('bridges generated AI video into Video-Assessed Dynamic N Text-Hooks and Drive sync', async () => {
    const { service, repos, deliverables, videoHooks, driveService } =
      buildHarness();

    // Seed a custom saved Text-Hook Master Prompt preset with fed-in examples
    const presetRepo = repos.get(DeliveryStudioPresetEntity)!;
    presetRepo.store.push({
      id: HOOK_PRESET_ID,
      workspaceId: WORKSPACE_ID,
      kind: 'TEXT_HOOK',
      name: 'Streetwear Scroll-Stoppers',
      masterPrompt: 'Write punchy 5-word Tokyo streetwear hooks.',
      examplesJson: [
        'Nobody makes heavyweight nylon like this anymore.',
        'POV: You finally found the perfect boxy silhouette.',
      ],
      configJson: { platform: 'TIKTOK', funnelStage: 'COLD' },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Step 1: Assess video + suggest hooks using saved master prompt & examples
    const suggested = await service.suggestHooksForVideo(makeAuth(), {
      assetId: VID_ASSET_ID,
      hookPresetId: HOOK_PRESET_ID,
      suggestionCount: 6,
    });

    expect(deliverables.createUploadedDeliverable).toHaveBeenCalledTimes(1);
    expect(videoHooks.analyzeContext).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ deliverableId: DELIVERABLE_ID }),
    );
    expect(videoHooks.generateSuggestions).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        deliverableId: DELIVERABLE_ID,
        creativeInput: expect.objectContaining({
          masterPrompt: 'Write punchy 5-word Tokyo streetwear hooks.',
          exampleHooks: [
            'Nobody makes heavyweight nylon like this anymore.',
            'POV: You finally found the perfect boxy silhouette.',
          ],
          variationCount: 6,
        }),
      }),
    );
    expect(suggested.deliverableId).toBe(DELIVERABLE_ID);

    // Step 2: User selects 4 dynamic hooks -> renders exact 4 variations + Drive sync
    const rendered = await service.renderSelectedHooksForVideo(makeAuth(), {
      assetId: VID_ASSET_ID,
      stylePreset: 'TIKTOK_PILL',
      syncToDrive: true,
      hooks: [
        { hookText: 'Hook variation 1' },
        { hookText: 'Hook variation 2' },
        { hookText: 'Hook variation 3' },
        { hookText: 'Hook variation 4' },
      ],
    });

    expect(videoHooks.saveProject).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        deliverableId: DELIVERABLE_ID,
        variations: expect.arrayContaining([
          expect.objectContaining({ variationNumber: 1, hookText: 'Hook variation 1' }),
          expect.objectContaining({ variationNumber: 4, hookText: 'Hook variation 4' }),
        ]),
      }),
    );
    expect(videoHooks.queueRender).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        variationIds: ['var-1', 'var-2', 'var-3', 'var-4'],
      }),
    );
    expect(driveService.enqueueDeliverableSyncIfConnected).toHaveBeenCalledWith(
      WORKSPACE_ID,
      DELIVERABLE_ID,
    );
    expect(rendered.hookProject.variations).toHaveLength(4);
  });

  it('publishes a self-describing agentic capabilities manifest', () => {
    const { service } = buildHarness();
    const manifest = service.getAgentCapabilitiesManifest();

    expect(manifest.service).toBe('otogrow-ai-studio');
    expect(manifest.basePath).toBe('/portal/delivery-studio/agent');
    expect(manifest.models.some((m) => m.key === 'nano-banana-2.1')).toBe(true);
    expect(manifest.models.some((m) => m.key === 'seedance-2.5')).toBe(true);
    expect(manifest.models.some((m) => m.key === 'magi-2')).toBe(true);
    expect(manifest.models.some((m) => m.key === 'wan-3.0-prime')).toBe(true);
    expect(
      manifest.endpoints.some(
        (e) => e.path === '/portal/delivery-studio/agent/videos/:assetId/hooks/render-and-sync',
      ),
    ).toBe(true);
  });
});
