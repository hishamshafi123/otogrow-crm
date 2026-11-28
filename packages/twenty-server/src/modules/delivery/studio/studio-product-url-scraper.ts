import { BadRequestException } from '@nestjs/common';
import { FileTypeParser } from 'file-type';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as dns from 'node:dns/promises';
import * as net from 'node:net';
import { resolveMediaBinaryCandidates } from 'src/modules/delivery/deliverables/delivery-media-probe.service';
import { STUDIO_ALLOWED_IMAGE_MIMES } from 'src/modules/delivery/studio/delivery-studio.policy';

const FETCH_TIMEOUT_MS = 12_000;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MIN_IMAGE_BYTES = 8_000; // Skip tiny tracking pixels, icons & micro thumbnails
const MIN_IMAGE_DIMENSION_PX = 250; // Skip swatches, avatars, trust badges & tiny thumbs
const MAX_WIDE_ASPECT_RATIO = 2.8; // Skip wide hero/promo/payment banners
const MAX_TALL_ASPECT_RATIO = 3.5; // Skip tall stacked infographics / size charts
const DHASH_DUPLICATE_THRESHOLD = 5; // Hamming distance <= 5 out of 64 bits => visually duplicate
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export type ScrapedProductImage = {
  url: string;
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  width?: number;
  height?: number;
  sha256?: string;
};

export type ScrapedProductResult = {
  title: string;
  sourceUrl: string;
  images: ScrapedProductImage[];
};

type CandidateEntry = {
  url: string;
  key: string;
  resScore: number;
  relevanceScore: number;
  order: number;
};

const isPrivateIpAddress = (ip: string): boolean => {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    const [a, b] = parts;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const norm = ip.toLowerCase();
    if (norm === '::1' || norm === '::') return true;
    if (norm.startsWith('fc') || norm.startsWith('fd')) return true;
    if (norm.startsWith('fe80') || norm.startsWith('::ffff:127.')) return true;
    if (norm.startsWith('::ffff:10.') || norm.startsWith('::ffff:192.168.')) {
      return true;
    }
    return false;
  }
  return true;
};

export const assertSafePublicProductUrl = async (
  rawUrl: string,
): Promise<URL> => {
  const trimmed = rawUrl.trim();
  const normalized = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new BadRequestException('Enter a valid product URL (https://...).');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new BadRequestException('Only HTTP and HTTPS product URLs are allowed.');
  }

  const host = parsed.hostname.toLowerCase();
  if (
    !host ||
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.localhost')
  ) {
    throw new BadRequestException('Local or internal URLs are not allowed.');
  }

  if (net.isIP(host)) {
    if (isPrivateIpAddress(host)) {
      throw new BadRequestException('Private IP addresses are not allowed.');
    }
    return parsed;
  }

  try {
    const addresses = await dns.lookup(host, { all: true });
    if (!addresses.length) {
      throw new BadRequestException('Could not resolve product URL host.');
    }
    for (const addr of addresses) {
      if (isPrivateIpAddress(addr.address)) {
        throw new BadRequestException('Private network hosts are not allowed.');
      }
    }
  } catch (err) {
    if (err instanceof BadRequestException) throw err;
    throw new BadRequestException('Could not resolve product URL host.');
  }

  return parsed;
};

const fetchWithLimit = async (
  url: string,
  maxBytes: number,
  accept: string,
): Promise<{ ok: boolean; contentType: string; buffer: Buffer }> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: accept,
      },
    });
    if (!response.ok) {
      return { ok: false, contentType: '', buffer: Buffer.alloc(0) };
    }
    // Re-check final redirected URL host for SSRF safety
    if (response.url && response.url !== url) {
      await assertSafePublicProductUrl(response.url);
    }
    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (contentLength > maxBytes) {
      return { ok: false, contentType: '', buffer: Buffer.alloc(0) };
    }
    const arrayBuf = await response.arrayBuffer();
    if (arrayBuf.byteLength > maxBytes) {
      return { ok: false, contentType: '', buffer: Buffer.alloc(0) };
    }
    return {
      ok: true,
      contentType: response.headers.get('content-type') ?? '',
      buffer: Buffer.from(arrayBuf),
    };
  } catch {
    return { ok: false, contentType: '', buffer: Buffer.alloc(0) };
  } finally {
    clearTimeout(timer);
  }
};

// Token-bounded pattern avoids false positives like "iconic-tee.jpg" or "flagship-hoodie.jpg"
const BLOCKED_URL_TOKEN_REGEX =
  /(?:^|[^a-z0-9])(logo|logos|favicon|sprite|sprites|avatar|avatars|badge|badges|payment|payments|visa|mastercard|amex|paypal|klarna|afterpay|shop-?pay|apple-?pay|google-?pay|trustpilot|trust-?badge|flag|flags|icon|icons|spinner|loader|loading|pixel|analytics|banner|banners|hero-?banner|promo|coupon|discount|newsletter|popup|modal|announcement|swatch|swatches|color-?dot|placeholder|no-?image|blank|spacer|1x1|size-?chart|size-?guide|sizing-?chart|measurement|measurements|fit-?guide|care-?guide|wash-?care|shipping|free-?shipping|guarantee|warranty|certificate|award|qr-?code|instagram|tiktok|youtube|pinterest|whatsapp|facebook|twitter|gravatar|star-?rating|stars|review-?star|testimonial)(?:[^a-z0-9]|$)/i;

