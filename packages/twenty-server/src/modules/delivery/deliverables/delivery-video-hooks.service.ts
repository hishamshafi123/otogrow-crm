import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { FileTypeParser } from 'file-type';
import { createReadStream, createWriteStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { DataSource, type EntityManager } from 'typeorm';
import { v4 } from 'uuid';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { FileStorageDriverFactory } from 'src/engine/core-modules/file-storage/file-storage-driver.factory';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryService } from 'src/modules/delivery/delivery.service';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import {
  DeliveryDeliverableEntity,
  type DeliverableMediaMeta,
} from 'src/modules/delivery/deliverables/entities/delivery-deliverable.entity';
import {
  DeliveryVideoHookProjectEntity,
  type AiHookSuggestion,
  type HookProjectStatus,
  type HookStyleConfig,
  type VideoHookAnalysis,
  type WebsiteProfileSnapshot,
} from 'src/modules/delivery/deliverables/entities/delivery-video-hook-project.entity';
import { DeliveryVideoHookVariationEntity } from 'src/modules/delivery/deliverables/entities/delivery-video-hook-variation.entity';
import {
  isUuidString,
  signDeliverableMediaToken,
} from 'src/modules/delivery/deliverables/delivery-deliverables.policy';
import { DeliveryDriveService } from 'src/modules/delivery/deliverables/delivery-drive.service';
import {
  DeliveryHookAiService,
  normalizeWebsiteUrl,
  type CreativeHookDirectionInput,
} from 'src/modules/delivery/deliverables/delivery-hook-ai.service';
import { DeliveryHookRenderAdapter } from 'src/modules/delivery/deliverables/delivery-hook-render.adapter';
import {
  analyzeHookContextSchema,
  DEFAULT_HOOK_STYLE,
  generateHookSuggestionsSchema,
  HOOK_STYLE_PRESETS,
  publishHookVariationsSchema,
  queueHookRenderSchema,
  resolveEffectiveHookStyle,
  saveHookProjectSchema,
} from 'src/modules/delivery/deliverables/delivery-video-hooks.policy';
import {
  readDeliveryKnowledgeContext,
  type DeliveryKnowledgeContext,
} from 'src/modules/delivery/knowledge/delivery-knowledge-context';
import { DeliveryClientSetupSourceService } from 'src/modules/delivery/onboarding/delivery-client-setup-source.service';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';

export const DELIVERY_HOOK_RENDER_JOB = 'delivery-video-hook-render';

const MAX_OVERLAY_PNG_BYTES = 20 * 1024 * 1024; // 20 MiB ceiling for 4K transparent PNG
const MAX_OVERLAY_PNG_DIMENSION = 8192;

const safeNormalizeWebsiteUrlOrRaw = (raw: string | null | undefined): string | null => {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    return normalizeWebsiteUrl(trimmed);
  } catch {
    return trimmed;
  }
};

const websiteSnapshotMatchesUrl = (
  snapshot: WebsiteProfileSnapshot | null,
  candidateUrl: string | null,
): boolean => {
  if (!snapshot || !candidateUrl) return false;
  const normalizedCandidate = safeNormalizeWebsiteUrlOrRaw(candidateUrl);
  if (!normalizedCandidate) return false;
  return (
    snapshot.url === normalizedCandidate ||
    snapshot.requestedUrl === normalizedCandidate ||
    snapshot.url === candidateUrl
  );
};

export type HookVariationDTO = {
  id: string;
  hookProjectId: string;
  deliverableId: string;
  variationNumber: number;
  label: string;
  hookText: string;
  angleTag: string;
  rationale: string;
  styleOverride: Partial<HookStyleConfig> | null;
  effectiveStyle: HookStyleConfig;
  hasOverlayPng: boolean;
  startSec: number;
  endSec: number;
  renderStatus: string;
  renderProgress: number;
  renderError: string | null;
  outputSizeBytes: number;
  outputMediaMeta: DeliverableMediaMeta;
  hasOutput: boolean;
  hasThumbnail: boolean;
  streamPath: string | null;
  thumbnailPath: string | null;
  driveFileId: string | null;
  driveWebUrl: string | null;
  driveSyncStatus: string;
  driveSyncedAt: string | null;
  storageState: string;
  clientVisibility: string;
  clientApprovalStatus: string;
  updatedAt: string;
};

export type HookProjectDTO = {
  id: string;
  companyId: string;
  companyName: string | null;
  deliverableId: string;
  deliverable: {
    id: string;
    title: string;
    monthKey: string;
    sequenceNumber: number;
    serviceKey: string;
    status: string;
    clientVisibility: string;
    storageState: string;
    mediaMeta: DeliverableMediaMeta;
    streamPath: string | null;
    thumbnailPath: string | null;
    driveWebUrl: string | null;
    driveSyncStatus: string;
  };
  websiteUrl: string | null;
  websiteProfileSnapshot: WebsiteProfileSnapshot | null;
  knowledgeFingerprint: string | null;
  brandKnowledgeCount: number;
  videoAnalysis: VideoHookAnalysis | null;
  creativeInput: CreativeHookDirectionInput;
  aiSuggestions: AiHookSuggestion[];
  defaultStyleConfig: HookStyleConfig;
  presets: typeof HOOK_STYLE_PRESETS;
  status: HookProjectStatus;
  lastError: string | null;
  variations: HookVariationDTO[];
  updatedAt: string;
};

const normalizeStyleForComparison = (style: HookStyleConfig): string =>
  JSON.stringify(
    Object.keys(style)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = style[key as keyof HookStyleConfig];
        return acc;
      }, {}),
  );

const buildVariationRenderFingerprint = (params: {
  hookText: string;
  startSec: number;
  endSec: number;
  overlayPngStorageKey: string | null;
  effectiveStyle: HookStyleConfig;
}): string =>
  JSON.stringify({
    hookText: params.hookText,
    startSec: Number(params.startSec),
    endSec: Number(params.endSec),
    overlayPngStorageKey: params.overlayPngStorageKey ?? null,
    style: normalizeStyleForComparison(params.effectiveStyle),
  });

@Injectable()
export class DeliveryVideoHooksService {
  private readonly logger = new Logger(DeliveryVideoHooksService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly delivery: DeliveryService,
    private readonly companies: DeliveryClientSetupSourceService,
    private readonly twentyConfigService: TwentyConfigService,
    private readonly storage: FileStorageDriverFactory,
    private readonly hookAi: DeliveryHookAiService,
    private readonly renderAdapter: DeliveryHookRenderAdapter,
    @InjectMessageQueue(MessageQueue.mediaRenderQueue)
    private readonly mediaRenderQueue: MessageQueueService,
    @Optional() private readonly driveService?: DeliveryDriveService,
  ) {}

  private identity(auth: WorkspaceAuthContext) {
    if (auth.type !== 'user' || !auth.workspaceMemberId) {
      throw new ForbiddenException('Sign in to access the Text-Hook Studio.');
    }
    return {
      workspaceId: auth.workspace.id,
      memberId: auth.workspaceMemberId,
      userWorkspaceId: auth.userWorkspaceId,
    };
  }

