import {
  competitorContentFingerprint,
  competitorReadFunding,
  competitorXPageUrl,
  competitorXReadBound,
} from '../delivery-competitor.policy';
import { parseCompetitorXPage } from '../delivery-competitor-x.parser';
import { type CompetitorXPageInput } from '../delivery-competitor.types';
const input: CompetitorXPageInput = {
  accountId: '123',
  limit: 5,
  sinceId: '100',
  untilId: null,
  nextToken: null,
};
const capturedAt = '2026-11-03T06:00:00Z';
const post = {
  id: '101',
  author_id: '123',
  text: 'A recorded public strategy.',
  created_at: '2026-11-02T06:00:00Z',
};
const page = (changes: Record<string, unknown> = {}) => ({
  data: [post],
  meta: { result_count: 1 },
  ...changes,
});
it('keeps unknown tariffs and a zero data allowance distinct from AI funding', () => {
  expect(competitorXReadBound(5, true, null)).toBeNull();
  expect(competitorReadFunding(null, '0')).toBe('UNKNOWN_TARIFF');
  const required = competitorXReadBound(5, true, {
    postReadMicros: '5000',
    userReadMicros: '10000',
  });
  expect(required).toBe('35000');
  expect(competitorReadFunding(required, '0')).toBe('NEEDS_ALLOWANCE');
  expect(competitorReadFunding(required, '35000')).toBe('WITHIN_ALLOWANCE');
});
it('blocks collection at a zero data allowance even when a recorded tariff estimates zero cost', () => {
  expect(competitorReadFunding('0', '0')).toBe('NEEDS_ALLOWANCE');
  expect(competitorReadFunding(null, '0')).toBe('UNKNOWN_TARIFF');
});
it('calculates a page bound in exact money without charging for an unused account lookup', () => {
  expect(
    competitorXReadBound(100, false, {
      postReadMicros: '5001',
      userReadMicros: '10000',
    }),
  ).toBe('500100');
  expect(competitorReadFunding('500100', '500099')).toBe('NEEDS_ALLOWANCE');
});
it.each([0, 4, 101, 5.1, NaN, Infinity])(
  'rejects an unsupported page size %s',
  (limit) => {
    expect(() => competitorXReadBound(limit, false, null)).toThrow();
    expect(() => competitorXPageUrl({ ...input, limit })).toThrow();
  },
);
it('uses a fixed provider host and treats opaque cursors as query data', () => {
  const url = competitorXPageUrl({
    ...input,
    nextToken: 'opaque_cursor-1',
  });
  expect(url.origin).toBe('https://api.x.com');
  expect(url.pathname).toBe('/2/users/123/tweets');
  expect(url.searchParams.get('max_results')).toBe('5');
  expect(url.searchParams.has('access_token')).toBe(false);
  expect(url.searchParams.has('expansions')).toBe(false);
  expect(url.searchParams.get('pagination_token')).toBe('opaque_cursor-1');
  expect(() =>
    competitorXPageUrl({
      ...input,
      nextToken: 'https://unsafe.invalid/?access_token=not-a-real-token',
    }),
  ).toThrow();
  expect(() =>
    parseCompetitorXPage(
      page({
        meta: { result_count: 1, next_token: 'https://unsafe.invalid/' },
      }),
      input,
      capturedAt,
    ),
  ).toThrow();
});
it('keeps large external identities exact and rejects a reversed window', () => {
  expect(
    competitorXPageUrl({
      ...input,
      sinceId: '9007199254740993',
    }).searchParams.get('since_id'),
  ).toBe('9007199254740993');
  expect(() =>
    competitorXPageUrl({ ...input, sinceId: '102', untilId: '101' }),
  ).toThrow();
});
it('distinguishes the publication date, capture date and known page coverage', () => {
  const result = parseCompetitorXPage(
    page({ meta: { result_count: 1, next_token: 'next' } }),
    input,
    capturedAt,
  );
  expect(result.observations[0]).toMatchObject({
    publishedAt: '2026-11-02T06:00:00.000Z',
    capturedAt: '2026-11-03T06:00:00.000Z',
    permalink: 'https://x.com/i/web/status/101',
  });
  expect(result.nextToken).toBe('next');
  expect(result.coverage).toBe('COMPLETE_PAGE');
  expect(
    parseCompetitorXPage(
      page({ errors: [{ detail: 'untrusted provider text' }] }),
      input,
      capturedAt,
    ).coverage,
  ).toBe('PARTIAL_PAGE');
});
it('does not invent an empty successful response from missing or malformed metadata', () => {
  expect(() => parseCompetitorXPage({}, input, capturedAt)).toThrow();
  expect(() =>
    parseCompetitorXPage(
      page({ meta: { result_count: 0 } }),
      input,
      capturedAt,
    ),
  ).toThrow();
  expect(
    parseCompetitorXPage({ meta: { result_count: 0 } }, input, capturedAt)
      .observations,
  ).toEqual([]);
});
it.each([
  { data: [{ ...post, author_id: '456' }] },
  { data: [{ ...post, id: '100' }] },
  { data: [{ ...post, created_at: '2027-01-01T00:00:00Z' }] },
  { data: [post, post], meta: { result_count: 2 } },
])(
  'rejects an ambiguous, wrong-account or out-of-window observation',
  (changes) => {
    expect(() =>
      parseCompetitorXPage(page(changes), input, capturedAt),
    ).toThrow();
  },
);
it('does not create another content version when capture time or engagement changes', () => {
  const first = parseCompetitorXPage(page(), input, capturedAt).observations[0];
  const observedLater = parseCompetitorXPage(
    page({ data: [{ ...post, public_metrics: { like_count: 999 } }] }),
    input,
    '2026-11-03T07:00:00Z',
  ).observations[0];
  expect(competitorContentFingerprint(first)).toBe(
    competitorContentFingerprint(observedLater),
  );
  expect(
    competitorContentFingerprint({
      ...first,
      text: 'An edited public strategy.',
    }),
  ).not.toBe(competitorContentFingerprint(first));
});