const BLOCKED_URL_SUBSTRINGS = [
  'facebook.com/tr',
  'doubleclick',
  'google-analytics',
  'googletagmanager',
  'clarity.ms',
  'hotjar',
  'judge.me/assets',
  'stamped.io/assets',
  'loox.io/img',
  'yotpo.com/assets',
  'klaviyo.com',
];

const BLOCKED_CONTEXT_REGEX =
  /(?:^|[^a-z0-9])(logo|favicon|size\s*chart|size\s*guide|sizing\s*chart|measurement|fit\s*guide|swatch|color\s*swatch|payment|visa|mastercard|paypal|klarna|afterpay|trustpilot|badge|banner|announcement|newsletter|popup|icon|avatar|flag|qr\s*code|shipping|guarantee|warranty|star\s*rating|related\s*product|you\s*may\s*also\s*like|recommended)(?:[^a-z0-9]|$)/i;

export const isLikelyNonProductImageUrl = (
  rawUrl: string,
  contextText = '',
): boolean => {
  const lower = rawUrl.toLowerCase();
  if (lower.startsWith('data:')) return true;
  if (/\.(svg|ico|gif)(\?|$)/i.test(lower)) return true;
  if (BLOCKED_URL_SUBSTRINGS.some((sub) => lower.includes(sub))) return true;

  let pathAndQuery = lower;
  try {
    const u = new URL(rawUrl);
    pathAndQuery = `${u.pathname}${u.search}`.toLowerCase();
  } catch {
    // Use raw lower string
  }

  if (BLOCKED_URL_TOKEN_REGEX.test(pathAndQuery)) return true;
  if (contextText && BLOCKED_CONTEXT_REGEX.test(contextText.toLowerCase())) {
    return true;
  }
  return false;
};

export const unwrapProxyImageUrl = (rawHref: string, baseUrl: URL): string => {
  try {
    const u = new URL(rawHref, baseUrl);
    const pathLower = u.pathname.toLowerCase();

    // Next.js / Vercel image optimization proxy: /_next/image?url=...&w=1080&q=75
    if (
      (pathLower === '/_next/image' || pathLower === '/_vercel/image') &&
      u.searchParams.has('url')
    ) {
      const inner = u.searchParams.get('url');
      if (inner) {
        const innerResolved = new URL(
          inner.startsWith('//') ? `${baseUrl.protocol}${inner}` : inner,
          baseUrl,
        );
        return innerResolved.toString();
      }
    }

    // Cloudflare Image Resizing: /cdn-cgi/image/width=800,quality=80/https://... or /cdn-cgi/image/.../path.jpg
    const cfMatch = u.pathname.match(/^\/cdn-cgi\/image\/[^/]+\/(.+)$/i);
    if (cfMatch?.[1]) {
      const target = cfMatch[1];
      if (/^https?:\/\//i.test(target)) {
        return new URL(target).toString();
      }
      return new URL(
        target.startsWith('/') ? target : `/${target}`,
        u.origin,
      ).toString();
    }

    return u.toString();
  } catch {
    return rawHref;
  }
};

const estimateUrlResolutionScore = (href: string): number => {
  let score = 500;
  try {
    const u = new URL(href);
    const wParam =
      Number(u.searchParams.get('width')) ||
      Number(u.searchParams.get('w')) ||
      Number(u.searchParams.get('imwidth'));
    if (Number.isFinite(wParam) && wParam > 0) {
      score = wParam;
    } else if (
      !/[_-](\d+x\d*|small|compact|medium|thumb|pico|icon)\.(jpg|jpeg|png|webp|avif)$/i.test(
        u.pathname,
      )
    ) {
      // Uncapped original image
      score = 2400;
    }
    const dimMatch = u.pathname.match(/[_-](\d{2,4})x(\d{0,4})(?:\.|_|-)/i);
    if (dimMatch?.[1]) {
      const dimW = Number(dimMatch[1]);
      if (Number.isFinite(dimW) && dimW > 0) {
        score = Math.min(score, dimW);
      }
    }
    // Slight preference for direct lossless/high-res extensions over heavily recompressed proxies
    if (/\.(png|jpg|jpeg)(\?|$)/i.test(href)) score += 10;
  } catch {
    // Keep default
  }
  return score;
};

