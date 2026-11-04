import { randomUUID } from 'node:crypto';
import {
  assertCompetitorEditor,
  canonicalCompetitorSource,
  competitorCollectionState,
  competitorCursor,
  competitorManager,
  competitorReviewer,
  parseCompetitorInput,
  readCompetitorCursor,
} from '../delivery-competitor-source.policy';
import {
  competitorSourceChangeSchema,
  competitorSourceSaveSchema,
} from '../delivery-competitor.types';
import { type OtogrowAccess } from 'src/modules/otogrow-access/otogrow-access.types';

const memberId = randomUUID();
const access: OtogrowAccess = {
  workspaceId: randomUUID(),
  memberId,
  userWorkspaceId: randomUUID(),
  nativeAdministrator: false,
  capabilities: [],
  roleIds: [],
  grants: [],
};
const projectId = randomUUID();
const command = {
  id: randomUUID(),
  requestId: randomUUID(),
  revision: 0,
  projectId,
  projectRevision: 1,
  expectedCompanyId: null,
};

it.each([
  '@Example_Name',
  'Example_Name',
  'https://x.com/Example_Name/',
  'https://twitter.com/EXAMPLE_NAME?utm_source=test#section',
])(
  'deduplicates public X profile alias %s without claiming a verified numeric identity',
  (reference) => {
    expect(canonicalCompetitorSource('X', reference)).toEqual(
      canonicalCompetitorSource('X', '@example_name'),
    );
    expect(canonicalCompetitorSource('X', reference).canonicalReference).toBe(
      'https://x.com/example_name',
    );
  },
);
it.each([
  'https://x.com/name/status/123',
  'https://elsewhere.invalid/name',
  'https://x.com/home',
  'bad handle',
  '@toolonghandle12345',
])('rejects an X source that is not an exact profile: %s', (reference) => {
  expect(() => canonicalCompetitorSource('X', reference)).toThrow();
});
it('normalizes Instagram handles while retaining an unconnected source state', () => {
  expect(canonicalCompetitorSource('INSTAGRAM', '@Some.Name')).toEqual(
    canonicalCompetitorSource(
      'INSTAGRAM',
      'https://www.instagram.com/some.name/?igshid=tracking',
    ),
  );
  expect(competitorCollectionState('INSTAGRAM')).toBe('NOT_CONNECTED');
});
it.each([
  'https://www.instagram.com/p/abc',
  '@a..b',
  '@ending.',
  'https://www.instagram.com/accounts',
])('rejects unsupported Instagram profile reference %s', (reference) => {
  expect(() => canonicalCompetitorSource('INSTAGRAM', reference)).toThrow();
});
it('deduplicates official page-filtered Ad Library references and numeric Page IDs', () => {
  const numeric = canonicalCompetitorSource(
    'META_AD_LIBRARY',
    '12345678901234567890',
  );
  expect(numeric).toEqual(
    canonicalCompetitorSource(
      'META_AD_LIBRARY',
      'https://www.facebook.com/ads/library/?active_status=all&country=GB&view_all_page_id=12345678901234567890',
    ),
  );
  expect(competitorCollectionState('META_AD_LIBRARY')).toBe('MANUAL_ONLY');
});
it.each([
  'https://www.facebook.com/ads/library/?q=brand',
  'https://www.facebook.com/ads/library/?view_all_page_id=1&view_all_page_id=2',
  'https://facebook.invalid/ads/library/?view_all_page_id=1',
  '00123',
])('rejects ambiguous or unofficial Ad Library reference %s', (reference) => {
  expect(() =>
    canonicalCompetitorSource('META_AD_LIBRARY', reference),
  ).toThrow();
});
it('preserves manual content parameters while removing tracking and fragments', () => {
  const source = canonicalCompetitorSource(
    'MANUAL',
    'https://example.com/article?variant=two&id=7&utm_campaign=tracking#part',
  );
  expect(source.canonicalReference).toBe(
    'https://example.com/article?id=7&variant=two',
  );
  expect(source).toEqual(
    canonicalCompetitorSource(
      'MANUAL',
      'https://example.com/article?id=7&variant=two',
    ),
  );
  expect(source.canonicalKey).not.toBe(
    canonicalCompetitorSource(
      'MANUAL',
      'https://example.com/article?id=8&variant=two',
    ).canonicalKey,
  );
  expect(competitorCollectionState('MANUAL')).toBe('MANUAL_ONLY');
});
it.each([
  'http://example.com/path',
  'https://user:password@example.com/path',
  'https://example.com/path?api_key=secret',
  'https://example.com/path?access%5Ftoken=secret',
  'https://example.com/path?auth=secret',
  'https://example.com:8443/path',
])('rejects unsafe public source reference %s', (reference) => {
  expect(() => canonicalCompetitorSource('MANUAL', reference)).toThrow();
});
it('checks credentials before canonicalizing platform query parameters', () => {
  expect(() =>
    canonicalCompetitorSource('X', 'https://x.com/name?token=secret'),
  ).toThrow();
  expect(() =>
    canonicalCompetitorSource(
      'META_AD_LIBRARY',
      'https://www.facebook.com/ads/library/?view_all_page_id=1&access_token=secret',
    ),
  ).toThrow();
});
it('does not let a saved X registry source imply collection is connected', () => {
  expect(competitorCollectionState('X')).toBe('NOT_CONNECTED');
});
it('normalizes submitted string fields before exact command hashing', () => {
  const input = parseCompetitorInput(competitorSourceSaveSchema, {
    ...command,
    body: {
      projectId,
      label: '  Example  ',
      platform: 'X',
      accountReference: ' @Example ',
      ownerId: memberId,
      reviewerId: randomUUID(),
      cadenceHours: 24,
      lookbackDays: 7,
      purpose: '  Learn how the launch is explained.  ',
    },
  });
  expect(input.body.label).toBe('Example');
  expect(input.body.accountReference).toBe('@Example');
  expect(input.body.purpose).toBe('Learn how the launch is explained.');
});
it('rejects client-supplied collection switches and unsupported state actions', () => {
  expect(() =>
    parseCompetitorInput(competitorSourceChangeSchema, {
      ...command,
      action: 'ENABLE',
      note: '',
    }),
  ).toThrow();
  expect(() =>
    parseCompetitorInput(competitorSourceChangeSchema, {
      ...command,
      action: 'PAUSE',
      note: '',
      collectionEnabled: true,
    }),
  ).toThrow();
});
it('uses effective capabilities for management, review and current-owner edits', () => {
  expect(competitorManager(access)).toBe(false);
  expect(competitorReviewer(access)).toBe(false);
  expect(competitorReviewer({ capabilities: ['delivery.review'] })).toBe(true);
  expect(competitorManager({ capabilities: ['delivery.review'] })).toBe(false);
  expect(competitorManager({ capabilities: ['delivery.manage'] })).toBe(true);
  expect(competitorReviewer({ capabilities: ['workspace.admin'] })).toBe(true);
  expect(() => assertCompetitorEditor(memberId, access)).not.toThrow();
  expect(() => assertCompetitorEditor(randomUUID(), access)).toThrow();
  expect(() =>
    assertCompetitorEditor(randomUUID(), {
      ...access,
      capabilities: ['delivery.manage'],
    }),
  ).not.toThrow();
});
it('binds opaque pages to the exact authority, project, client, filter and source scope supplied by reads', () => {
  const scope = 'a'.repeat(64),
    changed = 'b'.repeat(64),
    id = randomUUID();
  const cursor = competitorCursor(scope, 'SOURCE', id);
  expect(readCompetitorCursor(cursor, scope, 'SOURCE')?.id).toBe(id);
  expect(() => readCompetitorCursor(cursor, changed, 'SOURCE')).toThrow();
  expect(() => readCompetitorCursor(cursor, scope, 'PROJECT')).toThrow();
  expect(readCompetitorCursor(null, scope, 'SOURCE')).toBeNull();
});
it('retains exact history revision and rejects malformed or incomplete history cursors', () => {
  const scope = 'c'.repeat(64),
    id = randomUUID();
  expect(
    readCompetitorCursor(
      competitorCursor(scope, 'HISTORY', id, 26),
      scope,
      'HISTORY',
    )?.revision,
  ).toBe(26);
  expect(() =>
    readCompetitorCursor(
      competitorCursor(scope, 'HISTORY', id),
      scope,
      'HISTORY',
    ),
  ).toThrow();
  expect(() => readCompetitorCursor('not a page', scope, 'HISTORY')).toThrow();
});
