import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { DataSource, type EntityManager, In } from 'typeorm';
import { v4 } from 'uuid';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { FileStorageDriverFactory } from 'src/engine/core-modules/file-storage/file-storage-driver.factory';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { type EncryptedString } from 'src/engine/core-modules/secret-encryption/branded-strings/encrypted-string.type';
import { type PlaintextString } from 'src/engine/core-modules/secret-encryption/branded-strings/plaintext-string.type';
import { SecretEncryptionService } from 'src/engine/core-modules/secret-encryption/secret-encryption.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import {
  currentMonthKey,
  isUuidString,
} from 'src/modules/delivery/deliverables/delivery-deliverables.policy';
import { DeliveryDeliverablesService } from 'src/modules/delivery/deliverables/delivery-deliverables.service';
import { DeliveryDriveService } from 'src/modules/delivery/deliverables/delivery-drive.service';
import { DeliveryMediaProbeService } from 'src/modules/delivery/deliverables/delivery-media-probe.service';
import {
  DeliveryVideoHooksService,
  type HookProjectDTO,
} from 'src/modules/delivery/deliverables/delivery-video-hooks.service';
import {
  DEFAULT_HOOK_STYLE,
  HOOK_STYLE_PRESETS,
  hookStyleConfigSchema,
} from 'src/modules/delivery/deliverables/delivery-video-hooks.policy';
import {
  DeliveryDeliverableEntity,
  type DeliverableMediaMeta,
} from 'src/modules/delivery/deliverables/entities/delivery-deliverable.entity';
import { type HookStyleConfig } from 'src/modules/delivery/deliverables/entities/delivery-video-hook-project.entity';
import {
  normalizeClientRoster,
  normalizeClientTags,
  resolveEffectiveClientCompanyIds,
} from 'src/modules/delivery/clients/delivery-client-hub.policy';
import { DeliveryOperationsEntity } from 'src/modules/delivery/entities/delivery-operations.entity';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { readDeliveryKnowledgeContext } from 'src/modules/delivery/knowledge/delivery-knowledge-context';
import { DeliveryClientSetupSourceService } from 'src/modules/delivery/onboarding/delivery-client-setup-source.service';
import {
  newDeliveryOperations,
  type StudioHookDefaultSetting,
} from 'src/modules/delivery/operations/delivery-operations.types';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';
import {
  compileStudioPromptTemplate,
  estimateStudioJobCostUsd,
  getStudioModelSpec,
  STARTER_STUDIO_PRESETS,
  STUDIO_MODEL_CATALOG,
} from 'src/modules/delivery/studio/delivery-studio-catalog';
import {
  batchGenerateVideosSchema,
  generateCharacterSheetSchema,
  generateVideoSchema,
  importProductFromUrlSchema,
  renderSelectedHooksForStudioAssetSchema,
  saveProviderConfigSchema,
  saveStudioHookDefaultSchema,
  saveStudioVideoToDriveSchema,
  signStudioMediaToken,
  suggestHooksForStudioAssetSchema,
  updateProductAssetsSchema,
  upsertProductKitSchema,
  upsertStudioPresetSchema,
} from 'src/modules/delivery/studio/delivery-studio.policy';
import { scrapeProductImagesFromUrl } from 'src/modules/delivery/studio/studio-product-url-scraper';
import {
  DeliveryStudioProviderRouterService,
  StudioProviderCallError,
  type StudioProviderCredentials,
  type StudioProviderId,
  type StudioStageableMediaFile,
} from 'src/modules/delivery/studio/delivery-studio-provider-router.service';
import {
  DeliveryStudioAssetEntity,
  type StudioAssetKind,
} from 'src/modules/delivery/studio/entities/delivery-studio-asset.entity';
import {
  DeliveryStudioJobEntity,
  type StudioProviderAttemptRecord,
} from 'src/modules/delivery/studio/entities/delivery-studio-job.entity';
import {
  DeliveryStudioPresetEntity,
  type StudioPresetConfig,
  type StudioPresetKind,
} from 'src/modules/delivery/studio/entities/delivery-studio-preset.entity';
import {
  DeliveryStudioProductKitEntity,
  type StudioProductAssetItem,
} from 'src/modules/delivery/studio/entities/delivery-studio-product-kit.entity';
import {
  DeliveryStudioProviderConfigEntity,
  type StudioRoutingMode,
} from 'src/modules/delivery/studio/entities/delivery-studio-provider-config.entity';
import {
  DeliveryStudioReferenceVideoEntity,
  type StagedProviderUrlMap,
} from 'src/modules/delivery/studio/entities/delivery-studio-reference-video.entity';

export const DELIVERY_STUDIO_JOB = 'delivery-ai-studio-generation';

const readStreamToBuffer = async (stream: Readable): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
  }
  return Buffer.concat(chunks);
};

const isFreshStagedUrl = (
  staged: StagedProviderUrlMap | undefined,
  provider: StudioProviderId,
): string | null => {
  const entry = staged?.[provider];
  if (!entry?.url || !entry.expiresAt) return null;
  const expiresMs = Date.parse(entry.expiresAt);
  if (!Number.isFinite(expiresMs) || expiresMs <= Date.now() + 60_000) {
    return null;
  }
  return entry.url;
};

const extensionForMime = (mimeType: string): string => {
  if (mimeType === 'video/quicktime') return 'mov';
  if (mimeType === 'video/webm') return 'webm';
  if (mimeType.startsWith('video/')) return 'mp4';
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  return 'png';
};

export type StudioProviderConfigDTO = {
  wavespeedConfigured: boolean;
  wavespeedKeyLast4: string | null;
  wavespeedEnabled: boolean;
  wavespeedVerifiedAt: string | null;
  wavespeedLastError: string | null;
  kieConfigured: boolean;
  kieKeyLast4: string | null;
  kieEnabled: boolean;
  kieVerifiedAt: string | null;
  kieLastError: string | null;
  defaultRoutingMode: StudioRoutingMode;
  defaultImageModel: string;
  defaultVideoModel: string;
  maxConcurrentJobs: number;
  updatedAt: string | null;
};

@Injectable()
export class DeliveryStudioService {
  private readonly logger = new Logger(DeliveryStudioService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly delivery: DeliveryService,
    private readonly companies: DeliveryClientSetupSourceService,
    private readonly encryption: SecretEncryptionService,
    private readonly twentyConfig: TwentyConfigService,
    private readonly storage: FileStorageDriverFactory,
    private readonly probe: DeliveryMediaProbeService,
    private readonly router: DeliveryStudioProviderRouterService,
    private readonly deliverables: DeliveryDeliverablesService,
    private readonly videoHooks: DeliveryVideoHooksService,
    @InjectMessageQueue(MessageQueue.aiQueue)
    private readonly aiQueue: MessageQueueService,
    @Optional() private readonly driveService?: DeliveryDriveService,
  ) {}

  private identity(auth: WorkspaceAuthContext) {
    if (auth.type !== 'user' || !auth.workspaceMemberId) {
      throw new ForbiddenException('Sign in to access AI Studio.');
    }
    return {
      workspaceId: auth.workspace.id,
      memberId: auth.workspaceMemberId,
      userWorkspaceId: auth.userWorkspaceId,
    };
  }

  private async resolveActor(
    manager: EntityManager,
    id: { workspaceId: string; memberId: string; userWorkspaceId: string },
  ) {
    const workspace = await manager
      .getRepository(WorkspaceEntity)
      .findOneByOrFail({ id: id.workspaceId });
    return this.delivery.actor(
      workspace,
      id.memberId,
      id.userWorkspaceId,
      manager,
    );
  }

  private signedMediaPath(
    workspaceId: string,
    kind:
      | 'ref-video'
      | 'ref-thumb'
      | 'product-asset'
      | 'studio-asset'
      | 'studio-thumb'
      | 'preset-thumb',
    id: string,
    subId?: string,
  ): string {
    const secret = this.twentyConfig.get('APP_SECRET') || '';
    const token = signStudioMediaToken(secret, {
      w: workspaceId,
      t: kind,
      id,
      ...(subId ? { subId } : {}),
    });
    const base = `/delivery-studio/media/${kind}/${encodeURIComponent(id)}`;
    return subId
      ? `${base}/${encodeURIComponent(subId)}?token=${encodeURIComponent(token)}`
      : `${base}?token=${encodeURIComponent(token)}`;
  }

  private mapProviderConfig(
    row: DeliveryStudioProviderConfigEntity | null,
  ): StudioProviderConfigDTO {
    return {
      wavespeedConfigured: Boolean(row?.wavespeedKeyLast4),
      wavespeedKeyLast4: row?.wavespeedKeyLast4 ?? null,
      wavespeedEnabled: row?.wavespeedEnabled ?? true,
      wavespeedVerifiedAt: row?.wavespeedVerifiedAt
        ? row.wavespeedVerifiedAt.toISOString()
        : null,
      wavespeedLastError: row?.wavespeedLastError ?? null,
      kieConfigured: Boolean(row?.kieKeyLast4),
      kieKeyLast4: row?.kieKeyLast4 ?? null,
      kieEnabled: row?.kieEnabled ?? true,
      kieVerifiedAt: row?.kieVerifiedAt ? row.kieVerifiedAt.toISOString() : null,
      kieLastError: row?.kieLastError ?? null,
      defaultRoutingMode: row?.defaultRoutingMode ?? 'AUTO_FAILOVER',
      defaultImageModel: row?.defaultImageModel ?? 'nano-banana-2.1',
      defaultVideoModel: row?.defaultVideoModel ?? 'seedance-2.5',
      maxConcurrentJobs: row?.maxConcurrentJobs ?? 4,
      updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
    };
  }

