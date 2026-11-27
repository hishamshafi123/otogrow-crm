import { BadRequestException } from '@nestjs/common';
import { FileTypeParser } from 'file-type';
import * as dns from 'node:dns/promises';
import * as net from 'node:net';
import { STUDIO_ALLOWED_IMAGE_MIMES } from 'src/modules/delivery/studio/delivery-studio.policy';

const FETCH_TIMEOUT_MS = 12_000;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MIN_IMAGE_BYTES = 4_000; // Skip tiny tracking pixels & 16px icons
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export type ScrapedProductImage = {
  url: string;
  buffer: Buffer;
  mimeType: string;
  fileName: string;
};

export type ScrapedProductResult = {
  title: string;
  sourceUrl: string;
  images: ScrapedProductImage[];
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

const isLikelyNonProductImageUrl = (rawUrl: string): boolean => {
  const lower = rawUrl.toLowerCase();
  if (lower.startsWith('data:')) return true;
  if (/\.(svg|ico|gif)(\?|$)/i.test(lower)) return true;
  const blockedFragments = [
    'logo',
    'favicon',
    'sprite',
    'avatar',
    'badge',
    'payment',
    'visa',
    'mastercard',
    'amex',
    'paypal',
    'klarna',
    'afterpay',
    'trustpilot',
    'flag',
    'icon',
    'spinner',
    'loader',
    'pixel',
    'analytics',
    'facebook.com/tr',
    'doubleclick',
  ];
  return blockedFragments.some((frag) => lower.includes(frag));
};

const normalizeCandidateImageUrl = (
  raw: string,
  baseUrl: URL,
): string | null => {
  const cleaned = raw
    .trim()
    .replace(/&amp;/g, '&')
    .replace(/^['"]|['"]$/g, '');
  if (!cleaned || cleaned.startsWith('data:')) return null;
  try {
    const resolved = new URL(
      cleaned.startsWith('//') ? `${baseUrl.protocol}${cleaned}` : cleaned,
      baseUrl,
    );
    if (resolved.protocol !== 'https:' && resolved.protocol !== 'http:') {
      return null;
    }
    // Upgrade Shopify tiny thumbnail URLs like _100x100.jpg or ?width=120 to high-res
    let href = resolved.toString();
    href = href.replace(/_(\d+x\d*|small|compact|medium|thumb)\.(jpg|jpeg|png|webp)/i, '.$2');
    if (resolved.searchParams.has('width')) {
      const w = Number(resolved.searchParams.get('width'));
      if (!Number.isNaN(w) && w > 0 && w < 800) {
        resolved.searchParams.set('width', '1400');
        href = resolved.toString();
      }
    }
    if (isLikelyNonProductImageUrl(href)) return null;
    return href;
  } catch {
    return null;
  }
};

const dedupeKeyForImageUrl = (href: string): string => {
  try {
    const u = new URL(href);
    return `${u.origin}${u.pathname}`.toLowerCase();
  } catch {
    return href.toLowerCase();
  }
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

const extractJsonLdProduct = (
  html: string,
): { title: string | null; images: string[] } => {
  const images: string[] = [];
  let title: string | null = null;
  const regex =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    const rec = node as Record<string, unknown>;
    const typeVal = rec['@type'];
    const isProduct =
      typeVal === 'Product' ||
      (Array.isArray(typeVal) && typeVal.includes('Product'));
    if (isProduct) {
      if (!title && typeof rec.name === 'string' && rec.name.trim()) {
        title = rec.name.trim();
      }
      const rawImg = rec.image;
      if (typeof rawImg === 'string') {
        images.push(rawImg);
      } else if (Array.isArray(rawImg)) {
        for (const entry of rawImg) {
          if (typeof entry === 'string') images.push(entry);
          else if (
            entry &&
            typeof entry === 'object' &&
            typeof (entry as Record<string, unknown>).url === 'string'
          ) {
            images.push((entry as Record<string, unknown>).url as string);
          }
        }
      } else if (
        rawImg &&
        typeof rawImg === 'object' &&
        typeof (rawImg as Record<string, unknown>).url === 'string'
      ) {
        images.push((rawImg as Record<string, unknown>).url as string);
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

  return { title, images };
};

const pickBestFromSrcset = (srcset: string): string | null => {
  const parts = srcset
    .split(',')
    .map((entry) => entry.trim().split(/\s+/))
    .filter((pair) => pair[0]);
  if (!parts.length) return null;
  let bestUrl = parts[0][0];
  let bestScore = 0;
  for (const [url, descriptor] of parts) {
    const score = descriptor ? Number.parseInt(descriptor, 10) || 1 : 1;
    if (score >= bestScore) {
      bestScore = score;
      bestUrl = url;
    }
  }
  return bestUrl;
};

export const scrapeProductImagesFromUrl = async (
  rawUrl: string,
  maxImages = 6,
): Promise<ScrapedProductResult> => {
  const baseUrl = await assertSafePublicProductUrl(rawUrl);
  const candidateUrls: string[] = [];
  const seenKeys = new Set<string>();
  let detectedTitle: string | null = null;

  const pushCandidate = (raw: string | null | undefined) => {
    if (!raw) return;
    const normalized = normalizeCandidateImageUrl(raw, baseUrl);
    if (!normalized) return;
    const key = dedupeKeyForImageUrl(normalized);
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    candidateUrls.push(normalized);
  };

  // 1) Try Shopify product JSON endpoint first when URL matches /products/<handle>
  if (/\/products\/[^/?#]+/i.test(baseUrl.pathname)) {
    const cleanPath = baseUrl.pathname.replace(/\/$/, '').replace(/\.json$/i, '');
    const shopifyJsonUrl = `${baseUrl.origin}${cleanPath}.json`;
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
            images?: { src?: string }[];
            image?: { src?: string };
          };
        };
        if (parsed.product?.title) {
          detectedTitle = parsed.product.title.trim();
        }
        if (Array.isArray(parsed.product?.images)) {
          for (const img of parsed.product.images) {
            pushCandidate(img?.src);
          }
        }
        if (parsed.product?.image?.src) {
          pushCandidate(parsed.product.image.src);
        }
      } catch {
        // Not Shopify JSON — fall through to HTML extraction
      }
    }
  }

  // 2) Fetch HTML and extract JSON-LD, OpenGraph, and product <img> tags
  if (candidateUrls.length < maxImages) {
    const htmlRes = await fetchWithLimit(
      baseUrl.toString(),
      MAX_HTML_BYTES,
      'text/html,application/xhtml+xml,*/*;q=0.8',
    );
    if (htmlRes.ok && htmlRes.buffer.length > 0) {
      const html = htmlRes.buffer.toString('utf8');

      // JSON-LD Product schema
      const ld = extractJsonLdProduct(html);
      if (!detectedTitle && ld.title) detectedTitle = ld.title;
      for (const img of ld.images) pushCandidate(img);

      // Meta og:title & <title>
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

      // og:image / twitter:image
      const metaRegex =
        /<meta[^>]+(?:property|name)=["'](?:og:image|og:image:secure_url|twitter:image)["'][^>]+content=["']([^"']+)["']/gi;
      let mMatch: RegExpExecArray | null;
      while ((mMatch = metaRegex.exec(html)) !== null) {
        pushCandidate(mMatch[1]);
      }

      // <img> tags (preferring srcset / data-src / src)
      const imgRegex = /<img\b[^>]*>/gi;
      let imgMatch: RegExpExecArray | null;
      while ((imgMatch = imgRegex.exec(html)) !== null) {
        if (candidateUrls.length >= maxImages * 3) break;
        const tag = imgMatch[0];
        const srcsetMatch = tag.match(/\b(?:data-)?srcset=["']([^"']+)["']/i);
        const dataSrcMatch = tag.match(/\bdata-(?:src|original|zoom-image|large_image)=["']([^"']+)["']/i);
        const srcMatch = tag.match(/\bsrc=["']([^"']+)["']/i);
        const best =
          (srcsetMatch?.[1] ? pickBestFromSrcset(srcsetMatch[1]) : null) ||
          dataSrcMatch?.[1] ||
          srcMatch?.[1];
        pushCandidate(best);
      }
    }
  }

  if (candidateUrls.length === 0) {
    throw new BadRequestException(
      'No product images were found at that URL. You can upload photos directly instead.',
    );
  }

  // 3) Download & verify top images (magic-byte check + min size filter)
  const downloaded: ScrapedProductImage[] = [];
  const parser = new FileTypeParser();
  const limit = Math.max(1, Math.min(8, maxImages));

  for (const imgUrl of candidateUrls.slice(0, limit * 2)) {
    if (downloaded.length >= limit) break;
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

    const ext =
      mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    downloaded.push({
      url: imgUrl,
      buffer: res.buffer,
      mimeType: mime,
      fileName: `image-${downloaded.length + 1}.${ext}`,
    });
  }

  if (downloaded.length === 0) {
    throw new BadRequestException(
      'Could not download usable product images from that URL. Try uploading photos directly.',
    );
  }

  const fallbackTitle =
    baseUrl.pathname
      .split('/')
      .filter(Boolean)
      .pop()
      ?.replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase()) || 'Imported Product';

  return {
    title: (detectedTitle || fallbackTitle).slice(0, 160),
    sourceUrl: baseUrl.toString(),
    images: downloaded,
  };
};
