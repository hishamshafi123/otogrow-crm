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
const IMAGE_DOWNSCALE_THRESHOLD_BYTES = 600 * 1024;
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
        width: 1024,
        height: 1024,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 82 })
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
  bytes: Buffer;
};

export type StudioPromptVideoInput = {
  token: string;
  label: string;
  mimeType: string;
  durationSec?: number | null;
  filePath?: string;
  bytes?: Buffer;
};

export type StudioGeneratedVideoPromptResult = {
  prompt: string;
  source: 'GEMINI' | 'FALLBACK';
  modelId: string | null;
  summary: string;
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

  constructor(
    private readonly modelRegistry: AiModelRegistryService,
    private readonly renderAdapter: DeliveryHookRenderAdapter,
    @Optional() private readonly twentyConfig?: TwentyConfigService,
  ) {}

  private pickGeminiModel(overrideApiKey?: string | null): {
    model: RegisteredAiModel['model'];
    modelId: string;
    source: 'STUDIO_KEY' | 'ADMIN_CONFIG' | 'ENV';
  } | null {
    const cleanOverride = overrideApiKey?.trim();
    if (cleanOverride) {
      const google = createGoogleGenerativeAI({ apiKey: cleanOverride });
      const modelId = 'gemini-2.5-flash';
      return { model: google(modelId), modelId, source: 'STUDIO_KEY' };
    }

    try {
      const models = this.modelRegistry.getAdminFilteredModels();
      const googleModels = models.filter(
        (m) => m.sdkPackage === '@ai-sdk/google',
      );
      if (googleModels.length > 0) {
        const picked =
          googleModels.find((m) => /gemini-2\.5-flash/i.test(m.modelId)) ??
          googleModels.find((m) => /gemini-2\.0-flash/i.test(m.modelId)) ??
          googleModels.find((m) => /gemini-2\.5-pro/i.test(m.modelId)) ??
          googleModels.find((m) => /flash|pro/i.test(m.modelId)) ??
          googleModels[0];
        if (picked) {
          return {
            model: picked.model,
            modelId: picked.modelId,
            source: 'ADMIN_CONFIG',
          };
        }
      }
    } catch {
      // Fall through to direct API key check
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
      const google = createGoogleGenerativeAI({ apiKey: configGoogleKey });
      const modelId = 'gemini-2.5-flash';
      return { model: google(modelId), modelId, source: 'ADMIN_CONFIG' };
    }

    const envKey =
      process.env.GOOGLE_API_KEY?.trim() ||
      process.env.GEMINI_API_KEY?.trim() ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
    if (envKey) {
      const google = createGoogleGenerativeAI({ apiKey: envKey });
      const modelId = 'gemini-2.5-flash';
      return { model: google(modelId), modelId, source: 'ENV' };
    }

    return null;
  }

  getGeminiStatus(overrideApiKey?: string | null): StudioGeminiStatus {
    const picked = this.pickGeminiModel(overrideApiKey);
    if (!picked) {
      return { configured: false, modelId: null, source: null };
    }
    return {
      configured: true,
      modelId: picked.modelId,
      source: picked.source,
    };
  }

  async testGeminiApiKey(
    apiKey: string,
  ): Promise<{ ok: boolean; message: string }> {
    const clean = apiKey.trim();
    if (!clean) {
      return { ok: false, message: 'Enter a Google Gemini API key first.' };
    }
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
        message: `Connected to Google Gemini API (${count > 0 ? 'gemini-2.5-flash ready' : 'verified'}).`,
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

    const gemini = this.pickGeminiModel(params.overrideApiKey);
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
      // Use streamed source filePath directly when provided (avoids buffering huge videos in RAM)
      const rawExt =
        params.video.mimeType === 'video/quicktime'
          ? 'mov'
          : params.video.mimeType === 'video/webm'
            ? 'webm'
            : 'mp4';
      let rawVideoPath = params.video.filePath ?? '';
      if (!rawVideoPath) {
        if (!params.video.bytes || params.video.bytes.length === 0) {
          throw new Error('Reference video bytes were unavailable for analysis.');
        }
        rawVideoPath = path.join(tempDir, `ref.${rawExt}`);
        await fs.writeFile(rawVideoPath, params.video.bytes);
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

      // Attach every reference image (downscaled when large) with its exact token label
      for (const img of params.images) {
        const compacted = await compactImageForGemini(img.bytes, img.mimeType);
        if (
          compacted.bytes.length > MAX_INLINE_IMAGE_BYTES ||
          compacted.bytes.length > inlineBytesBudget
        ) {
          continue;
        }
        inlineBytesBudget -= compacted.bytes.length;
        contentParts.push({
          type: 'text',
          text: `Reference ${img.token} (Role: ${img.role}, Label: "${img.label}"):`,
        });
        contentParts.push({
          type: 'image',
          image: compacted.bytes,
          mediaType: compacted.mimeType,
        });
      }

      if (videoBytesForGemini) {
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

      contentParts.push({
        type: 'text',
        text: [
          'Step 1: Watch the ENTIRE reference video carefully to understand its shots, cuts, timing, camera motion, lighting, setting, subject, and the original product/garment being shown.',
          'Step 2: Inspect EVERY attached input image carefully to understand exact colors, textures, logos, print placement, fit, and styling.',
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
          'Write ONLY the final prompt paragraphs (plain text, no markdown headings, no bullet points, no quotes, no preamble).',
        ]
          .filter(Boolean)
          .join('\n'),
      });

      const systemPrompt = hasCharacterSheet
        ? [
            'You are an elite AI video director writing reference-to-video prompts (Seedance 2.5 / MAGI-2 / Wan 3.0) for fashion & streetwear brands.',
            'You MUST inspect every detail of the attached product images, character sheet image, and the entire reference video, and output a single ultra-precise prompt following this EXACT 7-paragraph blueprint:',
            '',
            'Paragraph 1 — Asset Role Declarations:',
            'State clearly what each @imageN (or Image N) is using the EXACT tokens provided. Explicitly state if the product only has a front print (e.g., "This garment has no back print; the back is plain and blank.") OR describe both front and back if a back image is provided. Declare @video1 as the reference video.',
            '',
            'Paragraph 2 — Exact Video Recreation:',
            'Open with: "Recreate [video token] exactly: the same shots, the same cuts and timing, the same camera moves, the same transitions and the same poses." Briefly reinforce key camera motion / pacing observed in the video.',
            '',
            'Paragraph 3 — Subject Replacement & Prop Rules:',
            'Explicitly state who is currently in the reference video (e.g., "Replace the woman in [video token] with the man from [character token]. Match his face, hair and build exactly."). Note accessories to keep (e.g., sunglasses if worn in the video or character sheet) and unwanted props from the reference video to remove (e.g., "No fan." / remove distracting handheld props that do not belong).',
            '',
            'Paragraph 4 — Exact Outfit & Graphic Placement Lock:',
            'List the EXACT full outfit visible on the Character Sheet (top fit/untucked/boxy, bottoms/shorts/pants, socks, sneakers/shoes). Then describe the EXACT garment color and print/graphic layout you see in the product image(s) — e.g. off-center vs centered, chest text vs back graphic, bleeding off side seam or bottom hem, exact ink colors. End with: "Do not center it, shrink it or mirror it, and do not redraw, move or resize the design."',
            '',
            'Paragraph 5 — Environment Swap:',
            'Explicitly state what environment is currently in the reference video and change it to the target environment with concrete visual details (textures, architecture, surfaces) and explicit exclusions of elements from the reference video background (e.g., "No graffiti, no color on the walls...").',
            '',
            'Paragraph 6 — Color Tone, Lighting & True Garment Color:',
            'Specify the exact lighting and color tone matching the Character Sheet / target environment (e.g., overcast/moody/cinematic/clean daylight, film grain, contrast) and explicitly state that the garment keeps its true colors and print vibrancy, and the background stays sharp.',
            '',
            'Paragraph 7 — Strict Anti-Leakage Closing:',
            'Explicitly forbid captions/on-screen text in any frame, forbid showing the original clothing design or original person from the reference video, and close by reiterating: remake the exact same reference video with the inputted model, garment, environment, and color tone while keeping everything else (edit, shots, timing, poses) identical.',
            '',
            'Rules:',
            '- Keep total length focused and crisp (around 220–360 words).',
            '- NEVER invent print details that are not visible in the product images.',
            '- NEVER swap the token numbers provided in the EXACT TOKEN MAPPING.',
            '- Output ONLY the prompt text, with blank lines between paragraphs.',
          ].join('\n')
        : [
            'You are an elite AI video director writing direct product-swap reference-to-video prompts (Seedance 2.5 / MAGI-2 / Wan 3.0) when NO separate Character Sheet is provided.',
            'You MUST watch the entire reference video first to understand what happens in every shot (subject, action, camera movement, cuts, timing, setting, and what product/garment is currently featured), then inspect the attached product image(s), and write ONE crisp, copy-ready prompt following this blueprint:',
            '',
            'Paragraph 1 — Asset Role Declarations:',
            'Declare what each provided @imageN (or Image N) is using the EXACT tokens provided (e.g., front flatlay, back view, close-up detail, product photo). NEVER mention a Character Sheet. Explicitly state if no back print exists ("This garment has no back print; the back is plain and blank.") OR describe both front and back if shown. Declare @video1 as the reference video.',
            '',
            'Paragraph 2 — Exact Video Recreation:',
            'Open with: "Recreate [video token] exactly: the same shots, the same cuts and timing, the same camera moves, the same transitions and the same poses." Briefly describe the key action/camera pacing observed in [video token].',
            '',
            'Paragraph 3 — Subject & Direct Product Replacement:',
            'Describe what is currently worn or featured in [video token] and instruct the model to keep the person/hands/motion/framing from [video token] while completely replacing the original garment/product with the exact product shown in the product image token(s). Remove any distracting props or unrelated branding from [video token] if needed.',
            '',
            'Paragraph 4 — Exact Product & Graphic Placement Lock:',
            'Describe the EXACT product color, fabric/material, fit/drape, neckline/silhouette, and print/logo layout you visually observe in the input image(s) — exact placement (centered vs off-center, chest vs back, scale, ink colors). End with: "Do not center it, shrink it or mirror it, and do not redraw, move or resize the design."',
            '',
            'Paragraph 5 — Environment & Lighting Continuity:',
            'If a Target Environment override was given, swap the setting in [video token] to that exact environment with concrete textures/lighting. Otherwise, explicitly keep the exact environment, background details, lighting direction, and color grade from [video token] while keeping the product in its true colors and the background sharp.',
            '',
            'Paragraph 6 — Strict Anti-Leakage Closing:',
            'Explicitly forbid captions or on-screen text in any frame, forbid any trace of the original garment design or logos from [video token], and close by reiterating: remake [video token] identically while seamlessly featuring the exact inputted product.',
            '',
            'Rules:',
            '- Keep total length focused and crisp (around 180–320 words).',
            '- NEVER mention a Character Sheet since none was provided.',
            '- NEVER invent print/logo details that are not visible in the input images.',
            '- NEVER swap the token numbers provided in the EXACT TOKEN MAPPING.',
            '- Output ONLY the prompt text, with blank lines between paragraphs.',
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
        maxOutputTokens: 1200,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(35_000),
      });

      const generated = response.text.trim();
      if (generated.length >= 60) {
        return {
          prompt: generated,
          source: 'GEMINI',
          modelId: gemini.modelId,
          summary: `Analyzed ${params.images.length} image${params.images.length === 1 ? '' : 's'} + ${videoBytesForGemini ? 'reference video' : fallbackKeyframes.length > 0 ? `${fallbackKeyframes.length} video keyframes` : 'reference metadata'} with ${gemini.modelId}.`,
        };
      }

      return {
        prompt: fallbackPrompt,
        source: 'FALLBACK',
        modelId: gemini.modelId,
        summary: 'Gemini returned an empty prompt; used the default structured recreation prompt.',
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
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