  private signedMediaPath(
    workspaceId: string,
    kind: 'deliverable' | 'thumbnail' | 'variation' | 'variation-thumbnail',
    id: string,
  ): string {
    const secret = this.twentyConfigService.get('APP_SECRET') || '';
    const token = signDeliverableMediaToken(secret, {
      w: workspaceId,
      t: kind,
      id,
    });
    if (kind === 'deliverable') {
      return `/delivery-deliverables/media/${id}/stream?token=${encodeURIComponent(token)}`;
    }
    if (kind === 'thumbnail') {
      return `/delivery-deliverables/media/${id}/thumbnail?token=${encodeURIComponent(token)}`;
    }
    if (kind === 'variation') {
      return `/delivery-deliverables/media/variations/${id}/stream?token=${encodeURIComponent(token)}`;
    }
    return `/delivery-deliverables/media/variations/${id}/thumbnail?token=${encodeURIComponent(token)}`;
  }

  private async authorizeCompanyForDeliverable(
    manager: EntityManager,
    workspaceId: string,
    memberId: string,
    userWorkspaceId: string,
    deliverableId: string,
    options?: { allowArchived?: boolean },
  ) {
    if (!isUuidString(deliverableId)) {
      throw new BadRequestException('Invalid deliverable ID.');
    }
    const workspace = await manager
      .getRepository(WorkspaceEntity)
      .findOneByOrFail({ id: workspaceId });
    const actor = await this.delivery.actor(
      workspace,
      memberId,
      userWorkspaceId,
      manager,
    );
    const deliverable = await manager
      .getRepository(DeliveryDeliverableEntity)
      .findOne({
        where: { id: deliverableId, workspaceId },
      });
    if (!deliverable) {
      throw new NotFoundException('Video deliverable not found.');
    }
    if (deliverable.assetKind !== 'VIDEO') {
      throw new BadRequestException(
        'Text-Hook Studio only supports video deliverables.',
      );
    }
    if (!options?.allowArchived && deliverable.status === 'ARCHIVED') {
      throw new BadRequestException(
        'Archived deliverables cannot be modified in Text-Hook Studio.',
      );
    }

    if (!actor.isManager) {
      const projects = await manager.getRepository(DeliveryProjectEntity).find({
        where: { workspaceId, companyId: deliverable.companyId },
      });
      const allowed = projects.some(
        (p) => Array.isArray(p.memberIds) && p.memberIds.includes(memberId),
      );
      if (!allowed) {
        throw new ForbiddenException(
          'You do not have access to deliverables for this client.',
        );
      }
    }

    return { workspace, actor, deliverable };
  }

  private async resolveProjectIdForKnowledge(
    manager: EntityManager,
    workspaceId: string,
    deliverable: DeliveryDeliverableEntity,
  ): Promise<string | null> {
    if (deliverable.projectId) {
      return deliverable.projectId;
    }
    const latest = await manager.getRepository(DeliveryProjectEntity).findOne({
      where: { workspaceId, companyId: deliverable.companyId },
      order: { createdAt: 'DESC' },
    });
    return latest?.id ?? null;
  }

  private async readKnowledgeForDeliverable(
    manager: EntityManager,
    workspaceId: string,
    deliverable: DeliveryDeliverableEntity,
  ): Promise<DeliveryKnowledgeContext | null> {
    const projectId = await this.resolveProjectIdForKnowledge(
      manager,
      workspaceId,
      deliverable,
    );
    if (!projectId) return null;
    try {
      return await readDeliveryKnowledgeContext(manager, workspaceId, projectId);
    } catch {
      return null;
    }
  }

  private async resolveCompanyMeta(
    auth: WorkspaceAuthContext,
    companyId: string,
  ): Promise<{ name: string | null; websiteUrl: string | null }> {
    try {
      const [company] = await this.companies.listByIds(auth, [companyId]);
      if (!company) return { name: null, websiteUrl: null };
      const domain = company.domainName?.trim() || null;
      const websiteUrl = domain
        ? /^https?:\/\//i.test(domain)
          ? domain
          : `https://${domain}`
        : null;
      return { name: company.name || null, websiteUrl };
    } catch {
      return { name: null, websiteUrl: null };
    }
  }

  private mapProjectDto(params: {
    project: DeliveryVideoHookProjectEntity;
    deliverable: DeliveryDeliverableEntity;
    variations: DeliveryVideoHookVariationEntity[];
    companyName: string | null;
    brandKnowledgeCount: number;
  }): HookProjectDTO {
    const { project, deliverable, variations, companyName, brandKnowledgeCount } =
      params;
    const defaultStyle = resolveEffectiveHookStyle(project.defaultStyleConfig);
    const hasDeliverableMedia = Boolean(
      deliverable.storageKey || deliverable.driveFileId,
    );
    const hasDeliverableThumb = Boolean(deliverable.thumbnailKey);

    return {
      id: project.id,
      companyId: project.companyId,
      companyName,
      deliverableId: project.deliverableId,
      deliverable: {
        id: deliverable.id,
        title: deliverable.title,
        monthKey: deliverable.monthKey,
        sequenceNumber: deliverable.sequenceNumber,
        serviceKey: deliverable.serviceKey,
        status: deliverable.status,
        clientVisibility: deliverable.clientVisibility,
        storageState: deliverable.storageState,
        mediaMeta: deliverable.mediaMeta ?? {},
        streamPath: hasDeliverableMedia
          ? this.signedMediaPath(
              deliverable.workspaceId,
              'deliverable',
              deliverable.id,
            )
          : null,
        thumbnailPath: hasDeliverableThumb
          ? this.signedMediaPath(
              deliverable.workspaceId,
              'thumbnail',
              deliverable.id,
            )
          : null,
        driveWebUrl: deliverable.driveWebUrl,
        driveSyncStatus: deliverable.driveSyncStatus,
      },
      websiteUrl: project.websiteUrl,
      websiteProfileSnapshot: project.websiteProfileSnapshot,
      knowledgeFingerprint: project.knowledgeFingerprint,
      brandKnowledgeCount,
      videoAnalysis: project.videoAnalysis,
      creativeInput: (project.creativeInput ?? {}) as CreativeHookDirectionInput,
      aiSuggestions: Array.isArray(project.aiSuggestions)
        ? project.aiSuggestions
        : [],
      defaultStyleConfig: defaultStyle,
      presets: HOOK_STYLE_PRESETS,
      status: project.status,
      lastError: project.lastError,
      variations: variations
        .slice()
        .sort((a, b) => a.variationNumber - b.variationNumber)
        .map((v) => {
          const hasOutput = Boolean(v.outputStorageKey || v.driveFileId);
          const hasThumb = Boolean(v.thumbnailKey);
          return {
            id: v.id,
            hookProjectId: v.hookProjectId,
            deliverableId: v.deliverableId,
            variationNumber: v.variationNumber,
            label: `v${v.variationNumber}`,
            hookText: v.hookText,
            angleTag: v.angleTag,
            rationale: v.rationale,
            styleOverride: v.styleOverride,
            effectiveStyle: resolveEffectiveHookStyle(
              defaultStyle,
              v.styleOverride,
            ),
            hasOverlayPng: Boolean(v.overlayPngStorageKey),
            startSec: Number(v.startSec),
            endSec: Number(v.endSec),
            renderStatus: v.renderStatus,
            renderProgress: v.renderProgress,
            renderError: v.renderError,
            outputSizeBytes: Number(v.outputSizeBytes ?? 0),
            outputMediaMeta: v.outputMediaMeta ?? {},
            hasOutput,
            hasThumbnail: hasThumb,
            streamPath: hasOutput
              ? this.signedMediaPath(v.workspaceId, 'variation', v.id)
              : null,
            thumbnailPath: hasThumb
              ? this.signedMediaPath(v.workspaceId, 'variation-thumbnail', v.id)
              : null,
            driveFileId: v.driveFileId,
            driveWebUrl: v.driveWebUrl,
            driveSyncStatus: v.driveSyncStatus,
            driveSyncedAt: v.driveSyncedAt
              ? v.driveSyncedAt.toISOString()
              : null,
            storageState: v.storageState,
            clientVisibility: v.clientVisibility,
            clientApprovalStatus: v.clientApprovalStatus,
            updatedAt: v.updatedAt.toISOString(),
          };
        }),
      updatedAt: project.updatedAt.toISOString(),
    };
  }

