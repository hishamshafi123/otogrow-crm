import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { z } from 'zod';
import { type DeliverableAssetKind } from 'src/modules/delivery/deliverables/entities/delivery-deliverable.entity';
import { type DriveFolderMode } from 'src/modules/delivery/deliverables/entities/delivery-drive-connection.entity';

const MONTH_NAMES = [
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
] as const;

const MONTH_SHORT_NAMES = [
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
] as const;

export const MONTH_FOLDER_PRESETS = [
  { pattern: '{Month} {YYYY}', example: 'November 2026' },
  { pattern: '{YYYY}-{MM}', example: '2026-11' },
  { pattern: '{YYYY}-{MM} - {Month} {YYYY}', example: '2026-11 - November 2026' },
  { pattern: '{Mon} {YYYY}', example: 'Nov 2026' },
  { pattern: '{Month} {YY}', example: 'November 26' },
] as const;

export const MONTH_KEY_REGEX = /^(?!0000)[0-9]{4}-(0[1-9]|1[0-2])$/;

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuidString = (value: unknown): value is string =>
  typeof value === 'string' && UUID_REGEX.test(value);

export const DELIVERABLE_MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024; // 2 GiB

export const ALLOWED_DELIVERABLE_MIMES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
]);

export const formatDriveMonthFolder = (
  monthKey: string,
  pattern = '{Month} {YYYY}',
): string => {
  if (!MONTH_KEY_REGEX.test(monthKey) || monthKey.startsWith('0000')) {
    throw new Error(`Invalid month key "${monthKey}". Expected YYYY-MM.`);
  }
  const [yearStr, monthStr] = monthKey.split('-');
  const monthIndex = Number(monthStr) - 1;
  const monthName = MONTH_NAMES[monthIndex];
  const monthShort = MONTH_SHORT_NAMES[monthIndex];
  const rawPattern = pattern.trim() || '{Month} {YYYY}';
  const formatted = rawPattern
    .replace(/\{YYYY\}/g, yearStr)
    .replace(/\{YY\}/g, yearStr.slice(-2))
    .replace(/\{MM\}/g, monthStr)
    .replace(/\{M\}/g, String(monthIndex + 1))
    .replace(/\{Month\}/g, monthName)
    .replace(/\{Mon\}/g, monthShort);

  const sanitized = formatted
    .replace(/[/\\:*?"<>|\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

  if (!sanitized || sanitized === '.' || sanitized === '..') {
    return `${monthName} ${yearStr}`;
  }
  return sanitized;
};

export const validateMonthFolderPattern = (pattern: string): string => {
  const trimmed = pattern.trim();
  if (!trimmed || trimmed.length > 80) {
    throw new Error('Month folder format must be 1 to 80 characters.');
  }
  if (/[/\\:*?"<>|\u0000-\u001f\u007f]/.test(trimmed)) {
    throw new Error(
      'Month folder format cannot include slashes or control characters.',
    );
  }
  // Ensure the pattern actually varies by month so two months never collide.
  const jan = formatDriveMonthFolder('2026-01', trimmed);
  const feb = formatDriveMonthFolder('2026-02', trimmed);
  const nextYear = formatDriveMonthFolder('2027-01', trimmed);
  if (jan === feb || jan === nextYear) {
    throw new Error(
      'Month folder format must include both a month token ({Month}, {Mon}, {MM}, or {M}) and a year token ({YYYY} or {YY}).',
    );
  }
  return trimmed;
};

export type ClientBillingCycleInfo = {
  monthStartDay: number;
  cycleMonthKey: string;
  startYear: number;
  startMonth: number;
  startDay: number;
  endYear: number;
  endMonth: number;
  endDay: number;
  cycleLabel: string;
};

const daysInUtcMonth = (year: number, month1Based: number): number =>
  new Date(Date.UTC(year, month1Based, 0)).getUTCDate();

export const resolveClientBillingCycle = (
  monthStartDay?: number | null,
  referenceDate: Date = new Date(),
): ClientBillingCycleInfo => {
  const clampedStartDay = Math.min(
    31,
    Math.max(1, Math.round(Number(monthStartDay) || 1)),
  );
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth() + 1;
  const day = referenceDate.getUTCDate();

  const currentMonthStartDay = Math.min(
    clampedStartDay,
    daysInUtcMonth(year, month),
  );

  let startYear = year;
  let startMonth = month;
  let startDay = currentMonthStartDay;

  if (day < currentMonthStartDay) {
    startYear = month === 1 ? year - 1 : year;
    startMonth = month === 1 ? 12 : month - 1;
    startDay = Math.min(
      clampedStartDay,
      daysInUtcMonth(startYear, startMonth),
    );
  }

  const nextStartYear = startMonth === 12 ? startYear + 1 : startYear;
  const nextStartMonth = startMonth === 12 ? 1 : startMonth + 1;
  const nextStartDay = Math.min(
    clampedStartDay,
    daysInUtcMonth(nextStartYear, nextStartMonth),
  );
  const endDate = new Date(
    Date.UTC(nextStartYear, nextStartMonth - 1, nextStartDay) - 86_400_000,
  );
  const endYear = endDate.getUTCFullYear();
  const endMonth = endDate.getUTCMonth() + 1;
  const endDay = endDate.getUTCDate();

  const cycleMonthKey = `${startYear}-${String(startMonth).padStart(2, '0')}`;
  const startLabel = `${MONTH_SHORT_NAMES[startMonth - 1]} ${startDay}`;
  const endLabel = `${MONTH_SHORT_NAMES[endMonth - 1]} ${endDay}`;
  const cycleLabel =
    startYear === endYear
      ? `${startLabel} – ${endLabel}, ${startYear}`
      : `${startLabel}, ${startYear} – ${endLabel}, ${endYear}`;

  return {
    monthStartDay: clampedStartDay,
    cycleMonthKey,
    startYear,
    startMonth,
    startDay,
    endYear,
    endMonth,
    endDay,
    cycleLabel,
  };
};

type MonthMention = { month: number; index: number };

const findMonthNameMentions = (lowerName: string): MonthMention[] => {
  const mentions: MonthMention[] = [];
  for (let i = 0; i < 12; i += 1) {
    const full = MONTH_NAMES[i].toLowerCase();
    const short = MONTH_SHORT_NAMES[i].toLowerCase();
    const regex = new RegExp(`\\b(?:${full}|${short})\\b`, 'g');
    let match: RegExpExecArray | null = regex.exec(lowerName);
    while (match) {
      mentions.push({ month: i + 1, index: match.index });
      match = regex.exec(lowerName);
    }
  }
  return mentions.sort((a, b) => a.index - b.index);
};

export const matchExistingMonthSubfolder = <
  T extends { id: string; name: string },
>(
  subfolders: T[],
  params: {
    monthKey: string;
    expectedName: string;
    monthStartDay?: number | null;
  },
): T | null => {
  if (!subfolders.length || !MONTH_KEY_REGEX.test(params.monthKey)) {
    return null;
  }

  const [yearStr, monthStr] = params.monthKey.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const yy = yearStr.slice(-2);
  const monthFull = MONTH_NAMES[month - 1].toLowerCase();
  const monthShort = MONTH_SHORT_NAMES[month - 1].toLowerCase();
  const startDay = Math.min(
    31,
    Math.max(1, Math.round(Number(params.monthStartDay) || 1)),
  );
  const effectiveStartDay = Math.min(startDay, daysInUtcMonth(year, month));
  const cycle = resolveClientBillingCycle(
    startDay,
    new Date(Date.UTC(year, month - 1, effectiveStartDay)),
  );
  const endMonthFull = MONTH_NAMES[cycle.endMonth - 1].toLowerCase();
  const endMonthShort = MONTH_SHORT_NAMES[cycle.endMonth - 1].toLowerCase();
  const allowedYears = new Set<number>([year, cycle.endYear]);
  const expectedLower = params.expectedName.trim().toLowerCase();

  const startDayStr = String(effectiveStartDay);
  const startDayPad = startDayStr.padStart(2, '0');
  const endDayStr = String(cycle.endDay);
  const endDayPad = endDayStr.padStart(2, '0');
  const endMonthPad = String(cycle.endMonth).padStart(2, '0');

  const startMonthWord = `(?:${monthFull}|${monthShort})`;
  const endMonthWord = `(?:${endMonthFull}|${endMonthShort})`;

  const startMonthDayRegex = new RegExp(
    `(?:\\b${startMonthWord}\\.?\\s+0?${effectiveStartDay}(?:st|nd|rd|th)?\\b|\\b0?${effectiveStartDay}(?:st|nd|rd|th)?\\s+${startMonthWord}\\.?\\b|\\b${yearStr}[-_/.]${monthStr}[-_/.]${startDayPad}\\b|\\b${monthStr}[-/.]${startDayPad}\\b|\\b${startDayPad}[-/.]${monthStr}\\b)`,
    'i',
  );
  const endMonthDayRegex = new RegExp(
    `(?:\\b${endMonthWord}\\.?\\s+0?${cycle.endDay}(?:st|nd|rd|th)?\\b|\\b0?${cycle.endDay}(?:st|nd|rd|th)?\\s+${endMonthWord}\\.?\\b|\\b${cycle.endYear}[-_/.]${endMonthPad}[-_/.]${endDayPad}\\b|\\b${endMonthPad}[-/.]${endDayPad}\\b|\\b${endDayPad}[-/.]${endMonthPad}\\b)`,
    'i',
  );
  const numericYearMonthRegex = new RegExp(
    `(?:\\b${yearStr}[-_/. ]${monthStr}\\b|\\b${monthStr}[-_/. ]${yearStr}\\b)`,
  );
  const hasShortYearRegex = new RegExp(`(?:'${yy}\\b|\\b${yy}\\b)`);

  let best: { folder: T; score: number } | null = null;

  for (const folder of subfolders) {
    const rawName = folder.name.trim();
    if (!rawName) continue;
    const lower = rawName.toLowerCase();

    // 1. Exact case-insensitive match to expected folder pattern
    if (expectedLower && lower === expectedLower) {
      return folder;
    }

    // Reject folders explicitly tagged with a different 4-digit year
    const explicitYears = Array.from(lower.matchAll(/\b((?:19|20)\d{2})\b/g)).map(
      (m) => Number(m[1]),
    );
    if (
      explicitYears.length > 0 &&
      !explicitYears.some((y) => allowedYears.has(y))
    ) {
      continue;
    }
    const hasMatchingFullYear = explicitYears.includes(year);

    const mentions = findMonthNameMentions(lower);
    const firstMentionedMonth = mentions[0]?.month ?? null;
    const mentionsTargetMonth = mentions.some((m) => m.month === month);

    // If a folder lists a month range (e.g. "Oct 15 - Nov 14"), only treat it as
    // matching its STARTING month (Oct), never the trailing end month (Nov).
    if (
      mentions.length >= 2 &&
      firstMentionedMonth !== null &&
      firstMentionedMonth !== month
    ) {
      continue;
    }

    let score = 0;

    // 2. Date-range or explicit start-day match (critical for custom month start days)
    if (startDay > 1 && startMonthDayRegex.test(lower)) {
      const hasEndMatch = endMonthDayRegex.test(lower);
      score = hasEndMatch
        ? hasMatchingFullYear
          ? 98
          : 95
        : hasMatchingFullYear
          ? 92
          : 88;
    }

    // 3. Explicit YYYY-MM or MM-YYYY match
    if (score < 85 && numericYearMonthRegex.test(lower)) {
      score = 85;
    }

    // 4. Month name + matching year (4-digit or 2-digit)
    if (
      score < 80 &&
      mentionsTargetMonth &&
      (hasMatchingFullYear || hasShortYearRegex.test(lower))
    ) {
      score = hasMatchingFullYear ? 82 : 76;
    }

    // 5. Unambiguous month name without year (and no conflicting year)
    if (score < 55 && mentionsTargetMonth && explicitYears.length === 0) {
      score = 55;
    }

    if (score > 0 && (!best || score > best.score)) {
      best = { folder, score };
    }
  }

  return best?.folder ?? null;
};

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const generateClientAccessCode = (): string => {
  const bytes = randomBytes(8);
  const chars: string[] = [];
  for (let i = 0; i < 8; i += 1) {
    chars.push(CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]);
  }
  return `OTO-${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}`;
};

export const normalizeClientAccessCode = (code: string): string =>
  code.trim().toUpperCase().replace(/\s+/g, '');

export const maskClientAccessCode = (code: string): string => {
  const normalized = normalizeClientAccessCode(code);
  if (normalized.length <= 4) return '••••';
  return `${'•'.repeat(Math.max(4, normalized.length - 4))}${normalized.slice(-4)}`;
};

export const validateCustomAccessCode = (code: string): string => {
  const normalized = normalizeClientAccessCode(code);
  if (normalized.length < 6 || normalized.length > 32) {
    throw new Error('Access code must be 6 to 32 characters long.');
  }
  if (!/^[A-Z0-9_-]+$/.test(normalized)) {
    throw new Error(
      'Access code may only contain letters, numbers, hyphens, and underscores.',
    );
  }
  return normalized;
};

export const hashClientAccessCode = (code: string, pepper = ''): string => {
  const normalized = normalizeClientAccessCode(code);
  if (pepper) {
    return createHmac('sha256', `otogrow-portal-code:${pepper}`)
      .update(normalized, 'utf8')
      .digest('hex');
  }
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
};

export const verifyClientAccessCodeHash = (
  providedCode: string,
  expectedHashHex: string,
  pepper = '',
): boolean => {
  const providedHash = Buffer.from(
    hashClientAccessCode(providedCode, pepper),
    'hex',
  );
  const expectedHash = Buffer.from(expectedHashHex, 'hex');
  if (
    providedHash.length === 0 ||
    providedHash.length !== expectedHash.length
  ) {
    return false;
  }
  return timingSafeEqual(providedHash, expectedHash);
};

export const buildPortalSlug = (
  companyName: string,
  fallbackId: string,
): string => {
  const base = companyName
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base || `client-${fallbackId.slice(0, 8)}`;
};

export const validatePortalSlug = (slug: string): string => {
  const normalized = slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (normalized.length < 2 || normalized.length > 64) {
    throw new Error(
      'Portal URL slug must be 2 to 64 lowercase letters, numbers, or hyphens.',
    );
  }
  return normalized;
};

export const normalizeServiceScope = (
  serviceKey: string,
  folderMode: DriveFolderMode,
): string => {
  if (folderMode === 'FLAT') {
    return 'ALL';
  }
  const normalized = serviceKey
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'general';
};

export const extensionForMime = (mimeType: string | null | undefined): string => {
  switch (mimeType) {
    case 'video/mp4':
      return 'mp4';
    case 'video/quicktime':
      return 'mov';
    case 'video/webm':
      return 'webm';
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'application/pdf':
      return 'pdf';
    default:
      return 'bin';
  }
};

export const assetKindForMime = (mimeType: string): DeliverableAssetKind => {
  if (mimeType.startsWith('video/')) return 'VIDEO';
  if (mimeType.startsWith('image/')) return 'IMAGE';
  return 'DOCUMENT';
};

export const formatDriveDeliverableFilename = (
  sequenceNumber: number,
  mimeType: string | null | undefined,
): string => `${sequenceNumber}.${extensionForMime(mimeType)}`;

export const formatDriveVariationFilename = (
  variationNumber: number,
  mimeType: string | null | undefined = 'video/mp4',
): string => `v${variationNumber}.${extensionForMime(mimeType)}`;

export type ByteRange = {
  start: number;
  end: number;
  chunkLength: number;
};

export const parseByteRangeHeader = (
  rangeHeader: string | undefined,
  totalSize: number,
): ByteRange | 'INVALID' | null => {
  if (!rangeHeader || totalSize <= 0) return null;
  const trimmed = rangeHeader.trim();
  if (!trimmed.startsWith('bytes=')) return 'INVALID';
  const spec = trimmed.slice('bytes='.length).split(',')[0]?.trim();
  if (!spec) return 'INVALID';
  const dashIndex = spec.indexOf('-');
  if (dashIndex === -1) return 'INVALID';

  const startStr = spec.slice(0, dashIndex).trim();
  const endStr = spec.slice(dashIndex + 1).trim();

  let start: number;
  let end: number;

  if (startStr === '') {
    // Suffix byte range: bytes=-500
    const suffixLength = Number(endStr);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) {
      return 'INVALID';
    }
    start = Math.max(totalSize - suffixLength, 0);
    end = totalSize - 1;
  } else {
    start = Number(startStr);
    end = endStr === '' ? totalSize - 1 : Number(endStr);
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      start >= totalSize ||
      end < start
    ) {
      return 'INVALID';
    }
    if (end >= totalSize) {
      end = totalSize - 1;
    }
  }

  return {
    start,
    end,
    chunkLength: end - start + 1,
  };
};

