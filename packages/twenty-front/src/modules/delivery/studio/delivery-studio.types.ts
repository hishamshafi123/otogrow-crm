import { REACT_APP_SERVER_BASE_URL } from '~/config';

export type StudioProviderId = 'wavespeed' | 'kie';
export type StudioRoutingMode = 'AUTO_FAILOVER' | 'WAVESPEED_ONLY' | 'KIE_ONLY';
export type StudioPresetKind =
  | 'CHARACTER_SHEET'
  | 'VIDEO_GENERATION'
  | 'TEXT_HOOK'
  | 'CASTING_PERSONA'
  | 'ENVIRONMENT';
export type StudioStageKey =
  | 'CHARACTER_SHEET'
  | 'VIDEO_GENERATION'
  | 'BATCH_MATRIX'
  | 'TEXT_HOOKS';

export type StudioModelSpecDTO = {
  key: string;
  label: string;
  vendor: string;
  kind: 'IMAGE' | 'VIDEO';
  tier: 'FLAGSHIP' | 'FAST' | 'VALUE' | 'SPECIALIZED' | 'DRAFT' | 'STANDARD' | 'PRO' | 'PREMIUM';
  description?: string;
  summary?: string;
  recommendedFor?: string[];
  capabilities: {
    supportsMultiImageRef?: boolean;
    maxReferenceImages: number;
    maxReferenceVideos?: number;
    supportsReferenceVideo?: boolean;
    supportsAudio?: boolean;
    supportsAudioGeneration?: boolean;
    aspectRatios?: string[];
    supportsAspectRatios?: string[];
    resolutions?: string[];
    supportsResolutions?: string[];
    defaultResolution: string;
    minDurationSec?: number;
    maxDurationSec?: number;
  };
  pricing: {
    unit: 'PER_IMAGE' | 'PER_SECOND';
    baseRateUsd?: number;
    baseUsd?: number;
    resolutionMultipliers?: Record<string, number>;
  };
  wavespeed?: { endpoint: string };
  kie?: { model: string };
  providers?: {
    wavespeed: { endpoint: string } | null;
    kie: { model: string } | null;
  };
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

export type StudioClientOption = {
  id: string;
  name: string;
  tags?: string[];
  isClothingBrand?: boolean;
  projects: { id: string; name: string; companyId: string | null }[];
};

export type StudioPresetDTO = {
  id: string;
  companyId: string | null;
  projectId: string | null;
  kind: StudioPresetKind;
  name: string;
  description: string;
  masterPrompt: string;
  thumbnailPath?: string | null;
  configJson: {
    angleLayout?: 'GRID_SHEET' | 'SEPARATE_FRAMES' | 'SINGLE_HERO';
    angles?: string[];
    aspectRatio?: string;
    resolution?: string;
    defaultModelKey?: string;
    defaultHookCount?: number;
    platform?: 'TIKTOK' | 'INSTAGRAM_REELS' | 'META_ADS' | 'YOUTUBE_SHORTS' | 'ALL';
    funnelStage?: 'COLD' | 'WARM' | 'RETARGETING' | 'ORGANIC';
    visualAccent?: string;
    category?: string;
    [key: string]: unknown;
  };
  examplesJson: string[];
  tags: string[];
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StudioReferenceVideoDTO = {
  id: string;
  companyId: string | null;
  projectId: string | null;
  title: string;
  notes: string;
  tags: string[];
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  mediaMeta: {
    durationSec?: number;
    width?: number;
    height?: number;
  };
  streamPath: string;
  thumbnailPath: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StudioProductAssetDTO = {
  id: string;
  role: string;
  label: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  imagePath: string;
  createdAt: string;
};

export type StudioProductKitDTO = {
  id: string;
  companyId: string;
  projectId: string | null;
  name: string;
  sku: string;
  category: string;
  notes: string;
  tags: string[];
  assets: StudioProductAssetDTO[];
  createdAt: string;
  updatedAt: string;
};

export type StudioAssetDTO = {
  id: string;
  companyId: string;
  projectId: string | null;
  kind: 'CHARACTER_SHEET' | 'GENERATED_VIDEO';
  productKitId: string | null;
  referenceVideoId: string | null;
  characterAssetId: string | null;
  presetId: string | null;
  jobId: string | null;
  title: string;
  promptUsed: string;
  modelKey: string;
  providerUsed: string;
  mimeType: string;
  sizeBytes: number;
  mediaMeta: {
    durationSec?: number;
    width?: number;
    height?: number;
  };
  approved: boolean;
  deliverableId: string | null;
  hookProjectId: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  mediaPath: string;
  thumbnailPath: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StudioJobAttemptDTO = {
  provider: StudioProviderId;
  endpoint: string;
  startedAt: string;
  endedAt?: string;
  httpStatus?: number;
  error?: string;
  succeeded: boolean;
};

export type StudioJobDTO = {
  id: string;
  batchId: string | null;
  companyId: string;
  projectId: string | null;
  jobKind: 'CHARACTER_SHEET' | 'VIDEO_GENERATION';
  title: string;
  modelKey: string;
  routingMode: StudioRoutingMode;
  providerUsed: StudioProviderId | null;
  failoverTriggered: boolean;
  status:
    | 'QUEUED'
    | 'STAGING'
    | 'PROCESSING'
    | 'DOWNLOADING'
    | 'COMPLETED'
    | 'FAILED'
    | 'CANCELLED';
  progress: number;
  estimatedCostUsd: string;
  actualCostUsd: string | null;
  attempts: StudioJobAttemptDTO[];
  outputAssetIds: string[];
  externalTaskId: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StudioHookDefaultSettingDTO = {
  styleConfig: Record<string, unknown>;
  startSec: number;
  durationSec: number;
  updatedAt: string;
};

export type StudioDriveFolderOptionDTO = {
  id: string;
  name: string;
  webViewLink: string | null;
};

export type StudioDriveFoldersResponseDTO = {
  connected: boolean;
  rootFolderId: string | null;
  rootFolderName: string | null;
  rootFolderWebUrl?: string | null;
  subfolders?: StudioDriveFolderOptionDTO[];
  folders?: StudioDriveFolderOptionDTO[];
};

export type StudioWorkspacePayload = {
  canManageProviders: boolean;
  catalog: StudioModelSpecDTO[];
  hookStylePresets: Record<string, Record<string, unknown>>;
  providerConfig: StudioProviderConfigDTO;
  clients: StudioClientOption[];
  selectedClientTags?: string[];
  selectedClientIsClothingBrand?: boolean;
  hookDefault?: StudioHookDefaultSettingDTO | null;
  hasClientHookDefault?: boolean;
  presets: StudioPresetDTO[];
  referenceVideos: StudioReferenceVideoDTO[];
  productKits: StudioProductKitDTO[];
  characterSheets: StudioAssetDTO[];
  generatedVideos: StudioAssetDTO[];
  jobs: StudioJobDTO[];
};

export type StudioHookSuggestionDTO = {
  hookText: string;
  angleTag?: string;
  rationale?: string;
  recommendedStartSec?: number;
  recommendedEndSec?: number;
};

export type StudioHookVariationDTO = {
  id: string;
  variationNumber: number;
  label: string;
  hookText: string;
  angleTag: string;
  rationale: string;
  renderStatus: string;
  renderProgress: number;
  renderError: string | null;
  hasOutput: boolean;
  streamPath: string | null;
  driveSyncStatus: string;
  driveWebUrl: string | null;
};

export type StudioHookProjectDTO = {
  id: string;
  deliverableId: string;
  status: string;
  websiteUrl: string | null;
  videoAnalysis: {
    summary?: string;
    visualMoments?: string[];
    pacingNotes?: string;
    audienceCue?: string;
  } | null;
  aiSuggestions: StudioHookSuggestionDTO[];
  variations: StudioHookVariationDTO[];
};

export type StudioAgentCapabilitiesDTO = {
  version: string;
  service: string;
  basePath: string;
  models: Array<{
    key: string;
    label: string;
    vendor: string;
    kind: string;
    tier: string;
  }>;
  endpoints: Array<{
    method: string;
    path: string;
    query?: string[];
    description: string;
  }>;
};

export const studioMediaUrl = (relativePath: string | null | undefined): string => {
  if (!relativePath) return '';
  if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
    return relativePath;
  }
  const base = (REACT_APP_SERVER_BASE_URL || '').replace(/\/+$/, '');
  return `${base}${relativePath.startsWith('/') ? '' : '/'}${relativePath}`;
};

export const estimateModelCostUsd = (
  model: StudioModelSpecDTO | undefined,
  opts: { resolution?: string; durationSec?: number; count?: number },
): number => {
  if (!model) return 0;
  const baseRate = model.pricing.baseRateUsd ?? model.pricing.baseUsd ?? 0;
  const mult =
    opts.resolution && model.pricing.resolutionMultipliers?.[opts.resolution]
      ? model.pricing.resolutionMultipliers[opts.resolution]
      : 1;
  const count = Math.max(1, opts.count ?? 1);
  if (model.pricing.unit === 'PER_IMAGE') {
    return Number((baseRate * mult * count).toFixed(4));
  }
  const dur = Math.max(1, opts.durationSec ?? 8);
  return Number((baseRate * dur * mult * count).toFixed(4));
};

export const formatUsdEstimate = (usd: number): string => {
  if (!Number.isFinite(usd) || usd <= 0) return '$0.00';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
};
