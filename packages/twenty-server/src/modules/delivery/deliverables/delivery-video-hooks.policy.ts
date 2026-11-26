import { z } from 'zod';
import { type HookStyleConfig } from 'src/modules/delivery/deliverables/entities/delivery-video-hook-project.entity';

export const DEFAULT_HOOK_STYLE: HookStyleConfig = {
  preset: 'TIKTOK_PILL',
  fontFamily: 'Inter, Noto Sans, DejaVu Sans, sans-serif',
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

export const HOOK_STYLE_PRESETS: Record<
  HookStyleConfig['preset'],
  Partial<HookStyleConfig>
> = {
  TIKTOK_PILL: {
    preset: 'TIKTOK_PILL',
    textColor: '#111111',
    backgroundColor: '#FFFFFF',
    backgroundOpacity: 0.96,
    backgroundRadiusPx: 22,
    paddingXPx: 28,
    paddingYPx: 16,
    strokeWidthPx: 0,
    shadowEnabled: true,
    fontWeight: 800,
    uppercase: false,
  },
  IG_SHADOW: {
    preset: 'IG_SHADOW',
    textColor: '#FFFFFF',
    backgroundColor: '#000000',
    backgroundOpacity: 0,
    backgroundRadiusPx: 0,
    paddingXPx: 16,
    paddingYPx: 8,
    strokeColor: '#000000',
    strokeWidthPx: 4,
    shadowEnabled: true,
    fontWeight: 800,
    uppercase: false,
  },
  AD_BOX: {
    preset: 'AD_BOX',
    textColor: '#FFFFFF',
    backgroundColor: '#0F172A',
    backgroundOpacity: 0.88,
    backgroundRadiusPx: 14,
    paddingXPx: 30,
    paddingYPx: 18,
    strokeWidthPx: 0,
    shadowEnabled: true,
    fontWeight: 800,
    uppercase: true,
  },
  EDITORIAL: {
    preset: 'EDITORIAL',
    textColor: '#F8FAFC',
    backgroundColor: '#111827',
    backgroundOpacity: 0.62,
    backgroundRadiusPx: 8,
    paddingXPx: 24,
    paddingYPx: 14,
    strokeWidthPx: 0,
    shadowEnabled: false,
    fontWeight: 600,
    uppercase: false,
  },
  BRAND_KIT: {
    preset: 'BRAND_KIT',
    textColor: '#FFFFFF',
    backgroundColor: '#6D28D9',
    backgroundOpacity: 0.94,
    backgroundRadiusPx: 18,
    paddingXPx: 28,
    paddingYPx: 16,
    strokeWidthPx: 0,
    shadowEnabled: true,
    fontWeight: 800,
    uppercase: false,
  },
};

export const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const hookStyleConfigSchema = z
  .object({
    preset: z
      .enum(['TIKTOK_PILL', 'IG_SHADOW', 'AD_BOX', 'EDITORIAL', 'BRAND_KIT'])
      .optional(),
    fontFamily: z.string().trim().min(1).max(120).optional(),
    fontSizePct: z.number().min(2).max(12).optional(),
    fontWeight: z.number().int().min(400).max(900).optional(),
    lineHeight: z.number().min(0.9).max(2.0).optional(),
    textAlign: z.enum(['left', 'center', 'right']).optional(),
    uppercase: z.boolean().optional(),
    textColor: z.string().regex(HEX_COLOR_REGEX).optional(),
    backgroundColor: z.string().regex(HEX_COLOR_REGEX).optional(),
    backgroundOpacity: z.number().min(0).max(1).optional(),
    backgroundRadiusPx: z.number().min(0).max(60).optional(),
    paddingXPx: z.number().min(0).max(80).optional(),
    paddingYPx: z.number().min(0).max(60).optional(),
    strokeColor: z.string().regex(HEX_COLOR_REGEX).optional(),
    strokeWidthPx: z.number().min(0).max(12).optional(),
    shadowEnabled: z.boolean().optional(),
    xPct: z.number().min(5).max(95).optional(),
    yPct: z.number().min(5).max(95).optional(),
    maxWidthPct: z.number().min(30).max(95).optional(),
    fadeInSec: z.number().min(0).max(2).optional(),
    fadeOutSec: z.number().min(0).max(2).optional(),
    safeZoneGuide: z
      .enum(['NONE', 'TIKTOK', 'INSTAGRAM_REELS', 'META_ADS', 'SHORTS'])
      .optional(),
  })
  .strict();

export const creativeHookInputSchema = z
  .object({
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
    variationCount: z.number().int().min(3).max(12).optional(),
  })
  .strict();

export const analyzeHookContextSchema = z
  .object({
    deliverableId: z.uuid(),
    websiteUrl: z.string().trim().max(400).nullable().optional(),
    refreshWebsite: z.boolean().optional(),
    refreshVideo: z.boolean().optional(),
  })
  .strict();

export const generateHookSuggestionsSchema = z
  .object({
    deliverableId: z.uuid(),
    websiteUrl: z.string().trim().max(400).nullable().optional(),
    creativeInput: creativeHookInputSchema.optional(),
  })
  .strict();

export const hookVariationInputSchema = z
  .object({
    id: z.uuid().optional(),
    variationNumber: z.number().int().min(1).max(20),
    hookText: z.string().trim().min(1).max(240),
    angleTag: z.string().trim().max(80).optional(),
    rationale: z.string().trim().max(400).optional(),
    startSec: z.number().min(0).max(3600),
    endSec: z.number().min(0.2).max(3600),
    styleOverride: hookStyleConfigSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => value.endSec > value.startSec + 0.15, {
    message: 'Hook end time must be at least 0.15s after start time.',
  });

export const saveHookProjectSchema = z
  .object({
    deliverableId: z.uuid(),
    websiteUrl: z.string().trim().max(400).nullable().optional(),
    creativeInput: creativeHookInputSchema.optional(),
    defaultStyleConfig: hookStyleConfigSchema.optional(),
    variations: z.array(hookVariationInputSchema).max(15),
  })
  .strict();

export const queueHookRenderSchema = z
  .object({
    deliverableId: z.uuid(),
    variationIds: z.array(z.uuid()).max(15).optional(),
  })
  .strict();

export const publishHookVariationsSchema = z
  .object({
    deliverableId: z.uuid(),
    variationIds: z.array(z.uuid()).max(15).optional(),
    publishDeliverable: z.boolean().optional(),
  })
  .strict();

export const resolveEffectiveHookStyle = (
  defaultStyle?: Partial<HookStyleConfig> | null,
  override?: Partial<HookStyleConfig> | null,
): HookStyleConfig => ({
  ...DEFAULT_HOOK_STYLE,
  ...(defaultStyle ?? {}),
  ...(override ?? {}),
});

export const computeSafeFadeTimings = (params: {
  startSec: number;
  endSec: number;
  fadeInSec: number;
  fadeOutSec: number;
  videoDurationSec?: number;
}) => {
  const maxDuration =
    params.videoDurationSec && params.videoDurationSec > 0
      ? params.videoDurationSec
      : 3600;
  const start = Math.max(0, Math.min(params.startSec, Math.max(0, maxDuration - 0.2)));
  const end = Math.max(start + 0.2, Math.min(params.endSec, maxDuration));
  const windowSec = end - start;
  const fadeIn = Math.max(0, Math.min(params.fadeInSec, windowSec * 0.4));
  const fadeOut = Math.max(0, Math.min(params.fadeOutSec, windowSec * 0.4));
  const fadeOutStart = Math.max(start, end - fadeOut);
  return {
    start: Number(start.toFixed(3)),
    end: Number(end.toFixed(3)),
    fadeIn: Number(fadeIn.toFixed(3)),
    fadeOut: Number(fadeOut.toFixed(3)),
    fadeOutStart: Number(fadeOutStart.toFixed(3)),
  };
};

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const wrapHookTextLines = (
  text: string,
  maxCharsPerLine: number,
): string[] => {
  const paragraphs = text.replace(/\r/g, '').split('\n');
  const lines: string[] = [];
  const safeLimit = Math.max(8, Math.floor(maxCharsPerLine));

  for (const para of paragraphs) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    let current = '';
    for (const word of words) {
      if (!current) {
        current = word;
      } else if (current.length + 1 + word.length <= safeLimit) {
        current = `${current} ${word}`;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) {
      lines.push(current);
    }
  }
  return lines.length > 0 ? lines.slice(0, 6) : [''];
};

export const buildHookOverlaySvg = (
  width: number,
  height: number,
  rawText: string,
  style: HookStyleConfig,
): string => {
  const safeWidth = Math.max(320, Math.round(width));
  const safeHeight = Math.max(320, Math.round(height));
  const referenceDim = Math.min(safeWidth, safeHeight);
  const scaleFactor = referenceDim / 1080;

  const displayText = style.uppercase ? rawText.toUpperCase() : rawText;
  const fontSizePx = Math.max(
    18,
    Math.round((referenceDim * style.fontSizePct) / 100),
  );
  const maxBoxWidth = Math.round((safeWidth * style.maxWidthPct) / 100);
  const padX = Math.round(style.paddingXPx * scaleFactor);
  const padY = Math.round(style.paddingYPx * scaleFactor);
  const radius = Math.round(style.backgroundRadiusPx * scaleFactor);
  const strokeWidth = Number((style.strokeWidthPx * scaleFactor).toFixed(2));
  const avgCharWidth = fontSizePx * (style.uppercase ? 0.62 : 0.56);
  const innerMaxWidth = Math.max(120, maxBoxWidth - padX * 2);
  const maxCharsPerLine = Math.max(8, Math.floor(innerMaxWidth / avgCharWidth));

  const lines = wrapHookTextLines(displayText, maxCharsPerLine);
  const lineHeightPx = Math.round(fontSizePx * style.lineHeight);
  const longestChars = Math.max(...lines.map((line) => line.length), 1);
  const estimatedTextWidth = Math.min(
    innerMaxWidth,
    Math.round(longestChars * avgCharWidth + fontSizePx * 0.6),
  );
  const boxWidth = Math.min(
    maxBoxWidth,
    Math.max(estimatedTextWidth + padX * 2, Math.round(fontSizePx * 3)),
  );
  const textBlockHeight = lines.length * lineHeightPx;
  const boxHeight = textBlockHeight + padY * 2;

  const centerX = Math.round((safeWidth * style.xPct) / 100);
  const centerY = Math.round((safeHeight * style.yPct) / 100);

  const clampedX = Math.max(
    Math.round(safeWidth * 0.03),
    Math.min(safeWidth - boxWidth - Math.round(safeWidth * 0.03), Math.round(centerX - boxWidth / 2)),
  );
  const clampedY = Math.max(
    Math.round(safeHeight * 0.03),
    Math.min(safeHeight - boxHeight - Math.round(safeHeight * 0.03), Math.round(centerY - boxHeight / 2)),
  );

  const anchor =
    style.textAlign === 'left'
      ? 'start'
      : style.textAlign === 'right'
        ? 'end'
        : 'middle';
  const textX =
    style.textAlign === 'left'
      ? clampedX + padX
      : style.textAlign === 'right'
        ? clampedX + boxWidth - padX
        : clampedX + Math.round(boxWidth / 2);

  const firstBaselineY =
    clampedY + padY + Math.round(fontSizePx * 0.86);

  const safeFontFamily = escapeXml(
    style.fontFamily.replace(/["'<>]/g, '').trim() ||
      'Noto Sans, DejaVu Sans, sans-serif',
  );

  const filterDef = style.shadowEnabled
    ? `<defs><filter id="hookShadow" x="-15%" y="-15%" width="130%" height="140%"><feDropShadow dx="0" dy="${Math.max(2, Math.round(4 * scaleFactor))}" stdDeviation="${Math.max(2, Math.round(6 * scaleFactor))}" flood-color="#000000" flood-opacity="0.48"/></filter></defs>`
    : '';

  const bgRect =
    style.backgroundOpacity > 0.01
      ? `<rect x="${clampedX}" y="${clampedY}" width="${boxWidth}" height="${boxHeight}" rx="${radius}" ry="${radius}" fill="${style.backgroundColor}" fill-opacity="${style.backgroundOpacity.toFixed(2)}"${style.shadowEnabled ? ' filter="url(#hookShadow)"' : ''}/>`
      : '';

  const strokeAttrs =
    strokeWidth > 0
      ? ` stroke="${style.strokeColor}" stroke-width="${strokeWidth}" paint-order="stroke fill" stroke-linejoin="round"`
      : '';
  const textShadowAttr =
    style.shadowEnabled && style.backgroundOpacity <= 0.01
      ? ' filter="url(#hookShadow)"'
      : '';

  const textElements = lines
    .map(
      (line, index) =>
        `<text x="${textX}" y="${firstBaselineY + index * lineHeightPx}" text-anchor="${anchor}" font-family="${safeFontFamily}" font-size="${fontSizePx}" font-weight="${style.fontWeight}" fill="${style.textColor}"${strokeAttrs}${textShadowAttr}>${escapeXml(line)}</text>`,
    )
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${safeWidth}" height="${safeHeight}" viewBox="0 0 ${safeWidth} ${safeHeight}">${filterDef}${bgRect}${textElements}</svg>`;
};
