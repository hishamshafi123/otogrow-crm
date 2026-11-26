/* oxlint-disable twenty/no-hardcoded-colors */
import {
  DEFAULT_HOOK_STYLE_CLIENT,
  type HookSafeZoneGuide,
  type HookStyleConfig,
} from '@/delivery/deliverables/delivery-deliverables.types';

export type SafeZoneSpec = {
  id: HookSafeZoneGuide;
  label: string;
  topPct: number;
  bottomPct: number;
  rightPct: number;
  leftPct: number;
};

export const SAFE_ZONE_SPECS: Record<HookSafeZoneGuide, SafeZoneSpec> = {
  NONE: {
    id: 'NONE',
    label: 'Off',
    topPct: 0,
    bottomPct: 0,
    rightPct: 0,
    leftPct: 0,
  },
  TIKTOK: {
    id: 'TIKTOK',
    label: 'TikTok',
    topPct: 12,
    bottomPct: 26,
    rightPct: 15,
    leftPct: 4,
  },
  INSTAGRAM_REELS: {
    id: 'INSTAGRAM_REELS',
    label: 'IG Reels',
    topPct: 13,
    bottomPct: 24,
    rightPct: 14,
    leftPct: 4,
  },
  META_ADS: {
    id: 'META_ADS',
    label: 'Meta Ads',
    topPct: 14,
    bottomPct: 28,
    rightPct: 10,
    leftPct: 5,
  },
  SHORTS: {
    id: 'SHORTS',
    label: 'YT Shorts',
    topPct: 12,
    bottomPct: 22,
    rightPct: 14,
    leftPct: 4,
  },
};

export const resolveEffectiveHookStyleClient = (
  defaultStyle?: Partial<HookStyleConfig> | null,
  override?: Partial<HookStyleConfig> | null,
): HookStyleConfig => ({
  ...DEFAULT_HOOK_STYLE_CLIENT,
  ...(defaultStyle ?? {}),
  ...(override ?? {}),
});

export const checkSafeZoneOverlap = (
  style: HookStyleConfig,
  guide: HookSafeZoneGuide | undefined,
  options?: { hookText?: string; width?: number; height?: number },
): string | null => {
  if (!guide || guide === 'NONE') return null;
  const spec = SAFE_ZONE_SPECS[guide];
  if (!spec) return null;

  const halfWidth = style.maxWidthPct / 2;
  const leftEdge = Math.max(3, style.xPct - halfWidth);
  const rightEdge = Math.min(97, style.xPct + halfWidth);

  const width = Math.max(320, options?.width ?? 1080);
  const height = Math.max(320, options?.height ?? 1920);
  const refDim = Math.min(width, height);
  const textLen = (options?.hookText ?? '').trim().length;
  const avgCharsPerLine = Math.max(
    10,
    Math.floor((width * (style.maxWidthPct / 100)) / (refDim * (style.fontSizePct / 100) * 0.58)),
  );
  const estimatedLines = Math.min(
    6,
    Math.max(1, Math.ceil(Math.max(1, textLen) / avgCharsPerLine)),
  );
  const lineHeightPct = ((refDim * (style.fontSizePct / 100) * style.lineHeight) / height) * 100;
  const padYPct = ((style.paddingYPx * (refDim / 1080) * 2) / height) * 100;
  const halfHeight = (estimatedLines * lineHeightPct + padYPct) / 2;

  const topEdge = Math.max(3, style.yPct - halfHeight);
  const bottomEdge = Math.min(97, style.yPct + halfHeight);

  if (topEdge < spec.topPct) {
    return `Top edge enters ${spec.label} top UI bar — move lower than ${Math.ceil(spec.topPct + halfHeight)}%.`;
  }
  if (bottomEdge > 100 - spec.bottomPct) {
    return `Bottom edge overlaps ${spec.label} caption/CTA area — move above ${Math.floor(100 - spec.bottomPct - halfHeight)}%.`;
  }
  if (leftEdge < spec.leftPct) {
    return `Left edge enters ${spec.label} margin — narrow width or shift right.`;
  }
  if (rightEdge > 100 - spec.rightPct) {
    return `Right edge enters ${spec.label} action buttons — narrow width or shift left.`;
  }
  return null;
};