  private mapReferenceVideo(row: DeliveryStudioReferenceVideoEntity) {
    return {
      id: row.id,
      companyId: row.companyId,
      projectId: row.projectId,
      title: row.title,
      notes: row.notes,
      tags: row.tagsJson ?? [],
      originalFileName: row.originalFileName,
      mimeType: row.mimeType,
      sizeBytes: Number(row.sizeBytes ?? 0),
      mediaMeta: row.mediaMeta ?? {},
      streamPath: this.signedMediaPath(row.workspaceId, 'ref-video', row.id),
      thumbnailPath: row.thumbnailKey
        ? this.signedMediaPath(row.workspaceId, 'ref-thumb', row.id)
        : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapProductKit(row: DeliveryStudioProductKitEntity) {
    return {
      id: row.id,
      companyId: row.companyId,
      projectId: row.projectId,
      name: row.name,
      sku: row.sku,
      category: row.category,
      notes: row.notes,
      tags: row.tagsJson ?? [],
      assets: (row.assetsJson ?? []).map((item) => ({
        id: item.id,
        role: item.role,
        label: item.label,
        originalFileName: item.originalFileName,
        mimeType: item.mimeType,
        sizeBytes: item.sizeBytes,
        imagePath: this.signedMediaPath(
          row.workspaceId,
          'product-asset',
          row.id,
          item.id,
        ),
        createdAt: item.createdAt,
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapPreset(row: DeliveryStudioPresetEntity) {
    const hasRefImg =
      typeof row.configJson?.referenceImageStorageKey === 'string' &&
      row.configJson.referenceImageStorageKey.length > 0;
    return {
      id: row.id,
      companyId: row.companyId,
      projectId: row.projectId,
      kind: row.kind,
      name: row.name,
      description: row.description,
      masterPrompt: row.masterPrompt,
      configJson: row.configJson ?? {},
      examplesJson: row.examplesJson ?? [],
      tags: row.tagsJson ?? [],
      isDefault: row.isDefault,
      thumbnailPath: hasRefImg
        ? this.signedMediaPath(row.workspaceId, 'preset-thumb', row.id)
        : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapAsset(row: DeliveryStudioAssetEntity) {
    return {
      id: row.id,
      companyId: row.companyId,
      projectId: row.projectId,
      kind: row.kind,
      productKitId: row.productKitId,
      referenceVideoId: row.referenceVideoId,
      characterAssetId: row.characterAssetId,
      presetId: row.presetId,
      jobId: row.jobId,
      title: row.title,
      promptUsed: row.promptUsed,
      modelKey: row.modelKey,
      providerUsed: row.providerUsed,
      mimeType: row.mimeType,
      sizeBytes: Number(row.sizeBytes ?? 0),
      mediaMeta: row.mediaMeta ?? {},
      approved: row.approved,
      deliverableId: row.deliverableId,
      hookProjectId: row.hookProjectId,
      tags: row.tagsJson ?? [],
      metadata: row.metadataJson ?? {},
      mediaPath: this.signedMediaPath(row.workspaceId, 'studio-asset', row.id),
      thumbnailPath: row.thumbnailKey
        ? this.signedMediaPath(row.workspaceId, 'studio-thumb', row.id)
        : row.kind === 'CHARACTER_SHEET'
          ? this.signedMediaPath(row.workspaceId, 'studio-asset', row.id)
          : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapJob(row: DeliveryStudioJobEntity) {
    return {
      id: row.id,
      batchId: row.batchId,
      companyId: row.companyId,
      projectId: row.projectId,
      jobKind: row.jobKind,
      title: row.title,
      modelKey: row.modelKey,
      routingMode: row.routingMode,
      providerUsed: row.providerUsed,
      failoverTriggered: row.failoverTriggered,
      status: row.status,
      progress: row.progress,
      estimatedCostUsd: row.estimatedCostUsd,
      actualCostUsd: row.actualCostUsd,
      attempts: row.attemptsJson ?? [],
      outputAssetIds: row.outputAssetIdsJson ?? [],
      externalTaskId: row.externalTaskId,
      errorMessage: row.errorMessage,
      startedAt: row.startedAt ? row.startedAt.toISOString() : null,
      completedAt: row.completedAt ? row.completedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async ensureStarterPresets(
    manager: EntityManager,
    workspaceId: string,
    memberId: string,
  ) {
    if (typeof manager.query === 'function') {
      await manager
        .query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          `studio-starter-presets:${workspaceId}`,
        ])
        .catch(() => undefined);
    }
    const repo = manager.getRepository(DeliveryStudioPresetEntity);
    const existing = await repo.find({
      where: { workspaceId },
      select: { id: true, kind: true, name: true },
    });

    const existingKinds = new Set(existing.map((row) => row.kind));
    const existingNamesByKind = new Set(
      existing.map((row) => `${row.kind}::${row.name.toLowerCase()}`),
    );

    const missingSeeds = STARTER_STUDIO_PRESETS.filter((seed) => {
      if (existing.length === 0) return true;
      // Seed ENVIRONMENT library and starter Avatar presets for existing workspaces seamlessly
      if (seed.kind === 'ENVIRONMENT' && !existingKinds.has('ENVIRONMENT')) {
        return true;
      }
      if (
        seed.kind === 'CASTING_PERSONA' &&
        existing.filter((r) => r.kind === 'CASTING_PERSONA').length <= 1 &&
        !existingNamesByKind.has(`${seed.kind}::${seed.name.toLowerCase()}`)
      ) {
        return true;
      }
      return false;
    });

    if (missingSeeds.length === 0) return;

    const entities = missingSeeds.map((seed) =>
      repo.create({
        workspaceId,
        companyId: null,
        projectId: null,
        kind: seed.kind,
        name: seed.name,
        description: seed.description,
        masterPrompt: seed.masterPrompt,
        configJson: seed.configJson,
        examplesJson: seed.examplesJson,
        tagsJson: seed.tagsJson,
        isDefault:
          seed.isDefault && !existingKinds.has(seed.kind),
        archived: false,
        createdById: memberId,
      }),
    );
    await repo.save(entities);
  }

  private async readBrandNotesSnippet(
    manager: EntityManager,
    workspaceId: string,
    projectId: string | null | undefined,
  ): Promise<string> {
    if (!projectId) return '';
    try {
      const ctx = await readDeliveryKnowledgeContext(
        manager,
        workspaceId,
        projectId,
      );
      if (!ctx.sources.length) return '';
      return ctx.sources
        .slice(0, 3)
        .map((s) => `${s.title}: ${s.knowledge.slice(0, 400)}`)
        .join(' | ');
    } catch {
      return '';
    }
  }

  // =========================================================================
  // 1. Provider & API Key Configuration (Encrypted in DB)
  // =========================================================================

  async getProviderConfig(
    auth: WorkspaceAuthContext,
  ): Promise<StudioProviderConfigDTO> {
    const id = this.identity(auth);
    const row = await this.dataSource.transaction(async (manager) => {
      await this.resolveActor(manager, id);
      return manager
        .getRepository(DeliveryStudioProviderConfigEntity)
        .findOne({ where: { workspaceId: id.workspaceId } });
    });
    return this.mapProviderConfig(row);
  }

  async saveProviderConfig(
    auth: WorkspaceAuthContext,
    rawInput: unknown,
  ): Promise<StudioProviderConfigDTO> {
    const parsed = saveProviderConfigSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid provider settings.',
      );
    }
    const input = parsed.data;
    const id = this.identity(auth);

    const saved = await this.dataSource.transaction(async (manager) => {
      const actor = await this.resolveActor(manager, id);
      if (!actor.isManager && !actor.isAdmin) {
        throw new ForbiddenException(
          'Only workspace managers or admins can configure AI Studio API keys.',
        );
      }

      const repo = manager.getRepository(DeliveryStudioProviderConfigEntity);
      let row = await repo
        .createQueryBuilder('cfg')
        .addSelect('cfg.encryptedWavespeedKey')
        .addSelect('cfg.encryptedKieKey')
        .where('cfg."workspaceId" = :workspaceId', {
          workspaceId: id.workspaceId,
        })
        .getOne();

      if (!row) {
        row = repo.create({
          workspaceId: id.workspaceId,
          defaultRoutingMode: 'AUTO_FAILOVER',
          defaultImageModel: 'nano-banana-2.1',
          defaultVideoModel: 'seedance-2.5',
          maxConcurrentJobs: 4,
        });
      }

      if (input.clearWavespeedKey) {
        row.encryptedWavespeedKey = null;
        row.wavespeedKeyLast4 = null;
        row.wavespeedVerifiedAt = null;
        row.wavespeedLastError = null;
      } else if (input.wavespeedApiKey && input.wavespeedApiKey.trim()) {
        const clean = input.wavespeedApiKey.trim();
        row.encryptedWavespeedKey = this.encryption.encryptVersioned(
          clean as PlaintextString,
          { workspaceId: id.workspaceId },
        );
        row.wavespeedKeyLast4 = clean.slice(-4);
        row.wavespeedVerifiedAt = null;
        row.wavespeedLastError = null;
      }

      if (input.clearKieKey) {
        row.encryptedKieKey = null;
        row.kieKeyLast4 = null;
        row.kieVerifiedAt = null;
        row.kieLastError = null;
      } else if (input.kieApiKey && input.kieApiKey.trim()) {
        const clean = input.kieApiKey.trim();
        row.encryptedKieKey = this.encryption.encryptVersioned(
          clean as PlaintextString,
          { workspaceId: id.workspaceId },
        );
        row.kieKeyLast4 = clean.slice(-4);
        row.kieVerifiedAt = null;
        row.kieLastError = null;
      }

      if (input.wavespeedEnabled !== undefined) {
        row.wavespeedEnabled = input.wavespeedEnabled;
      }
      if (input.kieEnabled !== undefined) {
        row.kieEnabled = input.kieEnabled;
      }
      if (input.defaultRoutingMode !== undefined) {
        row.defaultRoutingMode = input.defaultRoutingMode;
      }
      if (input.defaultImageModel !== undefined) {
        row.defaultImageModel = input.defaultImageModel;
      }
      if (input.defaultVideoModel !== undefined) {
        row.defaultVideoModel = input.defaultVideoModel;
      }
      if (input.maxConcurrentJobs !== undefined) {
        row.maxConcurrentJobs = input.maxConcurrentJobs;
      }
      row.updatedById = id.memberId;

      const persisted = await repo.save(row);

      await recordOtogrowActivity(manager, {
        workspaceId: id.workspaceId,
        actorId: id.memberId,
        category: 'CREATIVE',
        action: 'STUDIO_PROVIDER_CONFIG_UPDATED',
        outcome: 'RECORDED',
        summary: `Updated AI Studio provider settings (routing: ${persisted.defaultRoutingMode}).`,
        sourceType: 'settings',
        sourceId: persisted.id,
        changes: [],
      });

      return persisted;
    });

    return this.mapProviderConfig(saved);
  }

  async testProviderConnection(
    auth: WorkspaceAuthContext,
    provider: StudioProviderId,
    rawApiKey?: string | null,
  ): Promise<{ ok: boolean; message: string; config: StudioProviderConfigDTO }> {
    const id = this.identity(auth);
    if (provider !== 'wavespeed' && provider !== 'kie') {
      throw new BadRequestException('Provider must be "wavespeed" or "kie".');
    }

    const keyToTest = await this.dataSource.transaction(async (manager) => {
      await this.resolveActor(manager, id);
      if (rawApiKey && rawApiKey.trim()) {
        return rawApiKey.trim();
      }
      const row = await manager
        .getRepository(DeliveryStudioProviderConfigEntity)
        .createQueryBuilder('cfg')
        .addSelect('cfg.encryptedWavespeedKey')
        .addSelect('cfg.encryptedKieKey')
        .where('cfg."workspaceId" = :workspaceId', {
          workspaceId: id.workspaceId,
        })
        .getOne();
      const encrypted =
        provider === 'wavespeed'
          ? row?.encryptedWavespeedKey
          : row?.encryptedKieKey;
      if (!encrypted) return null;
      return this.encryption.decryptVersionedOrThrow(
        encrypted as EncryptedString,
        { workspaceId: id.workspaceId },
      );
    });

    if (!keyToTest) {
      return {
        ok: false,
        message: `No ${provider === 'wavespeed' ? 'WaveSpeedAI' : 'Kie.ai'} API key configured yet.`,
        config: await this.getProviderConfig(auth),
      };
    }

    const check = await this.router.verifyProviderKey(provider, keyToTest);

    const updated = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(DeliveryStudioProviderConfigEntity);
      const row = await repo.findOne({ where: { workspaceId: id.workspaceId } });
      if (!row) return null;
      if (provider === 'wavespeed') {
        row.wavespeedVerifiedAt = check.ok ? new Date() : null;
        row.wavespeedLastError = check.ok ? null : check.message;
      } else {
        row.kieVerifiedAt = check.ok ? new Date() : null;
        row.kieLastError = check.ok ? null : check.message;
      }
      return repo.save(row);
    });

    return {
      ok: check.ok,
      message: check.message,
      config: this.mapProviderConfig(updated),
    };
  }

  // =========================================================================
  // 2. Full Studio Workspace Read (Multi-Client Tabs + Global Render Queue)
  // =========================================================================

  async getStudioWorkspace(
    auth: WorkspaceAuthContext,
    filter?: { companyId?: string | null; projectId?: string | null },
  ) {
    const id = this.identity(auth);
    const companyId =
      filter?.companyId && isUuidString(filter.companyId)
        ? filter.companyId
        : null;
    const projectId =
      filter?.projectId && isUuidString(filter.projectId)
        ? filter.projectId
        : null;

    const txResult = await this.dataSource.transaction(async (manager) => {
      const actor = await this.resolveActor(manager, id);
      await this.ensureStarterPresets(manager, id.workspaceId, id.memberId);

      const [
        operations,
        providerConfig,
        projects,
        allPresets,
        refVideos,
        productKits,
        assets,
        globalJobs,
      ] = await Promise.all([
        manager
          .getRepository(DeliveryOperationsEntity)
          .findOneBy({ workspaceId: id.workspaceId }),
        manager
          .getRepository(DeliveryStudioProviderConfigEntity)
          .findOne({ where: { workspaceId: id.workspaceId } }),
        manager.getRepository(DeliveryProjectEntity).find({
          where: { workspaceId: id.workspaceId },
          order: { name: 'ASC' },
        }),
        manager.getRepository(DeliveryStudioPresetEntity).find({
          where: { workspaceId: id.workspaceId, archived: false },
          order: { isDefault: 'DESC', updatedAt: 'DESC' },
        }),
        manager.getRepository(DeliveryStudioReferenceVideoEntity).find({
          where: { workspaceId: id.workspaceId, archived: false },
          order: { createdAt: 'DESC' },
          take: 150,
        }),
        companyId
          ? manager.getRepository(DeliveryStudioProductKitEntity).find({
              where: {
                workspaceId: id.workspaceId,
                companyId,
                archived: false,
              },
              order: { updatedAt: 'DESC' },
              take: 100,
            })
          : manager.getRepository(DeliveryStudioProductKitEntity).find({
              where: { workspaceId: id.workspaceId, archived: false },
              order: { updatedAt: 'DESC' },
              take: 100,
            }),
        companyId
          ? manager.getRepository(DeliveryStudioAssetEntity).find({
              where: {
                workspaceId: id.workspaceId,
                companyId,
                archived: false,
              },
              order: { createdAt: 'DESC' },
              take: 160,
            })
          : manager.getRepository(DeliveryStudioAssetEntity).find({
              where: { workspaceId: id.workspaceId, archived: false },
              order: { createdAt: 'DESC' },
              take: 160,
            }),
        manager.getRepository(DeliveryStudioJobEntity).find({
          where: { workspaceId: id.workspaceId },
          order: { createdAt: 'DESC' },
          take: 80,
        }),
      ]);

      return {
        actor,
        operations,
        providerConfig,
        projects,
        allPresets,
        refVideos,
        productKits,
        assets,
        globalJobs,
      };
    });

    const {
      actor,
      operations,
      providerConfig,
      projects,
      allPresets,
      refVideos,
      productKits,
      assets,
      globalJobs,
    } = txResult;

    // Strictly use Delivery Clients roster (NOT all CRM companies)
    const roster = normalizeClientRoster(operations?.state.clientRoster);
    const engagements = operations?.state.clients?.engagements ?? [];
    const clientTagsMap = operations?.state.clientTags ?? {};
    const effectiveClientIds = resolveEffectiveClientCompanyIds(
      roster,
      projects.map((p) => p.companyId),
      engagements.map((e) => e.companyId),
    );
    const lookupIds = new Set(effectiveClientIds);
    if (companyId) lookupIds.add(companyId);

    const designatedCompanies = lookupIds.size
      ? await this.companies.listByIds(auth, [...lookupIds])
      : [];

    const projectsByCompany = new Map<
      string,
      { id: string; name: string; companyId: string | null }[]
    >();
    for (const proj of projects) {
      if (!proj.companyId) continue;
      const list = projectsByCompany.get(proj.companyId) ?? [];
      list.push({
        id: proj.id,
        name: proj.name,
        companyId: proj.companyId,
      });
      projectsByCompany.set(proj.companyId, list);
    }

    const clients = designatedCompanies
      .map((c) => {
        const tags = normalizeClientTags(clientTagsMap[c.id]);
        const isClothingBrand = tags.some(
          (t) => t.toLowerCase() === 'clothing brand',
        );
        return {
          id: c.id,
          name: c.name,
          tags,
          isClothingBrand,
          projects: projectsByCompany.get(c.id) ?? [],
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    // Keep all shared + client-scoped Avatars, Environments, and Reference Videos accessible
    // so the UI library modals can cleanly filter "All" vs "This client"
    const scopedPresets = allPresets.filter(
      (p) =>
        p.kind === 'CASTING_PERSONA' ||
        p.kind === 'ENVIRONMENT' ||
        ((!p.companyId || p.companyId === companyId) &&
          (!p.projectId || !projectId || p.projectId === projectId)),
    );
    const scopedProductKits = productKits.filter(
      (pk) => !projectId || !pk.projectId || pk.projectId === projectId,
    );
    const scopedAssets = assets.filter(
      (a) => !projectId || !a.projectId || a.projectId === projectId,
    );

    const hookDefaultsMap = operations?.state.studioHookDefaults ?? {};
    const workspaceHookDefault: StudioHookDefaultSetting | null =
      hookDefaultsMap.__workspace__ ?? hookDefaultsMap.default ?? null;
    const clientHookDefault: StudioHookDefaultSetting | null =
      (companyId ? hookDefaultsMap[companyId] : null) ?? null;
    const selectedClientInfo = companyId
      ? clients.find((c) => c.id === companyId) ?? null
      : null;

    return {
      canManageProviders: actor.isAdmin || actor.isManager,
      catalog: STUDIO_MODEL_CATALOG,
      hookStylePresets: HOOK_STYLE_PRESETS,
      providerConfig: this.mapProviderConfig(providerConfig),
      clients,
      selectedClientTags: selectedClientInfo?.tags ?? [],
      selectedClientIsClothingBrand: Boolean(
        selectedClientInfo?.isClothingBrand,
      ),
      presets: scopedPresets.map((p) => this.mapPreset(p)),
      referenceVideos: refVideos.map((rv) => this.mapReferenceVideo(rv)),
      productKits: scopedProductKits.map((pk) => this.mapProductKit(pk)),
      characterSheets: scopedAssets
        .filter((a) => a.kind === 'CHARACTER_SHEET')
        .map((a) => this.mapAsset(a)),
      generatedVideos: scopedAssets
        .filter((a) => a.kind === 'GENERATED_VIDEO')
        .map((a) => this.mapAsset(a)),
      jobs: globalJobs.map((j) => this.mapJob(j)),
      hookDefault: clientHookDefault ?? workspaceHookDefault,
      hasClientHookDefault: Boolean(clientHookDefault),
    };
  }

  // =========================================================================
  // 3. Dynamic Master Prompt Presets CRUD
  // =========================================================================

  async upsertPreset(auth: WorkspaceAuthContext, rawInput: unknown) {
    const parsed = upsertStudioPresetSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid preset input.',
      );
    }
    const input = parsed.data;
    const id = this.identity(auth);

    const saved = await this.dataSource.transaction(async (manager) => {
      await this.resolveActor(manager, id);
      const repo = manager.getRepository(DeliveryStudioPresetEntity);
      let row: DeliveryStudioPresetEntity | null = null;
      if (input.id) {
        row = await repo.findOne({
          where: { id: input.id, workspaceId: id.workspaceId },
        });
        if (!row) throw new NotFoundException('Preset not found.');
      } else {
        row = repo.create({
          workspaceId: id.workspaceId,
          createdById: id.memberId,
          archived: false,
        });
      }

      row.companyId = input.companyId ?? null;
      row.projectId = input.projectId ?? null;
      row.kind = input.kind as StudioPresetKind;
      row.name = input.name;
      row.description = input.description ?? row.description ?? '';
      row.masterPrompt = input.masterPrompt ?? row.masterPrompt ?? '';
      const existingConfig = (row.configJson ?? {}) as StudioPresetConfig;
      const incomingConfig = input.configJson as StudioPresetConfig | undefined;
      row.configJson = incomingConfig
        ? {
            ...(existingConfig.referenceImageStorageKey
              ? {
                  referenceImageStorageKey:
                    existingConfig.referenceImageStorageKey,
                  referenceImageMimeType: existingConfig.referenceImageMimeType,
                  referenceImageSha256: existingConfig.referenceImageSha256,
                }
              : {}),
            ...incomingConfig,
          }
        : existingConfig;
      row.examplesJson = input.examplesJson ?? row.examplesJson ?? [];
      row.tagsJson = input.tagsJson ?? row.tagsJson ?? [];
      row.isDefault = input.isDefault ?? row.isDefault ?? false;

      return repo.save(row);
    });

    return this.mapPreset(saved);
  }

  async archivePreset(auth: WorkspaceAuthContext, presetId: string) {
    if (!isUuidString(presetId)) {
      throw new BadRequestException('Invalid preset ID.');
    }
    const id = this.identity(auth);
    await this.dataSource.transaction(async (manager) => {
      await this.resolveActor(manager, id);
      const repo = manager.getRepository(DeliveryStudioPresetEntity);
      const row = await repo.findOne({
        where: { id: presetId, workspaceId: id.workspaceId },
      });
      if (!row) throw new NotFoundException('Preset not found.');
      row.archived = true;
      await repo.save(row);
    });
    return { archived: true, id: presetId };
  }

  // =========================================================================
  // 4. Reference Video Library & Product Kits (Canonical Storage)
  // =========================================================================

  async registerReferenceVideo(
    auth: WorkspaceAuthContext,
    input: {
      companyId?: string | null;
      projectId?: string | null;
      title: string;
      notes?: string;
      tags?: string[];
      tempFilePath: string;
      originalFileName: string;
      mimeType: string;
      sizeBytes: number;
    },
  ) {
    const id = this.identity(auth);
    const videoId = v4();
    const ext = extensionForMime(input.mimeType);
    const storageKey = `delivery-studio/${id.workspaceId}/ref-videos/${videoId}.${ext}`;
    const thumbKey = `delivery-studio/${id.workspaceId}/ref-videos/${videoId}-thumb.jpg`;

    const bytes = await fs.readFile(input.tempFilePath);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const mediaMeta = await this.probe.probeMedia(input.tempFilePath);

    const tempThumb = path.join(os.tmpdir(), `studio-ref-thumb-${videoId}.jpg`);
    let hasThumb = false;
    try {
      hasThumb = await this.probe.extractVideoThumbnail(
        input.tempFilePath,
        tempThumb,
        mediaMeta.durationSec,
      );
      const driver = this.storage.getCurrentDriver();
      await driver.writeFileStream({
        filePath: storageKey,
        stream: createReadStream(input.tempFilePath),
        mimeType: input.mimeType,
      });
      if (hasThumb) {
        await driver.writeFileStream({
          filePath: thumbKey,
          stream: createReadStream(tempThumb),
          mimeType: 'image/jpeg',
        });
      }
    } finally {
      await fs.rm(tempThumb, { force: true }).catch(() => undefined);
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      await this.resolveActor(manager, id);
      const repo = manager.getRepository(DeliveryStudioReferenceVideoEntity);
      return repo.save(
        repo.create({
          id: videoId,
          workspaceId: id.workspaceId,
          companyId: input.companyId ?? null,
          projectId: input.projectId ?? null,
          title: input.title.trim().slice(0, 180) || input.originalFileName,
          notes: (input.notes ?? '').trim().slice(0, 2000),
          tagsJson: (input.tags ?? []).slice(0, 20),
          storageKey,
          thumbnailKey: hasThumb ? thumbKey : null,
          originalFileName: input.originalFileName.slice(0, 240),
          mimeType: input.mimeType,
          sizeBytes: String(input.sizeBytes),
          sha256,
          mediaMeta,
          stagedUrlsJson: {},
          archived: false,
          createdById: id.memberId,
        }),
      );
    });

    return this.mapReferenceVideo(saved);
  }

  async archiveReferenceVideo(auth: WorkspaceAuthContext, refVideoId: string) {
    if (!isUuidString(refVideoId)) {
      throw new BadRequestException('Invalid reference video ID.');
    }
    const id = this.identity(auth);
    await this.dataSource.transaction(async (manager) => {
      await this.resolveActor(manager, id);
      const repo = manager.getRepository(DeliveryStudioReferenceVideoEntity);
      const row = await repo.findOne({
        where: { id: refVideoId, workspaceId: id.workspaceId },
      });
      if (!row) throw new NotFoundException('Reference video not found.');
      row.archived = true;
      await repo.save(row);
    });
    return { archived: true, id: refVideoId };
  }

  async upsertProductKit(auth: WorkspaceAuthContext, rawInput: unknown) {
    const parsed = upsertProductKitSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid product kit input.',
      );
    }
    const input = parsed.data;
    const id = this.identity(auth);

    const saved = await this.dataSource.transaction(async (manager) => {
      await this.resolveActor(manager, id);
      const repo = manager.getRepository(DeliveryStudioProductKitEntity);
      let row: DeliveryStudioProductKitEntity | null = null;
      if (input.id) {
        row = await repo.findOne({
          where: { id: input.id, workspaceId: id.workspaceId },
        });
        if (!row) throw new NotFoundException('Product kit not found.');
      } else {
        row = repo.create({
          workspaceId: id.workspaceId,
          companyId: input.companyId,
          projectId: input.projectId ?? null,
          assetsJson: [],
          archived: false,
          createdById: id.memberId,
        });
      }
      row.companyId = input.companyId;
      row.projectId = input.projectId ?? null;
      row.name = input.name;
      row.sku = input.sku ?? row.sku ?? '';
      row.category = input.category ?? row.category ?? '';
      row.notes = input.notes ?? row.notes ?? '';
      row.tagsJson = input.tagsJson ?? row.tagsJson ?? [];
      return repo.save(row);
    });

    return this.mapProductKit(saved);
  }

  async addProductKitAsset(
    auth: WorkspaceAuthContext,
    input: {
      productKitId: string;
      role: string;
      label?: string;
      tempFilePath: string;
      originalFileName: string;
      mimeType: string;
      sizeBytes: number;
    },
  ) {
    if (!isUuidString(input.productKitId)) {
      throw new BadRequestException('Invalid productKitId.');
    }
    const id = this.identity(auth);
    const assetId = v4();
    const ext = extensionForMime(input.mimeType);
    const storageKey = `delivery-studio/${id.workspaceId}/products/${input.productKitId}/${assetId}.${ext}`;
    const bytes = await fs.readFile(input.tempFilePath);
    const sha256 = createHash('sha256').update(bytes).digest('hex');

    const driver = this.storage.getCurrentDriver();
    await driver.writeFileStream({
      filePath: storageKey,
      stream: createReadStream(input.tempFilePath),
      mimeType: input.mimeType,
    });

    const saved = await this.dataSource.transaction(async (manager) => {
      await this.resolveActor(manager, id);
      const repo = manager.getRepository(DeliveryStudioProductKitEntity);
      const kit = await repo.findOne({
        where: { id: input.productKitId, workspaceId: id.workspaceId },
      });
      if (!kit) throw new NotFoundException('Product kit not found.');

      const normalizedRole =
        input.role.trim().toUpperCase().slice(0, 40) || 'REFERENCE';
      const item: StudioProductAssetItem = {
        id: assetId,
        role: normalizedRole,
        label: (input.label?.trim() || normalizedRole).slice(0, 80),
        storageKey,
        originalFileName: input.originalFileName.slice(0, 240),
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        sha256,
        stagedUrls: {},
        createdAt: new Date().toISOString(),
      };
      kit.assetsJson = [...(kit.assetsJson ?? []), item];
      return repo.save(kit);
    });

    return this.mapProductKit(saved);
  }

  async removeProductKitAsset(
    auth: WorkspaceAuthContext,
    productKitId: string,
    assetId: string,
  ) {
    if (!isUuidString(productKitId) || !isUuidString(assetId)) {
      throw new BadRequestException('Invalid product kit or asset ID.');
    }
    const id = this.identity(auth);
    const saved = await this.dataSource.transaction(async (manager) => {
      await this.resolveActor(manager, id);
      const repo = manager.getRepository(DeliveryStudioProductKitEntity);
      const kit = await repo.findOne({
        where: { id: productKitId, workspaceId: id.workspaceId },
      });
      if (!kit) throw new NotFoundException('Product kit not found.');
      kit.assetsJson = (kit.assetsJson ?? []).filter((a) => a.id !== assetId);
      return repo.save(kit);
    });
    return this.mapProductKit(saved);
  }

  async archiveProductKit(auth: WorkspaceAuthContext, productKitId: string) {
    if (!isUuidString(productKitId)) {
      throw new BadRequestException('Invalid product kit ID.');
    }
    const id = this.identity(auth);
    await this.dataSource.transaction(async (manager) => {
      await this.resolveActor(manager, id);
      const repo = manager.getRepository(DeliveryStudioProductKitEntity);
      const kit = await repo.findOne({
        where: { id: productKitId, workspaceId: id.workspaceId },
      });
      if (!kit) throw new NotFoundException('Product kit not found.');
      kit.archived = true;
      await repo.save(kit);
    });
    return { archived: true, id: productKitId };
  }

  async setPresetReferenceImage(
    auth: WorkspaceAuthContext,
    input: {
      presetId: string;
      tempFilePath: string;
      originalFileName: string;
      mimeType: string;
      sizeBytes: number;
    },
  ) {
    if (!isUuidString(input.presetId)) {
      throw new BadRequestException('Invalid preset ID.');
    }
    const id = this.identity(auth);
    const bytes = await fs.readFile(input.tempFilePath);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const ext = extensionForMime(input.mimeType);
    const storageKey = `delivery-studio/${id.workspaceId}/presets/${input.presetId}/${v4()}.${ext}`;

    const driver = this.storage.getCurrentDriver();
    await driver.writeFileStream({
      filePath: storageKey,
      stream: Readable.from(bytes),
      mimeType: input.mimeType,
    });

    const saved = await this.dataSource.transaction(async (manager) => {
      await this.resolveActor(manager, id);
      const repo = manager.getRepository(DeliveryStudioPresetEntity);
      const preset = await repo.findOne({
        where: { id: input.presetId, workspaceId: id.workspaceId },
      });
      if (!preset) throw new NotFoundException('Preset not found.');
      preset.configJson = {
        ...(preset.configJson ?? {}),
        referenceImageStorageKey: storageKey,
        referenceImageMimeType: input.mimeType,
        referenceImageSha256: sha256,
      };
      return repo.save(preset);
    });

    return this.mapPreset(saved);
  }

  async importProductFromUrl(auth: WorkspaceAuthContext, rawInput: unknown) {
    const parsed = importProductFromUrlSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Enter a valid product link.',
      );
    }
    const input = parsed.data;
    const id = this.identity(auth);

    const scraped = await scrapeProductImagesFromUrl(
      input.url,
      input.maxImages ?? 6,
    );

    const driver = this.storage.getCurrentDriver();
    const kitIdForPath = input.productKitId ?? v4();
    const uploadedItems: StudioProductAssetItem[] = [];

    for (let i = 0; i < scraped.images.length; i += 1) {
      const img = scraped.images[i];
      const itemId = v4();
      const ext = extensionForMime(img.mimeType);
      const sha256 = createHash('sha256').update(img.buffer).digest('hex');
      const storageKey = `delivery-studio/${id.workspaceId}/products/${kitIdForPath}/${itemId}.${ext}`;
      await driver.writeFileStream({
        filePath: storageKey,
        stream: Readable.from(img.buffer),
        mimeType: img.mimeType,
      });
      uploadedItems.push({
        id: itemId,
        role: i === 0 ? 'FRONT' : i === 1 ? 'BACK' : 'DETAIL',
        label: `Image ${i + 1}`,
        storageKey,
        originalFileName: img.fileName,
        mimeType: img.mimeType,
        sizeBytes: img.buffer.length,
        sha256,
        stagedUrls: {},
        createdAt: new Date().toISOString(),
      });
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      await this.resolveActor(manager, id);
      const repo = manager.getRepository(DeliveryStudioProductKitEntity);
      if (input.productKitId) {
        const existing = await repo.findOne({
          where: { id: input.productKitId, workspaceId: id.workspaceId },
        });
        if (!existing) throw new NotFoundException('Product not found.');
        const existingCount = existing.assetsJson?.length ?? 0;
        const renumbered = uploadedItems.map((item, idx) => ({
          ...item,
          label: `Image ${existingCount + idx + 1}`,
        }));
        existing.assetsJson = [...(existing.assetsJson ?? []), ...renumbered];
        if (!existing.notes) existing.notes = scraped.sourceUrl;
        return repo.save(existing);
      }

      const created = repo.create({
        id: kitIdForPath,
        workspaceId: id.workspaceId,
        companyId: input.companyId,
        projectId: input.projectId ?? null,
        name: (input.name?.trim() || scraped.title).slice(0, 180),
        sku: scraped.sourceUrl.slice(0, 80),
        category: 'Apparel',
        notes: scraped.sourceUrl,
        assetsJson: uploadedItems,
        tagsJson: ['url-import'],
        archived: false,
        createdById: id.memberId,
      });
      return repo.save(created);
    });

    return {
      productKit: this.mapProductKit(saved),
      importedCount: uploadedItems.length,
      sourceUrl: scraped.sourceUrl,
    };
  }

  async updateProductAssets(auth: WorkspaceAuthContext, rawInput: unknown) {
    const parsed = updateProductAssetsSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid product images update.',
      );
    }
    const input = parsed.data;
    const id = this.identity(auth);

    const saved = await this.dataSource.transaction(async (manager) => {
      await this.resolveActor(manager, id);
      const repo = manager.getRepository(DeliveryStudioProductKitEntity);
      const kit = await repo.findOne({
        where: { id: input.productKitId, workspaceId: id.workspaceId },
      });
      if (!kit) throw new NotFoundException('Product not found.');

      const byId = new Map((kit.assetsJson ?? []).map((a) => [a.id, a]));
      const reordered: StudioProductAssetItem[] = [];
      for (const spec of input.assets) {
        const existing = byId.get(spec.id);
        if (!existing) continue;
        reordered.push({
          ...existing,
          label: spec.label?.trim() || existing.label,
          role: spec.role?.trim().toUpperCase() || existing.role,
        });
        byId.delete(spec.id);
      }
      // Keep any remaining unmentioned assets at the end
      for (const leftover of byId.values()) {
        reordered.push(leftover);
      }
      kit.assetsJson = reordered;
      return repo.save(kit);
    });

    return this.mapProductKit(saved);
  }

