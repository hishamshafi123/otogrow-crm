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
import { createReadStream, createWriteStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
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
import {
  DeliveryMediaProbeService,
  normalizeTrimRange,
  type VideoComposeClipInput,
} from 'src/modules/delivery/deliverables/delivery-media-probe.service';
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
  type StudioGeminiConfigSetting,
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
  analyzeVideoPromptSchema,
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
  buildStructuredFallbackVideoPrompt,
  DeliveryStudioPromptAiService,
  type StudioGeminiStatus,
  type StudioPromptImageInput,
} from 'src/modules/delivery/studio/delivery-studio-prompt-ai.service';
import {
  DeliveryStudioProviderRouterService,
  StudioProviderCallError,
  type StudioProviderCredentials,
  type StudioProviderId,
  type StudioRouterExecutionResult,
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

export type StudioApiInputMediaRef = {
  mediaKind:
    | 'ref-video'
    | 'ref-thumb'
    | 'product-asset'
    | 'studio-asset'
    | 'studio-thumb'
    | 'preset-thumb';
  id: string;
  subId?: string;
};

export type StudioApiInputImageRef = {
  index: number;
  token: string;
  role: 'CHARACTER_SHEET' | 'PRODUCT' | 'AVATAR' | 'ENVIRONMENT';
  label: string;
  fileName: string;
  mimeType: string;
  mediaPath: string | null;
  stagedUrl: string | null;
  sourceRef?: StudioApiInputMediaRef;
};

export type StudioApiInputVideoRef = {
  index: number;
  token: string;
  role: 'REFERENCE_VIDEO';
  label: string;
  fileName: string;
  mimeType: string;
  durationSec?: number | null;
  mediaPath: string | null;
  thumbnailPath: string | null;
  stagedUrl: string | null;
  sourceRef?: StudioApiInputMediaRef;
  thumbRef?: StudioApiInputMediaRef | null;
};

export type StudioApiRequestSnapshot = {
  capturedAt: string;
  provider: StudioProviderId | null;
  endpoint: string | null;
  modelKey: string;
  modelLabel: string;
  routingMode: StudioRoutingMode;
  failoverTriggered: boolean;
  externalTaskId: string | null;
  prompt: string;
  images: StudioApiInputImageRef[];
  videos: StudioApiInputVideoRef[];
  rawPayload: Record<string, unknown> | null;
};

const buildVideoReferenceMappingNote = (params: {
  usesAtMentionTokens: boolean;
  hasCharacterSheet: boolean;
  productImageCount: number;
  productName: string;
  hasReferenceVideo: boolean;
  existingPrompt: string;
}): string => {
  const imgPrefix = params.usesAtMentionTokens ? '@image' : 'Image ';
  const vidPrefix = params.usesAtMentionTokens ? '@video' : 'Video ';

  // Skip if prompt already explicitly maps Image 2 / @image2 or higher
  if (/(?:@?image\s*2\b)/i.test(params.existingPrompt)) {
    return '';
  }
  // Also skip if there are no separate product images and the prompt already maps @image1 + @video1
  if (
    params.productImageCount === 0 &&
    /(?:@?image\s*1\b)/i.test(params.existingPrompt) &&
    /(?:@?video\s*1\b)/i.test(params.existingPrompt)
  ) {
    return '';
  }

  const parts: string[] = [];
  let nextIdx = 1;

  if (params.hasCharacterSheet) {
    parts.push(
      `${imgPrefix}${nextIdx} is the character sheet of the model wearing the full outfit`,
    );
    nextIdx += 1;
  }

  if (params.productImageCount > 0) {
    const tokens: string[] = [];
    for (let i = 0; i < params.productImageCount; i += 1) {
      tokens.push(`${imgPrefix}${nextIdx + i}`);
    }
    parts.push(
      `${tokens.join(', ')} ${tokens.length === 1 ? 'is the exact product photo' : 'are exact product photos'} of "${params.productName}" (match every front/back graphic, logo, placement, neckline, and fabric detail)`,
    );
  }

  if (params.hasReferenceVideo) {
    parts.push(
      `${vidPrefix}1 is the reference video (preserve exact camera angles, subject motion, shot transitions, and pacing)`,
    );
  }

  if (parts.length === 0) return '';
  return `Reference inputs: ${parts.join('; ')}.`;
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
  geminiConfigured: boolean;
  geminiKeyLast4: string | null;
  geminiModelId: string | null;
  geminiSource: 'STUDIO_KEY' | 'ADMIN_CONFIG' | 'ENV' | null;
  geminiVerifiedAt: string | null;
  geminiLastError: string | null;
  defaultRoutingMode: StudioRoutingMode;
  defaultImageModel: string;
  defaultVideoModel: string;
  maxConcurrentJobs: number;
  updatedAt: string | null;
};

@Injectable()
export class DeliveryStudioService {
  private readonly logger = new Logger(DeliveryStudioService.name);
  private readonly activeJobExecutions = new Set<string>();

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
    @Optional() private readonly promptAi?: DeliveryStudioPromptAiService,
  ) {}

  private resolvePrimaryProviderForPricing(
    routingMode: StudioRoutingMode,
    providerConfig: DeliveryStudioProviderConfigEntity | null,
  ): StudioProviderId {
    if (routingMode === 'KIE_ONLY') return 'kie';
    if (routingMode === 'WAVESPEED_ONLY') return 'wavespeed';
    const hasWaveSpeed = Boolean(
      (providerConfig?.wavespeedEnabled ?? true) &&
        providerConfig?.wavespeedKeyLast4,
    );
    const hasKie = Boolean(
      (providerConfig?.kieEnabled ?? true) && providerConfig?.kieKeyLast4,
    );
    if (!hasWaveSpeed && hasKie) return 'kie';
    return 'wavespeed';
  }

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

  private readDecryptedGeminiKeyFromConfig(
    workspaceId: string,
    geminiCfg: StudioGeminiConfigSetting | null | undefined,
  ): string | null {
    const encrypted = geminiCfg?.encryptedApiKey;
    if (!encrypted) return null;
    try {
      return this.encryption.decryptVersionedOrThrow(
        encrypted as EncryptedString,
        { workspaceId },
      );
    } catch (err) {
      this.logger.warn(
        `Failed to decrypt studio Gemini API key for workspace ${workspaceId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  private mapProviderConfig(
    row: DeliveryStudioProviderConfigEntity | null,
    geminiCfg?: StudioGeminiConfigSetting | null,
    geminiStatus?: StudioGeminiStatus | null,
  ): StudioProviderConfigDTO {
    const status =
      geminiStatus ??
      this.promptAi?.getGeminiStatus(
        geminiCfg?.encryptedApiKey ? '__configured__' : null,
      ) ?? {
        configured: Boolean(geminiCfg?.keyLast4),
        modelId: geminiCfg?.keyLast4 ? 'gemini-2.5-flash' : null,
        source: geminiCfg?.keyLast4 ? ('STUDIO_KEY' as const) : null,
      };
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
      geminiConfigured: status.configured,
      geminiKeyLast4: geminiCfg?.keyLast4 ?? null,
      geminiModelId: status.modelId,
      geminiSource: status.source,
      geminiVerifiedAt: geminiCfg?.verifiedAt ?? null,
      geminiLastError: geminiCfg?.lastError ?? null,
      defaultRoutingMode: row?.defaultRoutingMode ?? 'AUTO_FAILOVER',
      defaultImageModel: row?.defaultImageModel ?? 'nano-banana-2.1',
      defaultVideoModel: row?.defaultVideoModel ?? 'seedance-2.5',
      maxConcurrentJobs: row?.maxConcurrentJobs ?? 4,
      updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
    };
  }

  private mapReferenceVideo(
    row: DeliveryStudioReferenceVideoEntity,
    usageCounts?: { totalCount: number; clientCount: number },
  ) {
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
      usageCount: usageCounts?.totalCount ?? 0,
      clientUsageCount: usageCounts?.clientCount ?? 0,
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

  private hydrateApiRequestSnapshot(
    workspaceId: string,
    raw: unknown,
  ): StudioApiRequestSnapshot | null {
    if (!raw || typeof raw !== 'object') return null;
    const snap = raw as StudioApiRequestSnapshot;
    const images: StudioApiInputImageRef[] = Array.isArray(snap.images)
      ? snap.images.map((img) => ({
          ...img,
          mediaPath: img.sourceRef
            ? this.signedMediaPath(
                workspaceId,
                img.sourceRef.mediaKind,
                img.sourceRef.id,
                img.sourceRef.subId,
              )
            : (img.mediaPath ?? null),
        }))
      : [];
    const videos: StudioApiInputVideoRef[] = Array.isArray(snap.videos)
      ? snap.videos.map((vid) => ({
          ...vid,
          mediaPath: vid.sourceRef
            ? this.signedMediaPath(
                workspaceId,
                vid.sourceRef.mediaKind,
                vid.sourceRef.id,
                vid.sourceRef.subId,
              )
            : (vid.mediaPath ?? null),
          thumbnailPath: vid.thumbRef
            ? this.signedMediaPath(
                workspaceId,
                vid.thumbRef.mediaKind,
                vid.thumbRef.id,
                vid.thumbRef.subId,
              )
            : (vid.thumbnailPath ?? null),
        }))
      : [];

    return {
      ...snap,
      images,
      videos,
    };
  }

  private mapAsset(row: DeliveryStudioAssetEntity) {
    const rawMeta = (row.metadataJson ?? {}) as Record<string, unknown>;
    const hydratedApiRequest = this.hydrateApiRequestSnapshot(
      row.workspaceId,
      rawMeta.apiRequest,
    );
    const metadata = hydratedApiRequest
      ? { ...rawMeta, apiRequest: hydratedApiRequest }
      : rawMeta;
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
      metadata,
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
    const payload = (row.inputPayloadJson ?? {}) as Record<string, unknown>;
    const apiRequest = this.hydrateApiRequestSnapshot(
      row.workspaceId,
      payload.apiRequest,
    );
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
      apiRequest,
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
    const { row, ops } = await this.dataSource.transaction(async (manager) => {
      await this.resolveActor(manager, id);
      const [configRow, opsRow] = await Promise.all([
        manager
          .getRepository(DeliveryStudioProviderConfigEntity)
          .findOne({ where: { workspaceId: id.workspaceId } }),
        manager
          .getRepository(DeliveryOperationsEntity)
          .findOneBy({ workspaceId: id.workspaceId }),
      ]);
      return { row: configRow, ops: opsRow };
    });
    const geminiCfg = ops?.state?.studioGeminiConfig ?? null;
    const decryptedGeminiKey = this.readDecryptedGeminiKeyFromConfig(
      id.workspaceId,
      geminiCfg,
    );
    const geminiStatus = this.promptAi?.getGeminiStatus(decryptedGeminiKey);
    return this.mapProviderConfig(row, geminiCfg, geminiStatus);
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

    const { saved, geminiCfg } = await this.dataSource.transaction(
      async (manager) => {
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

        const opsRepo = manager.getRepository(DeliveryOperationsEntity);
        let ops = await opsRepo.findOne({
          where: { workspaceId: id.workspaceId },
        });
        let nextGeminiCfg: StudioGeminiConfigSetting | null =
          ops?.state?.studioGeminiConfig ?? null;

        if (input.clearGeminiKey || (input.geminiApiKey && input.geminiApiKey.trim())) {
          if (!ops) {
            ops = opsRepo.create({
              workspaceId: id.workspaceId,
              state: newDeliveryOperations(),
            });
          }
          if (input.clearGeminiKey) {
            nextGeminiCfg = {
              encryptedApiKey: null,
              keyLast4: null,
              verifiedAt: null,
              lastError: null,
              updatedAt: new Date().toISOString(),
            };
          } else if (input.geminiApiKey && input.geminiApiKey.trim()) {
            const clean = input.geminiApiKey.trim();
            nextGeminiCfg = {
              encryptedApiKey: this.encryption.encryptVersioned(
                clean as PlaintextString,
                { workspaceId: id.workspaceId },
              ),
              keyLast4: clean.slice(-4),
              verifiedAt: null,
              lastError: null,
              updatedAt: new Date().toISOString(),
            };
          }
          ops.state = {
            ...newDeliveryOperations(),
            ...(ops.state ?? {}),
            studioGeminiConfig: nextGeminiCfg ?? undefined,
          };
          await opsRepo.save(ops);
        }

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

        return { saved: persisted, geminiCfg: nextGeminiCfg };
      },
    );

    const decryptedGeminiKey = this.readDecryptedGeminiKeyFromConfig(
      id.workspaceId,
      geminiCfg,
    );
    const geminiStatus = this.promptAi?.getGeminiStatus(decryptedGeminiKey);
    return this.mapProviderConfig(saved, geminiCfg, geminiStatus);
  }

  async testProviderConnection(
    auth: WorkspaceAuthContext,
    provider: StudioProviderId | 'gemini',
    rawApiKey?: string | null,
  ): Promise<{ ok: boolean; message: string; config: StudioProviderConfigDTO }> {
    const id = this.identity(auth);
    if (provider !== 'wavespeed' && provider !== 'kie' && provider !== 'gemini') {
      throw new BadRequestException(
        'Provider must be "wavespeed", "kie", or "gemini".',
      );
    }

    if (provider === 'gemini') {
      const { keyToTest, hadStoredKey } = await this.dataSource.transaction(
        async (manager) => {
          await this.resolveActor(manager, id);
          if (rawApiKey && rawApiKey.trim()) {
            return { keyToTest: rawApiKey.trim(), hadStoredKey: false };
          }
          const ops = await manager
            .getRepository(DeliveryOperationsEntity)
            .findOneBy({ workspaceId: id.workspaceId });
          const decrypted = this.readDecryptedGeminiKeyFromConfig(
            id.workspaceId,
            ops?.state?.studioGeminiConfig,
          );
          if (decrypted) {
            return { keyToTest: decrypted, hadStoredKey: true };
          }
          const fallbackEnvKey =
            this.twentyConfig.get('GOOGLE_API_KEY')?.trim() ||
            process.env.GOOGLE_API_KEY?.trim() ||
            process.env.GEMINI_API_KEY?.trim() ||
            process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
            null;
          return { keyToTest: fallbackEnvKey, hadStoredKey: false };
        },
      );

      if (!keyToTest) {
        return {
          ok: false,
          message:
            'No Google Gemini API key configured yet. Paste an AIza… key from Google AI Studio and click Test Key.',
          config: await this.getProviderConfig(auth),
        };
      }

      const check = this.promptAi
        ? await this.promptAi.testGeminiApiKey(keyToTest)
        : { ok: false, message: 'Prompt AI service is unavailable.' };

      if (hadStoredKey || (rawApiKey && rawApiKey.trim())) {
        await this.dataSource.transaction(async (manager) => {
          const opsRepo = manager.getRepository(DeliveryOperationsEntity);
          const ops = await opsRepo.findOne({
            where: { workspaceId: id.workspaceId },
          });
          if (!ops?.state?.studioGeminiConfig?.encryptedApiKey) return;
          ops.state = {
            ...newDeliveryOperations(),
            ...(ops.state ?? {}),
            studioGeminiConfig: {
              ...ops.state.studioGeminiConfig,
              verifiedAt: check.ok ? new Date().toISOString() : null,
              lastError: check.ok ? null : check.message,
              updatedAt: new Date().toISOString(),
            },
          };
          await opsRepo.save(ops);
        });
      }

      return {
        ok: check.ok,
        message: check.message,
        config: await this.getProviderConfig(auth),
      };
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

    const { updated, ops } = await this.dataSource.transaction(
      async (manager) => {
        const repo = manager.getRepository(DeliveryStudioProviderConfigEntity);
        const [row, opsRow] = await Promise.all([
          repo.findOne({ where: { workspaceId: id.workspaceId } }),
          manager
            .getRepository(DeliveryOperationsEntity)
            .findOneBy({ workspaceId: id.workspaceId }),
        ]);
        if (!row) return { updated: null, ops: opsRow };
        if (provider === 'wavespeed') {
          row.wavespeedVerifiedAt = check.ok ? new Date() : null;
          row.wavespeedLastError = check.ok ? null : check.message;
        } else {
          row.kieVerifiedAt = check.ok ? new Date() : null;
          row.kieLastError = check.ok ? null : check.message;
        }
        return { updated: await repo.save(row), ops: opsRow };
      },
    );

    const geminiCfg = ops?.state?.studioGeminiConfig ?? null;
    const decryptedGeminiKey = this.readDecryptedGeminiKeyFromConfig(
      id.workspaceId,
      geminiCfg,
    );
    const geminiStatus = this.promptAi?.getGeminiStatus(decryptedGeminiKey);

    return {
      ok: check.ok,
      message: check.message,
      config: this.mapProviderConfig(updated, geminiCfg, geminiStatus),
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

      const assetRepo = manager.getRepository(DeliveryStudioAssetEntity);
      const refUsageRows =
        typeof assetRepo.createQueryBuilder === 'function'
          ? await assetRepo
              .createQueryBuilder('a')
              .select('a."referenceVideoId"', 'referenceVideoId')
              .addSelect('COUNT(*)', 'totalCount')
              .addSelect(
                companyId
                  ? 'SUM(CASE WHEN a."companyId" = :usageCompanyId THEN 1 ELSE 0 END)'
                  : '0',
                'clientCount',
              )
              .where('a."workspaceId" = :usageWorkspaceId', {
                usageWorkspaceId: id.workspaceId,
              })
              .andWhere('a."referenceVideoId" IS NOT NULL')
              .andWhere('a.kind = :videoKind', { videoKind: 'GENERATED_VIDEO' })
              .andWhere('a."providerUsed" <> :editorProvider', {
                editorProvider: 'editor',
              })
              .andWhere('a.archived = false')
              .setParameters(companyId ? { usageCompanyId: companyId } : {})
              .groupBy('a."referenceVideoId"')
              .getRawMany<{
                referenceVideoId: string;
                totalCount: string | number;
                clientCount: string | number;
              }>()
          : [];

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
        refUsageRows,
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
      refUsageRows,
    } = txResult;

    const refUsageMap = new Map<
      string,
      { totalCount: number; clientCount: number }
    >();
    for (const row of refUsageRows) {
      if (!row.referenceVideoId) continue;
      refUsageMap.set(row.referenceVideoId, {
        totalCount: Number(row.totalCount ?? 0) || 0,
        clientCount: Number(row.clientCount ?? 0) || 0,
      });
    }

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
        const isClothingBrand = tags.some((t) => {
          const normalized = t.trim().toLowerCase();
          return (
            normalized === 'clothing brand' ||
            normalized === 'clothing' ||
            normalized === 'apparel'
          );
        });
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

    const geminiCfg = operations?.state.studioGeminiConfig ?? null;
    const decryptedGeminiKey = this.readDecryptedGeminiKeyFromConfig(
      id.workspaceId,
      geminiCfg,
    );
    const geminiStatus = this.promptAi?.getGeminiStatus(decryptedGeminiKey);

    return {
      canManageProviders: actor.isAdmin || actor.isManager,
      catalog: STUDIO_MODEL_CATALOG,
      hookStylePresets: HOOK_STYLE_PRESETS,
      providerConfig: this.mapProviderConfig(
        providerConfig,
        geminiCfg,
        geminiStatus,
      ),
      clients,
      selectedClientTags: selectedClientInfo?.tags ?? [],
      selectedClientIsClothingBrand: Boolean(
        selectedClientInfo?.isClothingBrand,
      ),
      presets: scopedPresets.map((p) => this.mapPreset(p)),
      referenceVideos: refVideos.map((rv) =>
        this.mapReferenceVideo(rv, refUsageMap.get(rv.id)),
      ),
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
      clientDurationSec?: number;
      clientWidth?: number;
      clientHeight?: number;
      trimStartSec?: number;
      trimEndSec?: number;
    },
  ) {
    const id = this.identity(auth);
    const videoId = v4();
    const thumbKey = `delivery-studio/${id.workspaceId}/ref-videos/${videoId}-thumb.jpg`;

    const initialProbe = await this.probe.probeMedia(input.tempFilePath);
    const originalDurationSec =
      typeof initialProbe.durationSec === 'number' &&
      Number.isFinite(initialProbe.durationSec) &&
      initialProbe.durationSec > 0
        ? initialProbe.durationSec
        : typeof input.clientDurationSec === 'number' &&
            Number.isFinite(input.clientDurationSec) &&
            input.clientDurationSec > 0
          ? input.clientDurationSec
          : undefined;

    const trimRange = normalizeTrimRange({
      trimStartSec: input.trimStartSec,
      trimEndSec: input.trimEndSec,
      originalDurationSec,
    });

    if (trimRange && trimRange.durationSec < 0.25) {
      throw new BadRequestException(
        'Selected trim range must be at least 0.3 seconds long.',
      );
    }

    const tempTrimmed = path.join(
      os.tmpdir(),
      `studio-ref-trimmed-${videoId}.mp4`,
    );
    const tempThumb = path.join(os.tmpdir(), `studio-ref-thumb-${videoId}.jpg`);

    let effectiveFilePath = input.tempFilePath;
    let effectiveMimeType = input.mimeType;
    let effectiveSizeBytes = input.sizeBytes;
    let probedMeta = initialProbe;
    let storageKey = `delivery-studio/${id.workspaceId}/ref-videos/${videoId}.${extensionForMime(effectiveMimeType)}`;
    let sha256 = '';
    let mediaMeta: DeliverableMediaMeta = {};
    let hasThumb = false;

    try {
      if (trimRange?.shouldTrim) {
        try {
          await this.probe.trimVideo(
            input.tempFilePath,
            tempTrimmed,
            trimRange.startSec,
            trimRange.durationSec,
          );
        } catch (error) {
          throw new BadRequestException(
            `Could not trim reference video: ${(error as Error).message}`,
          );
        }
        const trimmedStats = await fs.stat(tempTrimmed);
        effectiveFilePath = tempTrimmed;
        effectiveMimeType = 'video/mp4';
        effectiveSizeBytes = trimmedStats.size;
        storageKey = `delivery-studio/${id.workspaceId}/ref-videos/${videoId}.mp4`;
        probedMeta = await this.probe.probeMedia(effectiveFilePath);
      }

      const bytes = await fs.readFile(effectiveFilePath);
      sha256 = createHash('sha256').update(bytes).digest('hex');

      const fallbackDuration = trimRange?.shouldTrim
        ? Math.round(trimRange.durationSec * 100) / 100
        : typeof input.clientDurationSec === 'number' &&
            Number.isFinite(input.clientDurationSec) &&
            input.clientDurationSec > 0
          ? Math.round(input.clientDurationSec * 10) / 10
          : undefined;

      mediaMeta = {
        ...probedMeta,
        ...(!probedMeta.durationSec && fallbackDuration
          ? { durationSec: fallbackDuration }
          : {}),
        ...(!probedMeta.width &&
        typeof input.clientWidth === 'number' &&
        input.clientWidth > 0
          ? { width: Math.round(input.clientWidth) }
          : {}),
        ...(!probedMeta.height &&
        typeof input.clientHeight === 'number' &&
        input.clientHeight > 0
          ? { height: Math.round(input.clientHeight) }
          : {}),
      };

      hasThumb = await this.probe.extractVideoThumbnail(
        effectiveFilePath,
        tempThumb,
        mediaMeta.durationSec,
      );
      const driver = this.storage.getCurrentDriver();
      await driver.writeFileStream({
        filePath: storageKey,
        stream: createReadStream(effectiveFilePath),
        mimeType: effectiveMimeType,
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
      await fs.rm(tempTrimmed, { force: true }).catch(() => undefined);
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
          mimeType: effectiveMimeType,
          sizeBytes: String(effectiveSizeBytes),
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

  async uploadStudioVideoAsset(
    auth: WorkspaceAuthContext,
    input: {
      companyId: string;
      projectId?: string | null;
      title?: string;
      tempFilePath: string;
      originalFileName: string;
      mimeType: string;
      sizeBytes: number;
      clientDurationSec?: number;
      clientWidth?: number;
      clientHeight?: number;
    },
  ) {
    if (!isUuidString(input.companyId)) {
      throw new BadRequestException(
        'Select a client before uploading a video for hook variations.',
      );
    }
    const id = this.identity(auth);
    const assetId = v4();
    const ext = extensionForMime(input.mimeType);
    const storageKey = `delivery-studio/${id.workspaceId}/assets/${assetId}.${ext}`;
    const thumbKey = `delivery-studio/${id.workspaceId}/assets/${assetId}-thumb.jpg`;

    const bytes = await fs.readFile(input.tempFilePath);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const probedMeta = await this.probe.probeMedia(input.tempFilePath);
    const mediaMeta: DeliverableMediaMeta = {
      ...probedMeta,
      ...(!probedMeta.durationSec &&
      typeof input.clientDurationSec === 'number' &&
      Number.isFinite(input.clientDurationSec) &&
      input.clientDurationSec > 0
        ? { durationSec: Math.round(input.clientDurationSec * 10) / 10 }
        : {}),
      ...(!probedMeta.width &&
      typeof input.clientWidth === 'number' &&
      input.clientWidth > 0
        ? { width: Math.round(input.clientWidth) }
        : {}),
      ...(!probedMeta.height &&
      typeof input.clientHeight === 'number' &&
      input.clientHeight > 0
        ? { height: Math.round(input.clientHeight) }
        : {}),
    };

    const tempThumb = path.join(
      os.tmpdir(),
      `studio-upload-video-thumb-${assetId}.jpg`,
    );
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

    const cleanTitle =
      input.title?.trim().slice(0, 180) ||
      input.originalFileName.replace(/\.[^.]+$/, '').slice(0, 180) ||
      'Uploaded Video';

    const saved = await this.dataSource.transaction(async (manager) => {
      await this.resolveActor(manager, id);
      const repo = manager.getRepository(DeliveryStudioAssetEntity);
      const created = await repo.save(
        repo.create({
          id: assetId,
          workspaceId: id.workspaceId,
          companyId: input.companyId,
          projectId:
            input.projectId && isUuidString(input.projectId)
              ? input.projectId
              : null,
          kind: 'GENERATED_VIDEO',
          productKitId: null,
          referenceVideoId: null,
          characterAssetId: null,
          presetId: null,
          jobId: null,
          title: cleanTitle,
          promptUsed: '',
          modelKey: 'uploaded-video',
          providerUsed: 'upload',
          storageKey,
          thumbnailKey: hasThumb ? thumbKey : null,
          mimeType: input.mimeType,
          sizeBytes: String(input.sizeBytes),
          sha256,
          mediaMeta,
          stagedUrlsJson: {},
          approved: true,
          deliverableId: null,
          hookProjectId: null,
          tagsJson: ['uploaded'],
          metadataJson: {
            source: 'direct-upload',
            originalFileName: input.originalFileName.slice(0, 240),
          },
          archived: false,
          createdById: id.memberId,
        }),
      );

      await recordOtogrowActivity(manager, {
        workspaceId: id.workspaceId,
        actorId: id.memberId,
        category: 'CREATIVE',
        action: 'STUDIO_VIDEO_UPLOADED',
        outcome: 'RECORDED',
        summary: `Uploaded video "${cleanTitle}" directly to AI Studio for text hooks & variations.`,
        sourceType: 'creative',
        sourceId: created.id,
        changes: [],
      });

      return created;
    });

    return this.mapAsset(saved);
  }

  async composeStudioVideoAsset(
    auth: WorkspaceAuthContext,
    input: {
      companyId: string;
      projectId?: string | null;
      title?: string;
      clips: Array<{
        sourceType: 'ASSET' | 'UPLOAD';
        assetId?: string;
        uploadIndex?: number;
        trimStartSec?: number;
        trimEndSec?: number;
        muted?: boolean;
      }>;
      uploadedFiles: Array<{
        tempFilePath: string;
        originalFileName: string;
        mimeType: string;
        sizeBytes: number;
      }>;
    },
  ) {
    if (!isUuidString(input.companyId)) {
      throw new BadRequestException(
        'Select a client before saving an edited video cut.',
      );
    }
    if (!Array.isArray(input.clips) || input.clips.length === 0) {
      throw new BadRequestException('Add at least one clip to render a cut.');
    }
    if (input.clips.length > 8) {
      throw new BadRequestException(
        'You can stitch up to 8 clips in a single edited cut.',
      );
    }

    const id = this.identity(auth);
    const assetId = v4();
    const storageKey = `delivery-studio/${id.workspaceId}/assets/${assetId}.mp4`;
    const thumbKey = `delivery-studio/${id.workspaceId}/assets/${assetId}-thumb.jpg`;

    // Resolve any referenced existing studio assets scoped to this workspace
    const requestedAssetIds = Array.from(
      new Set(
        input.clips
          .filter((c) => c.sourceType === 'ASSET')
          .map((c) => c.assetId ?? '')
          .filter(Boolean),
      ),
    );
    for (const reqId of requestedAssetIds) {
      if (!isUuidString(reqId)) {
        throw new BadRequestException(`Invalid clip asset ID "${reqId}".`);
      }
    }

    const existingAssets =
      requestedAssetIds.length > 0
        ? await this.dataSource.transaction(async (manager) => {
            await this.resolveActor(manager, id);
            return manager.getRepository(DeliveryStudioAssetEntity).find({
              where: {
                id: In(requestedAssetIds),
                workspaceId: id.workspaceId,
                kind: 'GENERATED_VIDEO',
                archived: false,
              },
            });
          })
        : [];
    const assetById = new Map(existingAssets.map((a) => [a.id, a]));

    const workDir = await fs.mkdtemp(
      path.join(os.tmpdir(), `studio-compose-${assetId}-`),
    );
    const downloadedAssetPaths = new Map<string, string>();
    const driver = this.storage.getCurrentDriver();

    let outputMeta: DeliverableMediaMeta = {};
    let outputSizeBytes = 0;
    let sha256 = '';
    let hasThumb = false;
    let primaryAsset: DeliveryStudioAssetEntity | null = null;
    const clipSummaries: Array<{
      sourceType: 'ASSET' | 'UPLOAD';
      assetId?: string;
      fileName?: string;
      trimStartSec: number;
      trimEndSec: number | null;
      durationSec: number | null;
      muted: boolean;
    }> = [];

    try {
      const composeInputs: VideoComposeClipInput[] = [];
      let targetWidth: number | undefined;
      let targetHeight: number | undefined;

      for (let i = 0; i < input.clips.length; i += 1) {
        const spec = input.clips[i];
        let localPath = '';
        let fileName = '';

        if (spec.sourceType === 'ASSET') {
          if (!spec.assetId) {
            throw new BadRequestException(`Clip #${i + 1} is missing assetId.`);
          }
          const assetRow = assetById.get(spec.assetId);
          if (!assetRow) {
            throw new NotFoundException(
              `Clip #${i + 1} video was not found in this workspace.`,
            );
          }
          if (!primaryAsset) {
            primaryAsset = assetRow;
          }
          fileName = assetRow.title;
          const cachedPath = downloadedAssetPaths.get(assetRow.id);
          if (cachedPath) {
            localPath = cachedPath;
          } else {
            const ext = extensionForMime(assetRow.mimeType);
            const destPath = path.join(workDir, `asset-${assetRow.id}.${ext}`);
            const stream = await driver.readFile({
              filePath: assetRow.storageKey,
            });
            await pipeline(stream, createWriteStream(destPath));
            downloadedAssetPaths.set(assetRow.id, destPath);
            localPath = destPath;
          }
        } else if (spec.sourceType === 'UPLOAD') {
          const uploadIdx = spec.uploadIndex;
          const uploaded =
            typeof uploadIdx === 'number' &&
            Number.isInteger(uploadIdx) &&
            uploadIdx >= 0
              ? input.uploadedFiles[uploadIdx]
              : undefined;
          if (!uploaded) {
            throw new BadRequestException(
              `Clip #${i + 1} references an uploaded file that was not attached.`,
            );
          }
          localPath = uploaded.tempFilePath;
          fileName = uploaded.originalFileName;
        } else {
          throw new BadRequestException(
            `Clip #${i + 1} has an unsupported sourceType.`,
          );
        }

        const probed = await this.probe.probeMedia(localPath);
        if (i === 0) {
          targetWidth = probed.width;
          targetHeight = probed.height;
        }

        const trimRange = normalizeTrimRange({
          trimStartSec: spec.trimStartSec,
          trimEndSec: spec.trimEndSec,
          originalDurationSec: probed.durationSec,
        });

        if (trimRange && trimRange.durationSec < 0.25) {
          throw new BadRequestException(
            `Clip #${i + 1} must be at least 0.3 seconds long after trimming.`,
          );
        }

        const startSec = trimRange?.shouldTrim ? trimRange.startSec : 0;
        const durationSec = trimRange?.shouldTrim
          ? trimRange.durationSec
          : probed.durationSec;

        composeInputs.push({
          filePath: localPath,
          startSec,
          durationSec,
          hasAudio: Boolean(probed.audioCodec),
          muted: Boolean(spec.muted),
        });

        clipSummaries.push({
          sourceType: spec.sourceType,
          ...(spec.assetId ? { assetId: spec.assetId } : {}),
          fileName,
          trimStartSec: startSec,
          trimEndSec: trimRange?.shouldTrim ? trimRange.endSec : (probed.durationSec ?? null),
          durationSec: durationSec ?? null,
          muted: Boolean(spec.muted),
        });
      }

      const outputMp4Path = path.join(workDir, `composed-${assetId}.mp4`);
      const tempThumbPath = path.join(workDir, `composed-${assetId}-thumb.jpg`);

      try {
        await this.probe.composeVideos(composeInputs, outputMp4Path, {
          targetWidth,
          targetHeight,
          fps: 30,
        });
      } catch (error) {
        throw new BadRequestException(
          `Could not render edited video cut: ${(error as Error).message}`,
        );
      }

      const outputStats = await fs.stat(outputMp4Path);
      outputSizeBytes = outputStats.size;
      const bytes = await fs.readFile(outputMp4Path);
      sha256 = createHash('sha256').update(bytes).digest('hex');
      outputMeta = await this.probe.probeMedia(outputMp4Path);
      hasThumb = await this.probe.extractVideoThumbnail(
        outputMp4Path,
        tempThumbPath,
        outputMeta.durationSec,
      );

      await driver.writeFileStream({
        filePath: storageKey,
        stream: createReadStream(outputMp4Path),
        mimeType: 'video/mp4',
      });
      if (hasThumb) {
        await driver.writeFileStream({
          filePath: thumbKey,
          stream: createReadStream(tempThumbPath),
          mimeType: 'image/jpeg',
        });
      }
    } finally {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }

    const defaultSuffix = input.clips.length > 1 ? 'Edited Cut' : 'Trimmed';
    const baseTitle = primaryAsset?.title || 'Studio Video';
    const cleanTitle =
      input.title?.trim().slice(0, 180) ||
      `${baseTitle} (${defaultSuffix})`.slice(0, 180);

    const primaryMeta = (primaryAsset?.metadataJson ?? {}) as Record<
      string,
      unknown
    >;

    const saved = await this.dataSource.transaction(async (manager) => {
      await this.resolveActor(manager, id);
      const repo = manager.getRepository(DeliveryStudioAssetEntity);
      const created = await repo.save(
        repo.create({
          id: assetId,
          workspaceId: id.workspaceId,
          companyId: input.companyId,
          projectId:
            input.projectId && isUuidString(input.projectId)
              ? input.projectId
              : (primaryAsset?.projectId ?? null),
          kind: 'GENERATED_VIDEO',
          productKitId: primaryAsset?.productKitId ?? null,
          referenceVideoId: primaryAsset?.referenceVideoId ?? null,
          characterAssetId: primaryAsset?.characterAssetId ?? null,
          presetId: primaryAsset?.presetId ?? null,
          jobId: null,
          title: cleanTitle,
          promptUsed: primaryAsset?.promptUsed ?? '',
          modelKey: 'clip-editor',
          providerUsed: 'editor',
          storageKey,
          thumbnailKey: hasThumb ? thumbKey : null,
          mimeType: 'video/mp4',
          sizeBytes: String(outputSizeBytes),
          sha256,
          mediaMeta: outputMeta,
          stagedUrlsJson: {},
          approved: true,
          deliverableId: null,
          hookProjectId: null,
          tagsJson: ['edited'],
          metadataJson: {
            ...(typeof primaryMeta.productName === 'string'
              ? { productName: primaryMeta.productName }
              : {}),
            source: 'clip-editor',
            clipCount: input.clips.length,
            editedFromAssetIds: requestedAssetIds,
            clips: clipSummaries,
          },
          archived: false,
          createdById: id.memberId,
        }),
      );

      await recordOtogrowActivity(manager, {
        workspaceId: id.workspaceId,
        actorId: id.memberId,
        category: 'CREATIVE',
        action: 'STUDIO_VIDEO_EDITED',
        outcome: 'RECORDED',
        summary: `Created edited video cut "${cleanTitle}" (${input.clips.length} clip${input.clips.length === 1 ? '' : 's'}) in AI Studio.`,
        sourceType: 'creative',
        sourceId: created.id,
        changes: [],
      });

      return created;
    });

    return this.mapAsset(saved);
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
      const pricingProvider = this.resolvePrimaryProviderForPricing(
        routingMode,
        providerConfig,
      );
      const estimatedPerJob = estimateStudioJobCostUsd({
        modelKey: spec.key,
        resolution,
        count: 1,
        provider: pricingProvider,
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

  async analyzeVideoPromptWithGemini(
    auth: WorkspaceAuthContext,
    rawInput: unknown,
  ) {
    const parsed = analyzeVideoPromptSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ??
          'Invalid Gemini video prompt analysis request.',
      );
    }
    const input = parsed.data;
    const id = this.identity(auth);

    const spec =
      getStudioModelSpec(input.modelKey || 'seedance-2.5') ??
      STUDIO_MODEL_CATALOG.find((m) => m.kind === 'VIDEO')!;
    const usesAtTokens = Boolean(spec.capabilities.usesAtMentionTokens);
    const imgPrefix = usesAtTokens ? '@image' : 'Image ';
    const vidPrefix = usesAtTokens ? '@video' : 'Video ';

    const loaded = await this.dataSource.transaction(async (manager) => {
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
            where: { id: inheritedEnvPresetId, workspaceId: id.workspaceId },
          })
        : null;
      const inheritedEnvPrompt =
        typeof charMeta.environmentPrompt === 'string'
          ? charMeta.environmentPrompt
          : '';
      const resolvedEnvironmentPrompt =
        input.environmentOverride?.trim() ||
        environmentPreset?.masterPrompt ||
        inheritedEnvPrompt ||
        '';

      const resolvedProductAssetIds =
        input.productAssetIds && input.productAssetIds.length > 0
          ? input.productAssetIds
          : productKit &&
              characterAsset?.productKitId === productKit.id &&
              Array.isArray(charMeta.productAssetIds) &&
              charMeta.productAssetIds.length > 0
            ? (charMeta.productAssetIds.filter(
                (v): v is string => typeof v === 'string',
              ) as string[])
            : null;

      const selectedKitAssets = productKit
        ? resolvedProductAssetIds
          ? (productKit.assetsJson ?? []).filter((a) =>
              resolvedProductAssetIds.includes(a.id),
            )
          : (productKit.assetsJson ?? [])
        : [];

      const brandNotes = await this.readBrandNotesSnippet(
        manager,
        id.workspaceId,
        characterAsset?.projectId ?? refVideo.projectId ?? null,
      );

      const ops = await manager
        .getRepository(DeliveryOperationsEntity)
        .findOneBy({ workspaceId: id.workspaceId });
      const overrideGeminiApiKey = this.readDecryptedGeminiKeyFromConfig(
        id.workspaceId,
        ops?.state?.studioGeminiConfig,
      );

      return {
        refVideo,
        characterAsset,
        productKit,
        selectedKitAssets,
        resolvedEnvironmentPrompt,
        brandNotes,
        overrideGeminiApiKey,
      };
    });

    const maxProductImages = Math.max(
      0,
      spec.capabilities.maxReferenceImages - (loaded.characterAsset ? 1 : 0),
    );
    const plannedKitAssets = loaded.selectedKitAssets.slice(0, maxProductImages);
    const productName =
      loaded.productKit?.name ||
      loaded.characterAsset?.title ||
      'featured garment';

    if (!this.promptAi) {
      const charToken = loaded.characterAsset ? `${imgPrefix}1` : null;
      const prodStart = loaded.characterAsset ? 2 : 1;
      const prompt = buildStructuredFallbackVideoPrompt({
        usesAtMentionTokens: usesAtTokens,
        characterToken: charToken,
        productTokens: plannedKitAssets.map((item, idx) => ({
          token: `${imgPrefix}${prodStart + idx}`,
          label: item.label || item.role || `Product Image ${idx + 1}`,
        })),
        videoToken: `${vidPrefix}1`,
        productName,
        productNotes: loaded.productKit?.notes || '',
        environmentPrompt: loaded.resolvedEnvironmentPrompt,
        brandNotes: loaded.brandNotes,
        customNotes: input.customNotes?.trim() || '',
      });
      return {
        prompt,
        source: 'FALLBACK' as const,
        modelId: null,
        summary: 'Prompt AI service is unavailable; used structured recreation template.',
        analyzedImageCount:
          (loaded.characterAsset ? 1 : 0) + plannedKitAssets.length,
        referenceVideoDurationSec: loaded.refVideo.mediaMeta?.durationSec ?? null,
      };
    }

    const driver = this.storage.getCurrentDriver();
    const images: StudioPromptImageInput[] = [];
    if (loaded.characterAsset) {
      const bytes = await readStreamToBuffer(
        await driver.readFile({ filePath: loaded.characterAsset.storageKey }),
      );
      images.push({
        token: `${imgPrefix}1`,
        role: 'CHARACTER_SHEET',
        label: loaded.characterAsset.title || 'Character Sheet',
        mimeType: loaded.characterAsset.mimeType,
        bytes,
      });
    }

    for (const item of plannedKitAssets) {
      const idx = images.length + 1;
      try {
        const bytes = await readStreamToBuffer(
          await driver.readFile({ filePath: item.storageKey }),
        );
        images.push({
          token: `${imgPrefix}${idx}`,
          role: 'PRODUCT',
          label: item.label || item.role || `Product Image ${idx}`,
          mimeType: item.mimeType,
          bytes,
        });
      } catch (err) {
        this.logger.warn(
          `Skipped unreadable product image ${item.id} during Gemini prompt analysis: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const videoBytes = await readStreamToBuffer(
      await driver.readFile({ filePath: loaded.refVideo.storageKey }),
    );

    const generated = await this.promptAi.generateVideoPromptFromMedia({
      usesAtMentionTokens: usesAtTokens,
      images,
      video: {
        token: `${vidPrefix}1`,
        label:
          loaded.refVideo.title ||
          loaded.refVideo.originalFileName ||
          'Reference Video',
        mimeType: loaded.refVideo.mimeType,
        durationSec: loaded.refVideo.mediaMeta?.durationSec ?? null,
        bytes: videoBytes,
      },
      productName,
      productNotes: loaded.productKit?.notes || '',
      environmentPrompt: loaded.resolvedEnvironmentPrompt,
      brandNotes: loaded.brandNotes,
      customNotes: input.customNotes?.trim() || '',
      overrideApiKey: loaded.overrideGeminiApiKey,
    });

    return {
      ...generated,
      analyzedImageCount: images.length,
      referenceVideoDurationSec: loaded.refVideo.mediaMeta?.durationSec ?? null,
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

    // If autoPromptWithGemini is enabled and the caller did not already supply a prompt,
    // analyze the Character Sheet + Product Images + Reference Video with Gemini BEFORE opening the DB transaction.
    let autoGeneratedMasterPrompt: string | null = null;
    if (input.autoPromptWithGemini && !input.masterPrompt?.trim()) {
      try {
        const analyzed = await this.analyzeVideoPromptWithGemini(auth, {
          companyId: input.companyId,
          referenceVideoId: input.referenceVideoId,
          characterAssetId: input.characterAssetId ?? null,
          productKitId: input.productKitId ?? null,
          productAssetIds: input.productAssetIds,
          environmentPresetId: input.environmentPresetId ?? null,
          modelKey: input.modelKeys[0],
          environmentOverride: input.environmentOverride,
          customNotes: input.customNotes,
        });
        if (analyzed.prompt?.trim()) {
          autoGeneratedMasterPrompt = analyzed.prompt.trim();
        }
      } catch (err) {
        this.logger.warn(
          `Auto-prompt with Gemini failed before queueing video; falling back to default template: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

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
      const pricingProvider = this.resolvePrimaryProviderForPricing(
        routingMode,
        providerConfig,
      );

      const brandNotes = await this.readBrandNotesSnippet(
        manager,
        id.workspaceId,
        input.projectId,
      );

      const fallbackVideoPreset =
        STARTER_STUDIO_PRESETS.find((p) => p.kind === 'VIDEO_GENERATION') ??
        STARTER_STUDIO_PRESETS[0];
      const defaultTemplate = resolvedEnvironmentPrompt
        ? STARTER_STUDIO_PRESETS.find(
            (p) =>
              p.kind === 'VIDEO_GENERATION' &&
              p.tagsJson.includes('environment-override'),
          )?.masterPrompt ?? fallbackVideoPreset.masterPrompt
        : fallbackVideoPreset.masterPrompt;

      const explicitMasterTemplate =
        input.masterPrompt?.trim() ||
        autoGeneratedMasterPrompt ||
        preset?.masterPrompt ||
        null;

      const resolvedProductAssetIds =
        input.productAssetIds && input.productAssetIds.length > 0
          ? input.productAssetIds
          : productKit &&
              characterAsset?.productKitId === productKit.id &&
              Array.isArray(charMeta.productAssetIds) &&
              charMeta.productAssetIds.length > 0
            ? (charMeta.productAssetIds.filter(
                (v): v is string => typeof v === 'string',
              ) as string[])
            : null;

      const selectedKitAssets = productKit
        ? resolvedProductAssetIds
          ? (productKit.assetsJson ?? []).filter((a) =>
              resolvedProductAssetIds.includes(a.id),
            )
          : (productKit.assetsJson ?? [])
        : [];

      const baseCompiledPrompt = explicitMasterTemplate || characterAsset
        ? compileStudioPromptTemplate(
            explicitMasterTemplate ?? defaultTemplate,
            {
              product_name:
                productKit?.name || characterAsset?.title || 'featured garment',
              product_notes: productKit?.notes || '',
              brand_notes: brandNotes,
              environment:
                resolvedEnvironmentPrompt ||
                (characterAsset
                  ? 'the exact environment and lighting shown in the Character Sheet (@image1)'
                  : 'the exact environment and lighting shown in the reference video'),
              reference_notes: refVideo.notes || '',
              custom_notes: input.customNotes?.trim() || '',
            },
          )
        : '';

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
          referenceVideoDurationSec: refDuration ?? durationSec,
          provider: pricingProvider,
        });

        const baseTitle =
          input.title?.trim() ||
          `${productKit?.name || characterAsset?.title || 'AI Video'} × ${refVideo.title}`;
        const title =
          input.modelKeys.length > 1 ? `${baseTitle} [${spec.label}]` : baseTitle;

        const maxProductImages = Math.max(
          0,
          spec.capabilities.maxReferenceImages - (characterAsset ? 1 : 0),
        );
        const plannedKitAssets = selectedKitAssets.slice(0, maxProductImages);
        const usesAtTokens = Boolean(spec.capabilities.usesAtMentionTokens);
        const imgPrefix = usesAtTokens ? '@image' : 'Image ';
        const vidPrefix = usesAtTokens ? '@video' : 'Video ';

        const effectiveBasePrompt =
          baseCompiledPrompt ||
          buildStructuredFallbackVideoPrompt({
            usesAtMentionTokens: usesAtTokens,
            characterToken: null,
            productTokens: plannedKitAssets.map((item, idx) => ({
              token: `${imgPrefix}${idx + 1}`,
              label: item.label || item.role || `Product Image ${idx + 1}`,
            })),
            videoToken: `${vidPrefix}1`,
            productName: productKit?.name || 'featured garment',
            productNotes: productKit?.notes || '',
            environmentPrompt: resolvedEnvironmentPrompt,
            brandNotes,
            customNotes: input.customNotes?.trim() || '',
          });

        const refMappingNote = buildVideoReferenceMappingNote({
          usesAtMentionTokens: usesAtTokens,
          hasCharacterSheet: Boolean(characterAsset),
          productImageCount: plannedKitAssets.length,
          productName:
            productKit?.name || characterAsset?.title || 'featured garment',
          hasReferenceVideo: true,
          existingPrompt: effectiveBasePrompt,
        });
        const compiledPrompt = refMappingNote
          ? `${effectiveBasePrompt}\n${refMappingNote}`.trim()
          : effectiveBasePrompt;

        const plannedImages: StudioApiInputImageRef[] = [];
        if (characterAsset) {
          plannedImages.push({
            index: 1,
            token: `${imgPrefix}1`,
            role: 'CHARACTER_SHEET',
            label: characterAsset.title || 'Character Sheet',
            fileName: `character-${characterAsset.id}.${extensionForMime(characterAsset.mimeType)}`,
            mimeType: characterAsset.mimeType,
            mediaPath: null,
            stagedUrl: null,
            sourceRef: { mediaKind: 'studio-asset', id: characterAsset.id },
          });
        }
        for (const item of plannedKitAssets) {
          const idx = plannedImages.length + 1;
          plannedImages.push({
            index: idx,
            token: `${imgPrefix}${idx}`,
            role: 'PRODUCT',
            label: item.label || item.role || `Product Image ${idx}`,
            fileName:
              item.originalFileName ||
              `${item.role.toLowerCase()}.${extensionForMime(item.mimeType)}`,
            mimeType: item.mimeType,
            mediaPath: null,
            stagedUrl: null,
            sourceRef: {
              mediaKind: 'product-asset',
              id: productKit!.id,
              subId: item.id,
            },
          });
        }

        const plannedVideos: StudioApiInputVideoRef[] = [
          {
            index: 1,
            token: `${vidPrefix}1`,
            role: 'REFERENCE_VIDEO',
            label: refVideo.title || refVideo.originalFileName || 'Reference Video',
            fileName:
              refVideo.originalFileName ||
              `ref-${refVideo.id}.${extensionForMime(refVideo.mimeType)}`,
            mimeType: refVideo.mimeType,
            durationSec: refVideo.mediaMeta?.durationSec ?? null,
            mediaPath: null,
            thumbnailPath: null,
            stagedUrl: null,
            sourceRef: { mediaKind: 'ref-video', id: refVideo.id },
            thumbRef: refVideo.thumbnailKey
              ? { mediaKind: 'ref-thumb', id: refVideo.id }
              : null,
          },
        ];

        const plannedApiRequest: StudioApiRequestSnapshot = {
          capturedAt: new Date().toISOString(),
          provider: null,
          endpoint: null,
          modelKey: spec.key,
          modelLabel: spec.label,
          routingMode,
          failoverTriggered: false,
          externalTaskId: null,
          prompt: compiledPrompt,
          images: plannedImages,
          videos: plannedVideos,
          rawPayload: null,
        };

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
              referenceVideoDurationSec: refDuration ?? durationSec,
              characterAssetId: characterAsset?.id ?? null,
              productKitId: productKit?.id ?? null,
              productAssetIds: resolvedProductAssetIds,
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
              apiRequest: plannedApiRequest,
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
      job.externalTaskId = null;
      job.providerUsed = null;
      job.completedAt = null;
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

    const resolvedMonthKey =
      options?.monthKey ||
      (typeof this.driveService?.resolveClientActiveMonthKey === 'function'
        ? await this.driveService.resolveClientActiveMonthKey(
            id.workspaceId,
            asset.companyId,
          )
        : currentMonthKey());

    const created = await this.deliverables.createUploadedDeliverable(
      workspace,
      id.memberId,
      id.userWorkspaceId,
      {
        companyId: asset.companyId,
        projectId: asset.projectId ?? undefined,
        serviceKey: options?.serviceKey?.trim() || 'AI Video',
        monthKey: resolvedMonthKey,
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

  async getClientDriveFolders(
    auth: WorkspaceAuthContext,
    companyId: string,
    search?: string | null,
  ) {
    if (!isUuidString(companyId)) {
      throw new BadRequestException('Invalid client company ID.');
    }
    if (!this.driveService) {
      const monthKey = currentMonthKey();
      return {
        connected: false,
        clientMapped: false,
        rootFolderId: null,
        rootFolderName: null,
        rootFolderWebUrl: null,
        monthStartDay: 1,
        monthStartDaySource: 'DEFAULT' as const,
        activeMonthKey: monthKey,
        activeCycleLabel: '',
        expectedMonthFolderName: monthKey,
        matchedMonthFolder: null,
        monthSubfolders: [] as Array<{
          id: string;
          name: string;
          webViewLink: string | null;
        }>,
        subfolders: [] as Array<{
          id: string;
          name: string;
          webViewLink: string | null;
        }>,
      };
    }
    return this.driveService.listClientSubfolders(auth, companyId, search);
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

    // Load saved Hook Master Prompt Preset + Working Examples (preferring explicit preset -> client brand preset -> workspace preset)
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

    const presetRepo = this.dataSource.getRepository(DeliveryStudioPresetEntity);
    let resolvedPreset: DeliveryStudioPresetEntity | null = null;
    if (input.hookPresetId) {
      resolvedPreset = await presetRepo.findOne({
        where: { id: input.hookPresetId, workspaceId: id.workspaceId },
      });
    } else if (typeof presetRepo.find === 'function') {
      const candidates = await presetRepo.find({
        where: {
          workspaceId: id.workspaceId,
          kind: 'TEXT_HOOK',
          archived: false,
        },
        order: { isDefault: 'DESC', updatedAt: 'DESC' },
      });
      resolvedPreset =
        candidates.find((p) => p.companyId === asset.companyId) ??
        candidates.find((p) => !p.companyId) ??
        null;
    }

    if (resolvedPreset) {
      presetMasterPrompt = resolvedPreset.masterPrompt || undefined;
      presetExamples = resolvedPreset.examplesJson ?? [];
      presetPlatform = resolvedPreset.configJson?.platform;
      presetFunnel = resolvedPreset.configJson?.funnelStage;
    }

    // Read workspace Studio Gemini API key if configured so AI hook suggestions use real Gemini even without global admin key
    let overrideGeminiApiKey: string | null = null;
    try {
      const ops = await this.dataSource
        .getRepository(DeliveryOperationsEntity)
        .findOne({ where: { workspaceId: id.workspaceId } });
      overrideGeminiApiKey = this.readDecryptedGeminiKeyFromConfig(
        id.workspaceId,
        ops?.state?.studioGeminiConfig ?? null,
      );
    } catch {
      overrideGeminiApiKey = null;
    }

    // Step A: Assess the actual generated video + website + Brand Knowledge
    await this.videoHooks.analyzeContext(
      auth,
      {
        deliverableId,
        websiteUrl: input.websiteUrl ?? undefined,
        refreshVideo: input.refreshVideoAnalysis ?? false,
      },
      { overrideGeminiApiKey },
    );

    // Step B: Generate AI text hooks using Video Assessment + Brand Knowledge + Master Prompt + Fed-in Examples
    const hookProject = await this.videoHooks.generateSuggestions(
      auth,
      {
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
      },
      { overrideGeminiApiKey },
    );

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
    if (this.activeJobExecutions.has(jobId)) {
      this.logger.log(
        `Skipping duplicate concurrent execution for studio job ${jobId}.`,
      );
      return;
    }
    this.activeJobExecutions.add(jobId);

    const jobRepo = this.dataSource.getRepository(DeliveryStudioJobEntity);
    try {
      const job = await jobRepo.findOne({ where: { id: jobId, workspaceId } });
      if (!job || job.status === 'CANCELLED' || job.status === 'COMPLETED') {
        return;
      }

      const spec = getStudioModelSpec(job.modelKey);
      if (!spec) {
        job.status = 'FAILED';
        job.errorMessage = `Unsupported model "${job.modelKey}".`;
        job.completedAt = new Date();
        await jobRepo.save(job);
        return;
      }

      const isResumingInFlight = Boolean(
        job.externalTaskId &&
          job.providerUsed &&
          ['PROCESSING', 'DOWNLOADING'].includes(job.status),
      );

      if (!isResumingInFlight) {
        job.status = 'STAGING';
        job.progress = 5;
        job.startedAt = job.startedAt ?? new Date();
        job.errorMessage = null;
        await jobRepo.save(job);
      }

      try {
        const credentials = await this.loadDecryptedCredentials(workspaceId);
        const payload = job.inputPayloadJson ?? {};
        const driver = this.storage.getCurrentDriver();

        const characterAssetId =
          typeof payload.characterAssetId === 'string'
            ? payload.characterAssetId
            : null;
        const productKitId =
          typeof payload.productKitId === 'string' ? payload.productKitId : null;
        const requestedAssetIds = Array.isArray(payload.productAssetIds)
          ? (payload.productAssetIds as string[])
          : null;
        const referenceVideoId =
          typeof payload.referenceVideoId === 'string'
            ? payload.referenceVideoId
            : null;
        const compiledPrompt =
          typeof payload.compiledPrompt === 'string'
            ? payload.compiledPrompt
            : job.title;

        let execResult: StudioRouterExecutionResult;
        let latestApiRequest: StudioApiRequestSnapshot | null =
          payload.apiRequest && typeof payload.apiRequest === 'object'
            ? (payload.apiRequest as StudioApiRequestSnapshot)
            : null;

        const resumeProvider: StudioProviderId | null =
          job.providerUsed === 'wavespeed' || job.providerUsed === 'kie'
            ? job.providerUsed
            : null;

        if (isResumingInFlight && job.externalTaskId && resumeProvider) {
          this.logger.log(
            `Resuming in-flight ${resumeProvider} task ${job.externalTaskId} for studio job ${job.id}.`,
          );
          const resumed = await this.router.resumeExistingTask({
            provider: resumeProvider,
            modelKey: job.modelKey,
            externalTaskId: job.externalTaskId,
            credentials,
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
          });
          execResult = {
            providerUsed: resumeProvider,
            endpoint: latestApiRequest?.endpoint ?? resumeProvider,
            failoverTriggered: job.failoverTriggered,
            externalTaskId: job.externalTaskId,
            outputUrls: resumed.outputUrls,
            actualCostUsd: resumed.actualCostUsd,
            requestPayload: latestApiRequest?.rawPayload ?? {},
            stagedImageUrls:
              latestApiRequest?.images
                ?.map((i) => i.stagedUrl)
                .filter((u): u is string => Boolean(u)) ?? [],
            stagedVideoUrls:
              latestApiRequest?.videos
                ?.map((v) => v.stagedUrl)
                .filter((u): u is string => Boolean(u)) ?? [],
            attempts: job.attemptsJson ?? [],
          };
        } else {
          const referenceImages: StudioStageableMediaFile[] = [];
          const referenceVideos: StudioStageableMediaFile[] = [];
          const imageRefsMeta: StudioApiInputImageRef[] = [];
          const videoRefsMeta: StudioApiInputVideoRef[] = [];
          const usesAtTokens = Boolean(spec.capabilities.usesAtMentionTokens);
          const imgPrefix = usesAtTokens ? '@image' : 'Image ';
          const vidPrefix = usesAtTokens ? '@video' : 'Video ';

          // 1) Attach approved Character Sheet as @image1 if present
          if (characterAssetId) {
            const charAsset = await this.dataSource
              .getRepository(DeliveryStudioAssetEntity)
              .findOne({ where: { id: characterAssetId, workspaceId } });
            if (charAsset) {
              const fileName = `character-${charAsset.id}.${extensionForMime(charAsset.mimeType)}`;
              referenceImages.push({
                sha256: charAsset.sha256,
                fileName,
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
              const idx = imageRefsMeta.length + 1;
              imageRefsMeta.push({
                index: idx,
                token: `${imgPrefix}${idx}`,
                role: 'CHARACTER_SHEET',
                label: charAsset.title || 'Character Sheet',
                fileName,
                mimeType: charAsset.mimeType,
                mediaPath: null,
                stagedUrl: null,
                sourceRef: { mediaKind: 'studio-asset', id: charAsset.id },
              });
            }
          }

          // 2) Attach Product Kit images (front, back, detail, etc.)
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
                const fileName =
                  item.originalFileName ||
                  `${item.role.toLowerCase()}.${extensionForMime(item.mimeType)}`;
                referenceImages.push({
                  sha256: item.sha256,
                  fileName,
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
                const idx = imageRefsMeta.length + 1;
                imageRefsMeta.push({
                  index: idx,
                  token: `${imgPrefix}${idx}`,
                  role: 'PRODUCT',
                  label: item.label || item.role || `Product Image ${idx}`,
                  fileName,
                  mimeType: item.mimeType,
                  mediaPath: null,
                  stagedUrl: null,
                  sourceRef: {
                    mediaKind: 'product-asset',
                    id: kit.id,
                    subId: item.id,
                  },
                });
              }
            }
          }

          // 2b) Attach uploaded Avatar & Environment preset reference photos (when present)
          const presetIdsToStage: Array<{
            id: string;
            prefix: 'avatar' | 'environment';
          }> = [];
          if (typeof payload.avatarPresetId === 'string' && !characterAssetId) {
            presetIdsToStage.push({
              id: payload.avatarPresetId,
              prefix: 'avatar',
            });
          }
          if (
            typeof payload.environmentPresetId === 'string' &&
            !characterAssetId
          ) {
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
                const fileName = `${specRef.prefix}-${refPreset.id}.${extensionForMime(refMime)}`;
                referenceImages.push({
                  sha256: refSha,
                  fileName,
                  mimeType: refMime,
                  kind: 'IMAGE',
                  readBytes: async () =>
                    readStreamToBuffer(
                      await driver.readFile({ filePath: refKey }),
                    ),
                  onStagedUrl: async () => undefined,
                });
                const idx = imageRefsMeta.length + 1;
                imageRefsMeta.push({
                  index: idx,
                  token: `${imgPrefix}${idx}`,
                  role: specRef.prefix === 'avatar' ? 'AVATAR' : 'ENVIRONMENT',
                  label:
                    refPreset.name ||
                    (specRef.prefix === 'avatar' ? 'Avatar' : 'Environment'),
                  fileName,
                  mimeType: refMime,
                  mediaPath: null,
                  stagedUrl: null,
                  sourceRef: { mediaKind: 'preset-thumb', id: refPreset.id },
                });
              }
            }
          }

          // 3) Attach Reference Video (@video1) for video generation
          if (referenceVideoId) {
            const refVideo = await this.dataSource
              .getRepository(DeliveryStudioReferenceVideoEntity)
              .findOne({ where: { id: referenceVideoId, workspaceId } });
            if (!refVideo) {
              throw new Error(
                'Reference video was removed before generation.',
              );
            }
            const fileName =
              refVideo.originalFileName ||
              `ref-${refVideo.id}.${extensionForMime(refVideo.mimeType)}`;
            referenceVideos.push({
              sha256: refVideo.sha256,
              fileName,
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
            const idx = videoRefsMeta.length + 1;
            videoRefsMeta.push({
              index: idx,
              token: `${vidPrefix}${idx}`,
              role: 'REFERENCE_VIDEO',
              label: refVideo.title || fileName,
              fileName,
              mimeType: refVideo.mimeType,
              durationSec: refVideo.mediaMeta?.durationSec ?? null,
              mediaPath: null,
              thumbnailPath: null,
              stagedUrl: null,
              sourceRef: { mediaKind: 'ref-video', id: refVideo.id },
              thumbRef: refVideo.thumbnailKey
                ? { mediaKind: 'ref-thumb', id: refVideo.id }
                : null,
            });
          }

          const buildSnapshot = (params: {
            provider: StudioProviderId | null;
            endpoint: string | null;
            failoverTriggered: boolean;
            externalTaskId: string | null;
            stagedImageUrls: string[];
            stagedVideoUrls: string[];
            rawPayload: Record<string, unknown> | null;
          }): StudioApiRequestSnapshot => ({
            capturedAt: new Date().toISOString(),
            provider: params.provider,
            endpoint: params.endpoint,
            modelKey: spec.key,
            modelLabel: spec.label,
            routingMode: job.routingMode,
            failoverTriggered: params.failoverTriggered,
            externalTaskId: params.externalTaskId,
            prompt: compiledPrompt,
            images: imageRefsMeta
              .slice(0, spec.capabilities.maxReferenceImages)
              .map((meta, idx) => ({
                ...meta,
                stagedUrl: params.stagedImageUrls[idx] ?? null,
              })),
            videos: videoRefsMeta
              .slice(0, spec.capabilities.maxReferenceVideos)
              .map((meta, idx) => ({
                ...meta,
                stagedUrl: params.stagedVideoUrls[idx] ?? null,
              })),
            rawPayload: params.rawPayload,
          });

          latestApiRequest = buildSnapshot({
            provider: null,
            endpoint: null,
            failoverTriggered: false,
            externalTaskId: null,
            stagedImageUrls: [],
            stagedVideoUrls: [],
            rawPayload: null,
          });

          execResult = await this.router.execute(
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
              onRequestPrepared: async (prepared) => {
                latestApiRequest = buildSnapshot({
                  provider: prepared.provider,
                  endpoint: prepared.endpoint,
                  failoverTriggered: false,
                  externalTaskId: null,
                  stagedImageUrls: prepared.stagedImageUrls,
                  stagedVideoUrls: prepared.stagedVideoUrls,
                  rawPayload: prepared.requestPayload,
                });
                job.inputPayloadJson = {
                  ...(job.inputPayloadJson ?? {}),
                  apiRequest: latestApiRequest,
                };
                await jobRepo.update(
                  { id: job.id, workspaceId },
                  {
                    providerUsed: prepared.provider,
                    inputPayloadJson: job.inputPayloadJson as never,
                  },
                );
              },
              onProgress: async (status, progress, externalTaskId) => {
                if (externalTaskId && latestApiRequest) {
                  latestApiRequest = {
                    ...latestApiRequest,
                    externalTaskId,
                  };
                }
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

          latestApiRequest = buildSnapshot({
            provider: execResult.providerUsed,
            endpoint: execResult.endpoint,
            failoverTriggered: execResult.failoverTriggered,
            externalTaskId: execResult.externalTaskId,
            stagedImageUrls: execResult.stagedImageUrls,
            stagedVideoUrls: execResult.stagedVideoUrls,
            rawPayload: execResult.requestPayload,
          });
        }

        // Download and persist every output canonically before provider TTL expires
        const expectedKind = spec.kind;
        const assetKind: StudioAssetKind =
          job.jobKind === 'CHARACTER_SHEET'
            ? 'CHARACTER_SHEET'
            : 'GENERATED_VIDEO';
        const createdAssetIds: string[] = [];
        const assetRepo = this.dataSource.getRepository(
          DeliveryStudioAssetEntity,
        );

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
              await fs
                .rm(tempDir, { recursive: true, force: true })
                .catch(() => undefined);
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
                productAssetIds: requestedAssetIds ?? null,
                apiRequest: latestApiRequest,
              },
              archived: false,
              createdById: job.createdById,
            }),
          );
          createdAssetIds.push(savedAsset.id);
        }

        const fallbackActualCost = estimateStudioJobCostUsd({
          modelKey: job.modelKey,
          resolution:
            typeof payload.resolution === 'string'
              ? payload.resolution
              : undefined,
          durationSec:
            typeof payload.durationSec === 'number'
              ? payload.durationSec
              : undefined,
          referenceVideoDurationSec:
            typeof payload.referenceVideoDurationSec === 'number'
              ? payload.referenceVideoDurationSec
              : undefined,
          provider: execResult.providerUsed,
        });

        job.status = 'COMPLETED';
        job.progress = 100;
        job.providerUsed = execResult.providerUsed;
        job.failoverTriggered = execResult.failoverTriggered;
        job.externalTaskId = execResult.externalTaskId;
        job.attemptsJson = execResult.attempts;
        job.outputAssetIdsJson = createdAssetIds;
        job.actualCostUsd = execResult.actualCostUsd ?? fallbackActualCost;
        job.inputPayloadJson = {
          ...(job.inputPayloadJson ?? {}),
          ...(latestApiRequest ? { apiRequest: latestApiRequest } : {}),
        };
        job.completedAt = new Date();
        await jobRepo.save(job);
      } catch (error) {
        const latestJob = await jobRepo.findOne({
          where: { id: job.id, workspaceId },
        });
        if (latestJob?.status === 'CANCELLED') {
          return;
        }
        const attempts =
          (
            error as StudioProviderCallError & {
              attempts?: StudioProviderAttemptRecord[];
            }
          )?.attempts ??
          job.attemptsJson ??
          [];
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
    } finally {
      this.activeJobExecutions.delete(jobId);
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