  private async ensureProjectInTx(
    manager: EntityManager,
    workspaceId: string,
    memberId: string,
    deliverable: DeliveryDeliverableEntity,
    fallbackWebsiteUrl: string | null,
  ): Promise<DeliveryVideoHookProjectEntity> {
    const repo = manager.getRepository(DeliveryVideoHookProjectEntity);
    let project = await repo.findOne({
      where: { workspaceId, deliverableId: deliverable.id },
    });
    if (project) {
      if (!project.websiteUrl && fallbackWebsiteUrl) {
        project.websiteUrl = fallbackWebsiteUrl;
        project = await repo.save(project);
      }
      return project;
    }

    const isVertical =
      (deliverable.mediaMeta?.height ?? 1920) >=
      (deliverable.mediaMeta?.width ?? 1080);
    const initialStyle: Partial<HookStyleConfig> = {
      ...DEFAULT_HOOK_STYLE,
      yPct: isVertical ? 22 : 18,
      safeZoneGuide: isVertical ? 'TIKTOK' : 'NONE',
    };

    try {
      return await repo.save(
        repo.create({
          workspaceId,
          companyId: deliverable.companyId,
          deliverableId: deliverable.id,
          websiteUrl: fallbackWebsiteUrl,
          websiteProfileSnapshot: null,
          knowledgeFingerprint: null,
          videoAnalysis: null,
          creativeInput: {
            platform: isVertical ? 'TIKTOK' : 'ALL',
            funnelStage: 'COLD',
            variationCount: 10,
          },
          aiSuggestions: [],
          defaultStyleConfig: initialStyle,
          status: 'DRAFT',
          lastError: null,
          createdById: memberId,
        }),
      );
    } catch {
      // Handle concurrent first-open race on unique(workspaceId, deliverableId)
      const existing = await repo.findOne({
        where: { workspaceId, deliverableId: deliverable.id },
      });
      if (existing) return existing;
      throw new BadRequestException('Could not initialize Text-Hook project.');
    }
  }

  private async rehydrateMasterVideoToPath(
    workspaceId: string,
    deliverable: DeliveryDeliverableEntity,
    destPath: string,
  ): Promise<void> {
    if (deliverable.storageState !== 'DRIVE_ONLY' && deliverable.storageKey) {
      try {
        const readStream = await this.storage
          .getCurrentDriver()
          .readFile({ filePath: deliverable.storageKey });
        await pipeline(readStream, createWriteStream(destPath));
        const stats = await fs.stat(destPath).catch(() => null);
        if (stats && stats.size > 0) {
          return;
        }
      } catch {
        // Fall through to Google Drive re-hydration if local file was purged or moved
      }
    }

    if (this.driveService && deliverable.driveFileId) {
      await this.driveService.downloadDriveFileToPath(
        workspaceId,
        deliverable.driveFileId,
        destPath,
      );
      const stats = await fs.stat(destPath).catch(() => null);
      if (stats && stats.size > 0) {
        return;
      }
    }

    throw new BadRequestException(
      'Source master video could not be read from local storage or Google Drive.',
    );
  }

  async getOrCreateProject(
    auth: WorkspaceAuthContext,
    deliverableId: string,
  ): Promise<HookProjectDTO> {
    const identity = this.identity(auth);

    const { project, deliverable, variations, brandKnowledgeCount } =
      await this.dataSource.transaction(async (manager) => {
        const { deliverable: del } = await this.authorizeCompanyForDeliverable(
          manager,
          identity.workspaceId,
          identity.memberId,
          identity.userWorkspaceId,
          deliverableId,
          { allowArchived: true },
        );
        const companyMeta = await this.resolveCompanyMeta(auth, del.companyId);
        const proj = await this.ensureProjectInTx(
          manager,
          identity.workspaceId,
          identity.memberId,
          del,
          companyMeta.websiteUrl,
        );
        const knowledge = await this.readKnowledgeForDeliverable(
          manager,
          identity.workspaceId,
          del,
        );
        const vars = await manager
          .getRepository(DeliveryVideoHookVariationEntity)
          .find({
            where: { workspaceId: identity.workspaceId, hookProjectId: proj.id },
            order: { variationNumber: 'ASC' },
          });
        return {
          project: proj,
          deliverable: del,
          variations: vars,
          brandKnowledgeCount: knowledge?.totalSources ?? 0,
        };
      });

    const companyMeta = await this.resolveCompanyMeta(auth, deliverable.companyId);
    return this.mapProjectDto({
      project,
      deliverable,
      variations,
      companyName: companyMeta.name,
      brandKnowledgeCount,
    });
  }

