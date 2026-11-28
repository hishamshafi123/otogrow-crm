import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { generateText } from 'ai';
import axios from 'axios';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import {
  AiModelRegistryService,
  type RegisteredAiModel,
} from 'src/engine/metadata-modules/ai/ai-models/services/ai-model-registry.service';
import { DeliveryHookRenderAdapter } from 'src/modules/delivery/deliverables/delivery-hook-render.adapter';

const MAX_INLINE_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_DOWNSCALE_THRESHOLD_BYTES = 900 * 1024;
const MAX_DIRECT_VIDEO_FALLBACK_BYTES = 4 * 1024 * 1024;
const MAX_VIDEO_PROXY_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_INLINE_BYTES = 7 * 1024 * 1024;

type SharpPipeline = {
  rotate: () => SharpPipeline;
  resize: (opts: {
    width: number;
    height: number;
    fit: 'inside';
    withoutEnlargement: boolean;
  }) => SharpPipeline;
  jpeg: (opts: { quality: number; mozjpeg?: boolean }) => SharpPipeline;
  toBuffer: () => Promise<Buffer>;
};
type SharpFactory = (input: Buffer) => SharpPipeline;

const compactImageForGemini = async (
  bytes: Buffer,
  mimeType: string,
): Promise<{ bytes: Buffer; mimeType: string }> => {
  if (bytes.length <= IMAGE_DOWNSCALE_THRESHOLD_BYTES) {
    return { bytes, mimeType };
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sharp = require('sharp') as SharpFactory;
    const resized = await sharp(bytes)
      .rotate()
      .resize({
        width: 1536,
        height: 1536,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 88 })
      .toBuffer();
    if (resized.length > 0 && resized.length < bytes.length) {
      return { bytes: resized, mimeType: 'image/jpeg' };
    }
  } catch {
    // Fall back to original image bytes when sharp is unavailable
  }
  return { bytes, mimeType };
};

export type StudioPromptImageInput = {
  token: string;
  role: 'CHARACTER_SHEET' | 'PRODUCT' | 'AVATAR' | 'ENVIRONMENT';
  label: string;
  mimeType: string;
  bytes?: Buffer;
  cachedAnalysis?: string | null;
};

export type StudioPromptVideoInput = {
  token: string;
  label: string;
  mimeType: string;
  durationSec?: number | null;
  filePath?: string;
  bytes?: Buffer;
  cachedAnalysis?: string | null;
};

export type StudioVideoAnalysisResult = {
  analysisText: string;
  modelId: string;
  mode: 'VIDEO' | 'KEYFRAMES';
};

export type StudioGeneratedVideoPromptResult = {
  prompt: string;
  source: 'GEMINI' | 'FALLBACK';
  modelId: string | null;
  summary: string;
  newImageAnalyses?: Record<string, string>;
  videoAnalysisUsedCache?: boolean;
  newlyAnalyzedImagesCount?: number;
  cachedImagesCount?: number;
};

export type StudioRefinedVideoPromptResult = {
  prompt: string;
  source: 'GEMINI' | 'FALLBACK';
  modelId: string | null;
  summary: string;
};

export type StudioGeminiModelOption = {
  id: string;
  label: string;
  badge?: string;
};

export const CURATED_GEMINI_PROMPT_MODELS: StudioGeminiModelOption[] = [
  {
    id: 'gemini-flash-latest',
    label: 'Gemini Flash Latest',
    badge: 'Auto-Latest',
  },
  {
    id: 'gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro Preview',
    badge: 'Pro',
  },
  {
    id: 'gemini-3-flash-preview',
    label: 'Gemini 3 Flash Preview',
    badge: 'Fast',
  },
  {
    id: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    badge: 'Pro',
  },
  {
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    badge: 'Balanced',
  },
  {
    id: 'gemini-2.5-flash-lite',
    label: 'Gemini 2.5 Flash-Lite',
    badge: 'Lite',
  },
];

