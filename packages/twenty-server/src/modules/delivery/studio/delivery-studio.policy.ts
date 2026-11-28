import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { STUDIO_MODEL_CATALOG } from 'src/modules/delivery/studio/delivery-studio-catalog';

const MODEL_KEYS = STUDIO_MODEL_CATALOG.map((item) => item.key);

export const STUDIO_MAX_VIDEO_UPLOAD_BYTES = 200 * 1024 * 1024; // 200 MB
export const STUDIO_MAX_IMAGE_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

export const STUDIO_ALLOWED_VIDEO_MIMES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);

export const STUDIO_ALLOWED_IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
]);

export const saveProviderConfigSchema = z
  .object({
    wavespeedApiKey: z.string().trim().max(400).nullable().optional(),
    clearWavespeedKey: z.boolean().optional(),
    wavespeedEnabled: z.boolean().optional(),
    kieApiKey: z.string().trim().max(400).nullable().optional(),
    clearKieKey: z.boolean().optional(),
    kieEnabled: z.boolean().optional(),
    geminiApiKey: z.string().trim().max(400).nullable().optional(),
    clearGeminiKey: z.boolean().optional(),
    defaultRoutingMode: z
      .enum(['AUTO_FAILOVER', 'WAVESPEED_ONLY', 'KIE_ONLY'])
      .optional(),
    defaultImageModel: z
      .string()
      .refine((v) => MODEL_KEYS.includes(v), 'Unsupported image model')
      .optional(),
    defaultVideoModel: z
      .string()
      .refine((v) => MODEL_KEYS.includes(v), 'Unsupported video model')
      .optional(),
    maxConcurrentJobs: z.number().int().min(1).max(20).optional(),
  })
  .strict();

export const upsertStudioPresetSchema = z
  .object({
    id: z.string().uuid().optional(),
    companyId: z.string().uuid().nullable().optional(),
    projectId: z.string().uuid().nullable().optional(),
    kind: z.enum([
      'CHARACTER_SHEET',
      'VIDEO_GENERATION',
      'TEXT_HOOK',
      'CASTING_PERSONA',
      'ENVIRONMENT',
    ]),
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(600).optional(),
    masterPrompt: z.string().trim().max(8000).optional(),
    configJson: z.record(z.string(), z.unknown()).optional(),
    examplesJson: z.array(z.string().trim().min(1).max(400)).max(30).optional(),
    tagsJson: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
    isDefault: z.boolean().optional(),
  })
  .strict();

export const upsertProductKitSchema = z
  .object({
    id: z.string().uuid().optional(),
    companyId: z.string().uuid(),
    projectId: z.string().uuid().nullable().optional(),
    name: z.string().trim().min(1).max(180),
    sku: z.string().trim().max(80).optional(),
    category: z.string().trim().max(80).optional(),
    notes: z.string().trim().max(3000).optional(),
    tagsJson: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  })
  .strict();

export const importProductFromUrlSchema = z
  .object({
    companyId: z.string().uuid(),
    projectId: z.string().uuid().nullable().optional(),
    productKitId: z.string().uuid().nullable().optional(),
    url: z.string().trim().min(4).max(1500),
    name: z.string().trim().max(180).optional(),
    maxImages: z.number().int().min(1).max(8).optional(),
  })
  .strict();

export const updateProductAssetsSchema = z
  .object({
    productKitId: z.string().uuid(),
    assets: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            label: z.string().trim().min(1).max(80).optional(),
            role: z.string().trim().min(1).max(40).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(24),
  })
  .strict();

export const generateCharacterSheetSchema = z
  .object({
    companyId: z.string().uuid(),
    projectId: z.string().uuid().nullable().optional(),
    productKitId: z.string().uuid().nullable().optional(),
    productAssetIds: z.array(z.string().uuid()).max(16).optional(),
    presetId: z.string().uuid().nullable().optional(),
    castingPresetId: z.string().uuid().nullable().optional(),
    environmentPresetId: z.string().uuid().nullable().optional(),
    title: z.string().trim().min(1).max(200).optional(),
    modelKey: z
      .string()
      .refine((v) => MODEL_KEYS.includes(v), 'Unsupported image model'),
    routingMode: z
      .enum(['AUTO_FAILOVER', 'WAVESPEED_ONLY', 'KIE_ONLY'])
      .optional(),
    masterPrompt: z.string().trim().max(8000).optional(),
    angles: z.array(z.string().trim().min(1).max(160)).min(1).max(8).optional(),
    angleLayout: z
      .enum(['GRID_SHEET', 'SEPARATE_FRAMES', 'SINGLE_HERO', 'CUSTOM'])
      .optional(),
    talentDescription: z.string().trim().max(1500).optional(),
    environmentOverride: z.string().trim().max(1500).optional(),
    customNotes: z.string().trim().max(2000).optional(),
    aspectRatio: z.string().trim().max(16).optional(),
    resolution: z.string().trim().max(16).optional(),
    quality: z.enum(['low', 'medium', 'high', 'max']).optional(),
    candidateCount: z.number().int().min(1).max(4).optional(),
  })
  .strict();