export const currentMonthKey = (now = new Date()): string =>
  `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

export const deliverableListFilterSchema = z
  .object({
    companyId: z.uuid().optional(),
    monthKey: z.string().regex(MONTH_KEY_REGEX).optional(),
    serviceKey: z.string().trim().max(100).optional(),
    assetKind: z.enum(['VIDEO', 'IMAGE', 'DOCUMENT', 'LINK']).optional(),
    status: z
      .enum([
        'DRAFT',
        'PENDING_REVIEW',
        'APPROVED',
        'CHANGES_REQUESTED',
        'ARCHIVED',
      ])
      .optional(),
    clientVisibility: z.enum(['INTERNAL', 'PUBLISHED']).optional(),
    search: z.string().trim().max(120).optional(),
    includeArchived: z.boolean().optional(),
    limit: z.number().int().min(1).max(500).optional(),
  })
  .strict();

export const createLinkDeliverableSchema = z
  .object({
    companyId: z.uuid(),
    projectId: z.uuid().nullable().optional(),
    engagementId: z.uuid().nullable().optional(),
    serviceKey: z.string().trim().min(1).max(100),
    monthKey: z.string().regex(MONTH_KEY_REGEX),
    sequenceNumber: z.number().int().positive().max(9999).optional(),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(4000).optional(),
    externalUrl: z
      .string()
      .trim()
      .url()
      .max(2000)
      .refine((url) => /^https?:\/\//i.test(url), 'Use an HTTP or HTTPS URL.'),
    publishImmediately: z.boolean().optional(),
    linkedTaskId: z.uuid().nullable().optional(),
  })
  .strict();

export const updateDeliverableSchema = z
  .object({
    id: z.uuid(),
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(4000).optional(),
    serviceKey: z.string().trim().min(1).max(100).optional(),
    monthKey: z.string().regex(MONTH_KEY_REGEX).optional(),
    sequenceNumber: z.number().int().positive().max(9999).optional(),
    status: z
      .enum([
        'DRAFT',
        'PENDING_REVIEW',
        'APPROVED',
        'CHANGES_REQUESTED',
        'ARCHIVED',
      ])
      .optional(),
    clientVisibility: z.enum(['INTERNAL', 'PUBLISHED']).optional(),
    linkedTaskId: z.uuid().nullable().optional(),
  })
  .strict();

export const reviewDeliverableSchema = z
  .object({
    deliverableId: z.uuid(),
    variationId: z.uuid().nullable().optional(),
    decision: z.enum(['COMMENT', 'APPROVED', 'CHANGES_REQUESTED']),
    comment: z.string().trim().max(4000).optional(),
    timestampSec: z.number().min(0).max(86400).nullable().optional(),
  })
  .strict();

export const managePortalAccessSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('generate'),
      companyId: z.uuid(),
      companyName: z.string().trim().min(1).max(200).optional(),
      expiresAt: z.iso.datetime().nullable().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('setCustom'),
      companyId: z.uuid(),
      companyName: z.string().trim().min(1).max(200).optional(),
      code: z.string().trim().min(6).max(32),
      expiresAt: z.iso.datetime().nullable().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('updateSettings'),
      companyId: z.uuid(),
      slug: z.string().trim().min(2).max(64).optional(),
      expiresAt: z.iso.datetime().nullable().optional(),
      welcomeNote: z.string().trim().max(1000).optional(),
      brandAccentColor: z
        .string()
        .trim()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .nullable()
        .optional(),
      showDriveLinks: z.boolean().optional(),
      visibleServiceOverrides: z.record(z.string(), z.boolean()).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('revoke'),
      companyId: z.uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal('restore'),
      companyId: z.uuid(),
    })
    .strict(),
]);

export type DeliverableMediaTokenKind =
  | 'deliverable'
  | 'thumbnail'
  | 'variation'
  | 'variation-thumbnail';

export type DeliverableMediaTokenPayload = {
  w: string;
  t: DeliverableMediaTokenKind;
  id: string;
  exp: number;
};

export const signDeliverableMediaToken = (
  secret: string,
  payload: Omit<DeliverableMediaTokenPayload, 'exp'>,
  ttlMs = 2 * 60 * 60 * 1000,
): string => {
  const fullPayload: DeliverableMediaTokenPayload = {
    ...payload,
    exp: Date.now() + ttlMs,
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString(
    'base64url',
  );
  const sig = createHmac('sha256', `otogrow-media-token:${secret}`)
    .update(encoded, 'utf8')
    .digest('base64url');
  return `v1.${encoded}.${sig}`;
};

export const verifyDeliverableMediaToken = (
  secret: string,
  token: string | undefined,
  expectedKind: DeliverableMediaTokenKind,
  expectedId: string,
): DeliverableMediaTokenPayload | null => {
  if (!token || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return null;
  const [, encoded, sig] = parts;
  if (!encoded || !sig) return null;
  const expectedSig = createHmac('sha256', `otogrow-media-token:${secret}`)
    .update(encoded, 'utf8')
    .digest();
  let providedSig: Buffer;
  try {
    providedSig = Buffer.from(sig, 'base64url');
  } catch {
    return null;
  }
  if (
    providedSig.length !== expectedSig.length ||
    !timingSafeEqual(providedSig, expectedSig)
  ) {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    ) as Partial<DeliverableMediaTokenPayload>;
    if (
      typeof parsed.w !== 'string' ||
      parsed.t !== expectedKind ||
      parsed.id !== expectedId ||
      typeof parsed.exp !== 'number' ||
      parsed.exp < Date.now()
    ) {
      return null;
    }
    return parsed as DeliverableMediaTokenPayload;
  } catch {
    return null;
  }
};

export type DriveOAuthStatePayload = {
  w: string;
  m: string;
  uw: string;
  ret: string;
  exp: number;
};

export const sanitizeSafeReturnPath = (value: string | undefined): string => {
  if (!value) return '/delivery?view=deliverables';
  const trimmed = value.trim();
  if (
    !trimmed.startsWith('/') ||
    trimmed.startsWith('//') ||
    trimmed.includes('\\') ||
    trimmed.includes('#') ||
    trimmed.includes('://') ||
    /[\u0000-\u001f\u007f]/.test(trimmed)
  ) {
    return '/delivery?view=deliverables';
  }
  return trimmed.slice(0, 300);
};

export const signDriveOAuthState = (
  secret: string,
  payload: Omit<DriveOAuthStatePayload, 'exp'>,
  ttlMs = 15 * 60 * 1000,
): string => {
  const fullPayload: DriveOAuthStatePayload = {
    ...payload,
    ret: sanitizeSafeReturnPath(payload.ret),
    exp: Date.now() + ttlMs,
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString(
    'base64url',
  );
  const sig = createHmac('sha256', `otogrow-drive-oauth:${secret}`)
    .update(encoded, 'utf8')
    .digest('base64url');
  return `d1.${encoded}.${sig}`;
};

export const verifyDriveOAuthState = (
  secret: string,
  state: string | undefined,
): DriveOAuthStatePayload | null => {
  if (!secret || !state) return null;
  const parts = state.split('.');
  if (parts.length !== 3 || parts[0] !== 'd1') return null;
  const [, encoded, sig] = parts;
  if (!encoded || !sig) return null;
  const expectedSig = createHmac('sha256', `otogrow-drive-oauth:${secret}`)
    .update(encoded, 'utf8')
    .digest();
  let providedSig: Buffer;
  try {
    providedSig = Buffer.from(sig, 'base64url');
  } catch {
    return null;
  }
  if (
    providedSig.length !== expectedSig.length ||
    !timingSafeEqual(providedSig, expectedSig)
  ) {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    ) as Partial<DriveOAuthStatePayload>;
    if (
      !isUuidString(parsed.w) ||
      !isUuidString(parsed.m) ||
      !isUuidString(parsed.uw) ||
      typeof parsed.exp !== 'number' ||
      parsed.exp < Date.now()
    ) {
      return null;
    }
    return {
      w: parsed.w,
      m: parsed.m,
      uw: parsed.uw,
      ret: sanitizeSafeReturnPath(parsed.ret),
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
};

export const updateDriveSettingsSchema = z
  .object({
    rootFolderId: z.string().trim().min(1).max(200).nullable().optional(),
    rootFolderName: z.string().trim().min(1).max(200).nullable().optional(),
    monthFolderPattern: z.string().trim().min(1).max(80).optional(),
    folderMode: z.enum(['FLAT', 'SERVICE_SPLIT']).optional(),
    includeOriginalInVariationFolder: z.boolean().optional(),
    autoPurgeVpsEnabled: z.boolean().optional(),
    autoPurgeVpsAfterHours: z.number().int().min(1).max(720).optional(),
  })
  .strict();

export const bindClientDriveFolderSchema = z
  .object({
    companyId: z.uuid(),
    companyName: z.string().trim().min(1).max(200).optional(),
    autoCreate: z.boolean().optional(),
    rootFolderId: z.string().trim().min(1).max(200).optional(),
    rootFolderName: z.string().trim().min(1).max(200).optional(),
    monthStartDay: z.number().int().min(1).max(31).nullable().optional(),
    monthFolderPatternOverride: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .nullable()
      .optional(),
  })
  .strict();

export const CLIENT_PORTAL_V2_COOKIE_NAME = 'otogrow_client_portal_v2';

export type ClientPortalV2SessionPayload = {
  v: 1;
  aid: string;
  cid: string;
  wid: string;
  rot: string;
  exp: number;
  name?: string;
};

export const signClientPortalV2Session = (
  secret: string,
  payload: Omit<ClientPortalV2SessionPayload, 'v' | 'exp'> & {
    ttlMs?: number;
  },
): string => {
  const fullPayload: ClientPortalV2SessionPayload = {
    v: 1,
    aid: payload.aid,
    cid: payload.cid,
    wid: payload.wid,
    rot: payload.rot,
    exp: Date.now() + (payload.ttlMs ?? 7 * 24 * 60 * 60 * 1000),
    ...(payload.name ? { name: payload.name.slice(0, 80) } : {}),
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString(
    'base64url',
  );
  const sig = createHmac('sha256', `otogrow-client-portal-v2:${secret}`)
    .update(encoded, 'utf8')
    .digest('base64url');
  return `cp2.${encoded}.${sig}`;
};

export const verifyClientPortalV2Session = (
  secret: string,
  token: string | undefined,
): ClientPortalV2SessionPayload | null => {
  if (!secret || !token) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'cp2') return null;
  const [, encoded, sig] = parts;
  if (!encoded || !sig) return null;
  const expectedSig = createHmac('sha256', `otogrow-client-portal-v2:${secret}`)
    .update(encoded, 'utf8')
    .digest();
  let providedSig: Buffer;
  try {
    providedSig = Buffer.from(sig, 'base64url');
  } catch {
    return null;
  }
  if (
    providedSig.length !== expectedSig.length ||
    !timingSafeEqual(providedSig, expectedSig)
  ) {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    ) as Partial<ClientPortalV2SessionPayload>;
    if (
      parsed.v !== 1 ||
      !isUuidString(parsed.aid) ||
      !isUuidString(parsed.cid) ||
      !isUuidString(parsed.wid) ||
      typeof parsed.rot !== 'string' ||
      !parsed.rot ||
      typeof parsed.exp !== 'number' ||
      parsed.exp <= Date.now()
    ) {
      return null;
    }
    return {
      v: 1,
      aid: parsed.aid,
      cid: parsed.cid,
      wid: parsed.wid,
      rot: parsed.rot,
      exp: parsed.exp,
      ...(typeof parsed.name === 'string' && parsed.name.trim()
        ? { name: parsed.name.trim().slice(0, 80) }
        : {}),
    };
  } catch {
    return null;
  }
};

export const clientPortalAuthenticateSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9-]+$/i)
      .optional(),
    accessCode: z.string().trim().min(4).max(40),
    stakeholderName: z.string().trim().max(80).optional(),
  })
  .strict();

export const clientPortalReviewSchema = z
  .object({
    decision: z.enum(['APPROVED', 'CHANGES_REQUESTED', 'COMMENT']),
    comment: z.string().trim().max(4000).default(''),
    authorName: z.string().trim().min(1).max(80).optional(),
    variationId: z.uuid().nullable().optional(),
    timestampSec: z.number().min(0).max(86400).nullable().optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (
      (val.decision === 'CHANGES_REQUESTED' || val.decision === 'COMMENT') &&
      !val.comment.trim()
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Add a note when requesting changes or leaving a comment.',
      });
    }
  });

const SOCIAL_METRIC_PLATFORMS = [
  'INSTAGRAM',
  'TIKTOK',
  'FACEBOOK',
  'X',
  'YOUTUBE',
  'LINKEDIN',
  'ALL',
] as const;

export const contentMetricSnapshotFilterSchema = z
  .object({
    companyId: z.uuid().optional(),
    monthKey: z.string().regex(MONTH_KEY_REGEX).optional(),
    platform: z.enum(SOCIAL_METRIC_PLATFORMS).optional(),
  })
  .strict()
  .optional();

export const upsertContentMetricSnapshotSchema = z
  .object({
    id: z.uuid().optional(),
    companyId: z.uuid(),
    projectId: z.uuid().nullable().optional(),
    contentVariantId: z.uuid().nullable().optional(),
    monthKey: z.string().regex(MONTH_KEY_REGEX),
    platform: z.enum(SOCIAL_METRIC_PLATFORMS),
    postTitle: z.string().trim().max(240).nullable().optional(),
    postUrl: z
      .string()
      .trim()
      .max(1000)
      .refine(
        (v) => {
          if (!v) return true;
          try {
            const parsed = new URL(v);
            return parsed.protocol === 'https:' || parsed.protocol === 'http:';
          } catch {
            return false;
          }
        },
        { message: 'Post URL must start with http:// or https://.' },
      )
      .nullable()
      .optional(),
    views: z.coerce.number().int().min(0).max(2_000_000_000).default(0),
    impressions: z.coerce.number().int().min(0).max(2_000_000_000).default(0),
    reach: z.coerce.number().int().min(0).max(2_000_000_000).default(0),
    likes: z.coerce.number().int().min(0).max(2_000_000_000).default(0),
    comments: z.coerce.number().int().min(0).max(2_000_000_000).default(0),
    shares: z.coerce.number().int().min(0).max(2_000_000_000).default(0),
    saves: z.coerce.number().int().min(0).max(2_000_000_000).default(0),
    clicks: z.coerce.number().int().min(0).max(2_000_000_000).default(0),
    followerDelta: z.coerce
      .number()
      .int()
      .min(-100_000_000)
      .max(100_000_000)
      .default(0),
    observedAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();
