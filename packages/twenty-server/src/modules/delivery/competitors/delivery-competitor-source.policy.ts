import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { z } from 'zod';
import { advertisingHash } from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy';
import { type OtogrowAccess } from 'src/modules/otogrow-access/otogrow-access.types';
import { type CompetitorPlatform } from './delivery-competitor.types';

export const COMPETITOR_SOURCE_PAGE_SIZE = 25;
export const competitorManager = (
  access: Pick<OtogrowAccess, 'capabilities'>,
) =>
  access.capabilities.some((capability) =>
    ['workspace.admin', 'delivery.manage'].includes(capability),
  );
export const competitorReviewer = (
  access: Pick<OtogrowAccess, 'capabilities'>,
) =>
  competitorManager(access) || access.capabilities.includes('delivery.review');
export const parseCompetitorInput = <TData>(
  schema: z.ZodType<TData>,
  raw: unknown,
): TData => {
  const parsed = schema.safeParse(raw);
  if (!parsed.success)
    throw new BadRequestException(
      parsed.error.issues[0]?.message ?? 'Check this competitor source.',
    );
  return parsed.data;
};

const credentialKey =
  /token|secret|password|signature|authorization|api.?key|credential|session|^auth$|^key$|^sig$/i;
const trackingKey =
  /^(utm_.+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|ref_src|ref_url)$/i;
const publicUrl = (reference: string) => {
  let url: URL;
  try {
    url = new URL(reference);
  } catch {
    throw new BadRequestException(
      'Use an HTTPS public source link without credentials.',
    );
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    [...url.searchParams.keys()].some((key) => credentialKey.test(key))
  )
    throw new BadRequestException(
      'Use an HTTPS public source link without credentials or access tokens.',
    );
  url.hash = '';
  return url;
};

export const canonicalCompetitorSource = (
  platform: CompetitorPlatform,
  raw: string,
) => {
  const reference = raw.trim();
  let canonicalReference: string;
  if (platform === 'X' || platform === 'INSTAGRAM') {
    let handle = reference.replace(/^@/, '');
    if (reference.includes('://')) {
      const url = publicUrl(reference);
      const hosts =
        platform === 'X'
          ? [
              'x.com',
              'www.x.com',
              'twitter.com',
              'www.twitter.com',
              'mobile.twitter.com',
            ]
          : ['instagram.com', 'www.instagram.com'];
      if (
        !hosts.includes(url.hostname.toLowerCase()) ||
        !/^\/[^/]+\/?$/.test(url.pathname)
      )
        throw new BadRequestException(
          'Use the exact public profile link or handle.',
        );
      handle = url.pathname.replace(/^\/@?/, '').replace(/\/$/, '');
    }
    const valid =
      platform === 'X'
        ? /^[A-Za-z0-9_]{1,15}$/
        : /^[A-Za-z0-9_](?:[A-Za-z0-9_.]{0,28}[A-Za-z0-9_])?$/;
    if (
      !valid.test(handle) ||
      (platform === 'INSTAGRAM' && handle.includes('..'))
    )
      throw new BadRequestException('Use a valid public profile handle.');
    const reserved =
      platform === 'X'
        ? [
            'home',
            'search',
            'explore',
            'notifications',
            'messages',
            'settings',
            'i',
            'intent',
            'share',
          ]
        : ['p', 'reel', 'reels', 'stories', 'explore', 'accounts', 'direct'];
    if (reserved.includes(handle.toLowerCase()))
      throw new BadRequestException(
        'Use a public account profile, rather than a platform navigation page.',
      );
    canonicalReference = `https://${platform === 'X' ? 'x.com' : 'www.instagram.com'}/${handle.toLowerCase()}`;
  } else if (platform === 'META_AD_LIBRARY') {
    let pageId = reference;
    if (reference.includes('://')) {
      const url = publicUrl(reference);
      if (
        !['facebook.com', 'www.facebook.com'].includes(
          url.hostname.toLowerCase(),
        ) ||
        !/^\/ads\/library\/?$/.test(url.pathname) ||
        url.searchParams.getAll('view_all_page_id').length !== 1
      )
        throw new BadRequestException(
          'Use a Page ID or the official Ad Library link filtered to one Page.',
        );
      pageId = url.searchParams.get('view_all_page_id') ?? '';
    }
    if (!/^[1-9]\d{0,99}$/.test(pageId))
      throw new BadRequestException(
        'Choose one exact numeric Facebook Page ID.',
      );
    canonicalReference = `https://www.facebook.com/ads/library/?view_all_page_id=${pageId}`;
  } else {
    const url = publicUrl(reference);
    for (const key of [...url.searchParams.keys()])
      if (trackingKey.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    canonicalReference = url.toString();
  }
  if (canonicalReference.length > 2000)
    throw new BadRequestException(
      'Keep the public source link within 2000 characters.',
    );
  return {
    canonicalReference,
    canonicalKey: advertisingHash([platform, canonicalReference]),
  };
};

export const competitorCollectionState = (
  platform: CompetitorPlatform,
): 'MANUAL_ONLY' | 'NOT_CONNECTED' =>
  ['MANUAL', 'META_AD_LIBRARY'].includes(platform)
    ? 'MANUAL_ONLY'
    : 'NOT_CONNECTED';

const cursorSchema = z.strictObject({
  version: z.literal(1),
  scope: z.string().regex(/^[a-f0-9]{64}$/),
  kind: z.enum(['PROJECT', 'SOURCE', 'HISTORY']),
  id: z.uuid(),
  revision: z.number().int().positive().nullable(),
});
type CompetitorCursorKind = z.infer<typeof cursorSchema>['kind'];
export const competitorCursor = (
  scope: string,
  kind: CompetitorCursorKind,
  id: string,
  revision: number | null = null,
) =>
  Buffer.from(
    JSON.stringify({ version: 1, scope, kind, id, revision }),
  ).toString('base64url');
export const readCompetitorCursor = (
  value: string | null | undefined,
  scope: string,
  kind: CompetitorCursorKind,
) => {
  if (!value) return null;
  try {
    const parsed = cursorSchema.parse(
      JSON.parse(Buffer.from(value, 'base64url').toString()),
    );
    if (
      parsed.scope === scope &&
      parsed.kind === kind &&
      (kind !== 'HISTORY' || parsed.revision !== null)
    )
      return parsed;
  } catch {
    // A cursor cannot retain an earlier actor, client or filter scope.
  }
  throw new BadRequestException(
    'This competitor page changed or no longer matches your access and filters. Open the first page.',
  );
};

export const assertCompetitorEditor = (
  ownerId: string,
  access: OtogrowAccess,
) => {
  if (!competitorManager(access) && ownerId !== access.memberId)
    throw new ForbiddenException(
      'Only the current source owner or a delivery manager can edit this source.',
    );
};