it('keeps edits under one source identity while retaining the observed version', () => {
  const first = parseCompetitorXPage(
    page({ data: [{ ...post, edit_history_post_ids: ['101'] }] }),
    input,
    capturedAt,
  ).observations[0];
  const edited = parseCompetitorXPage(
    page({
      data: [
        {
          ...post,
          id: '102',
          text: 'An edited strategy',
          edit_history_post_ids: ['102', '101'],
        },
      ],
    }),
    input,
    capturedAt,
  ).observations[0];
  expect(edited.externalId).toBe(first.externalId);
  expect(edited.versionExternalId).toBe('102');
  expect(edited.permalink).toBe('https://x.com/i/web/status/102');
  expect(competitorContentFingerprint(edited)).not.toBe(
    competitorContentFingerprint(first),
  );
  expect(() =>
    parseCompetitorXPage(
      page({ data: [{ ...post, edit_history_post_ids: ['102'] }] }),
      input,
      capturedAt,
    ),
  ).toThrow();
});
it('uses the documented account timeline without billing extra user expansions', () => {
  const url = competitorXPageUrl(input);
  expect(url.searchParams.get('post.fields')).toBe('id,text,created_at');
  expect(url.searchParams.has('tweet.fields')).toBe(false);
  const { author_id, ...withoutAuthor } = post;
  expect(author_id).toBe(input.accountId);
  expect(
    parseCompetitorXPage(page({ data: [withoutAuthor] }), input, capturedAt)
      .observations[0].accountId,
  ).toBe(input.accountId);
});

it.each(['-1', '1.5', 'NaN', '0001'])(
  'rejects an unsupported recorded tariff %s before a request can be bounded',
  (postReadMicros) => {
    expect(() =>
      competitorXReadBound(5, false, { postReadMicros, userReadMicros: '0' }),
    ).toThrow();
  },
);
it('rejects a page reservation beyond the supported exact-money range', () => {
  expect(() =>
    competitorXReadBound(100, false, {
      postReadMicros: '9999999999999999',
      userReadMicros: '0',
    }),
  ).toThrow();
});