export const normalizeGeminiModelId = (raw?: string | null): string | null => {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const cleaned = trimmed
    .replace(/^models\//i, '')
    .replace(/^google\//i, '')
    .trim();
  return cleaned.length > 0 ? cleaned : null;
};

export type StudioGeminiStatus = {
  configured: boolean;
  modelId: string | null;
  source: 'STUDIO_KEY' | 'ADMIN_CONFIG' | 'ENV' | null;
};

export const buildStructuredFallbackVideoPrompt = (params: {
  usesAtMentionTokens: boolean;
  characterToken: string | null;
  productTokens: Array<{ token: string; label: string }>;
  videoToken: string;
  productName: string;
  productNotes?: string;
  environmentPrompt?: string;
  brandNotes?: string;
  customNotes?: string;
}): string => {
  const hasCharacter = Boolean(params.characterToken);
  const charTok = params.characterToken;
  const vidTok = params.videoToken;

  const assetDeclarations: string[] = [];
  if (charTok) {
    assetDeclarations.push(
      `${charTok} is the character sheet of the model wearing the full outfit.`,
    );
  }
  const hasBackPhoto = params.productTokens.some((p) =>
    /back/i.test(p.label),
  );
  for (const prod of params.productTokens) {
    assetDeclarations.push(
      `${prod.token} is the ${prod.label || 'product reference'} of "${params.productName}".`,
    );
  }
  if (params.productTokens.length > 0 && !hasBackPhoto) {
    assetDeclarations.push(
      hasCharacter
        ? 'No back print is shown in the product references; keep the back of the garment plain and blank unless shown in the character sheet.'
        : 'No back print is shown in the product references; keep the back of the garment plain and blank.',
    );
  }
  assetDeclarations.push(`${vidTok} is the reference video.`);

  const prodRefText =
    params.productTokens.length > 0
      ? params.productTokens.map((p) => p.token).join(' and ')
      : (charTok ?? (params.usesAtMentionTokens ? '@image1' : 'Image 1'));

  const extraNotes = [
    params.productNotes?.trim(),
    params.brandNotes?.trim(),
    params.customNotes?.trim(),
  ]
    .filter(Boolean)
    .join(' ');

  if (!hasCharacter) {
    const envLine = params.environmentPrompt?.trim()
      ? `Change the environment from the original setting in ${vidTok} to: ${params.environmentPrompt.trim()}. Remove original background clutter and keep the background sharp.`
      : `Keep the exact environment, background, camera lighting, and color grade from ${vidTok}, keeping the background sharp and natural.`;

    return [
      assetDeclarations.join(' '),
      `Recreate ${vidTok} exactly: the same shots, the same cuts and timing, the same camera moves, the same transitions, and the same subject poses and actions.`,
      `Keep the person, framing, and natural motion from ${vidTok}, but completely replace the featured garment/product in ${vidTok} with the exact ${params.productName} shown in ${prodRefText}.`,
      `Keep the garment color, fabric texture, fit, drape, neckline/silhouette, and graphic/logo placement 100% identical to ${prodRefText}. Do not center, shrink, or mirror the graphic, and do not redraw, move, or resize the design.`,
      envLine,
      `Keep the ${params.productName} and its print in their true colors with realistic fabric folds, motion physics, and shadows matching the scene.${extraNotes ? ` ${extraNotes}` : ''}`,
      `No captions or on-screen text in any frame. Do not show the original garment design or original logos from ${vidTok} anywhere in the output video. Remake ${vidTok} seamlessly with the exact ${params.productName} from ${prodRefText} while keeping the edit, shots, timing, and motion identical.`,
    ].join('\n\n');
  }

  const envLine = params.environmentPrompt?.trim()
    ? `Change the environment from the original setting in ${vidTok} to: ${params.environmentPrompt.trim()}. Remove original background clutter and keep the background sharp.`
    : `Change the environment from the original setting in ${vidTok} to match the exact environment shown in ${charTok}. Keep the background sharp.`;

  return [
    assetDeclarations.join(' '),
    `Recreate ${vidTok} exactly: the same shots, the same cuts and timing, the same camera moves, the same transitions, and the same poses.`,
    `Replace the original person in ${vidTok} with the model from ${charTok}. Match their face, hair, skin tone, and build exactly across every shot.`,
    `They wear the exact outfit from ${charTok} in every shot, featuring the exact ${params.productName} from ${prodRefText}. Keep the garment color, fit, drape, and graphic placement 100% identical to ${prodRefText}. Do not center, shrink, or mirror the graphic, and do not redraw, move, or resize the design.`,
    envLine,
    `Match the color tone and lighting to ${charTok} and the target environment while keeping the garment and print in their true colors. The background stays sharp.${extraNotes ? ` ${extraNotes}` : ''}`,
    `No captions or on-screen text in any frame. Do not show the original garment design or the original person from ${vidTok} in the output video. Remake the exact same reference video with the inputted model, garment, environment, and color tone while keeping the edit, shots, timing, and poses identical.`,
  ].join('\n\n');
};

@Injectable()
export class DeliveryStudioPromptAiService {
  private readonly logger = new Logger(DeliveryStudioPromptAiService.name);
  private readonly modelListCache = new Map<
    string,
    { expiresAt: number; models: StudioGeminiModelOption[] }
  >();

  constructor(
    private readonly modelRegistry: AiModelRegistryService,
    private readonly renderAdapter: DeliveryHookRenderAdapter,
    @Optional() private readonly twentyConfig?: TwentyConfigService,
  ) {}

  private resolveGeminiApiKey(overrideApiKey?: string | null): {
    apiKey: string;
    source: 'STUDIO_KEY' | 'ADMIN_CONFIG' | 'ENV';
  } | null {
    const cleanOverride = overrideApiKey?.trim();
    if (cleanOverride && cleanOverride !== '__configured__') {
      return { apiKey: cleanOverride, source: 'STUDIO_KEY' };
    }

    let configGoogleKey = '';
    try {
      configGoogleKey =
        (this.twentyConfig?.get('GOOGLE_API_KEY') as string | undefined)
          ?.trim() ?? '';
    } catch {
      configGoogleKey = '';
    }
    if (configGoogleKey) {
      return { apiKey: configGoogleKey, source: 'ADMIN_CONFIG' };
    }

    const envKey =
      process.env.GOOGLE_API_KEY?.trim() ||
      process.env.GEMINI_API_KEY?.trim() ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
    if (envKey) {
      return { apiKey: envKey, source: 'ENV' };
    }

    return null;
  }

  private pickGeminiModel(
    overrideApiKey?: string | null,
    preferredModelId?: string | null,
  ): {
    model: RegisteredAiModel['model'];
    modelId: string;
    source: 'STUDIO_KEY' | 'ADMIN_CONFIG' | 'ENV';
  } | null {
    const preferred = normalizeGeminiModelId(preferredModelId);
    const cleanOverride = overrideApiKey?.trim();
    if (cleanOverride) {
      const google = createGoogleGenerativeAI({ apiKey: cleanOverride });
      const modelId = preferred ?? 'gemini-2.5-flash';
      return { model: google(modelId), modelId, source: 'STUDIO_KEY' };
    }

    try {
      const models = this.modelRegistry.getAdminFilteredModels();
      const googleModels = models.filter(
        (m) => m.sdkPackage === '@ai-sdk/google',
      );
      if (googleModels.length > 0) {
        if (preferred) {
          const exact = googleModels.find(
            (m) => normalizeGeminiModelId(m.modelId) === preferred,
          );
          if (exact) {
            return {
              model: exact.model,
              modelId: normalizeGeminiModelId(exact.modelId) ?? exact.modelId,
              source: 'ADMIN_CONFIG',
            };
          }
          // Fall through to direct API key check so newly-released or custom Gemini model IDs still work
        } else {
          const picked =
            googleModels.find((m) => /gemini-2\.5-flash/i.test(m.modelId)) ??
            googleModels.find((m) => /gemini-flash-latest/i.test(m.modelId)) ??
            googleModels.find((m) => /gemini-3-flash/i.test(m.modelId)) ??
            googleModels.find((m) => /gemini-2\.5-pro/i.test(m.modelId)) ??
            googleModels.find((m) => /flash|pro/i.test(m.modelId)) ??
            googleModels[0];
          if (picked) {
            return {
              model: picked.model,
              modelId: normalizeGeminiModelId(picked.modelId) ?? picked.modelId,
              source: 'ADMIN_CONFIG',
            };
          }
        }
      }
    } catch {
      // Fall through to direct API key check
    }

    const resolvedKey = this.resolveGeminiApiKey(null);
    if (resolvedKey) {
      const google = createGoogleGenerativeAI({ apiKey: resolvedKey.apiKey });
      const modelId = preferred ?? 'gemini-2.5-flash';
      return { model: google(modelId), modelId, source: resolvedKey.source };
    }

    // If preferred wasn't in registry and no direct key was readable, fall back to first registry Google model
    if (preferred) {
      try {
        const models = this.modelRegistry.getAdminFilteredModels();
        const fallback = models.find((m) => m.sdkPackage === '@ai-sdk/google');
        if (fallback) {
          return {
            model: fallback.model,
            modelId:
              normalizeGeminiModelId(fallback.modelId) ?? fallback.modelId,
            source: 'ADMIN_CONFIG',
          };
        }
      } catch {
        // ignore
      }
    }

    return null;
  }

  getGeminiStatus(
    overrideApiKey?: string | null,
    preferredModelId?: string | null,
  ): StudioGeminiStatus {
    const picked = this.pickGeminiModel(overrideApiKey, preferredModelId);
    if (!picked) {
      return { configured: false, modelId: null, source: null };
    }
    return {
      configured: true,
      modelId: picked.modelId,
      source: picked.source,
    };
  }

  async listAvailableGeminiModels(
    overrideApiKey?: string | null,
  ): Promise<StudioGeminiModelOption[]> {
    const resolved = this.resolveGeminiApiKey(overrideApiKey);
    const cacheKey = resolved
      ? `${resolved.source}:${resolved.apiKey.slice(-6)}`
      : 'no-key';
    const cached = this.modelListCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.models;
    }

    const byId = new Map<string, StudioGeminiModelOption>();
    for (const item of CURATED_GEMINI_PROMPT_MODELS) {
      byId.set(item.id, item);
    }

    const isEligiblePromptModel = (id: string): boolean => {
      if (!/^gemini-/i.test(id)) return false;
      if (
        /(embedding|imagen|veo|aqa|tts|audio|image|live|robotics|computer-use|deep-research|customtools|bisect|001$|exp-)/i.test(
          id,
        )
      ) {
        return false;
      }
      return true;
    };

    try {
      const registryModels = this.modelRegistry.getAdminFilteredModels();
      for (const m of registryModels) {
        if (m.sdkPackage !== '@ai-sdk/google') continue;
        const cleanId = normalizeGeminiModelId(m.modelId);
        if (!cleanId || !isEligiblePromptModel(cleanId) || byId.has(cleanId)) {
          continue;
        }
        byId.set(cleanId, {
          id: cleanId,
          label: cleanId
            .replace(/^gemini-/i, 'Gemini ')
            .replace(/-/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase()),
          badge: /latest/i.test(cleanId)
            ? 'Auto-Latest'
            : /pro/i.test(cleanId)
              ? 'Pro'
              : /lite/i.test(cleanId)
                ? 'Lite'
                : 'Fast',
        });
      }
    } catch {
      // ignore registry errors
    }

    if (resolved?.apiKey) {
      try {
        const res = await axios.get<{
          models?: Array<{
            name?: string;
            displayName?: string;
            supportedGenerationMethods?: string[];
          }>;
        }>('https://generativelanguage.googleapis.com/v1beta/models', {
          params: { key: resolved.apiKey, pageSize: 100 },
          timeout: 3_500,
        });
        for (const entry of res.data?.models ?? []) {
          const methods = entry.supportedGenerationMethods ?? [];
          if (!methods.includes('generateContent')) continue;
          const cleanId = normalizeGeminiModelId(entry.name);
          if (!cleanId || !isEligiblePromptModel(cleanId)) continue;
          const existing = byId.get(cleanId);
          byId.set(cleanId, {
            id: cleanId,
            label:
              existing?.label ||
              entry.displayName?.trim() ||
              cleanId
                .replace(/^gemini-/i, 'Gemini ')
                .replace(/-/g, ' ')
                .replace(/\b\w/g, (c) => c.toUpperCase()),
            badge:
              existing?.badge ??
              (/latest/i.test(cleanId)
                ? 'Auto-Latest'
                : /pro/i.test(cleanId)
                  ? 'Pro'
                  : /lite/i.test(cleanId)
                    ? 'Lite'
                    : 'Live'),
          });
        }
      } catch {
        // Best-effort live discovery; silently fall back to curated + registry models
      }
    }

    const scoreModel = (id: string): number => {
      if (id === 'gemini-flash-latest') return 10_000;
      if (id === 'gemini-pro-latest') return 9_900;
      if (id === 'gemini-flash-lite-latest') return 9_800;
      const versionMatch = /^gemini-(\d+)(?:\.(\d+))?/i.exec(id);
      const major = versionMatch ? Number(versionMatch[1]) : 0;
      const minor = versionMatch && versionMatch[2] ? Number(versionMatch[2]) : 0;
      const tier = /pro/i.test(id) ? 30 : /lite/i.test(id) ? 10 : 20;
      const stabilityBonus = /preview|exp/i.test(id) ? 0 : 5;
      return major * 1000 + minor * 100 + tier + stabilityBonus;
    };

    const sorted = Array.from(byId.values()).sort(
      (a, b) => scoreModel(b.id) - scoreModel(a.id) || a.id.localeCompare(b.id),
    );

    this.modelListCache.set(cacheKey, {
      expiresAt: Date.now() + 15 * 60 * 1000,
      models: sorted,
    });
    return sorted;
  }

  async testGeminiApiKey(
    apiKey: string,
    preferredModelId?: string | null,
  ): Promise<{ ok: boolean; message: string }> {
    const clean = apiKey.trim();
    if (!clean) {
      return { ok: false, message: 'Enter a Google Gemini API key first.' };
    }
    const targetModel = normalizeGeminiModelId(preferredModelId) ?? 'gemini-2.5-flash';
    try {
      const res = await axios.get<{
        models?: Array<{ name?: string }>;
      }>('https://generativelanguage.googleapis.com/v1beta/models', {
        params: { key: clean, pageSize: 5 },
        timeout: 12_000,
      });
      const count = res.data?.models?.length ?? 0;
      return {
        ok: true,
        message: `Connected to Google Gemini API (${count > 0 ? `${targetModel} ready` : 'verified'}).`,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const msg =
          (error.response?.data as { error?: { message?: string } } | undefined)
            ?.error?.message || error.message;
        return {
          ok: false,
          message: `Gemini API rejected key${status ? ` (HTTP ${status})` : ''}: ${msg}`,
        };
      }
      return {
        ok: false,
        message: `Gemini API check failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  async analyzeReferenceVideo(params: {
    label: string;
    mimeType: string;
    durationSec?: number | null;
    filePath?: string;
    bytes?: Buffer;
    overrideApiKey?: string | null;
    preferredModelId?: string | null;
  }): Promise<StudioVideoAnalysisResult | null> {
    const gemini = this.pickGeminiModel(
      params.overrideApiKey,
      params.preferredModelId,
    );
    if (!gemini) {
      return null;
    }

    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'otogrow-studio-vid-analyze-'),
    );
    try {
      const rawExt =
        params.mimeType === 'video/quicktime'
          ? 'mov'
          : params.mimeType === 'video/webm'
            ? 'webm'
            : 'mp4';
      let rawVideoPath = params.filePath ?? '';
      if (!rawVideoPath) {
        if (!params.bytes || params.bytes.length === 0) {
          return null;
        }
        rawVideoPath = path.join(tempDir, `ref.${rawExt}`);
        await fs.writeFile(rawVideoPath, params.bytes);
      }

      const proxyPath = path.join(tempDir, 'proxy.mp4');
      let videoBytesForGemini: Buffer | null = null;
      let videoMimeForGemini = 'video/mp4';
      let fallbackKeyframes: Array<{
        label: string;
        bytes: Buffer;
        mimeType: 'image/jpeg';
      }> = [];

      try {
        videoBytesForGemini =
          await this.renderAdapter.prepareLightweightAnalysisProxy(
            rawVideoPath,
            proxyPath,
            {
              includeAudio: false,
              maxDurationSec: 25,
              maxDimension: 360,
              fps: 8,
              maxBytes: MAX_VIDEO_PROXY_BYTES,
              timeoutMs: 25_000,
            },
          );
      } catch (proxyError) {
        this.logger.warn(
          `Video proxy transcode failed during reference video analysis; checking lightweight fallback: ${proxyError instanceof Error ? proxyError.message : String(proxyError)}`,
        );
        const rawStat = await fs.stat(rawVideoPath).catch(() => null);
        if (
          rawStat &&
          rawStat.size > 0 &&
          rawStat.size <= MAX_DIRECT_VIDEO_FALLBACK_BYTES
        ) {
          videoBytesForGemini = await fs.readFile(rawVideoPath);
          videoMimeForGemini = params.mimeType || 'video/mp4';
        } else {
          try {
            const keyframesDir = path.join(tempDir, 'keyframes');
            await fs.mkdir(keyframesDir, { recursive: true });
            fallbackKeyframes =
              await this.renderAdapter.extractAnalysisKeyframes(
                rawVideoPath,
                keyframesDir,
                {
                  maxFrames: 6,
                  durationSec: params.durationSec,
                },
              );
          } catch (keyframeError) {
            this.logger.warn(
              `Keyframe extraction fallback also failed: ${keyframeError instanceof Error ? keyframeError.message : String(keyframeError)}`,
            );
          }
        }
      }

      if (!videoBytesForGemini && fallbackKeyframes.length === 0) {
        return null;
      }

      const contentParts: Array<
        | { type: 'text'; text: string }
        | { type: 'image'; image: Buffer; mediaType?: string }
        | { type: 'file'; data: Buffer; mediaType: string }
      > = [];

      if (videoBytesForGemini) {
        contentParts.push({
          type: 'text',
          text: `Reference video "${params.label}" (Duration: ${params.durationSec ? `${params.durationSec.toFixed(1)}s` : 'unknown'}):`,
        });
        contentParts.push({
          type: 'file',
          data: videoBytesForGemini,
          mediaType: videoMimeForGemini,
        });
      } else {
        contentParts.push({
          type: 'text',
          text: `Reference video "${params.label}" (Duration: ${params.durationSec ? `${params.durationSec.toFixed(1)}s` : 'unknown'} — ${fallbackKeyframes.length} sequential keyframes):`,
        });
        for (const frame of fallbackKeyframes) {
          contentParts.push({
            type: 'text',
            text: frame.label,
          });
          contentParts.push({
            type: 'image',
            image: frame.bytes,
            mediaType: frame.mimeType,
          });
        }
      }

      contentParts.push({
        type: 'text',
        text: [
          'Analyze this reference video thoroughly so it can be stored in our library and reused to generate exact reference-to-video remake prompts with any new model or product.',
          'Provide a crisp, structured visual breakdown with these exact sections:',
          '1. SHOTS & TIMING: Every shot/cut in order with approximate timestamps, framing (wide/medium/close-up), and transitions.',
          '2. CAMERA MOTION: Exact camera movement (handheld walk-back, slow push-in, whip pan, static tripod, orbit, low angle, etc.) and pacing.',
          '3. SUBJECT & POSES: Who is in the video (e.g., young woman / man), exact actions, body language, hand movements, head turns, and any accessories or handheld props (e.g., sunglasses, phone, fan, bag) that should be kept or removed.',
          '4. ORIGINAL GARMENT / PRODUCT TO REPLACE: Exact clothing/product currently shown in the video (colors, graphics, logos) so downstream prompts can forbid leaking it.',
          '5. ENVIRONMENT & BACKGROUND: Setting, surfaces, architecture, clutter, graffiti, vehicles, people in background.',
          '6. LIGHTING & COLOR GRADE: Daylight/overcast/golden hour/studio, shadows, contrast, color tone, depth of field, and whether any on-screen captions/text appear.',
          '',
          'Keep it concise, concrete, and purely factual (160-260 words). Plain text only.',
        ].join('\n'),
      });

      const response = await generateText({
        model: gemini.model,
        system:
          'You are a precision video cinematography analyst for an AI fashion & ecommerce video studio. Write factual, reusable visual analyses of reference videos.',
        messages: [
          {
            role: 'user',
            content: contentParts,
          },
        ],
        maxOutputTokens: 700,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(35_000),
      });

      const analysisText = response.text.trim();
      if (analysisText.length < 40) {
        return null;
      }

      return {
        analysisText,
        modelId: gemini.modelId,
        mode: videoBytesForGemini ? 'VIDEO' : 'KEYFRAMES',
      };
    } catch (error) {
      this.logger.warn(
        `Reference video analysis failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    } finally {
      await fs
        .rm(tempDir, { recursive: true, force: true })
        .catch(() => undefined);
    }
  }

  private parsePromptAndImageAnalyses(
    rawText: string,
    expectedTokens: string[],
  ): { prompt: string; imageAnalyses: Record<string, string> } {
    const cleaned = rawText
      .trim()
      .replace(/^```(?:text|markdown)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    const promptMarkerMatch = cleaned.match(/===\s*PROMPT\s*===/i);
    if (!promptMarkerMatch || promptMarkerMatch.index === undefined) {
      return { prompt: cleaned, imageAnalyses: {} };
    }

    const headerPart = cleaned.slice(0, promptMarkerMatch.index).trim();
    const promptPart = cleaned
      .slice(promptMarkerMatch.index + promptMarkerMatch[0].length)
      .trim();

    const imageAnalyses: Record<string, string> = {};
    const analysisSection = headerPart.replace(
      /^[\s\S]*?===\s*IMAGE_ANALYSIS\s*===/i,
      '',
    );

    const tokenLookup = new Map<string, string>();
    for (const tok of expectedTokens) {
      tokenLookup.set(tok.toLowerCase().replace(/\s+/g, ''), tok);
    }

    for (const rawLine of analysisSection.split('\n')) {
      const line = rawLine.replace(/^\s*[-*•]\s*/, '').trim();
      if (!line) continue;
      const match = line.match(/^(@?image\s*\d+)\s*[:\-–—]\s*(.+)$/i);
      if (!match) continue;
      const normalizedKey = match[1].toLowerCase().replace(/\s+/g, '');
      const canonicalToken =
        tokenLookup.get(normalizedKey) ??
        tokenLookup.get(
          normalizedKey.startsWith('@')
            ? normalizedKey.slice(1)
            : `@${normalizedKey}`,
        );
      const description = match[2].trim();
      if (canonicalToken && description.length >= 12) {
        imageAnalyses[canonicalToken] = description.slice(0, 900);
      }
    }

    return {
      prompt: promptPart || cleaned,
      imageAnalyses,
    };
  }

  async generateVideoPromptFromMedia(params: {
    usesAtMentionTokens: boolean;
    images: StudioPromptImageInput[];
    video: StudioPromptVideoInput;
    productName: string;
    productNotes?: string;
    environmentPrompt?: string;
    brandNotes?: string;
    customNotes?: string;
    overrideApiKey?: string | null;
    preferredModelId?: string | null;
  }): Promise<StudioGeneratedVideoPromptResult> {
    const characterImage =
      params.images.find((img) => img.role === 'CHARACTER_SHEET') ?? null;
    const productImages = params.images.filter((img) => img.role === 'PRODUCT');
    const hasCharacterSheet = Boolean(characterImage);

    const fallbackPrompt = buildStructuredFallbackVideoPrompt({
      usesAtMentionTokens: params.usesAtMentionTokens,
      characterToken: characterImage?.token ?? null,
      productTokens: productImages.map((img) => ({
        token: img.token,
        label: img.label,
      })),
      videoToken: params.video.token,
      productName: params.productName,
      productNotes: params.productNotes,
      environmentPrompt: params.environmentPrompt,
      brandNotes: params.brandNotes,
      customNotes: params.customNotes,
    });

    const gemini = this.pickGeminiModel(
      params.overrideApiKey,
      params.preferredModelId,
    );
    if (!gemini) {
      return {
        prompt: fallbackPrompt,
        source: 'FALLBACK',
        modelId: null,
        summary:
          'No Gemini API key configured yet — add it in AI Studio Settings → Provider API Keys (or GOOGLE_API_KEY env). Using structured default prompt.',
      };
    }

    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'otogrow-studio-prompt-ai-'),
    );
    try {
      const hasCachedVideoAnalysis = Boolean(
        params.video.cachedAnalysis?.trim(),
      );
      let videoBytesForGemini: Buffer | null = null;
      let videoMimeForGemini = 'video/mp4';
      let fallbackKeyframes: Array<{
        label: string;
        bytes: Buffer;
        mimeType: 'image/jpeg';
      }> = [];

      // Only touch the raw video file if no cached video analysis was supplied
      if (!hasCachedVideoAnalysis) {
        const rawExt =
          params.video.mimeType === 'video/quicktime'
            ? 'mov'
            : params.video.mimeType === 'video/webm'
              ? 'webm'
              : 'mp4';
        let rawVideoPath = params.video.filePath ?? '';
        if (!rawVideoPath && params.video.bytes && params.video.bytes.length > 0) {
          rawVideoPath = path.join(tempDir, `ref.${rawExt}`);
          await fs.writeFile(rawVideoPath, params.video.bytes);
        }

        if (rawVideoPath) {
          const proxyPath = path.join(tempDir, 'proxy.mp4');
          try {
            videoBytesForGemini =
              await this.renderAdapter.prepareLightweightAnalysisProxy(
                rawVideoPath,
                proxyPath,
                {
                  includeAudio: false,
                  maxDurationSec: 25,
                  maxDimension: 360,
                  fps: 8,
                  maxBytes: MAX_VIDEO_PROXY_BYTES,
                  timeoutMs: 25_000,
                },
              );
          } catch (proxyError) {
            this.logger.warn(
              `Video proxy transcode failed; checking lightweight fallback: ${proxyError instanceof Error ? proxyError.message : String(proxyError)}`,
            );
            const rawStat = await fs.stat(rawVideoPath).catch(() => null);
            if (
              rawStat &&
              rawStat.size > 0 &&
              rawStat.size <= MAX_DIRECT_VIDEO_FALLBACK_BYTES
            ) {
              videoBytesForGemini = await fs.readFile(rawVideoPath);
              videoMimeForGemini = params.video.mimeType || 'video/mp4';
            } else {
              try {
                const keyframesDir = path.join(tempDir, 'keyframes');
                await fs.mkdir(keyframesDir, { recursive: true });
                fallbackKeyframes =
                  await this.renderAdapter.extractAnalysisKeyframes(
                    rawVideoPath,
                    keyframesDir,
                    {
                      maxFrames: 6,
                      durationSec: params.video.durationSec,
                    },
                  );
              } catch (keyframeError) {
                this.logger.warn(
                  `Keyframe extraction fallback also failed: ${keyframeError instanceof Error ? keyframeError.message : String(keyframeError)}`,
                );
              }
            }
          }
        }
      }

      const contentParts: Array<
        | { type: 'text'; text: string }
        | { type: 'image'; image: Buffer; mediaType?: string }
        | { type: 'file'; data: Buffer; mediaType: string }
      > = [];

      let inlineBytesBudget = MAX_TOTAL_INLINE_BYTES;
      if (videoBytesForGemini) {
        inlineBytesBudget = Math.max(
          1024 * 1024,
          inlineBytesBudget - videoBytesForGemini.length,
        );
      }

      const unanalyzedImageTokens: string[] = [];
      let cachedImagesCount = 0;

      // Attach bytes ONLY for unanalyzed images; pass saved visual descriptions for already-analyzed ones
      for (const img of params.images) {
        if (img.cachedAnalysis?.trim()) {
          cachedImagesCount += 1;
          contentParts.push({
            type: 'text',
            text: `Reference ${img.token} (Role: ${img.role}, Label: "${img.label}" — SAVED VISUAL ANALYSIS): ${img.cachedAnalysis.trim()}`,
          });
          continue;
        }
        if (!img.bytes || img.bytes.length === 0) {
          continue;
        }
        const compacted = await compactImageForGemini(img.bytes, img.mimeType);
        if (
          compacted.bytes.length > MAX_INLINE_IMAGE_BYTES ||
          compacted.bytes.length > inlineBytesBudget
        ) {
          continue;
        }
        inlineBytesBudget -= compacted.bytes.length;
        unanalyzedImageTokens.push(img.token);
        contentParts.push({
          type: 'text',
          text: `Reference ${img.token} (Role: ${img.role}, Label: "${img.label}" — INSPECT CAREFULLY: identify exact view/angle such as front/back/side/3-quarter/close-up/grid, garment color, fabric, fit, every graphic/logo/text & exact placement, or blank/plain back):`,
        });
        contentParts.push({
          type: 'image',
          image: compacted.bytes,
          mediaType: compacted.mimeType,
        });
      }

      if (hasCachedVideoAnalysis) {
        contentParts.push({
          type: 'text',
          text: [
            `Reference ${params.video.token} (Role: REFERENCE_VIDEO, Title: "${params.video.label}", Duration: ${params.video.durationSec ? `${params.video.durationSec.toFixed(1)}s` : 'unknown'} — SAVED VIDEO ANALYSIS):`,
            params.video.cachedAnalysis!.trim(),
          ].join('\n'),
        });
      } else if (videoBytesForGemini) {
        contentParts.push({
          type: 'text',
          text: `Reference ${params.video.token} (Role: REFERENCE_VIDEO, Title: "${params.video.label}", Duration: ${params.video.durationSec ? `${params.video.durationSec.toFixed(1)}s` : 'unknown'}):`,
        });
        contentParts.push({
          type: 'file',
          data: videoBytesForGemini,
          mediaType: videoMimeForGemini,
        });
      } else if (fallbackKeyframes.length > 0) {
        contentParts.push({
          type: 'text',
          text: `Reference ${params.video.token} (Role: REFERENCE_VIDEO, Title: "${params.video.label}", Duration: ${params.video.durationSec ? `${params.video.durationSec.toFixed(1)}s` : 'unknown'} — sampled sequentially as ${fallbackKeyframes.length} keyframes):`,
        });
        for (const frame of fallbackKeyframes) {
          if (frame.bytes.length > inlineBytesBudget) break;
          inlineBytesBudget -= frame.bytes.length;
          contentParts.push({
            type: 'text',
            text: `${params.video.token} ${frame.label}:`,
          });
          contentParts.push({
            type: 'image',
            image: frame.bytes,
            mediaType: frame.mimeType,
          });
        }
      }

      const tokenMappingSummary = [
        ...params.images.map(
          (img) => `- ${img.token}: ${img.role} (${img.label})`,
        ),
        `- ${params.video.token}: REFERENCE_VIDEO (${params.video.label})`,
      ].join('\n');

      const requestImageBreakdown = unanalyzedImageTokens.length > 0;

      contentParts.push({
        type: 'text',
        text: [
          hasCachedVideoAnalysis
            ? 'Step 1: Read the SAVED VIDEO ANALYSIS carefully to understand every shot, cut, timing, camera move, lighting, setting, subject, and original garment in the reference video.'
            : 'Step 1: Watch the ENTIRE reference video carefully to understand its shots, cuts, timing, camera motion, lighting, setting, subject, and the original product/garment being shown.',
          requestImageBreakdown
            ? `Step 2: Deeply inspect EVERY newly attached image (${unanalyzedImageTokens.join(', ')}). Determine each image's EXACT angle/view (front view, back view, left/right side view, 3/4 view, flat-lay, close-up detail, or multi-angle character sheet), exact base color & fabric texture, silhouette/fit, and every graphic, print, embroidery, or text (exact wording if readable, exact position, scale, ink colors, or explicitly note if a side/back is plain and blank). Also honor any SAVED VISUAL ANALYSIS entries.`
            : 'Step 2: Use the SAVED VISUAL ANALYSIS for each input image so exact colors, view angles (front/back/side), textures, logos, print placement, fit, and styling are locked accurately.',
          'Step 3: Write ONE final, copy-ready reference-to-video prompt.',
          '',
          `Mode: ${hasCharacterSheet ? 'CHARACTER_SHEET_PLUS_PRODUCT_SWAP' : 'DIRECT_PRODUCT_SWAP_NO_CHARACTER_SHEET'}`,
          '',
          'EXACT TOKEN MAPPING (YOU MUST USE THESE EXACT TOKENS — DO NOT SWAP NUMBERS):',
          tokenMappingSummary,
          '',
          `Product Name: ${params.productName}`,
          params.productNotes?.trim()
            ? `Product Notes: ${params.productNotes.trim()}`
            : '',
          params.environmentPrompt?.trim()
            ? `Target Environment / Setting: ${params.environmentPrompt.trim()}`
            : hasCharacterSheet
              ? 'Target Environment / Setting: Match the environment shown in the Character Sheet image.'
              : 'Target Environment / Setting: Keep the exact environment and lighting shown in the reference video.',
          params.brandNotes?.trim()
            ? `Brand Notes: ${params.brandNotes.trim()}`
            : '',
          params.customNotes?.trim()
            ? `Extra User Direction: ${params.customNotes.trim()}`
            : '',
          '',
          requestImageBreakdown
            ? [
                'OUTPUT FORMAT (follow these exact delimiters, plain text only, no markdown code fences):',
                '===IMAGE_ANALYSIS===',
                ...unanalyzedImageTokens.map(
                  (tok) =>
                    `${tok}: [View/Angle e.g. Front view / Back view / Side profile / Detail close-up / Multi-angle Character Sheet] — concise 1-2 sentence factual description of colors, fabric, fit, graphics/logos/placement, and any model/outfit/environment details visible.`,
                ),
                '===PROMPT===',
                '<final prompt paragraphs with blank lines between paragraphs, no markdown headings, no bullets, no quotes>',
              ].join('\n')
            : 'Write ONLY the final prompt paragraphs (plain text, no markdown headings, no bullet points, no quotes, no preamble).',
        ]
          .filter(Boolean)
          .join('\n'),
      });

      const systemPrompt = hasCharacterSheet
        ? [
            'You are an elite AI video director writing reference-to-video prompts (Seedance 2.5 / MAGI-2 / Wan 3.0) for fashion & streetwear brands.',
            'Inspect every detail of the product images (recognizing front view, back view, side view, and close-up details accurately regardless of filename), character sheet image, and the reference video analysis, and output an ultra-precise prompt following this EXACT 7-paragraph blueprint:',
            '',
            'Paragraph 1 — Asset Role Declarations:',
            'State clearly what each @imageN (or Image N) shows using the EXACT tokens provided AND the true visual view you observed (e.g., front view, back view, side profile, detail close-up, character sheet). Explicitly state if no back print exists ("This garment has no back print; the back is plain and blank.") OR describe both front and back accurately if a back view is provided. Declare @video1 as the reference video.',
            '',
            'Paragraph 2 — Exact Video Recreation:',
            'Open with: "Recreate [video token] exactly: the same shots, the same cuts and timing, the same camera moves, the same transitions and the same poses." Briefly reinforce key camera motion / pacing observed in the video.',
            '',
            'Paragraph 3 — Subject Replacement & Prop Rules:',
            'Explicitly state who is currently in the reference video (e.g., "Replace the woman in [video token] with the man from [character token]. Match his face, hair and build exactly."). Note accessories to keep (e.g., sunglasses if worn in the video or character sheet) and unwanted props from the reference video to remove.',
            '',
            'Paragraph 4 — Exact Outfit & Graphic Placement Lock:',
            'List the EXACT full outfit visible on the Character Sheet (top fit/untucked/boxy, bottoms/shorts/pants, socks, sneakers/shoes). Then describe the EXACT garment color, fabric, and print/graphic layout observed across the front/back/side product image(s) — exact placement (off-center vs centered, chest vs back vs sleeve), scale, and ink colors. End with: "Do not center it, shrink it or mirror it, and do not redraw, move or resize the design."',
            '',
            'Paragraph 5 — Environment Swap:',
            'Explicitly state what environment is currently in the reference video and change it to the target environment with concrete visual details (textures, architecture, surfaces) and explicit exclusions of elements from the reference video background.',
            '',
            'Paragraph 6 — Color Tone, Lighting & True Garment Color:',
            'Specify the exact lighting and color tone matching the Character Sheet / target environment and explicitly state that the garment keeps its true colors and print vibrancy, and the background stays sharp.',
            '',
            'Paragraph 7 — Strict Anti-Leakage Closing:',
            'Explicitly forbid captions/on-screen text in any frame, forbid showing the original clothing design or original person from the reference video, and close by reiterating: remake the exact same reference video with the inputted model, garment, environment, and color tone while keeping everything else (edit, shots, timing, poses) identical.',
            '',
            'Rules:',
            '- Keep the final prompt focused and crisp (around 220–360 words).',
            '- NEVER invent print details that are not visible in the product images.',
            '- NEVER swap the token numbers provided in the EXACT TOKEN MAPPING.',
          ].join('\n')
        : [
            'You are an elite AI video director writing direct product-swap reference-to-video prompts (Seedance 2.5 / MAGI-2 / Wan 3.0) when NO separate Character Sheet is provided.',
            'Use the reference video analysis to understand every shot (subject, action, camera movement, cuts, timing, setting, and original product), inspect the product image(s) (accurately identifying front view, back view, side view, or close-up detail regardless of filename), and write ONE crisp, copy-ready prompt following this blueprint:',
            '',
            'Paragraph 1 — Asset Role Declarations:',
            'Declare what each provided @imageN (or Image N) is using the EXACT tokens provided AND the true visual angle observed (front view, back view, side profile, close-up detail). NEVER mention a Character Sheet. Explicitly state if no back print exists ("This garment has no back print; the back is plain and blank.") OR describe both front and back if shown. Declare @video1 as the reference video.',
            '',
            'Paragraph 2 — Exact Video Recreation:',
            'Open with: "Recreate [video token] exactly: the same shots, the same cuts and timing, the same camera moves, the same transitions and the same poses." Briefly describe the key action/camera pacing observed in [video token].',
            '',
            'Paragraph 3 — Subject & Direct Product Replacement:',
            'Describe what is currently worn or featured in [video token] and instruct the model to keep the person/hands/motion/framing from [video token] while completely replacing the original garment/product with the exact product shown in the product image token(s). Remove any distracting props or unrelated branding from [video token] if needed.',
            '',
            'Paragraph 4 — Exact Product & Graphic Placement Lock:',
            'Describe the EXACT product color, fabric/material, fit/drape, neckline/silhouette, and print/logo layout observed across front/back/side image(s) — exact placement (centered vs off-center, chest vs back vs sleeve, scale, ink colors). End with: "Do not center it, shrink it or mirror it, and do not redraw, move or resize the design."',
            '',
            'Paragraph 5 — Environment & Lighting Continuity:',
            'If a Target Environment override was given, swap the setting in [video token] to that exact environment with concrete textures/lighting. Otherwise, explicitly keep the exact environment, background details, lighting direction, and color grade from [video token] while keeping the product in its true colors and the background sharp.',
            '',
            'Paragraph 6 — Strict Anti-Leakage Closing:',
            'Explicitly forbid captions or on-screen text in any frame, forbid any trace of the original garment design or logos from [video token], and close by reiterating: remake [video token] identically while seamlessly featuring the exact inputted product.',
            '',
            'Rules:',
            '- Keep the final prompt focused and crisp (around 180–320 words).',
            '- NEVER mention a Character Sheet since none was provided.',
            '- NEVER invent print/logo details that are not visible in the input images.',
            '- NEVER swap the token numbers provided in the EXACT TOKEN MAPPING.',
          ].join('\n');

      const response = await generateText({
        model: gemini.model,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: contentParts,
          },
        ],
        maxOutputTokens: requestImageBreakdown ? 1600 : 1200,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(35_000),
      });

      const parsed = requestImageBreakdown
        ? this.parsePromptAndImageAnalyses(response.text, unanalyzedImageTokens)
        : { prompt: response.text.trim(), imageAnalyses: {} };

      if (parsed.prompt.length >= 60) {
        const videoNote = hasCachedVideoAnalysis
          ? 'saved video analysis'
          : videoBytesForGemini
            ? 'reference video'
            : fallbackKeyframes.length > 0
              ? `${fallbackKeyframes.length} video keyframes`
              : 'reference metadata';
        const imgNote =
          unanalyzedImageTokens.length > 0
            ? `${unanalyzedImageTokens.length} new image${unanalyzedImageTokens.length === 1 ? '' : 's'}${cachedImagesCount > 0 ? ` + ${cachedImagesCount} cached` : ''}`
            : cachedImagesCount > 0
              ? `${cachedImagesCount} cached image${cachedImagesCount === 1 ? '' : 's'}`
              : 'no images';

        return {
          prompt: parsed.prompt,
          source: 'GEMINI',
          modelId: gemini.modelId,
          summary: `Built with ${gemini.modelId} (${imgNote}, ${videoNote}).`,
          newImageAnalyses: parsed.imageAnalyses,
          videoAnalysisUsedCache: hasCachedVideoAnalysis,
          newlyAnalyzedImagesCount: unanalyzedImageTokens.length,
          cachedImagesCount,
        };
      }

      return {
        prompt: fallbackPrompt,
        source: 'FALLBACK',
        modelId: gemini.modelId,
        summary:
          'Gemini returned an empty prompt; used the default structured recreation prompt.',
        videoAnalysisUsedCache: hasCachedVideoAnalysis,
        newlyAnalyzedImagesCount: 0,
        cachedImagesCount,
      };
    } catch (error) {
      this.logger.warn(
        `Gemini studio prompt analysis failed; falling back to default template: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        prompt: fallbackPrompt,
        source: 'FALLBACK',
        modelId: gemini.modelId,
        summary: `Gemini analysis unavailable (${error instanceof Error ? error.message.slice(0, 120) : 'error'}); used the default structured prompt.`,
      };
    } finally {
      await fs
        .rm(tempDir, { recursive: true, force: true })
        .catch(() => undefined);
    }
  }

  async refineVideoPrompt(params: {
    currentPrompt: string;
    editInstruction: string;
    usesAtMentionTokens: boolean;
    overrideApiKey?: string | null;
    preferredModelId?: string | null;
  }): Promise<StudioRefinedVideoPromptResult> {
    const gemini = this.pickGeminiModel(
      params.overrideApiKey,
      params.preferredModelId,
    );
    if (!gemini) {
      return {
        prompt: params.currentPrompt,
        source: 'FALLBACK',
        modelId: null,
        summary:
          'No Gemini API key configured yet — add it in AI Studio Settings to use AI prompt editing.',
      };
    }

    try {
      const response = await generateText({
        model: gemini.model,
        system: [
          'You are an expert AI video prompt editor for fashion & ecommerce reference-to-video models (Seedance 2.5 / MAGI-2 / Wan 3.0).',
          'Apply the user edit instruction cleanly to the existing prompt.',
          'Rules:',
          `- Keep ALL existing asset reference tokens (${params.usesAtMentionTokens ? '@image1, @image2, @video1' : 'Image 1, Image 2, Video 1'}) intact and accurately mapped.`,
          '- Preserve the clean multi-paragraph structure, graphic placement lock, and anti-leakage rules unless the user explicitly asks to change them.',
          '- Only modify the aspects requested by the user.',
          '- Output ONLY the updated plain-text prompt (no markdown headings, no preamble, no quotes, no code fences).',
        ].join('\n'),
        prompt: [
          'CURRENT PROMPT:',
          params.currentPrompt.trim(),
          '',
          'REQUESTED EDIT:',
          params.editInstruction.trim(),
          '',
          'Return the updated prompt:',
        ].join('\n'),
        maxOutputTokens: 1200,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(25_000),
      });

      const updated = response.text
        .trim()
        .replace(/^```(?:text|markdown)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();

      if (updated.length >= 40) {
        return {
          prompt: updated,
          source: 'GEMINI',
          modelId: gemini.modelId,
          summary: `Prompt updated with ${gemini.modelId}.`,
        };
      }

      return {
        prompt: params.currentPrompt,
        source: 'FALLBACK',
        modelId: gemini.modelId,
        summary: 'Gemini returned an empty edit; kept the current prompt.',
      };
    } catch (error) {
      this.logger.warn(
        `Gemini prompt refinement failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        prompt: params.currentPrompt,
        source: 'FALLBACK',
        modelId: gemini.modelId,
        summary: `Prompt edit failed (${error instanceof Error ? error.message.slice(0, 120) : 'error'}).`,
      };
    }
  }
}