export const generateVideoSchema = z
  .object({
    companyId: z.string().uuid(),
    projectId: z.string().uuid().nullable().optional(),
    referenceVideoId: z.string().uuid(),
    characterAssetId: z.string().uuid().nullable().optional(),
    productKitId: z.string().uuid().nullable().optional(),
    productAssetIds: z.array(z.string().uuid()).max(16).optional(),
    environmentPresetId: z.string().uuid().nullable().optional(),
    extraReferenceAssetIds: z.array(z.string().uuid()).max(8).optional(),
    presetId: z.string().uuid().nullable().optional(),
    title: z.string().trim().min(1).max(200).optional(),
    modelKeys: z
      .array(
        z
          .string()
          .refine((v) => MODEL_KEYS.includes(v), 'Unsupported video model'),
      )
      .min(1)
      .max(3),
    routingMode: z
      .enum(['AUTO_FAILOVER', 'WAVESPEED_ONLY', 'KIE_ONLY'])
      .optional(),
    masterPrompt: z.string().trim().max(8000).optional(),
    environmentOverride: z.string().trim().max(2000).optional(),
    customNotes: z.string().trim().max(2000).optional(),
    aspectRatio: z.string().trim().max(16).optional(),
    resolution: z.string().trim().max(16).optional(),
    durationSec: z.number().int().min(4).max(30).optional(),
    generateAudio: z.boolean().optional(),
    autoPromptWithGemini: z.boolean().optional(),
  })
  .strict();

export const analyzeVideoPromptSchema = z
  .object({
    companyId: z.string().uuid(),
    referenceVideoId: z.string().uuid(),
    characterAssetId: z.string().uuid().nullable().optional(),
    productKitId: z.string().uuid().nullable().optional(),
    productAssetIds: z.array(z.string().uuid()).max(16).optional(),
    environmentPresetId: z.string().uuid().nullable().optional(),
    modelKey: z
      .string()
      .refine((v) => MODEL_KEYS.includes(v), 'Unsupported video model')
      .optional(),
    environmentOverride: z.string().trim().max(2000).optional(),
    customNotes: z.string().trim().max(2000).optional(),
  })
  .strict();

