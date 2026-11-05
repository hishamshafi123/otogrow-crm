import { BadRequestException } from '@nestjs/common';
import { Temporal } from 'temporal-polyfill';
import { type z } from 'zod';
import { type OtogrowAccess } from 'src/modules/otogrow-access/otogrow-access.types';
import { canonicalCompetitorSource } from 'src/modules/delivery/competitors/delivery-competitor-source.policy';
import {
  type ContentAccountSave,
  type ContentBody,
  type ContentPlatform,
} from './delivery-content.types';

export const contentManager = (access: Pick<OtogrowAccess, 'capabilities'>) =>
  access.capabilities.some((value) =>
    ['workspace.admin', 'delivery.manage'].includes(value),
  );
export const contentReviewer = (access: Pick<OtogrowAccess, 'capabilities'>) =>
  contentManager(access) || access.capabilities.includes('delivery.review');
export const parseContentInput = <TData>(
  schema: z.ZodType<TData>,
  raw: unknown,
): TData => {
  const parsed = schema.safeParse(raw);
  if (!parsed.success)
    throw new BadRequestException(
      parsed.error.issues[0]?.message ?? 'Check this content item.',
    );
  return parsed.data;
};
const hosts: Record<ContentPlatform, string[]> = {
  X: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'],
  INSTAGRAM: ['instagram.com', 'www.instagram.com'],
  FACEBOOK: ['facebook.com', 'www.facebook.com'],
  TIKTOK: ['tiktok.com', 'www.tiktok.com'],
};
export const contentPublicUrl = (platform: ContentPlatform, value: string) => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BadRequestException('Use the public platform link.');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    !hosts[platform].includes(url.hostname.toLowerCase()) ||
    [...url.searchParams.keys()].some((key) =>
      /token|secret|password|signature|authorization|api.?key|credential|session|^auth$|^key$|^sig$|^u$|redirect/i.test(
        key,
      ),
    )
  )
    throw new BadRequestException(
      'Use a public link from the selected platform without credentials, redirects or fragments.',
    );
  return url;
};
export const validateContentAccount = (input: ContentAccountSave) => {
  const url = contentPublicUrl(input.platform, input.profileUrl);
  const handle = input.handle.replace(/^@/, '').toLowerCase();
  if (input.platform === 'X' || input.platform === 'INSTAGRAM') {
    const profile = canonicalCompetitorSource(input.platform, input.profileUrl);
    if (
      profile.canonicalReference !==
      canonicalCompetitorSource(input.platform, handle).canonicalReference
    )
      throw new BadRequestException(
        'The profile link must match this account handle.',
      );
  } else if (input.platform === 'TIKTOK') {
    if (
      !/^[a-z0-9_.]{1,24}$/.test(handle) ||
      url.pathname.replace(/\/$/, '').toLowerCase() !== `/@${handle}`
    )
      throw new BadRequestException(
        'Use the exact TikTok profile and matching handle.',
      );
  } else if (
    !/^\/[A-Za-z0-9.]+\/?$/.test(url.pathname) ||
    ['login', 'dialog', 'l.php', 'share', 'sharer.php'].includes(
      url.pathname.split('/')[1],
    ) ||
    (url.pathname === '/profile.php'
      ? url.searchParams.get('id') !== handle || !/^\d+$/.test(handle)
      : url.pathname.replace(/^\//, '').replace(/\/$/, '').toLowerCase() !==
        handle)
  )
    throw new BadRequestException(
      'Use the Facebook Page profile and its matching name or numeric profile ID.',
    );
};
export const validateContentTime = (
  body: Pick<ContentBody, 'plannedAt' | 'plannedLocal' | 'timezone'>,
) => {
  try {
    const local = Temporal.PlainDateTime.from(body.plannedLocal);
    const zoned = local.toZonedDateTime(body.timezone, {
      disambiguation: 'reject',
    });
    if (
      Temporal.Instant.compare(
        zoned.toInstant(),
        Temporal.Instant.from(body.plannedAt),
      ) !== 0
    )
      throw new Error('Different instant');
  } catch {
    throw new BadRequestException(
      'Choose a valid, unambiguous local publication time in this time zone.',
    );
  }
};
export const validateContentPackage = (
  body: ContentBody,
  platform: ContentPlatform,
  mimeType: string | null,
) => {
  validateContentTime(body);
  if (body.ownerId === body.reviewerId)
    throw new BadRequestException(
      'Choose a different person to review this post.',
    );
  if (body.format === 'TEXT') {
    if (body.asset || !body.caption || !['X', 'FACEBOOK'].includes(platform))
      throw new BadRequestException(
        'Text-only posts need copy and an X or Facebook account.',
      );
  } else if (
    !body.asset ||
    !mimeType?.startsWith(body.format === 'IMAGE' ? 'image/' : 'video/')
  )
    throw new BadRequestException(
      'Choose an approved final asset matching this post format.',
    );
};
export const contentContribution = (body: ContentBody) => ({
  accountId: body.accountId,
  accountRevision: body.accountRevision,
  format: body.format,
  caption: body.caption,
  plannedAt: body.plannedAt,
  plannedLocal: body.plannedLocal,
  timezone: body.timezone,
  asset: body.asset,
});
const validFacebookPublication = (url: URL, expected: string) => {
  const parts = url.pathname.replace(/\/$/, '').split('/');
  const postId = (value: string | null) =>
    value !== null && /^(?:[0-9]+|pfbid[A-Za-z0-9]+)$/.test(value);
  const parameter = (name: string) =>
    url.searchParams.getAll(name).length === 1
      ? url.searchParams.get(name)
      : null;
  const matchesAccount = () => {
    const accountId = parameter('id');
    return (
      accountId !== null &&
      /^[0-9]+$/.test(accountId) &&
      (!/^[0-9]+$/.test(expected) || accountId === expected)
    );
  };

  if (parts.length === 4 && parts[2] === 'posts')
    return parts[1].toLowerCase() === expected && postId(parts[3]);
  if (parts.length === 3 && parts[1] === 'reel')
    return /^[0-9]+$/.test(parts[2]);
  if (parts.length !== 2) return false;
  if (parts[1] === 'watch') return /^[0-9]+$/.test(parameter('v') ?? '');
  if (parts[1] === 'permalink.php')
    return postId(parameter('story_fbid')) && matchesAccount();
  if (parts[1] === 'photo.php')
    return (
      /^[0-9]+$/.test(parameter('fbid') ?? '') &&
      (!url.searchParams.has('id') || matchesAccount())
    );
  return false;
};
export const validatePublication = (
  platform: ContentPlatform,
  handle: string,
  evidenceUrl: string,
  publishedAt: string | null,
  now = Date.now(),
) => {
  const url = contentPublicUrl(platform, evidenceUrl);
  const path = url.pathname;
  const expected = handle.replace(/^@/, '').toLowerCase();
  const parts = path.replace(/\/$/, '').split('/');
  const valid =
    platform === 'X'
      ? new RegExp(`^/${expected}/status/[0-9]+/?$`, 'i').test(path)
      : platform === 'INSTAGRAM'
        ? /^\/(p|reel)\/[A-Za-z0-9_-]+\/?$/.test(path)
        : platform === 'TIKTOK'
          ? parts.length === 4 &&
            parts[1].toLowerCase() === `@${expected}` &&
            ['video', 'photo'].includes(parts[2]) &&
            /^[0-9]+$/.test(parts[3])
          : validFacebookPublication(url, expected);
  if (
    !valid ||
    !publishedAt ||
    !Number.isFinite(Date.parse(publishedAt)) ||
    Date.parse(publishedAt) > now
  )
    throw new BadRequestException(
      'Add the public post link and its actual publication time, which cannot be in the future.',
    );
};
