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
    maxInputVideoSec?: number;
    usesAtMentionTokens?: boolean;
  };
  pricing: {
    unit: 'PER_IMAGE' | 'PER_SECOND';
    baseRateUsd?: number;
    baseUsd?: number;
    resolutionMultipliers?: Record<string, number>;
    billsInputVideoDuration?: boolean;
    minRefVideoRatioOfOutput?: number;
    providerRates?: {
      wavespeed?: {
        perImage?: Record<string, number>;
        perSecWithoutRefVideo?: Record<string, number>;
        perSecWithRefVideo?: Record<string, number>;
      };
      kie?: {
        perImage?: Record<string, number>;
        perSecWithoutRefVideo?: Record<string, number>;
        perSecWithRefVideo?: Record<string, number>;
      };
    };
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
  geminiConfigured?: boolean;
  geminiKeyLast4?: string | null;
  geminiModelId?: string | null;
  geminiSource?: 'STUDIO_KEY' | 'ADMIN_CONFIG' | 'ENV' | null;
  geminiVerifiedAt?: string | null;
  geminiLastError?: string | null;
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
  usageCount?: number;
  clientUsageCount?: number;
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

export type StudioApiInputImageRefDTO = {
  index: number;
  token: string;
  role: 'CHARACTER_SHEET' | 'PRODUCT' | 'AVATAR' | 'ENVIRONMENT';
  label: string;
  fileName: string;
  mimeType: string;
  mediaPath: string | null;
  stagedUrl: string | null;
};

export type StudioApiInputVideoRefDTO = {
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
};

export type StudioApiRequestSnapshotDTO = {
  capturedAt: string;
  provider: StudioProviderId | null;
  endpoint: string | null;
  modelKey: string;
  modelLabel: string;
  routingMode: StudioRoutingMode;
  failoverTriggered: boolean;
  externalTaskId: string | null;
  prompt: string;
  images: StudioApiInputImageRefDTO[];
  videos: StudioApiInputVideoRefDTO[];
  rawPayload: Record<string, unknown> | null;
};

export type StudioJobAttemptDTO = {
  provider: StudioProviderId;
  endpoint: string;
  startedAt: string;
  finishedAt?: string | null;
  endedAt?: string;
  status?: 'SUCCESS' | 'FAILED';
  httpStatus?: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  error?: string;
  succeeded?: boolean;
  requestPayload?: Record<string, unknown> | null;
  stagedImageUrls?: string[];
  stagedVideoUrls?: string[];
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
  apiRequest?: StudioApiRequestSnapshotDTO | null;
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

export const DEFAULT_TEXT_HOOK_MASTER_PROMPT = [
  'Write crisp, scroll-stopping on-screen opening text hooks (5 to 12 words each, readable in 2–4 seconds on mobile) that pair directly with the opening visual of the video.',
  'Vary the angle across hooks (Curiosity Gap, Pain Point, Contrarian, Specific Proof, Direct Offer, Pattern Interrupt, Relatable POV, Mistake Callout).',
  'Match the brand voice and any working example hooks provided. Avoid generic clichés and never invent fake statistics or guarantees.',
].join('\n');

export type StudioDriveRootFolderDTO = {
  id: string;
  name: string;
  webViewLink: string | null;
  label?: string | null;
  isDefault: boolean;
};

export type StudioDriveFoldersResponseDTO = {
  connected: boolean;
  clientMapped?: boolean;
  rootFolderId: string | null;
  rootFolderName: string | null;
  rootFolderWebUrl?: string | null;
  selectedRootFolderId?: string | null;
  rootFolders?: StudioDriveRootFolderDTO[];
  monthStartDay?: number;
  monthStartDaySource?: 'EXPLICIT' | 'BILLING_SCHEDULE' | 'DEFAULT';
  activeMonthKey?: string;
  activeCycleLabel?: string;
  expectedMonthFolderName?: string;
  matchedMonthFolder?: StudioDriveFolderOptionDTO | null;
  monthSubfolders?: StudioDriveFolderOptionDTO[];
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
  opts: {
    resolution?: string;
    durationSec?: number;
    referenceVideoDurationSec?: number | null;
    count?: number;
    provider?: StudioProviderId;
  },
): number => {
  if (!model) return 0;
  const res = opts.resolution || model.capabilities.defaultResolution;
  const count = Math.max(1, opts.count ?? 1);
  const providerKey = opts.provider ?? 'wavespeed';
  const providerTable =
    model.pricing.providerRates?.[providerKey] ??
    model.pricing.providerRates?.wavespeed ??
    model.pricing.providerRates?.kie;
  const baseRate = model.pricing.baseRateUsd ?? model.pricing.baseUsd ?? 0;
  const mult =
    res && model.pricing.resolutionMultipliers?.[res]
      ? model.pricing.resolutionMultipliers[res]
      : 1;

  if (model.pricing.unit === 'PER_IMAGE') {
    const exactRate =
      providerTable?.perImage?.[res] ??
      providerTable?.perImage?.[res.toUpperCase()] ??
      baseRate * mult;
    return Number((exactRate * count).toFixed(4));
  }

  const outputSec = Math.max(
    model.capabilities.minDurationSec ?? 4,
    Math.min(
      model.capabilities.maxDurationSec ?? 30,
      Math.round(opts.durationSec ?? 8),
    ),
  );
  const rawRefSec =
    typeof opts.referenceVideoDurationSec === 'number' &&
    Number.isFinite(opts.referenceVideoDurationSec) &&
    opts.referenceVideoDurationSec > 0
      ? opts.referenceVideoDurationSec
      : 0;
  const hasRefVideo = rawRefSec > 0;

  let totalBilledSec = outputSec;
  if (hasRefVideo && model.pricing.billsInputVideoDuration) {
    const maxIn = model.capabilities.maxInputVideoSec ?? 30;
    const normalizedRef = Math.ceil(Math.max(2, Math.min(maxIn, rawRefSec)));
    const minFloor = model.pricing.minRefVideoRatioOfOutput
      ? Math.ceil(outputSec * model.pricing.minRefVideoRatioOfOutput)
      : 0;
    totalBilledSec = outputSec + Math.max(normalizedRef, minFloor);
  }

  const rateMap = hasRefVideo
    ? (providerTable?.perSecWithRefVideo ??
      providerTable?.perSecWithoutRefVideo)
    : (providerTable?.perSecWithoutRefVideo ??
      providerTable?.perSecWithRefVideo);

  const perSecRate =
    rateMap?.[res] ?? rateMap?.[res.toLowerCase()] ?? baseRate * mult;

  return Number((perSecRate * totalBilledSec * count).toFixed(4));
};

export const formatUsdEstimate = (usd: number): string => {
  if (!Number.isFinite(usd) || usd <= 0) return '$0.00';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
};