  async analyzeContext(
    auth: WorkspaceAuthContext,
    rawInput: unknown,
  ): Promise<HookProjectDTO> {
    const parsed = analyzeHookContextSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid analysis request.',
      );
    }
    const input = parsed.data;
    const identity = this.identity(auth);

    // Phase 1: authorize & mark ANALYZING
    const setup = await this.dataSource.transaction(async (manager) => {
      const { deliverable } = await this.authorizeCompanyForDeliverable(
        manager,
        identity.workspaceId,
        identity.memberId,
        identity.userWorkspaceId,
        input.deliverableId,
      );
      const companyMeta = await this.resolveCompanyMeta(
        auth,
        deliverable.companyId,
      );
      const project = await this.ensureProjectInTx(
        manager,
        identity.workspaceId,
        identity.memberId,
        deliverable,
        companyMeta.websiteUrl,
      );
      const knowledge = await this.readKnowledgeForDeliverable(
        manager,
        identity.workspaceId,
        deliverable,
      );

      const rawResolvedUrl =
        input.websiteUrl !== undefined
          ? input.websiteUrl?.trim() || null
          : project.websiteUrl || companyMeta.websiteUrl;
      const resolvedWebsiteUrl = safeNormalizeWebsiteUrlOrRaw(rawResolvedUrl);

      project.status = 'ANALYZING';
      project.lastError = null;
      if (resolvedWebsiteUrl !== project.websiteUrl) {
        project.websiteUrl = resolvedWebsiteUrl;
      }
      if (knowledge) {
        project.knowledgeFingerprint = knowledge.fingerprint;
      }
      await manager.getRepository(DeliveryVideoHookProjectEntity).save(project);

      return {
        projectId: project.id,
        deliverable,
        websiteUrl: resolvedWebsiteUrl,
        existingWebsiteProfile: project.websiteProfileSnapshot,
        existingVideoAnalysis: project.videoAnalysis,
        companyName: companyMeta.name,
        brandKnowledgeCount: knowledge?.totalSources ?? 0,
      };
    });

    // Phase 2: external I/O outside transaction (website fetch + Gemini video understanding)
    let websiteProfile: WebsiteProfileSnapshot | null =
      setup.existingWebsiteProfile;
    let videoAnalysis: VideoHookAnalysis | null = setup.existingVideoAnalysis;
    const errors: string[] = [];

    try {
      if (
        setup.websiteUrl &&
        (input.refreshWebsite ||
          !websiteSnapshotMatchesUrl(websiteProfile, setup.websiteUrl))
      ) {
        try {
          websiteProfile = await this.hookAi.analyzeWebsite(setup.websiteUrl);
        } catch (error) {
          errors.push(
            error instanceof Error ? error.message : 'Website analysis failed.',
          );
        }
      }

      if (input.refreshVideo || !videoAnalysis) {
        let tempDir: string | null = null;
        try {
          tempDir = await fs.mkdtemp(
            path.join(os.tmpdir(), 'otogrow-hook-analyze-'),
          );
          const videoPath = path.join(tempDir, 'source.mp4');
          await this.rehydrateMasterVideoToPath(
            identity.workspaceId,
            setup.deliverable,
            videoPath,
          );
          videoAnalysis = await this.hookAi.analyzeVideo(
            videoPath,
            setup.deliverable.mediaMeta ?? {},
          );
        } catch (error) {
          errors.push(
            error instanceof Error ? error.message : 'Video analysis failed.',
          );
        } finally {
          if (tempDir) {
            await fs
              .rm(tempDir, { recursive: true, force: true })
              .catch(() => undefined);
          }
        }
      }
    } catch (unexpectedError) {
      errors.push(
        unexpectedError instanceof Error
          ? unexpectedError.message
          : 'Unexpected context analysis failure.',
      );
    }

    // Phase 3: always persist results so project.status never stays stuck in ANALYZING
    const updated = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(DeliveryVideoHookProjectEntity);
      const project = await repo.findOneByOrFail({
        id: setup.projectId,
        workspaceId: identity.workspaceId,
      });
      project.websiteProfileSnapshot = websiteProfile;
      if (websiteProfile?.url) {
        project.websiteUrl = websiteProfile.url;
      }
      project.videoAnalysis = videoAnalysis;
      project.lastError = errors.length > 0 ? errors.join(' | ') : null;

      const variations = await manager
        .getRepository(DeliveryVideoHookVariationEntity)
        .find({
          where: {
            workspaceId: identity.workspaceId,
            hookProjectId: project.id,
          },
          order: { variationNumber: 'ASC' },
        });

      const isVertical =
        (setup.deliverable.mediaMeta?.height ?? 1920) >=
        (setup.deliverable.mediaMeta?.width ?? 1080);
      const defaultInitialY = isVertical ? 22 : 18;
      if (
        videoAnalysis?.suggestedYPct &&
        !setup.existingVideoAnalysis &&
        variations.length === 0 &&
        (project.defaultStyleConfig?.yPct === undefined ||
          project.defaultStyleConfig?.yPct === defaultInitialY)
      ) {
        project.defaultStyleConfig = {
          ...(project.defaultStyleConfig ?? {}),
          yPct: videoAnalysis.suggestedYPct,
        };
      }

      project.status = this.computeProjectStatus(variations, true);
      await repo.save(project);
      return { project, variations };
    });

    return this.mapProjectDto({
      project: updated.project,
      deliverable: setup.deliverable,
      variations: updated.variations,
      companyName: setup.companyName,
      brandKnowledgeCount: setup.brandKnowledgeCount,
    });
  }

  async generateSuggestions(
    auth: WorkspaceAuthContext,
    rawInput: unknown,
  ): Promise<HookProjectDTO> {
    const parsed = generateHookSuggestionsSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid hook generation input.',
      );
    }
    const input = parsed.data;
    const identity = this.identity(auth);

    const ctx = await this.dataSource.transaction(async (manager) => {
      const { deliverable } = await this.authorizeCompanyForDeliverable(
        manager,
        identity.workspaceId,
        identity.memberId,
        identity.userWorkspaceId,
        input.deliverableId,
      );
      const companyMeta = await this.resolveCompanyMeta(
        auth,
        deliverable.companyId,
      );
      const project = await this.ensureProjectInTx(
        manager,
        identity.workspaceId,
        identity.memberId,
        deliverable,
        companyMeta.websiteUrl,
      );
      const knowledge = await this.readKnowledgeForDeliverable(
        manager,
        identity.workspaceId,
        deliverable,
      );
      return {
        project,
        deliverable,
        knowledge,
        companyName: companyMeta.name || 'Client',
      };
    });

    let websiteProfile = ctx.project.websiteProfileSnapshot;
    const rawEffectiveUrl =
      input.websiteUrl !== undefined
        ? input.websiteUrl?.trim() || null
        : ctx.project.websiteUrl;
    const effectiveWebsiteUrl = safeNormalizeWebsiteUrlOrRaw(rawEffectiveUrl);

    if (
      effectiveWebsiteUrl &&
      !websiteSnapshotMatchesUrl(websiteProfile, effectiveWebsiteUrl)
    ) {
      try {
        websiteProfile = await this.hookAi.analyzeWebsite(effectiveWebsiteUrl);
      } catch (error) {
        this.logger.warn(
          `Optional website refresh skipped during hook generation: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const mergedCreativeInput: CreativeHookDirectionInput = {
      ...((ctx.project.creativeInput ?? {}) as CreativeHookDirectionInput),
      ...(input.creativeInput ?? {}),
    };

    const suggestions = await this.hookAi.generateHooks({
      companyName: ctx.companyName,
      deliverableTitle: ctx.deliverable.title,
      websiteProfile,
      brandKnowledge: ctx.knowledge,
      videoAnalysis: ctx.project.videoAnalysis,
      creativeInput: mergedCreativeInput,
      videoDurationSec: ctx.deliverable.mediaMeta?.durationSec,
    });

    const saved = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(DeliveryVideoHookProjectEntity);
      const project = await repo.findOneByOrFail({
        id: ctx.project.id,
        workspaceId: identity.workspaceId,
      });
      project.websiteUrl = websiteProfile?.url ?? effectiveWebsiteUrl;
      project.websiteProfileSnapshot = websiteProfile;
      if (ctx.knowledge) {
        project.knowledgeFingerprint = ctx.knowledge.fingerprint;
      }
      project.creativeInput = mergedCreativeInput as Record<string, unknown>;
      project.aiSuggestions = suggestions;
      project.lastError = null;
      const variations = await manager
        .getRepository(DeliveryVideoHookVariationEntity)
        .find({
          where: {
            workspaceId: identity.workspaceId,
            hookProjectId: project.id,
          },
          order: { variationNumber: 'ASC' },
        });
      project.status = this.computeProjectStatus(variations, true);
      await repo.save(project);
      return { project, variations };
    });

    return this.mapProjectDto({
      project: saved.project,
      deliverable: ctx.deliverable,
      variations: saved.variations,
      companyName: ctx.companyName,
      brandKnowledgeCount: ctx.knowledge?.totalSources ?? 0,
    });
  }

  async saveProject(
    auth: WorkspaceAuthContext,
    rawInput: unknown,
  ): Promise<HookProjectDTO> {
    const parsed = saveHookProjectSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid hook project payload.',
      );
    }
    const input = parsed.data;
    const identity = this.identity(auth);

    const seenNumbers = new Set<number>();
    for (const v of input.variations) {
      if (seenNumbers.has(v.variationNumber)) {
        throw new BadRequestException(
          `Duplicate variation number v${v.variationNumber}.`,
        );
      }
      seenNumbers.add(v.variationNumber);
    }

    const keysToCleanup: string[] = [];

    const result = await this.dataSource.transaction(async (manager) => {
      const { actor, deliverable } = await this.authorizeCompanyForDeliverable(
        manager,
        identity.workspaceId,
        identity.memberId,
        identity.userWorkspaceId,
        input.deliverableId,
      );
      const companyMeta = await this.resolveCompanyMeta(
        auth,
        deliverable.companyId,
      );
      const project = await this.ensureProjectInTx(
        manager,
        identity.workspaceId,
        identity.memberId,
        deliverable,
        companyMeta.websiteUrl,
      );

      // Serialize concurrent saves on the same hook project so variationNumber reordering never collides
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`delivery-hook-project:${identity.workspaceId}:${project.id}`],
      );

      const knowledge = await this.readKnowledgeForDeliverable(
        manager,
        identity.workspaceId,
        deliverable,
      );

      const prevDefaultStyle = resolveEffectiveHookStyle(
        project.defaultStyleConfig,
      );
      const nextDefaultStyle = input.defaultStyleConfig
        ? resolveEffectiveHookStyle(
            project.defaultStyleConfig,
            input.defaultStyleConfig,
          )
        : prevDefaultStyle;

      const varRepo = manager.getRepository(DeliveryVideoHookVariationEntity);
      const existingVars = await varRepo.find({
        where: { workspaceId: identity.workspaceId, hookProjectId: project.id },
      });
      const existingById = new Map(existingVars.map((v) => [v.id, v]));

      const incomingIds = new Set(
        input.variations.map((v) => v.id).filter(Boolean) as string[],
      );

      const toDelete = existingVars.filter((v) => !incomingIds.has(v.id));

      // RBAC: non-managers cannot delete or alter PUBLISHED variations
      if (!actor.isManager) {
        if (toDelete.some((v) => v.clientVisibility === 'PUBLISHED')) {
          throw new ForbiddenException(
            'Only delivery managers can remove published hook variations.',
          );
        }
        const defaultStyleChanged =
          normalizeStyleForComparison(prevDefaultStyle) !==
          normalizeStyleForComparison(nextDefaultStyle);
        if (
          defaultStyleChanged &&
          existingVars.some((v) => v.clientVisibility === 'PUBLISHED')
        ) {
          throw new ForbiddenException(
            'Only delivery managers can change shared hook styling once variations are published.',
          );
        }
        for (const item of input.variations) {
          if (!item.id) continue;
          const existing = existingById.get(item.id);
          if (!existing || existing.clientVisibility !== 'PUBLISHED') continue;
          const nextOverride =
            item.styleOverride === undefined
              ? existing.styleOverride
              : item.styleOverride;
          const prevEff = resolveEffectiveHookStyle(
            prevDefaultStyle,
            existing.styleOverride,
          );
          const nextEff = resolveEffectiveHookStyle(
            nextDefaultStyle,
            nextOverride,
          );
          const changed =
            existing.variationNumber !== item.variationNumber ||
            existing.hookText !== item.hookText ||
            Math.abs(Number(existing.startSec) - item.startSec) > 0.01 ||
            Math.abs(Number(existing.endSec) - item.endSec) > 0.01 ||
            normalizeStyleForComparison(prevEff) !==
              normalizeStyleForComparison(nextEff);
          if (changed) {
            throw new ForbiddenException(
              'Only delivery managers can edit published hook variations.',
            );
          }
        }
      }

      if (input.websiteUrl !== undefined) {
        project.websiteUrl = safeNormalizeWebsiteUrlOrRaw(input.websiteUrl);
      }
      if (input.creativeInput !== undefined) {
        project.creativeInput = {
          ...(project.creativeInput ?? {}),
          ...input.creativeInput,
        };
      }
      if (input.defaultStyleConfig !== undefined) {
        project.defaultStyleConfig = nextDefaultStyle;
      }

      // Delete removed variations first to avoid unique(variationNumber) collisions
      if (toDelete.length > 0) {
        for (const item of toDelete) {
          if (item.overlayPngStorageKey) {
            keysToCleanup.push(item.overlayPngStorageKey);
          }
          if (item.storageState === 'LOCAL' && item.outputStorageKey) {
            keysToCleanup.push(item.outputStorageKey);
          }
          if (item.thumbnailKey) {
            keysToCleanup.push(item.thumbnailKey);
          }
        }
        await varRepo.remove(toDelete);
      }

      // Shift surviving variations to temporary negative variationNumbers so reordering never collides
      const surviving = existingVars.filter((v) => incomingIds.has(v.id));
      for (let i = 0; i < surviving.length; i++) {
        surviving[i].variationNumber = -(i + 1);
      }
      if (surviving.length > 0) {
        await varRepo.save(surviving);
      }

      const savedVariations: DeliveryVideoHookVariationEntity[] = [];
      for (const item of input.variations) {
        const existing = item.id ? existingById.get(item.id) : undefined;
        if (item.id && !existing) {
          throw new NotFoundException(
            `Variation ${item.id} does not belong to this hook project.`,
          );
        }

        const nextOverride =
          item.styleOverride === undefined
            ? (existing?.styleOverride ?? null)
            : item.styleOverride;
        const nextEffectiveStyle = resolveEffectiveHookStyle(
          nextDefaultStyle,
          nextOverride,
        );

        if (existing) {
          const prevEffectiveStyle = resolveEffectiveHookStyle(
            prevDefaultStyle,
            existing.styleOverride,
          );
          const visualsChanged =
            existing.hookText !== item.hookText ||
            Math.abs(Number(existing.startSec) - item.startSec) > 0.01 ||
            Math.abs(Number(existing.endSec) - item.endSec) > 0.01 ||
            normalizeStyleForComparison(prevEffectiveStyle) !==
              normalizeStyleForComparison(nextEffectiveStyle);

          existing.variationNumber = item.variationNumber;
          existing.hookText = item.hookText;
          existing.angleTag = item.angleTag ?? existing.angleTag;
          existing.rationale = item.rationale ?? existing.rationale;
          existing.startSec = item.startSec;
          existing.endSec = item.endSec;
          existing.styleOverride = nextOverride;

          if (visualsChanged) {
            if (existing.overlayPngStorageKey) {
              keysToCleanup.push(existing.overlayPngStorageKey);
              existing.overlayPngStorageKey = null;
            }
            existing.renderStatus = 'PENDING';
            existing.renderProgress = 0;
            existing.renderError = null;
          }

          savedVariations.push(await varRepo.save(existing));
        } else {
          const created = varRepo.create({
            workspaceId: identity.workspaceId,
            hookProjectId: project.id,
            deliverableId: deliverable.id,
            variationNumber: item.variationNumber,
            hookText: item.hookText,
            angleTag: item.angleTag ?? '',
            rationale: item.rationale ?? '',
            styleOverride: nextOverride,
            overlayPngStorageKey: null,
            startSec: item.startSec,
            endSec: item.endSec,
            renderStatus: 'PENDING',
            renderProgress: 0,
            renderError: null,
            outputStorageKey: null,
            thumbnailKey: null,
            outputSizeBytes: '0',
            outputMediaMeta: {},
            driveFileId: null,
            driveWebUrl: null,
            driveSyncStatus: 'NOT_SYNCED',
            driveSyncedAt: null,
            driveSyncError: null,
            storageState: 'LOCAL',
            localFilePurgedAt: null,
            clientVisibility: 'INTERNAL',
            clientApprovalStatus: 'PENDING',
          });
          savedVariations.push(await varRepo.save(created));
        }
      }

      project.status = this.computeProjectStatus(savedVariations, false);
      await manager.getRepository(DeliveryVideoHookProjectEntity).save(project);

      return {
        project,
        deliverable,
        variations: savedVariations,
        companyName: companyMeta.name,
        brandKnowledgeCount: knowledge?.totalSources ?? 0,
      };
    });

    // Best-effort cleanup of replaced/deleted storage keys after DB commit
    if (keysToCleanup.length > 0) {
      const driver = this.storage.getCurrentDriver();
      for (const key of keysToCleanup) {
        await driver.delete({ folderPath: key }).catch(() => undefined);
      }
    }

    return this.mapProjectDto(result);
  }

  async saveVariationOverlayPng(
    workspace: WorkspaceEntity,
    memberId: string,
    userWorkspaceId: string,
    variationId: string,
    tempFilePath: string,
    fileSizeBytes: number,
  ): Promise<{ variationId: string; overlayPngStorageKey: string }> {
    if (!isUuidString(variationId)) {
      throw new BadRequestException('Invalid variation ID.');
    }
    if (!fileSizeBytes || fileSizeBytes > MAX_OVERLAY_PNG_BYTES) {
      throw new BadRequestException(
        'Overlay PNG must be non-empty and under 20 MiB.',
      );
    }

    // Verify PNG magic bytes and IHDR dimensions from disk
    const handle = await fs.open(tempFilePath, 'r');
    try {
      const buf = Buffer.alloc(4096);
      const { bytesRead } = await handle.read(buf, 0, buf.length, 0);
      const detected = await new FileTypeParser().fromBuffer(
        buf.subarray(0, bytesRead),
      );
      if (!detected || detected.mime !== 'image/png') {
        throw new BadRequestException(
          'Overlay upload must be a valid transparent PNG image.',
        );
      }
      if (
        bytesRead < 24 ||
        buf.subarray(12, 16).toString('ascii') !== 'IHDR'
      ) {
        throw new BadRequestException('Malformed PNG header.');
      }
      const pngWidth = buf.readUInt32BE(16);
      const pngHeight = buf.readUInt32BE(20);
      if (
        pngWidth < 1 ||
        pngHeight < 1 ||
        pngWidth > MAX_OVERLAY_PNG_DIMENSION ||
        pngHeight > MAX_OVERLAY_PNG_DIMENSION
      ) {
        throw new BadRequestException(
          `Overlay PNG dimensions (${pngWidth}x${pngHeight}) exceed the ${MAX_OVERLAY_PNG_DIMENSION}x${MAX_OVERLAY_PNG_DIMENSION} safety limit.`,
        );
      }
    } finally {
      await handle.close();
    }

    // Authorize caller against the variation's deliverable company
    const authorized = await this.dataSource.transaction(async (manager) => {
      const variation = await manager
        .getRepository(DeliveryVideoHookVariationEntity)
        .findOne({
          where: { id: variationId, workspaceId: workspace.id },
        });
      if (!variation) {
        throw new NotFoundException('Hook variation not found.');
      }
      const { actor, deliverable } = await this.authorizeCompanyForDeliverable(
        manager,
        workspace.id,
        memberId,
        userWorkspaceId,
        variation.deliverableId,
      );
      if (!actor.isManager && variation.clientVisibility === 'PUBLISHED') {
        throw new ForbiddenException(
          'Only delivery managers can update overlays on published hook variations.',
        );
      }
      return { variation, deliverable };
    });

    const overlayKey = `${workspace.id}/delivery-deliverables/${authorized.deliverable.companyId}/hooks/${variationId}-${v4()}.png`;
    const driver = this.storage.getCurrentDriver();
    await driver.writeFileStream({
      filePath: overlayKey,
      stream: createReadStream(tempFilePath),
      mimeType: 'image/png',
    });

    let previousKey: string | null = null;
    try {
      previousKey = await this.dataSource.transaction(async (manager) => {
        const varRepo = manager.getRepository(DeliveryVideoHookVariationEntity);
        const current = await varRepo.findOne({
          where: { id: variationId, workspaceId: workspace.id },
        });
        if (!current) {
          throw new NotFoundException('Hook variation not found.');
        }
        const prev = current.overlayPngStorageKey;
        current.overlayPngStorageKey = overlayKey;
        await varRepo.save(current);
        return prev;
      });
    } catch (error) {
      await driver.delete({ folderPath: overlayKey }).catch(() => undefined);
      throw error;
    }

    if (previousKey && previousKey !== overlayKey) {
      await driver.delete({ folderPath: previousKey }).catch(() => undefined);
    }

    return { variationId, overlayPngStorageKey: overlayKey };
  }

  async queueRender(
    auth: WorkspaceAuthContext,
    rawInput: unknown,
  ): Promise<HookProjectDTO> {
    const parsed = queueHookRenderSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid render request.',
      );
    }
    const input = parsed.data;
    const identity = this.identity(auth);

    const queued = await this.dataSource.transaction(async (manager) => {
      const { actor, deliverable } = await this.authorizeCompanyForDeliverable(
        manager,
        identity.workspaceId,
        identity.memberId,
        identity.userWorkspaceId,
        input.deliverableId,
      );
      const projectRepo = manager.getRepository(DeliveryVideoHookProjectEntity);
      const project = await projectRepo.findOne({
        where: { workspaceId: identity.workspaceId, deliverableId: deliverable.id },
      });
      if (!project) {
        throw new NotFoundException(
          'Save at least one hook variation before rendering.',
        );
      }

      const varRepo = manager.getRepository(DeliveryVideoHookVariationEntity);
      const allVariations = await varRepo.find({
        where: { workspaceId: identity.workspaceId, hookProjectId: project.id },
        order: { variationNumber: 'ASC' },
      });
      if (allVariations.length === 0) {
        throw new BadRequestException(
          'Add at least one hook variation before rendering.',
        );
      }

      const filterSet =
        input.variationIds && input.variationIds.length > 0
          ? new Set(input.variationIds)
          : null;
      const requestedVariations = filterSet
        ? allVariations.filter((v) => filterSet.has(v.id))
        : allVariations;

      if (
        !actor.isManager &&
        requestedVariations.some((v) => v.clientVisibility === 'PUBLISHED')
      ) {
        throw new ForbiddenException(
          'Only delivery managers can re-render published hook variations.',
        );
      }

      // Never reset already QUEUED or RENDERING variations — prevents double-renders
      const targetVariations = requestedVariations.filter(
        (v) => v.renderStatus !== 'QUEUED' && v.renderStatus !== 'RENDERING',
      );

      if (targetVariations.length > 0) {
        for (const variation of targetVariations) {
          variation.renderStatus = 'QUEUED';
          variation.renderProgress = 0;
          variation.renderError = null;
        }
        await varRepo.save(targetVariations);

        project.status = 'RENDERING';
        project.lastError = null;
        await projectRepo.save(project);
      }

      const knowledge = await this.readKnowledgeForDeliverable(
        manager,
        identity.workspaceId,
        deliverable,
      );

      return {
        project,
        deliverable,
        allVariations,
        targetVariationIds: targetVariations.map((v) => v.id),
        brandKnowledgeCount: knowledge?.totalSources ?? 0,
      };
    });

    const enqueuedIds = new Set<string>();
    try {
      for (const variationId of queued.targetVariationIds) {
        await this.mediaRenderQueue.add(
          DELIVERY_HOOK_RENDER_JOB,
          {
            workspaceId: identity.workspaceId,
            variationId,
          },
          {
            id: `hook-render:${identity.workspaceId}:${variationId}`,
          },
        );
        enqueuedIds.add(variationId);
      }
    } catch (queueError) {
      const failedIds = queued.targetVariationIds.filter(
        (id) => !enqueuedIds.has(id),
      );
      const errMessage =
        queueError instanceof Error
          ? queueError.message.slice(0, 300)
          : 'Failed to enqueue render job.';
      if (failedIds.length > 0) {
        await this.dataSource
          .transaction(async (manager) => {
            const varRepo = manager.getRepository(
              DeliveryVideoHookVariationEntity,
            );
            for (const id of failedIds) {
              await varRepo.update(
                { id, workspaceId: identity.workspaceId, renderStatus: 'QUEUED' },
                {
                  renderStatus: 'FAILED',
                  renderError: `Queue dispatch failed: ${errMessage}`,
                },
              );
            }
            const siblings = await varRepo.find({
              where: {
                workspaceId: identity.workspaceId,
                hookProjectId: queued.project.id,
              },
            });
            await manager
              .getRepository(DeliveryVideoHookProjectEntity)
              .update(
                { id: queued.project.id, workspaceId: identity.workspaceId },
                {
                  status: this.computeProjectStatus(siblings, true),
                  lastError: `Queue dispatch failed: ${errMessage}`,
                },
              );
          })
          .catch(() => undefined);
      }
      throw queueError;
    }

    const companyMeta = await this.resolveCompanyMeta(
      auth,
      queued.deliverable.companyId,
    );
    return this.mapProjectDto({
      project: queued.project,
      deliverable: queued.deliverable,
      variations: queued.allVariations,
      companyName: companyMeta.name,
      brandKnowledgeCount: queued.brandKnowledgeCount,
    });
  }

  async processRenderJob(
    workspaceId: string,
    variationId: string,
  ): Promise<void> {
    if (!isUuidString(workspaceId) || !isUuidString(variationId)) {
      return;
    }

    const loaded = await this.dataSource.transaction(async (manager) => {
      const varRepo = manager.getRepository(DeliveryVideoHookVariationEntity);
      const variation = await varRepo.findOne({
        where: { id: variationId, workspaceId },
      });
      if (!variation) return null;

      const project = await manager
        .getRepository(DeliveryVideoHookProjectEntity)
        .findOne({
          where: { id: variation.hookProjectId, workspaceId },
        });
      const deliverable = await manager
        .getRepository(DeliveryDeliverableEntity)
        .findOne({
          where: { id: variation.deliverableId, workspaceId },
        });
      if (!project || !deliverable) return null;

      const effectiveStyle = resolveEffectiveHookStyle(
        project.defaultStyleConfig,
        variation.styleOverride,
      );
      const inputFingerprint = buildVariationRenderFingerprint({
        hookText: variation.hookText,
        startSec: Number(variation.startSec),
        endSec: Number(variation.endSec),
        overlayPngStorageKey: variation.overlayPngStorageKey,
        effectiveStyle,
      });

      variation.renderStatus = 'RENDERING';
      variation.renderProgress = 5;
      variation.renderError = null;
      await varRepo.save(variation);

      return {
        variation,
        project,
        deliverable,
        effectiveStyle,
        inputFingerprint,
      };
    });

    if (!loaded) {
      return;
    }

    const { variation, project, deliverable, effectiveStyle, inputFingerprint } =
      loaded;
    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'otogrow-hook-render-'),
    );
    const driver = this.storage.getCurrentDriver();
    const oldOutputKey =
      variation.storageState === 'LOCAL' ? variation.outputStorageKey : null;
    const oldThumbKey = variation.thumbnailKey;

    try {
      const sourcePath = path.join(tempDir, 'source.mp4');
      const overlayPath = path.join(tempDir, 'overlay.png');
      const outputVideoPath = path.join(tempDir, 'rendered.mp4');
      const outputThumbPath = path.join(tempDir, 'thumb.jpg');

      await this.rehydrateMasterVideoToPath(workspaceId, deliverable, sourcePath);

      let hasOverlayPng = false;
      if (variation.overlayPngStorageKey) {
        try {
          const pngStream = await driver.readFile({
            filePath: variation.overlayPngStorageKey,
          });
          await pipeline(pngStream, createWriteStream(overlayPath));
          const stats = await fs.stat(overlayPath).catch(() => null);
          hasOverlayPng = Boolean(stats && stats.size > 0);
        } catch {
          hasOverlayPng = false;
        }
      }

      if (!hasOverlayPng) {
        await this.renderAdapter.renderSvgOverlayToPng({
          width: deliverable.mediaMeta?.width ?? 1080,
          height: deliverable.mediaMeta?.height ?? 1920,
          hookText: variation.hookText,
          style: effectiveStyle,
          outputPngPath: overlayPath,
        });
      }

      const rendered = await this.renderAdapter.renderHookVariationVideo({
        inputVideoPath: sourcePath,
        overlayPngPath: overlayPath,
        outputVideoPath,
        outputThumbnailPath: outputThumbPath,
        startSec: Number(variation.startSec),
        endSec: Number(variation.endSec),
        fadeInSec: effectiveStyle.fadeInSec,
        fadeOutSec: effectiveStyle.fadeOutSec,
        mediaMeta: deliverable.mediaMeta,
        onProgress: (percent) => {
          void this.dataSource
            .getRepository(DeliveryVideoHookVariationEntity)
            .update(
              { id: variation.id, workspaceId, renderStatus: 'RENDERING' },
              { renderProgress: percent },
            )
            .catch(() => undefined);
        },
      });

      const fileToken = v4();
      const outputKey = `${workspaceId}/delivery-deliverables/${deliverable.companyId}/hooks/${variation.id}-${fileToken}.mp4`;
      const thumbKey = rendered.thumbnailCreated
        ? `${workspaceId}/delivery-deliverables/${deliverable.companyId}/hooks/${variation.id}-${fileToken}.thumb.jpg`
        : null;

      await driver.writeFileStream({
        filePath: outputKey,
        stream: createReadStream(outputVideoPath),
        mimeType: 'video/mp4',
      });

      if (thumbKey) {
        try {
          await driver.writeFileStream({
            filePath: thumbKey,
            stream: createReadStream(outputThumbPath),
            mimeType: 'image/jpeg',
          });
        } catch {
          // Thumbnail failure should not fail the rendered MP4
        }
      }

      let committed = false;
      try {
        committed = await this.dataSource.transaction(async (manager) => {
          const varRepo = manager.getRepository(
            DeliveryVideoHookVariationEntity,
          );
          const current = await varRepo.findOne({
            where: { id: variation.id, workspaceId },
          });
          if (!current) {
            return false;
          }
          const currentProject = await manager
            .getRepository(DeliveryVideoHookProjectEntity)
            .findOne({
              where: { id: project.id, workspaceId },
            });
          if (!currentProject) {
            return false;
          }

          // Guard against concurrent edits during render: discard stale MP4 if inputs changed
          const liveEffectiveStyle = resolveEffectiveHookStyle(
            currentProject.defaultStyleConfig,
            current.styleOverride,
          );
          const liveFingerprint = buildVariationRenderFingerprint({
            hookText: current.hookText,
            startSec: Number(current.startSec),
            endSec: Number(current.endSec),
            overlayPngStorageKey: current.overlayPngStorageKey,
            effectiveStyle: liveEffectiveStyle,
          });
          if (liveFingerprint !== inputFingerprint) {
            return false;
          }

          current.renderStatus = 'READY';
          current.renderProgress = 100;
          current.renderError = null;
          current.outputStorageKey = outputKey;
          current.thumbnailKey = thumbKey;
          current.outputSizeBytes = String(rendered.sizeBytes);
          current.outputMediaMeta = rendered.mediaMeta;
          current.storageState = 'LOCAL';
          current.localFilePurgedAt = null;
          current.driveSyncStatus = 'NOT_SYNCED';
          current.driveSyncError = null;
          await varRepo.save(current);

          await manager
            .getRepository(DeliveryDeliverableEntity)
            .update(
              { id: deliverable.id, workspaceId },
              { hasVariations: true },
            );

          const siblings = await varRepo.find({
            where: { workspaceId, hookProjectId: project.id },
          });
          await manager
            .getRepository(DeliveryVideoHookProjectEntity)
            .update(
              { id: project.id, workspaceId },
              {
                status: this.computeProjectStatus(siblings, true),
                lastError: null,
              },
            );
          return true;
        });
      } catch (dbErr) {
        await driver.delete({ folderPath: outputKey }).catch(() => undefined);
        if (thumbKey) {
          await driver.delete({ folderPath: thumbKey }).catch(() => undefined);
        }
        throw dbErr;
      }

      if (!committed) {
        // Variation was deleted or edited while FFmpeg was running — remove newly uploaded stale artifacts
        await driver.delete({ folderPath: outputKey }).catch(() => undefined);
        if (thumbKey) {
          await driver.delete({ folderPath: thumbKey }).catch(() => undefined);
        }
        return;
      }

      // Clean up replaced output files best-effort
      if (oldOutputKey && oldOutputKey !== outputKey) {
        await driver.delete({ folderPath: oldOutputKey }).catch(() => undefined);
      }
      if (oldThumbKey && oldThumbKey !== thumbKey) {
        await driver.delete({ folderPath: oldThumbKey }).catch(() => undefined);
      }

      // Auto-trigger Google Drive sync so standalone 3.mp4 promotes to 3/v1.mp4, v2.mp4, v3.mp4
      if (this.driveService) {
        await this.driveService
          .enqueueDeliverableSyncIfConnected(workspaceId, deliverable.id)
          .catch(() => undefined);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message.slice(0, 400) : String(error);
      this.logger.error(
        `Hook variation render failed for variation ${variationId}: ${message}`,
      );
      await this.dataSource
        .transaction(async (manager) => {
          const varRepo = manager.getRepository(
            DeliveryVideoHookVariationEntity,
          );
          await varRepo.update(
            { id: variationId, workspaceId, renderStatus: 'RENDERING' },
            {
              renderStatus: 'FAILED',
              renderError: message,
            },
          );
          const siblings = await varRepo.find({
            where: { workspaceId, hookProjectId: project.id },
          });
          await manager
            .getRepository(DeliveryVideoHookProjectEntity)
            .update(
              { id: project.id, workspaceId },
              {
                status: this.computeProjectStatus(siblings, true),
                lastError: message,
              },
            );
        })
        .catch(() => undefined);
    } finally {
      await fs
        .rm(tempDir, { recursive: true, force: true })
        .catch(() => undefined);
    }
  }

  async publishVariations(
    auth: WorkspaceAuthContext,
    rawInput: unknown,
  ): Promise<HookProjectDTO> {
    const parsed = publishHookVariationsSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? 'Invalid publish payload.',
      );
    }
    const input = parsed.data;
    const identity = this.identity(auth);

    const published = await this.dataSource.transaction(async (manager) => {
      const { actor, deliverable } = await this.authorizeCompanyForDeliverable(
        manager,
        identity.workspaceId,
        identity.memberId,
        identity.userWorkspaceId,
        input.deliverableId,
      );
      if (!actor.isManager) {
        throw new ForbiddenException(
          'Only delivery managers can publish hook variations to the client dashboard.',
        );
      }

      const project = await manager
        .getRepository(DeliveryVideoHookProjectEntity)
        .findOne({
          where: {
            workspaceId: identity.workspaceId,
            deliverableId: deliverable.id,
          },
        });
      if (!project) {
        throw new NotFoundException('Hook project not found.');
      }

      const varRepo = manager.getRepository(DeliveryVideoHookVariationEntity);
      const variations = await varRepo.find({
        where: { workspaceId: identity.workspaceId, hookProjectId: project.id },
        order: { variationNumber: 'ASC' },
      });

      const selectedSet =
        input.variationIds && input.variationIds.length > 0
          ? new Set(input.variationIds)
          : null;
      const readyToPublish = variations.filter(
        (v) =>
          v.renderStatus === 'READY' &&
          (!selectedSet || selectedSet.has(v.id)),
      );
      if (readyToPublish.length === 0) {
        throw new BadRequestException(
          'Render at least one hook variation before publishing to the client.',
        );
      }

      for (const v of readyToPublish) {
        v.clientVisibility = 'PUBLISHED';
      }
      await varRepo.save(readyToPublish);

      if (input.publishDeliverable !== false) {
        deliverable.clientVisibility = 'PUBLISHED';
        deliverable.hasVariations = true;
        if (!deliverable.publishedAt) {
          deliverable.publishedAt = new Date();
        }
        if (deliverable.status === 'PENDING_REVIEW' || deliverable.status === 'DRAFT') {
          deliverable.status = 'APPROVED';
          deliverable.approvedById = identity.memberId;
        }
        await manager.getRepository(DeliveryDeliverableEntity).save(deliverable);
      }

      await recordOtogrowActivity(manager, {
        workspaceId: identity.workspaceId,
        actorId: identity.memberId,
        actorType: 'HUMAN',
        category: 'CREATIVE',
        sourceType: 'deliverable',
        sourceId: deliverable.id,
        projectId: deliverable.projectId ?? undefined,
        action: 'HOOK_VARIATIONS_PUBLISHED',
        outcome: 'SUCCEEDED',
        summary: `Published ${readyToPublish.length} text-hook variation(s) for "${deliverable.title}" to client dashboard.`,
        changes: [
          {
            field: 'variationCount',
            before: null,
            after: String(readyToPublish.length),
          },
          {
            field: 'hookProjectStatus',
            before: project.status,
            after: 'COMPLETED',
          },
        ],
      });

      const knowledge = await this.readKnowledgeForDeliverable(
        manager,
        identity.workspaceId,
        deliverable,
      );

      return {
        project,
        deliverable,
        variations,
        brandKnowledgeCount: knowledge?.totalSources ?? 0,
      };
    });

    if (this.driveService) {
      await this.driveService
        .enqueueDeliverableSyncIfConnected(
          identity.workspaceId,
          published.deliverable.id,
        )
        .catch(() => undefined);
    }

    const companyMeta = await this.resolveCompanyMeta(
      auth,
      published.deliverable.companyId,
    );
    return this.mapProjectDto({
      project: published.project,
      deliverable: published.deliverable,
      variations: published.variations,
      companyName: companyMeta.name,
      brandKnowledgeCount: published.brandKnowledgeCount,
    });
  }

  private computeProjectStatus(
    variations: DeliveryVideoHookVariationEntity[],
    hasAnalysisOrRender: boolean,
  ): HookProjectStatus {
    if (variations.length === 0) {
      return hasAnalysisOrRender ? 'READY' : 'DRAFT';
    }
    if (
      variations.some(
        (v) => v.renderStatus === 'QUEUED' || v.renderStatus === 'RENDERING',
      )
    ) {
      return 'RENDERING';
    }
    if (variations.every((v) => v.renderStatus === 'READY')) {
      return 'COMPLETED';
    }
    if (variations.some((v) => v.renderStatus === 'FAILED')) {
      return 'FAILED';
    }
    return 'READY';
  }
}