export const normalizeCandidateImageUrl = (
  raw: string,
  baseUrl: URL,
  contextText = '',
): string | null => {
  const cleaned = raw
    .trim()
    .replace(/&amp;/g, '&')
    .replace(/^['"]|['"]$/g, '');
  if (!cleaned || cleaned.startsWith('data:')) return null;
  try {
    const unwrapped = unwrapProxyImageUrl(
      cleaned.startsWith('//') ? `${baseUrl.protocol}${cleaned}` : cleaned,
      baseUrl,
    );
    const resolved = new URL(unwrapped, baseUrl);
    if (resolved.protocol !== 'https:' && resolved.protocol !== 'http:') {
      return null;
    }

    // Upgrade Shopify tiny thumbnail URLs like _100x100.jpg or ?width=120 to high-res
    let pathname = resolved.pathname.replace(
      /_(\d+x\d*|pico|icon|small|compact|medium|thumb|crop_[a-z]+)(?=\.(jpg|jpeg|png|webp|avif)$)/i,
      '',
    );
    // Also handle double suffixes like _600x600_crop_center.jpg
    pathname = pathname.replace(
      /_(\d+x\d*|pico|icon|small|compact|medium|thumb)(?=\.(jpg|jpeg|png|webp|avif)$)/i,
      '',
    );
    resolved.pathname = pathname;

    for (const key of ['width', 'w']) {
      if (resolved.searchParams.has(key)) {
        const w = Number(resolved.searchParams.get(key));
        if (!Number.isNaN(w) && w > 0 && w < 1000) {
          resolved.searchParams.set(key, '1600');
        }
      }
    }

    const href = resolved.toString();
    if (isLikelyNonProductImageUrl(href, contextText)) return null;
    return href;
  } catch {
    return null;
  }
};

export const dedupeKeyForImageUrl = (href: string): string => {
  try {
    const u = new URL(href);
    let path = decodeURIComponent(u.pathname).toLowerCase();

    // Strip Cloudinary / Imgix / CDN inline transform path segments (e.g. /w_800,c_fill,f_auto/)
    path = path.replace(
      /\/(?:[a-z]{1,4}_[^/,]+(?:,[a-z]{1,4}_[^/,]+)*)(?=\/)/gi,
      '',
    );

    // Strip extension for stem comparison (.jpg vs .jpeg vs .webp vs .png of same asset)
    path = path.replace(/\.(jpg|jpeg|png|webp|avif)$/i, '');

    // Strip resize/crop/retina/scaled suffixes
    path = path
      .replace(/_crop_[a-z]+$/i, '')
      .replace(
        /_(?:\d+x\d*|pico|icon|thumb|small|compact|medium|large|grande|master|original)$/i,
        '',
      )
      .replace(/-\d{2,4}x\d{2,4}$/i, '')
      .replace(/-scaled$/i, '')
      .replace(/@\dx$/i, '');

    // Collapse Shopify dual CDN URLs:
    //   https://cdn.shopify.com/s/files/1/xxxx/xxxx/files/tee
    //   https://brand.com/cdn/shop/files/tee
    //   https://brand.com/cdn/shop/products/tee
    const shopifyMatch = path.match(
      /(?:^|\/)(?:s\/files\/\d+\/\d+\/\d+|cdn\/shop)\/(?:products|files)\/(.+)$/i,
    );
    if (shopifyMatch?.[1]) {
      return `shopify:${shopifyMatch[1]}`;
    }

    return `${u.hostname.toLowerCase()}${path}`;
  } catch {
    return href.toLowerCase();
  }
};

/**
 * Pure-Node image dimension parser for PNG, JPEG, and WebP buffers.
 * Returns null if the format isn't recognized so callers can fall back safely.
 */
export const readImageDimensions = (
  buffer: Buffer,
): { width: number; height: number } | null => {
  if (!buffer || buffer.length < 24) return null;

  // PNG: 8-byte signature + IHDR chunk (width at 16, height at 20)
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return width > 0 && height > 0 ? { width, height } : null;
  }

  // WebP: RIFF....WEBP
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    const chunkHeader = buffer.toString('ascii', 12, 16);
    if (chunkHeader === 'VP8X' && buffer.length >= 30) {
      const width = 1 + (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16));
      const height = 1 + (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16));
      return width > 0 && height > 0 ? { width, height } : null;
    }
    if (chunkHeader === 'VP8L' && buffer.length >= 25) {
      const bits = buffer.readUInt32LE(21);
      const width = (bits & 0x3fff) + 1;
      const height = ((bits >> 14) & 0x3fff) + 1;
      return width > 0 && height > 0 ? { width, height } : null;
    }
    if (chunkHeader === 'VP8 ' && buffer.length >= 30) {
      const width = buffer.readUInt16LE(26) & 0x3fff;
      const height = buffer.readUInt16LE(28) & 0x3fff;
      return width > 0 && height > 0 ? { width, height } : null;
    }
    return null;
  }

  // JPEG: 0xFF 0xD8, scan markers for SOF0..SOF15 (excluding DHT 0xC4, JPG 0xC8, DAC 0xCC)
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      while (offset < buffer.length && buffer[offset] === 0xff) {
        offset += 1;
      }
      if (offset >= buffer.length) break;
      const marker = buffer[offset];
      offset += 1;

      if (marker === 0xd9 || marker === 0xda) break; // EOI or SOS
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;

      if (offset + 2 > buffer.length) break;
      const segmentLength = buffer.readUInt16BE(offset);
      if (segmentLength < 2 || offset + segmentLength > buffer.length) break;

      const isSof =
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc;
      if (isSof && offset + 7 < buffer.length) {
        const height = buffer.readUInt16BE(offset + 3);
        const width = buffer.readUInt16BE(offset + 5);
        return width > 0 && height > 0 ? { width, height } : null;
      }
      offset += segmentLength;
    }
  }

  return null;
};

