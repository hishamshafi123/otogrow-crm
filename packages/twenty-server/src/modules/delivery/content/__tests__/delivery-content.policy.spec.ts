import { randomUUID } from 'node:crypto';
import {
  contentContribution,
  validateContentAccount,
  validateContentPackage,
  validateContentTime,
  validatePublication,
} from '../delivery-content.policy';
import {
  contentDecisionSchema,
  contentSaveSchema,
  type ContentAccountSave,
  type ContentBody,
} from '../delivery-content.types';

const body = (): ContentBody => ({
  accountId: randomUUID(),
  accountRevision: 1,
  ownerId: randomUUID(),
  reviewerId: randomUUID(),
  format: 'TEXT',
  caption: 'A useful, reviewed idea.',
  plannedAt: '2026-11-05T03:00:00Z',
  plannedLocal: '2026-11-05T06:00',
  timezone: 'Asia/Qatar',
  asset: null,
  notes: '',
});
const account = (): ContentAccountSave => ({
  id: randomUUID(),
  requestId: randomUUID(),
  revision: 0,
  projectId: randomUUID(),
  projectRevision: 1,
  expectedCompanyId: null,
  platform: 'X',
  name: 'Agency',
  handle: '@otogrow',
  profileUrl: 'https://x.com/otogrow',
  archived: false,
});
it('preserves an explicit Qatar local time without machine timezone assumptions', () => {
  expect(() => validateContentTime(body())).not.toThrow();
  expect(() =>
    validateContentTime({ ...body(), plannedAt: '2026-11-05T06:00:00Z' }),
  ).toThrow('unambiguous');
});
it.each([
  ['2026-03-08T02:30', '2026-03-08T07:30:00Z'],
  ['2026-11-01T01:30', '2026-11-01T05:30:00Z'],
])(
  'rejects a missing or ambiguous DST local time %s',
  (plannedLocal, plannedAt) => {
    expect(() =>
      validateContentTime({
        plannedLocal,
        plannedAt,
        timezone: 'America/New_York',
      }),
    ).toThrow();
  },
);
it.each([
  'https://localhost/otogrow',
  'https://127.0.0.1/otogrow',
  'https://x.com.evil.test/otogrow',
  'https://user:password@x.com/otogrow',
  'https://x.com/otogrow#secret',
  'https://x.com/otogrow?session=private',
  'https://x.com:444/otogrow',
])('rejects nonpublic or credential-bearing account URL %s', (profileUrl) => {
  expect(() => validateContentAccount({ ...account(), profileUrl })).toThrow();
});
it('requires matching profile identity and distinguishes a post from an account', () => {
  expect(() => validateContentAccount(account())).not.toThrow();
  expect(() =>
    validateContentAccount({
      ...account(),
      profileUrl: 'https://x.com/another',
    }),
  ).toThrow();
  expect(() =>
    validateContentAccount({
      ...account(),
      profileUrl: 'https://x.com/otogrow/status/123',
    }),
  ).toThrow();
});
it('supports public Instagram, Facebook and TikTok manual account metadata', () => {
  for (const [platform, profileUrl] of [
    ['INSTAGRAM', 'https://www.instagram.com/otogrow'],
    ['FACEBOOK', 'https://www.facebook.com/otogrow'],
    ['TIKTOK', 'https://www.tiktok.com/@otogrow'],
  ] as const)
    expect(() =>
      validateContentAccount({ ...account(), platform, profileUrl }),
    ).not.toThrow();
});
it('requires independent posting owner and reviewer', () => {
  const draft = body();
  expect(() =>
    validateContentPackage({ ...draft, reviewerId: draft.ownerId }, 'X', null),
  ).toThrow('different person');
});
it('permits text-only X/Facebook work without artificial media tasks', () => {
  for (const platform of ['X', 'FACEBOOK'] as const)
    expect(() => validateContentPackage(body(), platform, null)).not.toThrow();
  for (const platform of ['INSTAGRAM', 'TIKTOK'] as const)
    expect(() => validateContentPackage(body(), platform, null)).toThrow();
});
it('requires exact compatible approved media metadata for media posts', () => {
  const draft: ContentBody = {
    ...body(),
    format: 'VIDEO',
    asset: {
      taskId: randomUUID(),
      submissionVersion: 1,
      assetId: randomUUID(),
    },
  };
  expect(() =>
    validateContentPackage(draft, 'TIKTOK', 'video/mp4'),
  ).not.toThrow();
  expect(() => validateContentPackage(draft, 'TIKTOK', 'image/png')).toThrow();
  expect(() =>
    validateContentPackage({ ...draft, asset: null }, 'TIKTOK', 'video/mp4'),
  ).toThrow();
});
it('allows a single approved TikTok photo and records its manual photo URL', () => {
  const draft: ContentBody = {
    ...body(),
    format: 'IMAGE',
    asset: {
      taskId: randomUUID(),
      submissionVersion: 1,
      assetId: randomUUID(),
    },
  };
  expect(() =>
    validateContentPackage(draft, 'TIKTOK', 'image/png'),
  ).not.toThrow();
  expect(() =>
    validatePublication(
      'TIKTOK',
      '@otogrow',
      'https://www.tiktok.com/@otogrow/photo/123',
      '2026-11-05T05:00:00Z',
      Date.parse('2026-11-05T06:00:00Z'),
    ),
  ).not.toThrow();
  expect(() =>
    validatePublication(
      'TIKTOK',
      '@otogrow',
      'https://www.tiktok.com/@another/photo/123',
      '2026-11-05T05:00:00Z',
    ),
  ).toThrow();
});
it('does not treat assignment and feedback edits as posting authorship', () => {
  const draft = body();
  expect(
    contentContribution({
      ...draft,
      ownerId: randomUUID(),
      reviewerId: randomUUID(),
      notes: 'Please check the opening.',
    }),
  ).toEqual(contentContribution(draft));
  expect(
    contentContribution({ ...draft, caption: 'A different claim.' }),
  ).not.toEqual(contentContribution(draft));
  expect(contentContribution({ ...draft, accountRevision: 2 })).not.toEqual(
    contentContribution(draft),
  );
});
it('records only a real platform post URL and a nonfuture actual time', () => {
  const now = Date.parse('2026-11-05T06:00:00Z');
  expect(() =>
    validatePublication(
      'X',
      '@otogrow',
      'https://x.com/otogrow/status/123',
      '2026-11-05T05:00:00Z',
      now,
    ),
  ).not.toThrow();
  for (const url of [
    'https://x.com/otogrow',
    'https://x.com/another/status/123',
    'https://x.com/otogrow/status/123#token',
    'https://example.com/post',
  ])
    expect(() =>
      validatePublication('X', '@otogrow', url, '2026-11-05T05:00:00Z', now),
    ).toThrow();
  expect(() =>
    validatePublication(
      'X',
      '@otogrow',
      'https://x.com/otogrow/status/123',
      '2026-11-05T07:00:00Z',
      now,
    ),
  ).toThrow();
});
it('keeps exact preview fingerprint explicit and includes cancellation/correction identities', () => {
  const draft = {
    id: randomUUID(),
    requestId: randomUUID(),
    revision: 0,
    planId: randomUUID(),
    planRevision: 1,
    body: body(),
    expectedSourceFingerprint: null,
  };
  expect(contentSaveSchema.safeParse(draft).success).toBe(true);
  expect(
    contentSaveSchema.safeParse({
      ...draft,
      expectedSourceFingerprint: 'invalid',
    }).success,
  ).toBe(false);
  expect(
    contentDecisionSchema.safeParse({
      id: randomUUID(),
      requestId: randomUUID(),
      revision: 1,
      action: 'CANCEL',
      sourceFingerprint: 'a'.repeat(64),
      note: 'No longer needed',
      evidenceUrl: '',
      publishedAt: null,
      correctsEventId: null,
    }).success,
  ).toBe(true);
});
it('requires Facebook post identifiers and matches page identities where present', () => {
  const now = Date.parse('2026-11-05T06:00:00Z');
  const check = (url: string, handle = 'otogrow') =>
    validatePublication('FACEBOOK', handle, url, '2026-11-05T05:00:00Z', now);
  for (const url of [
    'https://www.facebook.com/otogrow/posts/123',
    'https://www.facebook.com/otogrow/posts/pfbidAbc123',
    'https://www.facebook.com/reel/123',
    'https://www.facebook.com/watch/?v=123',
    'https://www.facebook.com/permalink.php?story_fbid=123&id=456',
    'https://www.facebook.com/photo.php?fbid=123',
  ])
    expect(() => check(url)).not.toThrow();
  for (const url of [
    'https://www.facebook.com/another/posts/123',
    'https://www.facebook.com/otogrow/posts/not-a-post-id',
    'https://www.facebook.com/watch/',
    'https://www.facebook.com/watch/?v=123&v=456',
    'https://www.facebook.com/permalink.php',
    'https://www.facebook.com/permalink.php?story_fbid=123',
    'https://www.facebook.com/photo.php',
    'https://www.facebook.com/reel/not-a-post-id',
  ])
    expect(() => check(url)).toThrow();
  expect(() =>
    check(
      'https://www.facebook.com/permalink.php?story_fbid=123&id=456',
      '456',
    ),
  ).not.toThrow();
  expect(() =>
    check(
      'https://www.facebook.com/permalink.php?story_fbid=123&id=789',
      '456',
    ),
  ).toThrow();
  expect(() =>
    check('https://www.facebook.com/photo.php?fbid=123&id=789', '456'),
  ).toThrow();
});
it('rejects nested TikTok paths and matches the exact dotted account handle', () => {
  const check = (url: string) =>
    validatePublication(
      'TIKTOK',
      '@oto.grow',
      url,
      '2026-11-05T05:00:00Z',
      Date.parse('2026-11-05T06:00:00Z'),
    );
  expect(() =>
    check('https://www.tiktok.com/@oto.grow/video/123'),
  ).not.toThrow();
  expect(() => check('https://www.tiktok.com/@otoxgrow/video/123')).toThrow();
  expect(() =>
    check('https://www.tiktok.com/@oto.grow/another/video/123'),
  ).toThrow();
});