const hexToRgba = (hex: string, alpha: number): string => {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const num = Number.parseInt(full, 16);
  if (Number.isNaN(num)) return `rgba(255,255,255,${alpha})`;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) => {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
};

const wrapCanvasLines = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] => {
  const paragraphs = text.replace(/\r/g, '').split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (!current || ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines.length > 0 ? lines.slice(0, 6) : [''];
};

export const renderHookOverlayToPngBlob = async (params: {
  width: number;
  height: number;
  hookText: string;
  style: HookStyleConfig;
}): Promise<Blob> => {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    await document.fonts.ready.catch(() => undefined);
  }

  const width = Math.max(320, Math.round(params.width));
  const height = Math.max(320, Math.round(params.height));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable.');
  }

  ctx.clearRect(0, 0, width, height);

  const style = params.style;
  const refDim = Math.min(width, height);
  const scaleFactor = refDim / 1080;
  const fontSizePx = Math.max(18, Math.round((refDim * style.fontSizePct) / 100));
  const maxBoxWidth = Math.round((width * style.maxWidthPct) / 100);
  const padX = Math.round(style.paddingXPx * scaleFactor);
  const padY = Math.round(style.paddingYPx * scaleFactor);
  const radius = Math.round(style.backgroundRadiusPx * scaleFactor);
  const strokeWidth = style.strokeWidthPx * scaleFactor;
  const displayText = style.uppercase
    ? params.hookText.toUpperCase()
    : params.hookText;

  ctx.font = `${style.fontWeight} ${fontSizePx}px ${style.fontFamily}`;
  ctx.textBaseline = 'middle';

  const innerMaxWidth = Math.max(120, maxBoxWidth - padX * 2);
  const lines = wrapCanvasLines(ctx, displayText, innerMaxWidth);
  const lineHeightPx = Math.round(fontSizePx * style.lineHeight);
  const widestLine = Math.max(
    ...lines.map((line) => ctx.measureText(line).width),
    fontSizePx * 2,
  );
  const boxWidth = Math.min(
    maxBoxWidth,
    Math.ceil(widestLine) + padX * 2,
  );
  const boxHeight = lines.length * lineHeightPx + padY * 2;

  const centerX = Math.round((width * style.xPct) / 100);
  const centerY = Math.round((height * style.yPct) / 100);
  const marginX = Math.round(width * 0.03);
  const marginY = Math.round(height * 0.03);
  const clampedX = Math.max(
    marginX,
    Math.min(width - boxWidth - marginX, Math.round(centerX - boxWidth / 2)),
  );
  const clampedY = Math.max(
    marginY,
    Math.min(height - boxHeight - marginY, Math.round(centerY - boxHeight / 2)),
  );

  // Draw pill/box background if opaque
  if (style.backgroundOpacity > 0.01) {
    ctx.save();
    if (style.shadowEnabled) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.48)';
      ctx.shadowBlur = Math.max(6, Math.round(14 * scaleFactor));
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = Math.max(2, Math.round(5 * scaleFactor));
    }
    ctx.fillStyle = hexToRgba(style.backgroundColor, style.backgroundOpacity);
    drawRoundedRect(ctx, clampedX, clampedY, boxWidth, boxHeight, radius);
    ctx.fill();
    ctx.restore();
  }

  // Draw text lines
  ctx.save();
  ctx.font = `${style.fontWeight} ${fontSizePx}px ${style.fontFamily}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = style.textAlign;

  if (style.shadowEnabled && style.backgroundOpacity <= 0.01) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.72)';
    ctx.shadowBlur = Math.max(6, Math.round(12 * scaleFactor));
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = Math.max(2, Math.round(4 * scaleFactor));
  }

  const textX =
    style.textAlign === 'left'
      ? clampedX + padX
      : style.textAlign === 'right'
        ? clampedX + boxWidth - padX
        : clampedX + boxWidth / 2;

  lines.forEach((line, index) => {
    const lineCenterY = clampedY + padY + lineHeightPx * (index + 0.5);
    if (strokeWidth > 0) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = strokeWidth * 2;
      ctx.strokeStyle = style.strokeColor;
      ctx.strokeText(line, textX, lineCenterY);
    }
    ctx.fillStyle = style.textColor;
    ctx.fillText(line, textX, lineCenterY);
  });
  ctx.restore();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to export overlay PNG from canvas.'));
      }
    }, 'image/png');
  });
};