export const isAcceptableProductDimensions = (
  dims: { width: number; height: number } | null,
): boolean => {
  if (!dims) return true; // If dimensions couldn't be parsed, don't reject blindly
  const { width, height } = dims;
  if (width < MIN_IMAGE_DIMENSION_PX || height < MIN_IMAGE_DIMENSION_PX) {
    return false;
  }
  const ratio = width / height;
  if (ratio > MAX_WIDE_ASPECT_RATIO) return false;
  if (height / width > MAX_TALL_ASPECT_RATIO) return false;
  return true;
};

/**
 * Computes a 64-bit perceptual difference hash (dHash) via bundled ffmpeg (in-memory pipe).
 * Returns null gracefully if ffmpeg is unavailable or decoding fails.
 */
const computeImageDHash = async (buffer: Buffer): Promise<string | null> => {
  const candidates = resolveMediaBinaryCandidates('ffmpeg');
  for (const bin of candidates) {
    try {
      const rawGray = await new Promise<Buffer>((resolve, reject) => {
        const child = spawn(
          bin,
          [
            '-hide_banner',
            '-loglevel',
            'error',
            '-i',
            'pipe:0',
            '-frames:v',
            '1',
            '-vf',
            'scale=9:8:flags=area,format=gray',
            '-f',
            'rawvideo',
            'pipe:1',
          ],
          { stdio: ['pipe', 'pipe', 'ignore'] },
        );

        const chunks: Buffer[] = [];
        const timer = setTimeout(() => {
          child.kill('SIGKILL');
          reject(new Error('dhash timeout'));
        }, 2500);

        child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
        child.on('error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
        child.on('close', (code) => {
          clearTimeout(timer);
          if (code === 0) {
            resolve(Buffer.concat(chunks));
          } else {
            reject(new Error(`ffmpeg exited with code ${code}`));
          }
        });

        child.stdin.on('error', () => {
          // Ignore EPIPE when ffmpeg finishes reading header/frame early
        });
        child.stdin.end(buffer);
      });

      if (rawGray.length < 72) return null;
      let bits = '';
      for (let y = 0; y < 8; y += 1) {
        const rowOffset = y * 9;
        for (let x = 0; x < 8; x += 1) {
          bits += rawGray[rowOffset + x] < rawGray[rowOffset + x + 1] ? '1' : '0';
        }
      }
      return bits;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === 'ENOENT' || code === 'EACCES') {
        continue;
      }
      return null;
    }
  }
  return null;
};

export const hammingDistance64 = (a: string, b: string): number => {
  const len = Math.min(a.length, b.length);
  let count = Math.abs(a.length - b.length);
  for (let i = 0; i < len; i += 1) {
    if (a.charCodeAt(i) !== b.charCodeAt(i)) {
      count += 1;
    }
  }
  return count;
};

const decodeHtmlEntities = (text: string): string =>
  text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

const extractProductTokens = (title: string | null, baseUrl: URL): string[] => {
  const stopWords = new Set([
    'the',
    'and',
    'for',
    'with',
    'from',
    'product',
    'products',
    'shop',
    'store',
    'collection',
    'collections',
    'item',
    'new',
    'sale',
  ]);
  const slug = baseUrl.pathname.split('/').filter(Boolean).pop() ?? '';
  const combined = `${title ?? ''} ${slug}`.toLowerCase();
  const tokens = combined
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !stopWords.has(t));
  return Array.from(new Set(tokens));
};

export const extractJsonLdProduct = (
  html: string,
): { title: string | null; images: string[] } => {
  const images: string[] = [];
  const variantImages: string[] = [];
  let title: string | null = null;
  const regex =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  const collectImageField = (rawImg: unknown, target: string[]) => {
    if (typeof rawImg === 'string') {
      target.push(rawImg);
    } else if (Array.isArray(rawImg)) {
      for (const entry of rawImg) {
        if (typeof entry === 'string') target.push(entry);
        else if (entry && typeof entry === 'object') {
          const obj = entry as Record<string, unknown>;
          const candidate =
            typeof obj.contentUrl === 'string'
              ? obj.contentUrl
              : typeof obj.url === 'string'
                ? obj.url
                : null;
          if (candidate) target.push(candidate);
        }
      }
    } else if (rawImg && typeof rawImg === 'object') {
      const obj = rawImg as Record<string, unknown>;
      const candidate =
        typeof obj.contentUrl === 'string'
          ? obj.contentUrl
          : typeof obj.url === 'string'
            ? obj.url
            : null;
      if (candidate) target.push(candidate);
    }
  };

  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    const rec = node as Record<string, unknown>;
    const typeVal = rec['@type'];
    const types = Array.isArray(typeVal)
      ? typeVal.map((t) => String(t))
      : typeof typeVal === 'string'
        ? [typeVal]
        : [];
    const isProduct = types.includes('Product') || types.includes('ProductGroup');
    if (isProduct) {
      if (!title && typeof rec.name === 'string' && rec.name.trim()) {
        title = decodeHtmlEntities(rec.name.trim());
      }
      collectImageField(rec.image, images);
      if (Array.isArray(rec.hasVariant) && rec.hasVariant.length > 0) {
        // Only take the first variant's images as fallback to avoid pulling 20 other colorways
        const firstVariant = rec.hasVariant[0] as Record<string, unknown> | null;
        if (firstVariant && typeof firstVariant === 'object') {
          collectImageField(firstVariant.image, variantImages);
        }
      }
    }
    if (rec['@graph']) visit(rec['@graph']);
  };

  while ((match = regex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      visit(parsed);
    } catch {
      // Ignore malformed JSON-LD blocks
    }
  }

  return {
    title,
    images: images.length > 0 ? images : variantImages,
  };
};