export const batchGenerateVideosSchema = z
  .object({
    companyId: z.string().uuid(),
    projectId: z.string().uuid().nullable().optional(),
    modelKey: z
      .string()
      .refine((v) => MODEL_KEYS.includes(v), 'Unsupported video model'),
    routingMode: z
      .enum(['AUTO_FAILOVER', 'WAVESPEED_ONLY', 'KIE_ONLY'])
      .optional(),
    presetId: z.string().uuid().nullable().optional(),
    masterPrompt: z.string().trim().max(8000).optional(),
    aspectRatio: z.string().trim().max(16).optional(),
    resolution: z.string().trim().max(16).optional(),
    durationSec: z.number().int().min(4).max(30).optional(),
    generateAudio: z.boolean().optional(),
    items: z
      .array(
        z
          .object({
            referenceVideoId: z.string().uuid(),
            characterAssetId: z.string().uuid().nullable().optional(),
            productKitId: z.string().uuid().nullable().optional(),
            title: z.string().trim().min(1).max(200).optional(),
            environmentOverride: z.string().trim().max(2000).optional(),
            customNotes: z.string().trim().max(2000).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(60),
  })
  .strict();

export const suggestHooksForStudioAssetSchema = z
  .object({
    assetId: z.string().uuid(),
    hookPresetId: z.string().uuid().nullable().optional(),
    masterPrompt: z.string().trim().max(4000).optional(),
    exampleHooks: z.array(z.string().trim().min(1).max(300)).max(25).optional(),
    websiteUrl: z.string().trim().max(400).nullable().optional(),
    platform: z
      .enum(['TIKTOK', 'INSTAGRAM_REELS', 'META_ADS', 'YOUTUBE_SHORTS', 'ALL'])
      .optional(),
    funnelStage: z
      .enum(['COLD', 'WARM', 'RETARGETING', 'ORGANIC'])
      .optional(),
    campaignGoal: z.string().trim().max(300).optional(),
    offerAngle: z.string().trim().max(400).optional(),
    toneOverride: z.string().trim().max(200).optional(),
    customDirection: z.string().trim().max(1200).optional(),
    suggestionCount: z.number().int().min(3).max(12).optional(),
    refreshVideoAnalysis: z.boolean().optional(),
    serviceKey: z.string().trim().min(1).max(100).optional(),
    monthKey: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  })
  .strict();

export const renderSelectedHooksForStudioAssetSchema = z
  .object({
    assetId: z.string().uuid(),
    stylePreset: z
      .enum(['TIKTOK_PILL', 'IG_SHADOW', 'AD_BOX', 'EDITORIAL', 'BRAND_KIT'])
      .optional(),
    styleConfig: z.record(z.string(), z.unknown()).optional(),
    hooks: z
      .array(
        z
          .object({
            hookText: z.string().trim().min(1).max(240),
            angleTag: z.string().trim().max(80).optional(),
            rationale: z.string().trim().max(400).optional(),
            startSec: z.number().min(0).max(60).optional(),
            endSec: z.number().min(0.5).max(65).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(12),
    driveRootFolderId: z.string().trim().max(200).nullable().optional(),
    driveTargetFolderId: z.string().trim().max(200).nullable().optional(),
    driveSubfolderName: z.string().trim().max(120).nullable().optional(),
    saveAsClientDefault: z.boolean().optional(),
    publishToClientPortal: z.boolean().optional(),
    syncToDrive: z.boolean().optional(),
  })
  .strict();

export const saveStudioVideoToDriveSchema = z
  .object({
    assetId: z.string().uuid(),
    driveRootFolderId: z.string().trim().max(200).nullable().optional(),
    driveTargetFolderId: z.string().trim().max(200).nullable().optional(),
    driveSubfolderName: z.string().trim().max(120).nullable().optional(),
    serviceKey: z.string().trim().min(1).max(100).optional(),
    monthKey: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    publishToClientPortal: z.boolean().optional(),
  })
  .strict();

export const saveStudioHookDefaultSchema = z
  .object({
    companyId: z.string().uuid().nullable().optional(),
    styleConfig: z.record(z.string(), z.unknown()),
    startSec: z.number().min(0).max(60).default(0),
    durationSec: z.number().min(0.5).max(30).default(3.5),
  })
  .strict();

export const trimReferenceVideoSchema = z
  .object({
    referenceVideoId: z.string().uuid(),
    trimStartSec: z.number().min(0).max(600),
    trimEndSec: z.number().positive().max(600),
    title: z.string().trim().min(1).max(180).optional(),
    notes: z.string().trim().max(2000).optional(),
    saveAsCopy: z.boolean().optional(),
  })
  .strict();

export type StudioMediaTokenPayload = {
  w: string; // workspaceId
  t:
    | 'ref-video'
    | 'ref-thumb'
    | 'product-asset'
    | 'studio-asset'
    | 'studio-thumb'
    | 'preset-thumb';
  id: string;
  subId?: string;
  exp: number;
};

const STUDIO_MEDIA_TOKEN_TTL_SEC = 12 * 60 * 60; // 12 hours

export const signStudioMediaToken = (
  secret: string,
  payload: Omit<StudioMediaTokenPayload, 'exp'>,
): string => {
  const full: StudioMediaTokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + STUDIO_MEDIA_TOKEN_TTL_SEC,
  };
  const body = Buffer.from(JSON.stringify(full), 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret || 'otogrow-studio-fallback')
    .update(`studio-media:${body}`)
    .digest('base64url');
  return `${body}.${sig}`;
};

export const verifyStudioMediaToken = (
  secret: string,
  token: string,
): StudioMediaTokenPayload | null => {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = createHmac('sha256', secret || 'otogrow-studio-fallback')
    .update(`studio-media:${body}`)
    .digest('base64url');
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    ) as StudioMediaTokenPayload;
    if (
      !parsed ||
      typeof parsed.w !== 'string' ||
      typeof parsed.t !== 'string' ||
      typeof parsed.id !== 'string' ||
      typeof parsed.exp !== 'number'
    ) {
      return null;
    }
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
};