  // =========================================================================
  // 5. Character Sheet & AI Video Generation Queueing (Single, Compare, Batch)
  // =========================================================================

  async queueCharacterSheetGeneration(
    auth: WorkspaceAuthContext,
    rawInput: unknown,
  ) {
    const parsed = generateCharacterSheetSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ??
          'Invalid character sheet generation request.',
      );
    }
    const input = parsed.data;
    const spec = getStudioModelSpec(input.modelKey);
    if (!spec || spec.kind !== 'IMAGE') {
      throw new BadRequestException(
        'Select a valid image model (Nano Banana 2.1/Pro or GPT Image 2.6).',
      );
    }

    const id = this.identity(auth);
    const candidateCount = input.candidateCount ?? 1;
    const batchId = candidateCount > 1 ? v4() : null;

    const jobs = await this.dataSource.transaction(async (manager) => {
      await this.resolveActor(manager, id);

      const providerConfig = await manager
        .getRepository(DeliveryStudioProviderConfigEntity)
        .findOne({ where: { workspaceId: id.workspaceId } });
      const routingMode: StudioRoutingMode =
        input.routingMode ??
        providerConfig?.defaultRoutingMode ??
        'AUTO_FAILOVER';

      const productKit = input.productKitId
        ? await manager.getRepository(DeliveryStudioProductKitEntity).findOne({
            where: {
              id: input.productKitId,
              workspaceId: id.workspaceId,
            },
          })
        : null;

      const preset = input.presetId
        ? await manager.getRepository(DeliveryStudioPresetEntity).findOne({
            where: { id: input.presetId, workspaceId: id.workspaceId },
          })
        : null;

      const castingPreset = input.castingPresetId
        ? await manager.getRepository(DeliveryStudioPresetEntity).findOne({
            where: { id: input.castingPresetId, workspaceId: id.workspaceId },
          })
        : null;

      const environmentPreset = input.environmentPresetId
        ? await manager.getRepository(DeliveryStudioPresetEntity).findOne({
            where: {
              id: input.environmentPresetId,
              workspaceId: id.workspaceId,
            },
          })
        : null;

      const brandNotes = await this.readBrandNotesSnippet(
        manager,
        id.workspaceId,
        input.projectId,
      );

      const angles =
        input.angles ??
        (Array.isArray(preset?.configJson?.angles)
          ? (preset?.configJson?.angles as string[])
          : [
              'Full-body Front View',
              'Full-body Back View showing back print',
              '3/4 Side Profile',
              'Upper Torso Close-up showing fabric & print detail',
            ]);

      const angleLayout =
        input.angleLayout ??
        preset?.configJson?.angleLayout ??
        (angles.length === 1 ? 'SINGLE_HERO' : 'GRID_SHEET');

      const masterTemplate =
        input.masterPrompt?.trim() ||
        preset?.masterPrompt ||
        STARTER_STUDIO_PRESETS[0].masterPrompt;

      const resolvedEnvironmentPrompt =
        input.environmentOverride?.trim() ||
        environmentPreset?.masterPrompt ||
        'Sunlit minimalist architectural loft apartment with natural window light';
      const resolvedEnvironmentName =
        environmentPreset?.name ||
        (input.environmentOverride?.trim() ? 'Custom Environment' : 'Minimalist Studio');
      const resolvedAvatarName =
        castingPreset?.name ||
        (input.talentDescription?.trim() ? 'Custom Avatar' : 'Default Model');

      // Describe clearly numbered product images (Image 1, Image 2...) for the prompt
      const selectedAssets = productKit
        ? input.productAssetIds?.length
          ? (productKit.assetsJson ?? []).filter((a) =>
              input.productAssetIds?.includes(a.id),
            )
          : (productKit.assetsJson ?? [])
        : [];
      const numberedImagesNote = selectedAssets.length
        ? `Garment reference photos provided: ${selectedAssets
            .map((a, idx) => `Image ${idx + 1} (${a.label || a.role})`)
            .join(', ')}.`
        : '';

      const compiledPrompt = compileStudioPromptTemplate(masterTemplate, {
        product_name: productKit?.name || 'featured garment',
        product_notes: [productKit?.notes || '', numberedImagesNote]
          .filter(Boolean)
          .join(' '),
        brand_notes: brandNotes,
        angles: angles.join(', '),
        angle_count: String(angles.length),
        layout_style: angleLayout,
        talent:
          input.talentDescription?.trim() ||
          castingPreset?.masterPrompt ||
          'editorial fashion model',
        environment: resolvedEnvironmentPrompt,
        custom_notes: input.customNotes?.trim() || '',
      });

      const resolution =
        input.resolution ??
        preset?.configJson?.resolution ??
        spec.capabilities.defaultResolution;
      const aspectRatio =
        input.aspectRatio ?? preset?.configJson?.aspectRatio ?? '3:4';
      const estimatedPerJob = estimateStudioJobCostUsd({
        modelKey: spec.key,
        resolution,
        count: 1,
      });

      const repo = manager.getRepository(DeliveryStudioJobEntity);
      const created: DeliveryStudioJobEntity[] = [];

      const effectiveCount =
        angleLayout === 'SEPARATE_FRAMES'
          ? Math.min(8, angles.length)
          : candidateCount;

      for (let i = 0; i < effectiveCount; i += 1) {
        const frameAngle =
          angleLayout === 'SEPARATE_FRAMES' ? angles[i] : undefined;
        const jobPrompt = frameAngle
          ? `${compiledPrompt}\nFocus strictly on this single angle: ${frameAngle}.`
          : compiledPrompt;
        const baseTitle =
          input.title?.trim() ||
          `${productKit?.name || 'Character'} · ${resolvedAvatarName}`;
        const title =
          effectiveCount > 1
            ? `${baseTitle} (${frameAngle || `Take ${i + 1}`})`
            : baseTitle;

        const job = await repo.save(
          repo.create({
            workspaceId: id.workspaceId,
            batchId,
            companyId: input.companyId,
            projectId: input.projectId ?? null,
            jobKind: 'CHARACTER_SHEET',
            title: title.slice(0, 200),
            modelKey: spec.key,
            routingMode,
            status: 'QUEUED',
            progress: 0,
            estimatedCostUsd: estimatedPerJob,
            inputPayloadJson: {
              productKitId: productKit?.id ?? null,
              productName: productKit?.name ?? null,
              productAssetIds: input.productAssetIds ?? null,
              presetId: preset?.id ?? null,
              avatarPresetId: castingPreset?.id ?? null,
              avatarName: resolvedAvatarName,
              environmentPresetId: environmentPreset?.id ?? null,
              environmentName: resolvedEnvironmentName,
              environmentPrompt: resolvedEnvironmentPrompt,
              compiledPrompt: jobPrompt,
              aspectRatio,
              resolution,
              quality: input.quality,
              angles,
              angleLayout,
            },
            attemptsJson: [],
            outputAssetIdsJson: [],
            createdById: id.memberId,
          }),
        );
        created.push(job);
      }

      return created;
    });

    for (const job of jobs) {
      await this.aiQueue.add(DELIVERY_STUDIO_JOB, {
        workspaceId: id.workspaceId,
        jobId: job.id,
      });
    }

    return {
      batchId,
      jobs: jobs.map((j) => this.mapJob(j)),
    };
  }

  async queueVideoGeneration(auth: WorkspaceAuthContext, rawInput: unknown) {
    const parsed = generateVideoSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid video generation request.',
      );
    }
    const input = parsed.data;
    const id = this.identity(auth);
    const batchId = input.modelKeys.length > 1 ? v4() : null;

    const jobs = await this.dataSource.transaction(async (manager) => {
      await this.resolveActor(manager, id);

      const refVideo = await manager
        .getRepository(DeliveryStudioReferenceVideoEntity)
        .findOne({
          where: { id: input.referenceVideoId, workspaceId: id.workspaceId },
        });
      if (!refVideo) {
        throw new NotFoundException('Selected reference video not found.');
      }

      const characterAsset = input.characterAssetId
        ? await manager.getRepository(DeliveryStudioAssetEntity).findOne({
            where: { id: input.characterAssetId, workspaceId: id.workspaceId },
          })
        : null;

      const resolvedProductKitId =
        input.productKitId ?? characterAsset?.productKitId ?? null;
      const productKit = resolvedProductKitId
        ? await manager.getRepository(DeliveryStudioProductKitEntity).findOne({
            where: { id: resolvedProductKitId, workspaceId: id.workspaceId },
          })
        : null;

      const preset = input.presetId
        ? await manager.getRepository(DeliveryStudioPresetEntity).findOne({
            where: { id: input.presetId, workspaceId: id.workspaceId },
          })
        : null;

      // Carry over the EXACT environment from the Character Sheet automatically
      const charMeta = (characterAsset?.metadataJson ?? {}) as Record<
        string,
        unknown
      >;
      const inheritedEnvPresetId =
        input.environmentPresetId ??
        (typeof charMeta.environmentPresetId === 'string'
          ? charMeta.environmentPresetId
          : null);
      const environmentPreset = inheritedEnvPresetId
        ? await manager.getRepository(DeliveryStudioPresetEntity).findOne({
            where: {
              id: inheritedEnvPresetId,
              workspaceId: id.workspaceId,
            },
          })
        : null;

      const inheritedEnvPrompt =
        typeof charMeta.environmentPrompt === 'string'
          ? charMeta.environmentPrompt
          : null;
      const inheritedEnvName =
        typeof charMeta.environmentName === 'string'
          ? charMeta.environmentName
          : null;

      const resolvedEnvironmentPrompt =
        input.environmentOverride?.trim() ||
        environmentPreset?.masterPrompt ||
        inheritedEnvPrompt ||
        '';
      const resolvedEnvironmentName =
        environmentPreset?.name ||
        inheritedEnvName ||
        (input.environmentOverride?.trim() ? 'Custom Environment' : null);

      const providerConfig = await manager
        .getRepository(DeliveryStudioProviderConfigEntity)
        .findOne({ where: { workspaceId: id.workspaceId } });
      const routingMode: StudioRoutingMode =
        input.routingMode ??
        providerConfig?.defaultRoutingMode ??
        'AUTO_FAILOVER';

      const brandNotes = await this.readBrandNotesSnippet(
        manager,
        id.workspaceId,
        input.projectId,
      );

      const defaultTemplate = resolvedEnvironmentPrompt
        ? STARTER_STUDIO_PRESETS.find(
            (p) =>
              p.kind === 'VIDEO_GENERATION' &&
              p.tagsJson.includes('environment-override'),
          )?.masterPrompt ?? STARTER_STUDIO_PRESETS[3].masterPrompt
        : STARTER_STUDIO_PRESETS[3].masterPrompt;

      const masterTemplate =
        input.masterPrompt?.trim() || preset?.masterPrompt || defaultTemplate;

      const compiledPrompt = compileStudioPromptTemplate(masterTemplate, {
        product_name:
          productKit?.name || characterAsset?.title || 'featured garment',
        product_notes: productKit?.notes || '',
        brand_notes: brandNotes,
        environment:
          resolvedEnvironmentPrompt ||
          'the exact environment and lighting shown in the Character Sheet (@Image 1)',
        reference_notes: refVideo.notes || '',
        custom_notes: input.customNotes?.trim() || '',
      });

      const refDuration = refVideo.mediaMeta?.durationSec;
      const repo = manager.getRepository(DeliveryStudioJobEntity);
      const created: DeliveryStudioJobEntity[] = [];

      for (const modelKey of input.modelKeys) {
        const spec = getStudioModelSpec(modelKey);
        if (!spec || spec.kind !== 'VIDEO') {
          throw new BadRequestException(`Unsupported video model "${modelKey}".`);
        }

        const durationSec = Math.max(
          spec.capabilities.minDurationSec ?? 4,
          Math.min(
            spec.capabilities.maxDurationSec ?? 30,
            input.durationSec ??
              (refDuration ? Math.round(refDuration) : 8),
          ),
        );
        const resolution =
          input.resolution ??
          preset?.configJson?.resolution ??
          spec.capabilities.defaultResolution;
        const aspectRatio =
          input.aspectRatio ?? preset?.configJson?.aspectRatio ?? '9:16';

        const estimatedCostUsd = estimateStudioJobCostUsd({
          modelKey: spec.key,
          resolution,
          durationSec,
        });

        const baseTitle =
          input.title?.trim() ||
          `${productKit?.name || characterAsset?.title || 'AI Video'} × ${refVideo.title}`;
        const title =
          input.modelKeys.length > 1 ? `${baseTitle} [${spec.label}]` : baseTitle;

        const job = await repo.save(
          repo.create({
            workspaceId: id.workspaceId,
            batchId,
            companyId: input.companyId,
            projectId: input.projectId ?? null,
            jobKind: 'VIDEO_GENERATION',
            title: title.slice(0, 200),
            modelKey: spec.key,
            routingMode,
            status: 'QUEUED',
            progress: 0,
            estimatedCostUsd,
            inputPayloadJson: {
              referenceVideoId: refVideo.id,
              characterAssetId: characterAsset?.id ?? null,
              productKitId: productKit?.id ?? null,
              productName: productKit?.name ?? null,
              environmentPresetId: environmentPreset?.id ?? inheritedEnvPresetId,
              environmentName: resolvedEnvironmentName,
              environmentPrompt: resolvedEnvironmentPrompt || null,
              extraReferenceAssetIds: input.extraReferenceAssetIds ?? [],
              presetId: preset?.id ?? null,
              compiledPrompt,
              environmentOverride: resolvedEnvironmentPrompt || null,
              aspectRatio,
              resolution,
              durationSec,
              generateAudio: input.generateAudio ?? true,
            },
            attemptsJson: [],
            outputAssetIdsJson: [],
            createdById: id.memberId,
          }),
        );
        created.push(job);
      }

      return created;
    });

    for (const job of jobs) {
      await this.aiQueue.add(DELIVERY_STUDIO_JOB, {
        workspaceId: id.workspaceId,
        jobId: job.id,
      });
    }

    return {
      batchId,
      jobs: jobs.map((j) => this.mapJob(j)),
    };
  }

  async queueBatchVideoGeneration(
    auth: WorkspaceAuthContext,
    rawInput: unknown,
  ) {
    const parsed = batchGenerateVideosSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid batch video request.',
      );
    }
    const input = parsed.data;
    const spec = getStudioModelSpec(input.modelKey);
    if (!spec || spec.kind !== 'VIDEO') {
      throw new BadRequestException('Select a valid video model for the batch.');
    }

    const batchId = v4();
    const id = this.identity(auth);
    const createdJobs: ReturnType<DeliveryStudioService['mapJob']>[] = [];
    let totalEstimatedUsd = 0;

    for (const item of input.items) {
      const res = await this.queueVideoGeneration(auth, {
        companyId: input.companyId,
        projectId: input.projectId ?? null,
        referenceVideoId: item.referenceVideoId,
        characterAssetId: item.characterAssetId ?? null,
        productKitId: item.productKitId ?? null,
        presetId: input.presetId ?? null,
        title: item.title,
        modelKeys: [input.modelKey],
        routingMode: input.routingMode,
        masterPrompt: input.masterPrompt,
        environmentOverride: item.environmentOverride,
        customNotes: item.customNotes,
        aspectRatio: input.aspectRatio,
        resolution: input.resolution,
        durationSec: input.durationSec,
        generateAudio: input.generateAudio,
      });

      // Tag with shared batchId
      if (res.jobs.length > 0) {
        const jobIds = res.jobs.map((j) => j.id);
        await this.dataSource
          .getRepository(DeliveryStudioJobEntity)
          .update(
            { workspaceId: id.workspaceId, id: In(jobIds) },
            { batchId },
          );
        for (const j of res.jobs) {
          j.batchId = batchId;
          totalEstimatedUsd += Number(j.estimatedCostUsd ?? 0);
          createdJobs.push(j);
        }
      }
    }

    return {
      batchId,
      count: createdJobs.length,
      totalEstimatedCostUsd: totalEstimatedUsd.toFixed(4),
      jobs: createdJobs,
    };
  }

  async retryJob(
    auth: WorkspaceAuthContext,
    jobId: string,
    overrideRoutingMode?: StudioRoutingMode,
  ) {
    if (!isUuidString(jobId)) {
      throw new BadRequestException('Invalid job ID.');
    }
    const id = this.identity(auth);
    const updated = await this.dataSource.transaction(async (manager) => {
      await this.resolveActor(manager, id);
      const repo = manager.getRepository(DeliveryStudioJobEntity);
      const job = await repo.findOne({
        where: { id: jobId, workspaceId: id.workspaceId },
      });
      if (!job) throw new NotFoundException('Studio job not found.');
      if (['QUEUED', 'STAGING', 'PROCESSING', 'DOWNLOADING'].includes(job.status)) {
        throw new BadRequestException('This job is still running.');
      }
      job.status = 'QUEUED';
      job.progress = 0;
      job.errorMessage = null;
      if (overrideRoutingMode) {
        job.routingMode = overrideRoutingMode;
      }
      return repo.save(job);
    });

    await this.aiQueue.add(DELIVERY_STUDIO_JOB, {
      workspaceId: id.workspaceId,
      jobId: updated.id,
    });
    return this.mapJob(updated);
  }

  async cancelJob(auth: WorkspaceAuthContext, jobId: string) {
    if (!isUuidString(jobId)) {
      throw new BadRequestException('Invalid job ID.');
    }
    const id = this.identity(auth);
    const updated = await this.dataSource.transaction(async (manager) => {
      await this.resolveActor(manager, id);
      const repo = manager.getRepository(DeliveryStudioJobEntity);
      const job = await repo.findOne({
        where: { id: jobId, workspaceId: id.workspaceId },
      });
      if (!job) throw new NotFoundException('Studio job not found.');
      if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(job.status)) {
        return job;
      }
      job.status = 'CANCELLED';
      job.errorMessage = 'Cancelled by operator.';
      job.completedAt = new Date();
      return repo.save(job);
    });
    return this.mapJob(updated);
  }

  async setAssetApproved(
    auth: WorkspaceAuthContext,
    assetId: string,
    approved: boolean,
  ) {
    if (!isUuidString(assetId)) {
      throw new BadRequestException('Invalid studio asset ID.');
    }
    const id = this.identity(auth);
    const saved = await this.dataSource.transaction(async (manager) => {
      await this.resolveActor(manager, id);
      const repo = manager.getRepository(DeliveryStudioAssetEntity);
      const asset = await repo.findOne({
        where: { id: assetId, workspaceId: id.workspaceId },
      });
      if (!asset) throw new NotFoundException('Studio asset not found.');
      asset.approved = approved;
      return repo.save(asset);
    });
    return this.mapAsset(saved);
  }

  async archiveAsset(auth: WorkspaceAuthContext, assetId: string) {
    if (!isUuidString(assetId)) {
      throw new BadRequestException('Invalid studio asset ID.');
    }
    const id = this.identity(auth);
    await this.dataSource.transaction(async (manager) => {
      await this.resolveActor(manager, id);
      const repo = manager.getRepository(DeliveryStudioAssetEntity);
      const asset = await repo.findOne({
        where: { id: assetId, workspaceId: id.workspaceId },
      });
      if (!asset) throw new NotFoundException('Studio asset not found.');
      asset.archived = true;
      await repo.save(asset);
    });
    return { archived: true, id: assetId };
  }

  // =========================================================================
  // 6. Seamless Bridge: AI Video -> Video Assessment -> Dynamic N Text Hooks -> Drive
  // =========================================================================

  private async ensureDeliverableForStudioVideo(
    auth: WorkspaceAuthContext,
    assetId: string,
    options?: {
      serviceKey?: string;
      monthKey?: string;
      driveTargetFolderId?: string | null;
      driveSubfolderName?: string | null;
    },
  ): Promise<{ asset: DeliveryStudioAssetEntity; deliverableId: string }> {
    const id = this.identity(auth);
    const asset = await this.dataSource
      .getRepository(DeliveryStudioAssetEntity)
      .findOne({
        where: { id: assetId, workspaceId: id.workspaceId, archived: false },
      });
    if (!asset) throw new NotFoundException('Studio asset not found.');
    if (asset.kind !== 'GENERATED_VIDEO') {
      throw new BadRequestException(
        'Only generated videos can be sent to AI Text-Hook Studio.',
      );
    }

    const metaProductName =
      typeof asset.metadataJson?.productName === 'string'
        ? asset.metadataJson.productName.trim()
        : '';
    const resolvedSubfolderName =
      options?.driveSubfolderName !== undefined
        ? options.driveSubfolderName?.trim() || undefined
        : metaProductName || undefined;
    const resolvedTargetFolderId =
      options?.driveTargetFolderId !== undefined
        ? options.driveTargetFolderId?.trim() || undefined
        : undefined;

    if (asset.deliverableId) {
      if (
        options?.driveTargetFolderId !== undefined ||
        options?.driveSubfolderName !== undefined
      ) {
        const delivRepo = this.dataSource.getRepository(
          DeliveryDeliverableEntity,
        );
        const existingDeliv = await delivRepo.findOne({
          where: { id: asset.deliverableId, workspaceId: id.workspaceId },
        });
        if (existingDeliv) {
          existingDeliv.mediaMeta = {
            ...(existingDeliv.mediaMeta ?? {}),
            ...(options?.driveTargetFolderId !== undefined
              ? { driveTargetFolderId: resolvedTargetFolderId }
              : {}),
            ...(options?.driveSubfolderName !== undefined
              ? { driveSubfolderName: resolvedSubfolderName }
              : {}),
          };
          await delivRepo.save(existingDeliv);
        }
      }
      return { asset, deliverableId: asset.deliverableId };
    }

    const workspace = await this.dataSource
      .getRepository(WorkspaceEntity)
      .findOneByOrFail({ id: id.workspaceId });

    const created = await this.deliverables.createUploadedDeliverable(
      workspace,
      id.memberId,
      id.userWorkspaceId,
      {
        companyId: asset.companyId,
        projectId: asset.projectId ?? undefined,
        serviceKey: options?.serviceKey?.trim() || 'AI Video',
        monthKey: options?.monthKey || currentMonthKey(),
        title: asset.title,
        description: `Generated in Otogrow AI Studio (${asset.modelKey} via ${asset.providerUsed}).`,
        assetKind: 'VIDEO',
        originalFileName: `${asset.title.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80)}.${extensionForMime(asset.mimeType)}`,
        storageKey: asset.storageKey,
        thumbnailKey: asset.thumbnailKey,
        mimeType: asset.mimeType,
        sizeBytes: Number(asset.sizeBytes ?? 0),
        mediaMeta: {
          ...(asset.mediaMeta ?? {}),
          ...(resolvedTargetFolderId
            ? { driveTargetFolderId: resolvedTargetFolderId }
            : {}),
          ...(resolvedSubfolderName
            ? { driveSubfolderName: resolvedSubfolderName }
            : {}),
        },
        publishImmediately: false,
      },
    );

    asset.deliverableId = created.id;
    asset.approved = true;
    await this.dataSource.getRepository(DeliveryStudioAssetEntity).save(asset);

    return { asset, deliverableId: created.id };
  }

  async getClientDriveFolders(auth: WorkspaceAuthContext, companyId: string) {
    if (!isUuidString(companyId)) {
      throw new BadRequestException('Invalid client company ID.');
    }
    if (!this.driveService) {
      return {
        connected: false,
        rootFolderId: null,
        rootFolderName: null,
        folders: [] as Array<{
          id: string;
          name: string;
          webViewLink: string | null;
        }>,
      };
    }
    return this.driveService.listClientSubfolders(auth, companyId);
  }

  async saveHookDefault(auth: WorkspaceAuthContext, rawInput: unknown) {
    const parsed = saveStudioHookDefaultSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid hook default settings.',
      );
    }
    const input = parsed.data;
    const id = this.identity(auth);
    const key = input.companyId ?? '__workspace__';

    const rawStyle: Record<string, unknown> = { ...(input.styleConfig ?? {}) };
    if (
      typeof rawStyle.borderRadiusPx === 'number' &&
      rawStyle.backgroundRadiusPx === undefined
    ) {
      rawStyle.backgroundRadiusPx = rawStyle.borderRadiusPx;
    }
    delete rawStyle.borderRadiusPx;
    delete rawStyle.presetKey;

    const setting: StudioHookDefaultSetting = {
      styleConfig: rawStyle,
      startSec: input.startSec ?? 0,
      durationSec: input.durationSec ?? 3.5,
      updatedAt: new Date().toISOString(),
    };

    await this.dataSource.transaction(async (manager) => {
      await this.resolveActor(manager, id);
      const opsRepo = manager.getRepository(DeliveryOperationsEntity);
      let ops = await opsRepo.findOne({
        where: { workspaceId: id.workspaceId },
      });
      if (!ops) {
        ops = opsRepo.create({
          workspaceId: id.workspaceId,
          state: newDeliveryOperations(),
        });
      }
      const nextState = {
        ...newDeliveryOperations(),
        ...(ops.state ?? {}),
        studioHookDefaults: {
          ...(ops.state?.studioHookDefaults ?? {}),
          [key]: setting,
        },
      };
      ops.state = nextState;
      await opsRepo.save(ops);
    });

    return {
      key,
      hookDefault: setting,
    };
  }

  async saveVideoToDrive(auth: WorkspaceAuthContext, rawInput: unknown) {
    const parsed = saveStudioVideoToDriveSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid Drive save request.',
      );
    }
    const input = parsed.data;
    const { asset, deliverableId } = await this.ensureDeliverableForStudioVideo(
      auth,
      input.assetId,
      {
        serviceKey: input.serviceKey,
        monthKey: input.monthKey,
        driveTargetFolderId: input.driveTargetFolderId ?? null,
        driveSubfolderName: input.driveSubfolderName ?? undefined,
      },
    );

    if (!asset.approved) {
      asset.approved = true;
      await this.dataSource.getRepository(DeliveryStudioAssetEntity).save(asset);
    }

    let queuedDriveSync = false;
    if (this.driveService) {
      queuedDriveSync = await this.driveService
        .enqueueDeliverableSyncIfConnected(asset.workspaceId, deliverableId)
        .catch(() => false);
    }

    return {
      asset: this.mapAsset(asset),
      deliverableId,
      queuedDriveSync,
    };
  }

  async suggestHooksForVideo(
    auth: WorkspaceAuthContext,
    rawInput: unknown,
  ): Promise<{
    asset: ReturnType<DeliveryStudioService['mapAsset']>;
    deliverableId: string;
    hookProject: HookProjectDTO;
  }> {
    const parsed = suggestHooksForStudioAssetSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid hook suggestion request.',
      );
    }
    const input = parsed.data;
    const id = this.identity(auth);

    const { asset, deliverableId } = await this.ensureDeliverableForStudioVideo(
      auth,
      input.assetId,
      { serviceKey: input.serviceKey, monthKey: input.monthKey },
    );

    // Load optional saved Hook Master Prompt Preset + Examples
    let presetMasterPrompt: string | undefined;
    let presetExamples: string[] = [];
    let presetPlatform:
      | 'TIKTOK'
      | 'INSTAGRAM_REELS'
      | 'META_ADS'
      | 'YOUTUBE_SHORTS'
      | 'ALL'
      | undefined;
    let presetFunnel: 'COLD' | 'WARM' | 'RETARGETING' | 'ORGANIC' | undefined;

    if (input.hookPresetId) {
      const preset = await this.dataSource
        .getRepository(DeliveryStudioPresetEntity)
        .findOne({
          where: { id: input.hookPresetId, workspaceId: id.workspaceId },
        });
      if (preset) {
        presetMasterPrompt = preset.masterPrompt || undefined;
        presetExamples = preset.examplesJson ?? [];
        presetPlatform = preset.configJson?.platform;
        presetFunnel = preset.configJson?.funnelStage;
      }
    }

    // Step A: Assess the actual generated video + website + Brand Knowledge
    await this.videoHooks.analyzeContext(auth, {
      deliverableId,
      websiteUrl: input.websiteUrl ?? undefined,
      refreshVideo: input.refreshVideoAnalysis ?? false,
    });

    // Step B: Generate AI text hooks using Video Assessment + Brand Knowledge + Master Prompt + Fed-in Examples
    const hookProject = await this.videoHooks.generateSuggestions(auth, {
      deliverableId,
      websiteUrl: input.websiteUrl ?? undefined,
      creativeInput: {
        platform: input.platform ?? presetPlatform ?? 'ALL',
        funnelStage: input.funnelStage ?? presetFunnel ?? 'COLD',
        campaignGoal: input.campaignGoal,
        offerAngle: input.offerAngle,
        toneOverride: input.toneOverride,
        customDirection: input.customDirection,
        masterPrompt: input.masterPrompt?.trim() || presetMasterPrompt,
        exampleHooks:
          input.exampleHooks && input.exampleHooks.length > 0
            ? input.exampleHooks
            : presetExamples.length > 0
              ? presetExamples
              : undefined,
        variationCount: input.suggestionCount ?? 8,
      },
    });

    if (asset.hookProjectId !== hookProject.id) {
      asset.hookProjectId = hookProject.id;
      await this.dataSource.getRepository(DeliveryStudioAssetEntity).save(asset);
    }

    return {
      asset: this.mapAsset(asset),
      deliverableId,
      hookProject,
    };
  }

  async renderSelectedHooksForVideo(
    auth: WorkspaceAuthContext,
    rawInput: unknown,
  ): Promise<{
    asset: ReturnType<DeliveryStudioService['mapAsset']>;
    deliverableId: string;
    hookProject: HookProjectDTO;
  }> {
    const parsed = renderSelectedHooksForStudioAssetSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid hook render request.',
      );
    }
    const input = parsed.data;
    const { asset, deliverableId } = await this.ensureDeliverableForStudioVideo(
      auth,
      input.assetId,
      {
        driveTargetFolderId: input.driveTargetFolderId ?? undefined,
        driveSubfolderName: input.driveSubfolderName ?? undefined,
      },
    );

    const presetStyle = input.stylePreset
      ? HOOK_STYLE_PRESETS[input.stylePreset]
      : {};
    const rawStyleConfig: Record<string, unknown> = {
      ...(input.styleConfig ?? {}),
    };
    if (
      typeof rawStyleConfig.borderRadiusPx === 'number' &&
      rawStyleConfig.backgroundRadiusPx === undefined
    ) {
      rawStyleConfig.backgroundRadiusPx = rawStyleConfig.borderRadiusPx;
    }
    const allowedStyleKeys = new Set(Object.keys(hookStyleConfigSchema.shape));
    const filteredStyleConfig: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rawStyleConfig)) {
      if (allowedStyleKeys.has(k) && v !== undefined) {
        filteredStyleConfig[k] = v;
      }
    }
    const mergedStyleCandidate = {
      ...DEFAULT_HOOK_STYLE,
      ...presetStyle,
      ...filteredStyleConfig,
    };
    const parsedStyle = hookStyleConfigSchema.safeParse(mergedStyleCandidate);
    if (!parsedStyle.success) {
      throw new BadRequestException(
        parsedStyle.error.issues[0]?.message ?? 'Invalid hook text style configuration.',
      );
    }
    const defaultStyleConfig: Partial<HookStyleConfig> = parsedStyle.data;

    const maxDur =
      asset.mediaMeta?.durationSec && asset.mediaMeta.durationSec > 1
        ? asset.mediaMeta.durationSec
        : 12;

    const variations = input.hooks.map((h, idx) => {
      const startSec = h.startSec ?? 0;
      const endSec = Math.min(
        maxDur,
        Math.max(startSec + 1.5, h.endSec ?? Math.min(maxDur, 3.8)),
      );
      return {
        variationNumber: idx + 1,
        hookText: h.hookText,
        angleTag: h.angleTag ?? '',
        rationale: h.rationale ?? '',
        startSec,
        endSec,
      };
    });

    if (input.saveAsClientDefault) {
      const firstVar = variations[0];
      await this.saveHookDefault(auth, {
        companyId: asset.companyId,
        styleConfig: defaultStyleConfig as Record<string, unknown>,
        startSec: firstVar ? firstVar.startSec : 0,
        durationSec: firstVar
          ? Math.max(0.5, Number((firstVar.endSec - firstVar.startSec).toFixed(2)))
          : 3.5,
      }).catch(() => undefined);
    }

    // Save exact N selected variations (e.g., 3, 4, or N!)
    const savedProject = await this.videoHooks.saveProject(auth, {
      deliverableId,
      defaultStyleConfig,
      variations,
    });

    // Queue FFmpeg renders (DeliveryVideoHooksService automatically enqueues Drive Sync for each rendered variation when Drive is connected!)
    const queuedProject = await this.videoHooks.queueRender(auth, {
      deliverableId,
      variationIds: savedProject.variations.map((v) => v.id),
    });

    if (input.syncToDrive && this.driveService) {
      await this.driveService
        .enqueueDeliverableSyncIfConnected(asset.workspaceId, deliverableId)
        .catch(() => false);
    }

    if (asset.hookProjectId !== queuedProject.id) {
      asset.hookProjectId = queuedProject.id;
      await this.dataSource.getRepository(DeliveryStudioAssetEntity).save(asset);
    }

    return {
      asset: this.mapAsset(asset),
      deliverableId,
      hookProject: queuedProject,
    };
  }

  async getHookProjectForStudioVideo(
    auth: WorkspaceAuthContext,
    assetId: string,
  ): Promise<HookProjectDTO | null> {
    if (!isUuidString(assetId)) {
      throw new BadRequestException('Invalid asset ID.');
    }
    const id = this.identity(auth);
    const asset = await this.dataSource
      .getRepository(DeliveryStudioAssetEntity)
      .findOne({
        where: { id: assetId, workspaceId: id.workspaceId },
      });
    if (!asset || !asset.deliverableId) return null;
    return this.videoHooks.getOrCreateProject(auth, asset.deliverableId);
  }

  // =========================================================================
  // 7. BullMQ Async Execution Engine (WaveSpeed Primary -> Kie.ai Failover)
  // =========================================================================

  async executeJob(workspaceId: string, jobId: string): Promise<void> {
    const jobRepo = this.dataSource.getRepository(DeliveryStudioJobEntity);
    const job = await jobRepo.findOne({ where: { id: jobId, workspaceId } });
    if (!job || job.status === 'CANCELLED' || job.status === 'COMPLETED') {
      return;
    }

    job.status = 'STAGING';
    job.progress = 5;
    job.startedAt = new Date();
    job.errorMessage = null;
    await jobRepo.save(job);

    const spec = getStudioModelSpec(job.modelKey);
    if (!spec) {
      job.status = 'FAILED';
      job.errorMessage = `Unsupported model "${job.modelKey}".`;
      job.completedAt = new Date();
      await jobRepo.save(job);
      return;
    }

    try {
      const credentials = await this.loadDecryptedCredentials(workspaceId);
      const payload = job.inputPayloadJson ?? {};
      const driver = this.storage.getCurrentDriver();

      const referenceImages: StudioStageableMediaFile[] = [];
      const referenceVideos: StudioStageableMediaFile[] = [];

      // 1) Attach approved Character Sheet as @Image 1 if present
      const characterAssetId =
        typeof payload.characterAssetId === 'string'
          ? payload.characterAssetId
          : null;
      if (characterAssetId) {
        const charAsset = await this.dataSource
          .getRepository(DeliveryStudioAssetEntity)
          .findOne({ where: { id: characterAssetId, workspaceId } });
        if (charAsset) {
          referenceImages.push({
            sha256: charAsset.sha256,
            fileName: `character-${charAsset.id}.${extensionForMime(charAsset.mimeType)}`,
            mimeType: charAsset.mimeType,
            kind: 'IMAGE',
            cachedWavespeedUrl: isFreshStagedUrl(
              charAsset.stagedUrlsJson,
              'wavespeed',
            ),
            cachedKieUrl: isFreshStagedUrl(charAsset.stagedUrlsJson, 'kie'),
            readBytes: async () =>
              readStreamToBuffer(
                await driver.readFile({ filePath: charAsset.storageKey }),
              ),
            onStagedUrl: async (provider, url, expiresAt) => {
              charAsset.stagedUrlsJson = {
                ...(charAsset.stagedUrlsJson ?? {}),
                [provider]: {
                  url,
                  uploadedAt: new Date().toISOString(),
                  expiresAt,
                },
              };
              await this.dataSource
                .getRepository(DeliveryStudioAssetEntity)
                .save(charAsset);
            },
          });
        }
      }

      // 2) Attach Product Kit images (front, back, detail, etc.)
      const productKitId =
        typeof payload.productKitId === 'string' ? payload.productKitId : null;
      const requestedAssetIds = Array.isArray(payload.productAssetIds)
        ? (payload.productAssetIds as string[])
        : null;
      if (productKitId) {
        const kit = await this.dataSource
          .getRepository(DeliveryStudioProductKitEntity)
          .findOne({ where: { id: productKitId, workspaceId } });
        if (kit) {
          const kitAssets = requestedAssetIds
            ? (kit.assetsJson ?? []).filter((a) =>
                requestedAssetIds.includes(a.id),
              )
            : (kit.assetsJson ?? []);
          for (const item of kitAssets) {
            referenceImages.push({
              sha256: item.sha256,
              fileName:
                item.originalFileName ||
                `${item.role.toLowerCase()}.${extensionForMime(item.mimeType)}`,
              mimeType: item.mimeType,
              kind: 'IMAGE',
              cachedWavespeedUrl: isFreshStagedUrl(
                item.stagedUrls,
                'wavespeed',
              ),
              cachedKieUrl: isFreshStagedUrl(item.stagedUrls, 'kie'),
              readBytes: async () =>
                readStreamToBuffer(
                  await driver.readFile({ filePath: item.storageKey }),
                ),
              onStagedUrl: async (provider, url, expiresAt) => {
                item.stagedUrls = {
                  ...(item.stagedUrls ?? {}),
                  [provider]: {
                    url,
                    uploadedAt: new Date().toISOString(),
                    expiresAt,
                  },
                };
                await this.dataSource
                  .getRepository(DeliveryStudioProductKitEntity)
                  .save(kit);
              },
            });
          }
        }
      }

      // 2b) Attach uploaded Avatar & Environment preset reference photos (when present)
      const presetIdsToStage: Array<{
        id: string;
        prefix: string;
      }> = [];
      if (typeof payload.avatarPresetId === 'string' && !characterAssetId) {
        presetIdsToStage.push({ id: payload.avatarPresetId, prefix: 'avatar' });
      }
      if (typeof payload.environmentPresetId === 'string' && !characterAssetId) {
        presetIdsToStage.push({
          id: payload.environmentPresetId,
          prefix: 'environment',
        });
      }
      if (presetIdsToStage.length > 0) {
        const presetRepo = this.dataSource.getRepository(
          DeliveryStudioPresetEntity,
        );
        for (const specRef of presetIdsToStage) {
          const refPreset = await presetRepo.findOne({
            where: { id: specRef.id, workspaceId },
          });
          const refKey = refPreset?.configJson?.referenceImageStorageKey;
          const refMime = refPreset?.configJson?.referenceImageMimeType;
          const refSha = refPreset?.configJson?.referenceImageSha256;
          if (refPreset && refKey && refMime && refSha) {
            referenceImages.push({
              sha256: refSha,
              fileName: `${specRef.prefix}-${refPreset.id}.${extensionForMime(refMime)}`,
              mimeType: refMime,
              kind: 'IMAGE',
              readBytes: async () =>
                readStreamToBuffer(await driver.readFile({ filePath: refKey })),
              onStagedUrl: async () => undefined,
            });
          }
        }
      }

      // 3) Attach Reference Video (@Video 1) for video generation
      const referenceVideoId =
        typeof payload.referenceVideoId === 'string'
          ? payload.referenceVideoId
          : null;
      if (referenceVideoId) {
        const refVideo = await this.dataSource
          .getRepository(DeliveryStudioReferenceVideoEntity)
          .findOne({ where: { id: referenceVideoId, workspaceId } });
        if (!refVideo) {
          throw new Error('Reference video was removed before generation.');
        }
        referenceVideos.push({
          sha256: refVideo.sha256,
          fileName:
            refVideo.originalFileName ||
            `ref-${refVideo.id}.${extensionForMime(refVideo.mimeType)}`,
          mimeType: refVideo.mimeType,
          kind: 'VIDEO',
          cachedWavespeedUrl: isFreshStagedUrl(
            refVideo.stagedUrlsJson,
            'wavespeed',
          ),
          cachedKieUrl: isFreshStagedUrl(refVideo.stagedUrlsJson, 'kie'),
          readBytes: async () =>
            readStreamToBuffer(
              await driver.readFile({ filePath: refVideo.storageKey }),
            ),
          onStagedUrl: async (provider, url, expiresAt) => {
            refVideo.stagedUrlsJson = {
              ...(refVideo.stagedUrlsJson ?? {}),
              [provider]: {
                url,
                uploadedAt: new Date().toISOString(),
                expiresAt,
              },
            };
            await this.dataSource
              .getRepository(DeliveryStudioReferenceVideoEntity)
              .save(refVideo);
          },
        });
      }

      const compiledPrompt =
        typeof payload.compiledPrompt === 'string'
          ? payload.compiledPrompt
          : job.title;

      const execResult = await this.router.execute(
        {
          modelKey: job.modelKey,
          prompt: compiledPrompt,
          routingMode: job.routingMode,
          aspectRatio:
            typeof payload.aspectRatio === 'string'
              ? payload.aspectRatio
              : undefined,
          resolution:
            typeof payload.resolution === 'string'
              ? payload.resolution
              : undefined,
          quality:
            typeof payload.quality === 'string'
              ? (payload.quality as 'low' | 'medium' | 'high' | 'max')
              : undefined,
          durationSec:
            typeof payload.durationSec === 'number'
              ? payload.durationSec
              : undefined,
          generateAudio:
            typeof payload.generateAudio === 'boolean'
              ? payload.generateAudio
              : undefined,
          referenceImages,
          referenceVideos,
          onProgress: async (status, progress, externalTaskId) => {
            await jobRepo.update(
              { id: job.id, workspaceId },
              {
                status,
                progress,
                ...(externalTaskId ? { externalTaskId } : {}),
              },
            );
          },
        },
        credentials,
      );

      // Download and persist every output canonically before provider TTL expires
      const expectedKind = spec.kind;
      const assetKind: StudioAssetKind =
        job.jobKind === 'CHARACTER_SHEET'
          ? 'CHARACTER_SHEET'
          : 'GENERATED_VIDEO';
      const createdAssetIds: string[] = [];
      const assetRepo = this.dataSource.getRepository(DeliveryStudioAssetEntity);

      for (let idx = 0; idx < execResult.outputUrls.length; idx += 1) {
        const outUrl = execResult.outputUrls[idx];
        const downloaded = await this.router.downloadOutput(
          outUrl,
          expectedKind,
        );
        const assetId = v4();
        const ext = extensionForMime(downloaded.mimeType);
        const storageKey = `delivery-studio/${workspaceId}/outputs/${assetId}.${ext}`;
        const sha256 = createHash('sha256')
          .update(downloaded.bytes)
          .digest('hex');

        await driver.writeFileStream({
          filePath: storageKey,
          stream: Readable.from(downloaded.bytes),
          mimeType: downloaded.mimeType,
        });

        let thumbnailKey: string | null = null;
        let mediaMeta: DeliverableMediaMeta = {};

        if (expectedKind === 'VIDEO') {
          const tempDir = await fs.mkdtemp(
            path.join(os.tmpdir(), 'otogrow-studio-out-'),
          );
          try {
            const tempVid = path.join(tempDir, `out.${ext}`);
            const tempThumb = path.join(tempDir, 'thumb.jpg');
            await fs.writeFile(tempVid, downloaded.bytes);
            mediaMeta = await this.probe.probeMedia(tempVid);
            const okThumb = await this.probe.extractVideoThumbnail(
              tempVid,
              tempThumb,
              mediaMeta.durationSec,
            );
            if (okThumb) {
              thumbnailKey = `delivery-studio/${workspaceId}/outputs/${assetId}-thumb.jpg`;
              await driver.writeFileStream({
                filePath: thumbnailKey,
                stream: createReadStream(tempThumb),
                mimeType: 'image/jpeg',
              });
            }
          } finally {
            await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
          }
        }

        const savedAsset = await assetRepo.save(
          assetRepo.create({
            id: assetId,
            workspaceId,
            companyId: job.companyId,
            projectId: job.projectId,
            kind: assetKind,
            productKitId,
            referenceVideoId,
            characterAssetId,
            presetId:
              typeof payload.presetId === 'string' ? payload.presetId : null,
            jobId: job.id,
            title:
              execResult.outputUrls.length > 1
                ? `${job.title} #${idx + 1}`
                : job.title,
            promptUsed: compiledPrompt,
            modelKey: job.modelKey,
            providerUsed: execResult.providerUsed,
            storageKey,
            thumbnailKey,
            mimeType: downloaded.mimeType,
            sizeBytes: String(downloaded.bytes.length),
            sha256,
            mediaMeta,
            stagedUrlsJson: {},
            approved: false,
            tagsJson: [],
            metadataJson: {
              failoverTriggered: execResult.failoverTriggered,
              externalTaskId: execResult.externalTaskId,
              aspectRatio: payload.aspectRatio ?? null,
              resolution: payload.resolution ?? null,
              environmentOverride: payload.environmentOverride ?? null,
              avatarPresetId: payload.avatarPresetId ?? null,
              avatarName: payload.avatarName ?? null,
              environmentPresetId: payload.environmentPresetId ?? null,
              environmentName: payload.environmentName ?? null,
              environmentPrompt: payload.environmentPrompt ?? null,
              productName: payload.productName ?? null,
            },
            archived: false,
            createdById: job.createdById,
          }),
        );
        createdAssetIds.push(savedAsset.id);
      }

      job.status = 'COMPLETED';
      job.progress = 100;
      job.providerUsed = execResult.providerUsed;
      job.failoverTriggered = execResult.failoverTriggered;
      job.externalTaskId = execResult.externalTaskId;
      job.attemptsJson = execResult.attempts;
      job.outputAssetIdsJson = createdAssetIds;
      job.actualCostUsd = job.estimatedCostUsd;
      job.completedAt = new Date();
      await jobRepo.save(job);
    } catch (error) {
      const attempts =
        (
          error as StudioProviderCallError & {
            attempts?: StudioProviderAttemptRecord[];
          }
        )?.attempts ?? job.attemptsJson ?? [];
      const message =
        error instanceof Error
          ? error.message.slice(0, 500)
          : 'AI Studio generation failed.';
      this.logger.warn(`Studio job ${job.id} failed: ${message}`);
      job.status = 'FAILED';
      job.errorMessage = message;
      job.attemptsJson = attempts;
      job.completedAt = new Date();
      await jobRepo.save(job);
    }
  }

  private async loadDecryptedCredentials(
    workspaceId: string,
  ): Promise<StudioProviderCredentials> {
    const row = await this.dataSource
      .getRepository(DeliveryStudioProviderConfigEntity)
      .createQueryBuilder('cfg')
      .addSelect('cfg.encryptedWavespeedKey')
      .addSelect('cfg.encryptedKieKey')
      .where('cfg."workspaceId" = :workspaceId', { workspaceId })
      .getOne();

    const wavespeedApiKey = row?.encryptedWavespeedKey
      ? this.encryption.decryptVersionedOrThrow(
          row.encryptedWavespeedKey as EncryptedString,
          { workspaceId },
        )
      : null;
    const kieApiKey = row?.encryptedKieKey
      ? this.encryption.decryptVersionedOrThrow(
          row.encryptedKieKey as EncryptedString,
          { workspaceId },
        )
      : null;

    return {
      wavespeedApiKey,
      wavespeedEnabled: row?.wavespeedEnabled ?? true,
      kieApiKey,
      kieEnabled: row?.kieEnabled ?? true,
    };
  }

  // =========================================================================
  // 8. Signed Media Stream Resolution Helper (for Files Controller)
  // =========================================================================

  async resolveMediaStreamTarget(
    workspaceId: string,
    kind:
      | 'ref-video'
      | 'ref-thumb'
      | 'product-asset'
      | 'studio-asset'
      | 'studio-thumb'
      | 'preset-thumb',
    id: string,
    subId?: string,
  ): Promise<{ storageKey: string; mimeType: string; sizeBytes: number } | null> {
    if (!isUuidString(id)) return null;

    if (kind === 'preset-thumb') {
      const preset = await this.dataSource
        .getRepository(DeliveryStudioPresetEntity)
        .findOne({ where: { id, workspaceId } });
      const key = preset?.configJson?.referenceImageStorageKey;
      if (!key) return null;
      return {
        storageKey: key,
        mimeType: preset?.configJson?.referenceImageMimeType || 'image/jpeg',
        sizeBytes: 0,
      };
    }

    if (kind === 'ref-video' || kind === 'ref-thumb') {
      const row = await this.dataSource
        .getRepository(DeliveryStudioReferenceVideoEntity)
        .findOne({ where: { id, workspaceId } });
      if (!row) return null;
      if (kind === 'ref-thumb') {
        if (!row.thumbnailKey) return null;
        return {
          storageKey: row.thumbnailKey,
          mimeType: 'image/jpeg',
          sizeBytes: 0,
        };
      }
      return {
        storageKey: row.storageKey,
        mimeType: row.mimeType,
        sizeBytes: Number(row.sizeBytes ?? 0),
      };
    }

    if (kind === 'product-asset') {
      if (!subId) return null;
      const kit = await this.dataSource
        .getRepository(DeliveryStudioProductKitEntity)
        .findOne({ where: { id, workspaceId } });
      const item = kit?.assetsJson?.find((a) => a.id === subId);
      if (!item) return null;
      return {
        storageKey: item.storageKey,
        mimeType: item.mimeType,
        sizeBytes: item.sizeBytes,
      };
    }

    const asset = await this.dataSource
      .getRepository(DeliveryStudioAssetEntity)
      .findOne({ where: { id, workspaceId } });
    if (!asset) return null;
    if (kind === 'studio-thumb') {
      const key = asset.thumbnailKey ?? (asset.kind === 'CHARACTER_SHEET' ? asset.storageKey : null);
      if (!key) return null;
      return {
        storageKey: key,
        mimeType: asset.thumbnailKey ? 'image/jpeg' : asset.mimeType,
        sizeBytes: 0,
      };
    }
    return {
      storageKey: asset.storageKey,
      mimeType: asset.mimeType,
      sizeBytes: Number(asset.sizeBytes ?? 0),
    };
  }

  // =========================================================================
  // 9. Agentic Capabilities Manifest (Self-Describing Tool Schema for Agents)
  // =========================================================================

  getAgentCapabilitiesManifest() {
    return {
      version: '1.0.0',
      service: 'otogrow-ai-studio',
      basePath: '/portal/delivery-studio/agent',
      models: STUDIO_MODEL_CATALOG.map((m) => ({
        key: m.key,
        label: m.label,
        vendor: m.vendor,
        kind: m.kind,
        tier: m.tier,
        capabilities: m.capabilities,
        pricing: m.pricing,
      })),
      endpoints: [
        {
          method: 'GET',
          path: '/portal/delivery-studio/agent/capabilities',
          description: 'List all available models, pricing, and agent tool endpoints.',
        },
        {
          method: 'GET',
          path: '/portal/delivery-studio/agent/workspace',
          query: ['companyId?', 'projectId?'],
          description:
            'Inspect clients, projects, saved Master Prompt Presets, Reference Videos, Product Kits, Character Sheets, Generated Videos, and active Jobs.',
        },
        {
          method: 'POST',
          path: '/portal/delivery-studio/agent/presets',
          description:
            'Create or update a dynamic Master Prompt Preset (CHARACTER_SHEET, VIDEO_GENERATION, TEXT_HOOK, CASTING_PERSONA) including custom angle layouts and hook examples.',
        },
        {
          method: 'POST',
          path: '/portal/delivery-studio/agent/product-kits',
          description: 'Create or update a client/project Product Kit.',
        },
        {
          method: 'POST',
          path: '/portal/delivery-studio/agent/character-sheets/generate',
          description:
            'Queue Character Sheet generation with any image model, saved preset, angle layout (2-angle, 4-angle, single, custom), and WaveSpeed -> Kie.ai failover.',
        },
        {
          method: 'POST',
          path: '/portal/delivery-studio/agent/videos/generate',
          description:
            'Queue single or multi-model comparison AI video generation from a Reference Video + Character Sheet + optional environment override.',
        },
        {
          method: 'POST',
          path: '/portal/delivery-studio/agent/videos/batch',
          description:
            'Queue a batch matrix of up to 60 AI videos in one call with automatic WaveSpeed -> Kie.ai failover.',
        },
        {
          method: 'GET',
          path: '/portal/delivery-studio/agent/jobs/:jobId',
          description: 'Poll generation job status, failover attempts, and output asset IDs.',
        },
        {
          method: 'POST',
          path: '/portal/delivery-studio/agent/videos/:assetId/hooks/suggest',
          description:
            'Assess a generated AI video with Gemini + Brand Knowledge + Hook Master Prompt + fed-in Example Hooks to generate ranked text-hook suggestions.',
        },
        {
          method: 'POST',
          path: '/portal/delivery-studio/agent/videos/:assetId/hooks/render-and-sync',
          description:
            'Render N selected text-hook variations onto the video via FFmpeg and automatically sync to Google Drive & Deliverables Hub.',
        },
      ],
    };
  }

  async getJobById(auth: WorkspaceAuthContext, jobId: string) {
    if (!isUuidString(jobId)) {
      throw new BadRequestException('Invalid job ID.');
    }
    const id = this.identity(auth);
    const job = await this.dataSource.transaction(async (manager) => {
      await this.resolveActor(manager, id);
      return manager.getRepository(DeliveryStudioJobEntity).findOne({
        where: { id: jobId, workspaceId: id.workspaceId },
      });
    });
    if (!job) throw new NotFoundException('Studio job not found.');
    return this.mapJob(job);
  }
}
