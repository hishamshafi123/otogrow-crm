export type DeliverableAssetKind = 'VIDEO' | 'IMAGE' | 'DOCUMENT' | 'LINK';

export type DeliverableMediaMeta = {
  width?: number;
  height?: number;
  durationSec?: number;
  fps?: number;
  videoCodec?: string;
  audioCodec?: string;
  bitrateKbps?: number;
  colorSpace?: string;
  colorTransfer?: string;
  colorPrimaries?: string;
  pixelFormat?: string;
  aspectRatio?: string;
  isHdr?: boolean;
};

export type DeliverableVariationSummary = {
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

export type DeliverableReviewItem = {
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

export type DeliverableItem = {
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
  variations: DeliverableVariationSummary[];
  reviewsCount: number;
  reviews?: DeliverableReviewItem[];
};

export type DeliverableListResponse = {
  deliverables: DeliverableItem[];
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
};

export type ClientPortalAccessSummary = {
  id: string;
  companyId: string;
  slug: string;
  portalPath: string;
  activeCode: string | null;
  codeHint: string;
  codeRotatedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  isActive: boolean;
  isExpired?: boolean;
  lastAccessedAt: string | null;
  welcomeNote: string;
  brandAccentColor: string | null;
  showDriveLinks: boolean;
  visibleServiceOverrides: Record<string, boolean>;
};

export const DELIVERABLE_SERVICE_OPTIONS = [
  { key: 'ai-videos', label: 'AI Videos' },
  { key: 'social-media', label: 'Social Media' },
  { key: 'static-ads', label: 'Static Ads' },
  { key: 'paid-ads', label: 'Paid Ads' },
  { key: 'seo', label: 'SEO' },
  { key: 'web-development', label: 'Web / SaaS / App' },
  { key: 'design', label: 'Design & Branding' },
  { key: 'general', label: 'Other Deliverable' },
] as const;

export const formatBytesHuman = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
};

export const formatDurationHuman = (seconds?: number): string => {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return '';
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

export const currentMonthKeyInput = (): string => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
};

export type DriveFolderMode = 'FLAT' | 'SERVICE_SPLIT';

export type DriveFolderOption = {
  id: string;
  name: string;
  webViewLink: string | null;
};

export type ClientDriveRootFolderOption = {
  id: string;
  name: string;
  webViewLink: string | null;
  label?: string | null;
  isDefault: boolean;
};

export type ClientDriveMappingSummary = {
  companyId: string;
  companyName: string | null;
  rootFolderId: string;
  rootFolderName: string;
  rootFolderWebUrl: string | null;
  rootFolders?: ClientDriveRootFolderOption[];
  monthStartDay?: number;
  monthStartDaySource?: 'EXPLICIT' | 'BILLING_SCHEDULE' | 'DEFAULT';
  activeMonthKey?: string;
  activeCycleLabel?: string;
  monthFolderPatternOverride: string | null;
  monthFolderPreview: string;
};

export type DeliveryDriveConfig = {
  oauthConfigured: boolean;
  connected: boolean;
  googleEmail: string | null;
  rootFolderId: string | null;
  rootFolderName: string | null;
  monthFolderPattern: string;
  monthFolderPreview: string;
  monthFolderPresets: { pattern: string; example: string }[];
  folderMode: DriveFolderMode;
  includeOriginalInVariationFolder: boolean;
  autoPurgeVpsEnabled: boolean;
  autoPurgeVpsAfterHours: number;
  connectedAt: string | null;
  clientMappings: ClientDriveMappingSummary[];
};

export type VpsCleanupSummary = {
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

const PREVIEW_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const PREVIEW_MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export const previewDriveMonthFolder = (
  monthKey: string,
  pattern: string,
): string => {
  const match = /^([0-9]{4})-(0[1-9]|1[0-2])$/.exec(monthKey);
  if (!match) return monthKey;
  const [, year, monthStr] = match;
  const idx = Number(monthStr) - 1;
  return (pattern.trim() || '{Month} {YYYY}')
    .replace(/\{YYYY\}/g, year)
    .replace(/\{YY\}/g, year.slice(-2))
    .replace(/\{MM\}/g, monthStr)
    .replace(/\{M\}/g, String(idx + 1))
    .replace(/\{Month\}/g, PREVIEW_MONTHS[idx] ?? monthStr)
    .replace(/\{Mon\}/g, PREVIEW_MONTHS_SHORT[idx] ?? monthStr)
    .replace(/[/\\:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export type HookStylePreset =
  | 'TIKTOK_PILL'
  | 'IG_SHADOW'
  | 'AD_BOX'
  | 'EDITORIAL'
  | 'BRAND_KIT';

export type HookSafeZoneGuide =
  | 'NONE'
  | 'TIKTOK'
  | 'INSTAGRAM_REELS'
  | 'META_ADS'
  | 'SHORTS';

export type HookStyleConfig = {
  preset: HookStylePreset;
  fontFamily: string;
  fontSizePct: number;
  fontWeight: number;
  lineHeight: number;
  textAlign: 'left' | 'center' | 'right';
  uppercase: boolean;
  textColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  backgroundRadiusPx: number;
  paddingXPx: number;
  paddingYPx: number;
  strokeColor: string;
  strokeWidthPx: number;
  shadowEnabled: boolean;
  xPct: number;
  yPct: number;
  maxWidthPct: number;
  fadeInSec: number;
  fadeOutSec: number;
  safeZoneGuide?: HookSafeZoneGuide;
};

export type WebsiteProfileSnapshot = {
  url: string;
  requestedUrl?: string;
  fetchedAt: string;
  brandName: string;
  summary: string;
  targetAudience: string;
  coreOffer: string;
  painPoints: string[];
  proofPoints: string[];
  toneOfVoice: string;
  keyProducts: string[];
  source?: 'AI' | 'FALLBACK';
};

export type VideoHookAnalysis = {
  analyzedAt: string;
  openingVisualSummary: string;
  spokenTranscript: string;
  moodAndPacing: string;
  recommendedPlacement: 'TOP_SAFE' | 'UPPER_CENTER' | 'LOWER_THIRD';
  placementReason: string;
  suggestedYPct: number;
  source?: 'GEMINI' | 'FALLBACK';
};

export type AiHookSuggestion = {
  id: string;
  hookText: string;
  angleTag: string;
  rationale: string;
  suggestedStartSec: number;
  suggestedEndSec: number;
  estimatedReadSec: number;
  source?: 'AI' | 'FALLBACK';
};

export type CreativeHookDirectionInput = {
  platform?: 'TIKTOK' | 'INSTAGRAM_REELS' | 'META_ADS' | 'YOUTUBE_SHORTS' | 'ALL';
  funnelStage?: 'COLD' | 'WARM' | 'RETARGETING' | 'ORGANIC';
  campaignGoal?: string;
  offerAngle?: string;
  toneOverride?: string;
  customDirection?: string;
  variationCount?: number;
};

export type HookVariationItem = {
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

export type HookProjectData = {
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
  presets: Record<HookStylePreset, Partial<HookStyleConfig>>;
  status: string;
  lastError: string | null;
  variations: HookVariationItem[];
  updatedAt: string;
};

/* oxlint-disable twenty/no-hardcoded-colors */
export const DEFAULT_HOOK_STYLE_CLIENT: HookStyleConfig = {
  preset: 'TIKTOK_PILL',
  fontFamily: 'Inter, Noto Sans, system-ui, sans-serif',
  fontSizePct: 4.8,
  fontWeight: 800,
  lineHeight: 1.18,
  textAlign: 'center',
  uppercase: false,
  textColor: '#111111',
  backgroundColor: '#FFFFFF',
  backgroundOpacity: 0.96,
  backgroundRadiusPx: 22,
  paddingXPx: 28,
  paddingYPx: 16,
  strokeColor: '#000000',
  strokeWidthPx: 0,
  shadowEnabled: true,
  xPct: 50,
  yPct: 22,
  maxWidthPct: 70,
  fadeInSec: 0.15,
  fadeOutSec: 0.2,
  safeZoneGuide: 'TIKTOK',
};

export const HOOK_STYLE_PRESET_LABELS: {
  id: HookStylePreset;
  label: string;
  swatchBg: string;
  swatchFg: string;
}[] = [
  { id: 'TIKTOK_PILL', label: 'TikTok Pill', swatchBg: '#FFFFFF', swatchFg: '#111111' },
  { id: 'IG_SHADOW', label: 'IG Shadow', swatchBg: '#1F2937', swatchFg: '#FFFFFF' },
  { id: 'AD_BOX', label: 'Ad Box', swatchBg: '#0F172A', swatchFg: '#FFFFFF' },
  { id: 'EDITORIAL', label: 'Editorial', swatchBg: '#374151', swatchFg: '#F8FAFC' },
  { id: 'BRAND_KIT', label: 'Brand Kit', swatchBg: '#6D28D9', swatchFg: '#FFFFFF' },
];
/* oxlint-enable twenty/no-hardcoded-colors */