const pickBestFromSrcset = (srcset: string): { url: string; width: number } | null => {
  const parts = srcset
    .split(',')
    .map((entry) => entry.trim().split(/\s+/))
    .filter((pair) => pair[0]);
  if (!parts.length) return null;
  let bestUrl = parts[0][0];
  let bestScore = 0;
  for (const [url, descriptor] of parts) {
    let score = 1;
    if (descriptor) {
      if (descriptor.endsWith('w')) {
        score = Number.parseInt(descriptor, 10) || 1;
      } else if (descriptor.endsWith('x')) {
        score = Math.round((Number.parseFloat(descriptor) || 1) * 600);
      }
    }
    if (score >= bestScore) {
      bestScore = score;
      bestUrl = url;
    }
  }
  return { url: bestUrl, width: bestScore };
};

/**
 * Strips non-product page chrome (header, nav, footer, aside, scripts, related/recommended sections)
 * so fallback HTML scanning only inspects the main product content area.
 */
export const stripNonProductHtmlSections = (html: string): string => {
  let cleaned = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|svg|noscript|template)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(header|nav|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');

  // Remove common related-product / recommendation / review / cart / mega-menu blocks
  const nonProductSectionPattern =
    /(?:related|recommend|upsell|cross[-_]?sell|also[-_]?like|may[-_]?also|recently[-_]?viewed|recent[-_]?product|complementary|complete[-_]?the[-_]?look|shop[-_]?the[-_]?look|cart[-_]?drawer|mini[-_]?cart|mega[-_]?menu|navbar|announcement|newsletter|popup|modal|cookie|review|testimonial|instagram|social[-_]?feed|breadcrumb|trust[-_]?badge|payment[-_]?icon|footer|site[-_]?header)/i;

  cleaned = cleaned.replace(
    /<(section|div|ul)\b([^>]*\b(?:id|class|data-section-type|data-section|aria-label)=["'][^"']*["'][^>]*)>([\s\S]*?)<\/\1>/gi,
    (fullMatch, _tag, attrs: string) =>
      nonProductSectionPattern.test(attrs) ? ' ' : fullMatch,
  );

  return cleaned;
};

/**
 * Extracts explicit product gallery images from WooCommerce / Shopify gallery markup
 * without scanning unrelated page images.
 */
const extractScopedProductGalleryImages = (
  html: string,
): Array<{ url: string; alt: string; boost: number }> => {
  const results: Array<{ url: string; alt: string; boost: number }> = [];

  // 1) WooCommerce gallery attributes: data-large_image / data-zoom-image
  const wooRegex =
    /<(?:img|a)\b[^>]*\bdata-(?:large_image|zoom-image|full-src|high-res-src)=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = wooRegex.exec(html)) !== null) {
    const altMatch = match[0].match(/\balt=["']([^"']*)["']/i);
    results.push({
      url: match[1],
      alt: altMatch?.[1] ? decodeHtmlEntities(altMatch[1]) : '',
      boost: 8,
    });
  }

  // 2) Embedded Shopify product media JSON inside <script type="application/json">
  const scriptJsonRegex =
    /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;
  while ((match = scriptJsonRegex.exec(html)) !== null) {
    const raw = match[1].trim();
    if (!raw.startsWith('{') || raw.length > 500_000) continue;
    if (!raw.includes('"media"') && !raw.includes('"images"')) continue;
    try {
      const parsed = JSON.parse(raw) as {
        media?: Array<{
          media_type?: string;
          src?: string;
          alt?: string;
          preview_image?: { src?: string };
        }>;
        images?: Array<string | { src?: string; alt?: string }>;
        product?: {
          media?: Array<{
            media_type?: string;
            src?: string;
            alt?: string;
            preview_image?: { src?: string };
          }>;
          images?: Array<string | { src?: string; alt?: string }>;
        };
      };
      const mediaList = parsed.media ?? parsed.product?.media;
      if (Array.isArray(mediaList) && mediaList.length > 0) {
        for (const item of mediaList) {
          if (item?.media_type && item.media_type !== 'image') continue;
          const src = item?.src ?? item?.preview_image?.src;
          if (typeof src === 'string') {
            results.push({ url: src, alt: item?.alt ?? '', boost: 10 });
          }
        }
      }
      const imgList = parsed.images ?? parsed.product?.images;
      if (Array.isArray(imgList) && imgList.length > 0) {
        for (const entry of imgList) {
          if (typeof entry === 'string') {
            results.push({ url: entry, alt: '', boost: 9 });
          } else if (entry && typeof entry.src === 'string') {
            results.push({ url: entry.src, alt: entry.alt ?? '', boost: 9 });
          }
        }
      }
    } catch {
      // Ignore non-product JSON scripts
    }
  }

  return results;
};

