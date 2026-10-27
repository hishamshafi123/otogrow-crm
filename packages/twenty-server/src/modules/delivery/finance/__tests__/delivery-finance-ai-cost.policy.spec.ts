import {
  financeAiAmount,
  financeAiModelIdentity,
  financeAiCostPrepareSchema,
  type FinanceAiCostOrigin,
} from 'src/modules/delivery/finance/delivery-finance-ai-cost.policy';
import { projectFinanceAiCostOrigin } from 'src/modules/delivery/finance/delivery-finance-ai-cost.hooks';
import { projectFinanceAiEvidence } from 'src/modules/delivery/finance/read-delivery-finance-ai-cost';

const IDENTIFIER = 'e090d6e5-41b8-4fbc-94aa-f762277cd137';

it.each([
  null,
  [],
  {},
  { modelId: { privatePayload: 'hidden' }, revision: 1 },
  { modelId: 'model', revision: 0 },
])(
  'keeps a malformed saved model identity unavailable without a raw property error',
  (value) => {
    expect(() => financeAiModelIdentity(value)).not.toThrow();
    expect(financeAiModelIdentity(value)).toBeNull();
  },
);
it('projects only verified model identity fields from saved pricing', () => {
  expect(
    financeAiModelIdentity({
      modelId: 'model',
      revision: 2,
      pricing: { privatePayload: 'hidden' },
    }),
  ).toEqual({ modelId: 'model', revision: 2 });
});

it.each([null, undefined, '-1', '1.0', '1e6', '01', '9223372036854775808'])(
  'keeps malformed or unknown AI cost %s unavailable',
  (value) => {
    expect(() => financeAiAmount(value)).not.toThrow();
    expect(financeAiAmount(value)).toBeNull();
  },
);
it.each(['0', '1', '2000000', '9223372036854775807'])(
  'retains exact nonnegative AI cost %s',
  (value) => {
    expect(financeAiAmount(value)).toBe(value);
  },
);
it('projects the selected lower late amount without applying a budget high-water maximum', () => {
  expect(
    projectFinanceAiEvidence({
      id: IDENTIFIER,
      action: 'LATE_PROVIDER_USAGE',
      actualAmount: '9000000',
      reportedAmount: '1',
      createdAt: new Date('2026-09-01T00:00:00Z'),
    }),
  ).toEqual({
    id: IDENTIFIER,
    basis: 'LATE_PRICED_USAGE',
    amountMicros: '1',
    recordedAt: '2026-09-01T00:00:00.000Z',
  });
});
it('requires duplicate-cost review and a complete explicit replacement reference', () => {
  const preparation = {
    id: IDENTIFIER,
    spendId: IDENTIFIER,
    evidenceEventId: IDENTIFIER,
    expectedSourceReviewToken: 'a'.repeat(64),
    expectedClaimRevision: 0,
    month: '2026-09',
    title: 'Reviewed AI cost',
    note: '',
    allocations: [],
    acknowledgeSourceWarnings: false,
    acknowledgeNoDuplicateCost: true,
  };
  expect(financeAiCostPrepareSchema.safeParse(preparation).success).toBe(true);
  expect(
    financeAiCostPrepareSchema.safeParse({
      ...preparation,
      acknowledgeNoDuplicateCost: false,
    }).success,
  ).toBe(false);
  expect(
    financeAiCostPrepareSchema.safeParse({
      ...preparation,
      replacesEntryId: IDENTIFIER,
    }).success,
  ).toBe(false);
  expect(
    financeAiCostPrepareSchema.safeParse({
      ...preparation,
      replacesEntryId: IDENTIFIER,
      expectedReplacedEntryRevision: 2,
      correctionReason: 'Reviewed later provider usage.',
    }).success,
  ).toBe(true);
});
it('exposes an allowlisted origin without private ledger payloads or request identities', () => {
  const stored = {
    spendId: IDENTIFIER,
    spendRevision: 2,
    evidenceEventId: IDENTIFIER,
    basis: 'MANUAL_EVIDENCE',
    amountMicros: '0',
    currency: 'USD',
    modelId: 'model',
    sourceKind: 'INBOX_DRAFT',
    recordedAt: '2026-09-01T00:00:00.000Z',
    projectId: null,
    projectName: null,
    replacesEntryId: null,
    correctionReason: null,
    requestHash: 'private-request-hash',
    preparedBy: IDENTIFIER,
    replacedEntryRevision: null,
    sourceRunId: IDENTIFIER,
    clientId: null,
    taskId: null,
    privatePayload: 'private source content',
  } satisfies FinanceAiCostOrigin & { privatePayload: string };
  const projected = projectFinanceAiCostOrigin(stored);
  expect(projected).toMatchObject({ spendId: IDENTIFIER, amountMicros: '0' });
  expect(JSON.stringify(projected)).not.toContain('private');
  expect(projected).not.toHaveProperty('sourceRunId');
  expect(projected).not.toHaveProperty('preparedBy');
});
