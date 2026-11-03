import { validateOtogrowAiMediaReservation } from 'src/modules/otogrow-ai-budget/otogrow-ai-media.policy';
import { type OtogrowAiMediaReservation } from 'src/modules/otogrow-ai-budget/otogrow-ai-budget.types';

const NOW = new Date('2026-10-29T08:00:00.000Z');
const request = (): OtogrowAiMediaReservation => ({
  workspaceId: '10000000-0000-4000-8000-000000000001',
  actorId: '10000000-0000-4000-8000-000000000002',
  projectId: '10000000-0000-4000-8000-000000000003',
  taskId: '10000000-0000-4000-8000-000000000004',
  sourceRunId: '10000000-0000-4000-8000-000000000005',
  modelId: 'atlascloud/google/nano-banana-pro/text-to-image',
  kind: 'IMAGE',
  limit: {
    id: '10000000-0000-4000-8000-000000000006',
    revision: 1,
    maximumCostUsd: '0.250000',
    source: 'Synthetic verified request limit; no provider price claim.',
    verifiedAt: '2026-10-28T08:00:00.000Z',
  },
  quotedCostUsd: '0.125001',
  quoteEstimated: false,
  quotedAt: NOW.toISOString(),
  requestHash: 'a'.repeat(64),
  catalogSchemaRevision: 'atlas-catalog-2026-10-29',
});

it('accepts an exact fixed-unit request without treating a discount as the maximum reservation', () => {
  const result = validateOtogrowAiMediaReservation(request(), NOW);
  expect(result.limit.maximumCostUsd).toBe('0.250000');
  expect(result.quotedCostUsd).toBe('0.125001');
});

it.each([
  { quotedCostUsd: '0.250001' },
  { quotedCostUsd: '0.0000001' },
  { quotedCostUsd: '-0.01' },
  { quoteEstimated: true },
  { quotedAt: '2026-10-29T08:00:00.001Z' },
  { quotedAt: '2026-10-29T07:54:59.999Z' },
  { requestHash: 'unbound request' },
  { modelId: 'google/unrelated-model' },
])('blocks unsupported or unbound request pricing: %j', (change) => {
  expect(() =>
    validateOtogrowAiMediaReservation({ ...request(), ...change }, NOW),
  ).toThrow();
});

it('accepts the exact five-minute boundary and permits an expired quote only for a separately matched existing request', () => {
  const value = { ...request(), quotedAt: '2026-10-29T07:55:00.000Z' };
  expect(validateOtogrowAiMediaReservation(value, NOW).requestHash).toBe(
    value.requestHash,
  );
  value.quotedAt = '2026-10-29T07:00:00.000Z';
  expect(() => validateOtogrowAiMediaReservation(value, NOW)).toThrow();
  expect(validateOtogrowAiMediaReservation(value, NOW, true).requestHash).toBe(
    value.requestHash,
  );
});

it.each([
  { maximumCostUsd: '0' },
  { maximumCostUsd: '-1' },
  { maximumCostUsd: '0.0000001' },
  { revision: 0 },
  { verifiedAt: '2026-10-29T08:00:00.001Z' },
])('requires a real current administrator limit: %j', (change) => {
  const value = request();
  value.limit = { ...value.limit, ...change };
  expect(() => validateOtogrowAiMediaReservation(value, NOW)).toThrow();
});

it('keeps a quoted zero distinct from a missing or zero maximum limit', () => {
  expect(
    validateOtogrowAiMediaReservation({ ...request(), quotedCostUsd: '0' }, NOW)
      .quotedCostUsd,
  ).toBe('0');
});