const createCandidateCollector = (baseUrl: URL) => {
  const byKey = new Map<string, CandidateEntry>();
  let orderCounter = 0;

  const add = (
    raw: string | null | undefined,
    opts?: { contextText?: string; relevanceScore?: number },
  ) => {
    if (!raw) return;
    const normalized = normalizeCandidateImageUrl(
      raw,
      baseUrl,
      opts?.contextText ?? '',
    );
    if (!normalized) return;
    const key = dedupeKeyForImageUrl(normalized);
    const resScore = estimateUrlResolutionScore(normalized);
    const relevanceScore = opts?.relevanceScore ?? 0;

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        url: normalized,
        key,
        resScore,
        relevanceScore,
        order: orderCounter++,
      });
      return;
    }

    // Prefer the higher-resolution version of the exact same asset while preserving original slot order
    if (resScore > existing.resScore) {
      existing.url = normalized;
      existing.resScore = resScore;
    }
    if (relevanceScore > existing.relevanceScore) {
      existing.relevanceScore = relevanceScore;
    }
  };

  const toOrderedUrls = (sortByRelevance = false): string[] => {
    const entries = Array.from(byKey.values());
    if (sortByRelevance) {
      entries.sort(
        (a, b) =>
          b.relevanceScore - a.relevanceScore ||
          b.resScore - a.resScore ||
          a.order - b.order,
      );
    } else {
      entries.sort((a, b) => a.order - b.order);
    }
    return entries.map((e) => e.url);
  };

  return {
    add,
    size: () => byKey.size,
    toOrderedUrls,
  };
};

const downloadAndDedupeImages = async (
  candidateUrls: string[],
  limit: number,
  parser: FileTypeParser,
): Promise<ScrapedProductImage[]> => {
  type DownloadedCandidate = ScrapedProductImage & {
    sha256: string;
    pixelArea: number;
    dHash: string | null;
  };

  const accepted: DownloadedCandidate[] = [];
  const seenSha256 = new Set<string>();
  // Check up to limit * 2 candidates in case a few are size charts, tiny badges, or duplicates
  const urlsToInspect = candidateUrls.slice(0, Math.max(limit * 2, 12));

  for (const imgUrl of urlsToInspect) {
    if (accepted.length >= limit) break;
    try {
      await assertSafePublicProductUrl(imgUrl);
    } catch {
      continue;
    }

    const res = await fetchWithLimit(
      imgUrl,
      MAX_IMAGE_BYTES,
      'image/webp,image/png,image/jpeg,image/*;q=0.8',
    );
    if (!res.ok || res.buffer.length < MIN_IMAGE_BYTES) continue;

    const detected = await parser.fromBuffer(res.buffer.subarray(0, 8192));
    const mime = detected?.mime ?? '';
    if (!STUDIO_ALLOWED_IMAGE_MIMES.has(mime)) continue;

    const dims = readImageDimensions(res.buffer);
    if (!isAcceptableProductDimensions(dims)) continue;

    const sha256 = createHash('sha256').update(res.buffer).digest('hex');
    if (seenSha256.has(sha256)) continue;

    const pixelArea = dims ? dims.width * dims.height : res.buffer.length;
    const dHash = await computeImageDHash(res.buffer);

    if (dHash !== null) {
      const dupIdx = accepted.findIndex(
        (item) =>
          item.dHash !== null &&
          hammingDistance64(item.dHash, dHash) <= DHASH_DUPLICATE_THRESHOLD,
      );
      if (dupIdx >= 0) {
        // Visually identical image (e.g. resized or re-encoded duplicate) — keep the higher-res copy
        const existing = accepted[dupIdx];
        if (
          pixelArea > existing.pixelArea ||
          (pixelArea === existing.pixelArea &&
            res.buffer.length > existing.buffer.length)
        ) {
          const ext =
            mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
          accepted[dupIdx] = {
            url: imgUrl,
            buffer: res.buffer,
            mimeType: mime,
            fileName: `image-${dupIdx + 1}.${ext}`,
            width: dims?.width,
            height: dims?.height,
            sha256,
            pixelArea,
            dHash,
          };
          seenSha256.add(sha256);
        }
        continue;
      }
    }

    seenSha256.add(sha256);
    const ext =
      mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    accepted.push({
      url: imgUrl,
      buffer: res.buffer,
      mimeType: mime,
      fileName: `image-${accepted.length + 1}.${ext}`,
      width: dims?.width,
      height: dims?.height,
      sha256,
      pixelArea,
      dHash,
    });
  }

  return accepted.map(({ pixelArea: _pa, dHash: _dh, ...img }, idx) => {
    const ext =
      img.mimeType === 'image/png'
        ? 'png'
        : img.mimeType === 'image/webp'
          ? 'webp'
          : 'jpg';
    return {
      ...img,
      fileName: `image-${idx + 1}.${ext}`,
    };
  });
};

