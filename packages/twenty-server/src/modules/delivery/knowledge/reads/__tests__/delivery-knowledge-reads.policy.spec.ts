import {
  deliveryKnowledgeContextSchema,
  deliveryKnowledgeProjectsSchema,
  deliveryKnowledgeListSchema,
  deliveryKnowledgeSelectionSchema,
  deliveryKnowledgeCursor,
  deliveryKnowledgeScope,
  parseDeliveryKnowledgeRead,
  readDeliveryKnowledgeCursor,
} from 'src/modules/delivery/knowledge/reads/delivery-knowledge-reads.policy';
const projectId = '00000000-0000-4000-8000-000000000001';
const sourceId = '00000000-0000-4000-8000-000000000002';

it('accepts only bounded page/filter/selection inputs without treating a missing project as all-project knowledge', () => {
  expect(
    parseDeliveryKnowledgeRead(deliveryKnowledgeContextSchema, {}),
  ).toEqual({});
  expect(
    parseDeliveryKnowledgeRead(deliveryKnowledgeListSchema, {
      projectId,
      search: '  confirmed  ',
      limit: 50,
    }).search,
  ).toBe('confirmed');
  for (const input of [
    { projectId, limit: 51 },
    { projectId, limit: 0 },
    { projectId, search: 'x'.repeat(161) },
    { projectId, category: 'unrecognized' },
    { projectId, transcript: 'private' },
    {},
  ])
    expect(() =>
      parseDeliveryKnowledgeRead(deliveryKnowledgeListSchema, input),
    ).toThrow('Check the knowledge');
  expect(() =>
    parseDeliveryKnowledgeRead(deliveryKnowledgeProjectsSchema, {
      after: 'x'.repeat(4001),
    }),
  ).toThrow();
  expect(() =>
    parseDeliveryKnowledgeRead(deliveryKnowledgeSelectionSchema, {
      projectId,
      sourceId,
      version: 0,
    }),
  ).toThrow();
});

it('preserves microsecond ordering without rounding it to the JavaScript millisecond', () => {
  const scope = deliveryKnowledgeScope({ projectId, revision: 1 });
  const key = '2026-10-31T01:02:03.000123Z';
  expect(
    readDeliveryKnowledgeCursor(
      deliveryKnowledgeCursor(scope, 'SOURCE', key, sourceId),
      scope,
      'SOURCE',
    ),
  ).toEqual({ scope, kind: 'SOURCE', key, id: sourceId });
});

it('rejects changed source sets, filters, identities and cursor kinds with explicit first-page recovery', () => {
  const original = {
    projectId,
    identity: 'original',
    search: 'approved',
    fingerprint: 'v1',
  };
  const scope = deliveryKnowledgeScope(original);
  const cursor = deliveryKnowledgeCursor(
    scope,
    'SOURCE',
    '2026-10-31T01:02:03.000123Z',
    sourceId,
  );
  for (const changed of [
    { ...original, fingerprint: 'v2' },
    { ...original, identity: 'another' },
    { ...original, search: 'other' },
    { ...original, projectId: sourceId },
  ])
    expect(() =>
      readDeliveryKnowledgeCursor(
        cursor,
        deliveryKnowledgeScope(changed),
        'SOURCE',
      ),
    ).toThrow('Open the first page');
  expect(() => readDeliveryKnowledgeCursor(cursor, scope, 'PROJECT')).toThrow(
    'Open the first page',
  );
  expect(() => readDeliveryKnowledgeCursor('invalid', scope, 'SOURCE')).toThrow(
    'Open the first page',
  );
  expect(() =>
    readDeliveryKnowledgeCursor(
      deliveryKnowledgeCursor(
        scope,
        'SOURCE',
        '2026-10-31T01:02:03.000Z',
        sourceId,
      ),
      scope,
      'SOURCE',
    ),
  ).toThrow();
  expect(() =>
    readDeliveryKnowledgeCursor(
      deliveryKnowledgeCursor(
        scope,
        'SOURCE',
        '2026-02-30T01:02:03.000123Z',
        sourceId,
      ),
      scope,
      'SOURCE',
    ),
  ).toThrow('Open the first page');
  expect(readDeliveryKnowledgeCursor(null, scope, 'SOURCE')).toBeNull();
});