export const scrapeProductImagesFromUrl = async (
  rawUrl: string,
  maxImages = 6,
): Promise<ScrapedProductResult> => {
  const baseUrl = await assertSafePublicProductUrl(rawUrl);
  const limit = Math.max(1, Math.min(8, maxImages));
  const parser = new FileTypeParser();
  let detectedTitle: string | null = null;

  const fallbackTitle = () =>
    (
      baseUrl.pathname
        .split('/')
        .filter(Boolean)
        .pop()
        ?.replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase()) || 'Imported Product'
    ).slice(0, 160);

  // =========================================================================
  // STAGE 1: Shopify Product JSON (authoritative — never pad with page <img>s)
  // Handles both /products/<handle> and /collections/<col>/products/<handle>
  // =========================================================================
  const shopifyHandleMatch = baseUrl.pathname.match(/\/products\/([^/?#]+)/i);
  if (shopifyHandleMatch?.[1]) {
    const cleanHandle = shopifyHandleMatch[1].replace(/\.json$/i, '');
    const shopifyJsonUrl = `${baseUrl.origin}/products/${cleanHandle}.json`;
    const jsonRes = await fetchWithLimit(
      shopifyJsonUrl,
      MAX_HTML_BYTES,
      'application/json',
    );
    if (jsonRes.ok && jsonRes.buffer.length > 0) {
      try {
        const parsed = JSON.parse(jsonRes.buffer.toString('utf8')) as {
          product?: {
            title?: string;
            images?: Array<{
              src?: string;
              alt?: string | null;
              variant_ids?: number[];
            }>;
            image?: { src?: string; alt?: string | null };
          };
        };
        if (parsed.product?.title) {
          detectedTitle = parsed.product.title.trim();
        }
        const stage1 = createCandidateCollector(baseUrl);
        const requestedVariantId = Number(baseUrl.searchParams.get('variant'));
        const hasRequestedVariant =
          Number.isFinite(requestedVariantId) && requestedVariantId > 0;

        if (Array.isArray(parsed.product?.images)) {
          const allImages = parsed.product.images;
          if (hasRequestedVariant) {
            // Put selected-variant images first, then untagged gallery photos (skipping other variants' photos)
            const variantSpecific = allImages.filter(
              (img) =>
                Array.isArray(img.variant_ids) &&
                img.variant_ids.includes(requestedVariantId),
            );
            const sharedGallery = allImages.filter(
              (img) => !Array.isArray(img.variant_ids) || img.variant_ids.length === 0,
            );
            const prioritized =
              variantSpecific.length > 0
                ? [...variantSpecific, ...sharedGallery]
                : allImages;
            for (const img of prioritized) {
              stage1.add(img?.src, { contextText: img?.alt ?? '' });
            }
          } else {
            for (const img of allImages) {
              stage1.add(img?.src, { contextText: img?.alt ?? '' });
            }
          }
        }
        if (parsed.product?.image?.src) {
          stage1.add(parsed.product.image.src, {
            contextText: parsed.product.image.alt ?? '',
          });
        }

        if (stage1.size() > 0) {
          const downloaded = await downloadAndDedupeImages(
            stage1.toOrderedUrls(false),
            limit,
            parser,
          );
          if (downloaded.length > 0) {
            return {
              title: (detectedTitle || fallbackTitle()).slice(0, 160),
              sourceUrl: baseUrl.toString(),
              images: downloaded,
            };
          }
        }
      } catch {
        // Not Shopify JSON — fall through to HTML extraction
      }
    }
  }

  // =========================================================================
  // STAGE 2: Fetch HTML and extract authoritative structured product data
  // (JSON-LD Product schema + WooCommerce/Shopify embedded gallery JSON)
  // =========================================================================
  const htmlRes = await fetchWithLimit(
    baseUrl.toString(),
    MAX_HTML_BYTES,
    'text/html,application/xhtml+xml,*/*;q=0.8',
  );
  if (!htmlRes.ok || htmlRes.buffer.length === 0) {
    throw new BadRequestException(
      'Could not load that product page. You can upload product photos directly instead.',
    );
  }

  const html = htmlRes.buffer.toString('utf8');

  // Extract product title early so we can score product relevance
  const ld = extractJsonLdProduct(html);
  if (!detectedTitle && ld.title) detectedTitle = ld.title;
  if (!detectedTitle) {
    const ogTitleMatch = html.match(
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    );
    const titleTagMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const rawTitle = ogTitleMatch?.[1] ?? titleTagMatch?.[1] ?? '';
    if (rawTitle.trim()) {
      detectedTitle = decodeHtmlEntities(rawTitle).split('|')[0].trim();
    }
  }

  const structuredCollector = createCandidateCollector(baseUrl);
  for (const img of ld.images) {
    structuredCollector.add(img, { relevanceScore: 10 });
  }

  // Also check explicit embedded gallery JSON / WooCommerce zoom attributes
  const scopedGallery = extractScopedProductGalleryImages(html);
  for (const entry of scopedGallery) {
    structuredCollector.add(entry.url, {
      contextText: entry.alt,
      relevanceScore: entry.boost,
    });
  }

  // If structured product data gave us >= 2 candidates (an actual product gallery),
  // download them and STOP — never pad with random page <img> tags or og:image!
  if (structuredCollector.size() >= 2) {
    const downloaded = await downloadAndDedupeImages(
      structuredCollector.toOrderedUrls(false),
      limit,
      parser,
    );
    if (downloaded.length > 0) {
      return {
        title: (detectedTitle || fallbackTitle()).slice(0, 160),
        sourceUrl: baseUrl.toString(),
        images: downloaded,
      };
    }
  }

  // =========================================================================
  // STAGE 3: Scoped Product-Area HTML <img> Fallback
  // Strips headers, navs, footers, related/recommended blocks & scores relevance
  // =========================================================================
  const fallbackCollector = createCandidateCollector(baseUrl);
  // Seed with any single structured image we found in Stage 2 (highest priority)
  for (const url of structuredCollector.toOrderedUrls(false)) {
    fallbackCollector.add(url, { relevanceScore: 12 });
  }

  const productTokens = extractProductTokens(detectedTitle, baseUrl);
  const mainHtml = stripNonProductHtmlSections(html);
  const imgRegex = /<img\b[^>]*>/gi;
  let imgMatch: RegExpExecArray | null;

  while ((imgMatch = imgRegex.exec(mainHtml)) !== null) {
    const tag = imgMatch[0];
    const alt = decodeHtmlEntities(
      tag.match(/\balt=["']([^"']*)["']/i)?.[1] ?? '',
    );
    const className = tag.match(/\bclass=["']([^"']*)["']/i)?.[1] ?? '';
    const htmlW = Number(tag.match(/\bwidth=["']?(\d+)/i)?.[1] ?? 0);
    const htmlH = Number(tag.match(/\bheight=["']?(\d+)/i)?.[1] ?? 0);

    const srcsetRaw = tag.match(/\b(?:data-)?srcset=["']([^"']+)["']/i)?.[1];
    const bestSrcset = srcsetRaw ? pickBestFromSrcset(srcsetRaw) : null;
    const zoomSrc = tag.match(
      /\bdata-(?:zoom-image|large_image|full-src|original|src)=["']([^"']+)["']/i,
    )?.[1];
    const srcAttr = tag.match(/\bsrc=["']([^"']+)["']/i)?.[1];

    // Skip explicitly tiny <img> elements (swatches, icons, avatars) unless they carry a zoom/high-res source
    if (
      !zoomSrc &&
      (!bestSrcset || bestSrcset.width < 500) &&
      ((htmlW > 0 && htmlW < 180) || (htmlH > 0 && htmlH < 180))
    ) {
      continue;
    }

    const bestUrl = bestSrcset?.url || zoomSrc || srcAttr;
    if (!bestUrl) continue;

    // Score product relevance so only genuine product images are kept
    let score = 0;
    const lowerUrl = bestUrl.toLowerCase();
    const lowerMeta = `${alt} ${className}`.toLowerCase();

    if (zoomSrc) score += 5;
    if (
      /(?:product|gallery|pdp|item-image|media-image|carousel|slider-main|slide)/i.test(
        className,
      )
    ) {
      score += 4;
    }
    if (
      /\/(?:products?|catalog\/product|media\/catalog|cdn\/shop\/(?:products|files))\//i.test(
        lowerUrl,
      )
    ) {
      score += 4;
    }
    if (bestSrcset && bestSrcset.width >= 800) {
      score += 2;
    }
    if (productTokens.length > 0) {
      const matchedTokens = productTokens.filter(
        (tok) => lowerUrl.includes(tok) || lowerMeta.includes(tok),
      ).length;
      if (matchedTokens >= 2) score += 6;
      else if (matchedTokens === 1) score += 3;
    }
    if (
      /\/(?:collections?|banners?|blog|articles?|pages?|editorial|lookbook|avatars?|reviews?|icons?|badges?)\//i.test(
        lowerUrl,
      )
    ) {
      score -= 6;
    }

    // Require positive product-relevance signal when scraping generic <img> tags
    if (score < 2) continue;

    fallbackCollector.add(bestUrl, {
      contextText: `${alt} ${className}`,
      relevanceScore: score,
    });
  }

  // STAGE 4: og:image / twitter:image ONLY if we still have zero candidates
  if (fallbackCollector.size() === 0) {
    const metaRegex =
      /<meta[^>]+(?:property|name)=["'](?:og:image|og:image:secure_url|twitter:image)["'][^>]+content=["']([^"']+)["']/gi;
    let mMatch: RegExpExecArray | null;
    while ((mMatch = metaRegex.exec(html)) !== null) {
      fallbackCollector.add(mMatch[1], { relevanceScore: 1 });
    }
  }

  const finalCandidateUrls = fallbackCollector.toOrderedUrls(true);
  if (finalCandidateUrls.length === 0) {
    throw new BadRequestException(
      'No product images were found at that URL. You can upload photos directly instead.',
    );
  }

  const downloaded = await downloadAndDedupeImages(
    finalCandidateUrls,
    limit,
    parser,
  );
  if (downloaded.length === 0) {
    throw new BadRequestException(
      'Could not download usable product images from that URL. Try uploading photos directly.',
    );
  }

  return {
    title: (detectedTitle || fallbackTitle()).slice(0, 160),
    sourceUrl: baseUrl.toString(),
    images: downloaded,
  };
};
