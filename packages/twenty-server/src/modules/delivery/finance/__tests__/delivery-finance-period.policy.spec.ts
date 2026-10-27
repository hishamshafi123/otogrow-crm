import {
  financePeriodChangeSchema,
  financePeriodSummariesSchema,
} from 'src/modules/delivery/finance/delivery-finance-period.policy';
import { projectFinancePeriod } from 'src/modules/delivery/finance/delivery-finance-period.helpers';

const command = {
  id: 'e090d6e5-41b8-4fbc-94aa-f762277cd137',
  month: '2026-09',
  revision: 0,
  expectedPreviewToken: 'a'.repeat(64),
  status: 'LOCKED',
  reason: 'Reviewed the recorded results.',
  acknowledgeLimitations: true,
};

it('projects a missing period as open without inventing saved audit metadata', () => {
  expect(projectFinancePeriod('2026-09', null)).toEqual({
    id: null,
    month: '2026-09',
    status: 'OPEN',
    revision: 0,
    changedBy: null,
    changedByName: null,
    changedAt: null,
    reason: null,
  });
});
it.each([
  { month: '2026-13' },
  { month: '0000-01' },
  { reason: '   ' },
  { revision: -1 },
  { status: 'CLOSED' },
  { expectedPreviewToken: 'old' },
])('rejects an invalid management-period command %j', (invalid) => {
  expect(
    financePeriodChangeSchema.safeParse({ ...command, ...invalid }).success,
  ).toBe(false);
});
it('retains a deliberate reopen reason without treating it as an accounting close', () => {
  expect(
    financePeriodChangeSchema.parse({
      ...command,
      status: 'OPEN',
      revision: 1,
      reason: '  Correct a recorded cost.  ',
      acknowledgeLimitations: false,
    }),
  ).toMatchObject({ status: 'OPEN', reason: 'Correct a recorded cost.' });
});
it('retains exact aggregate amounts beyond one bigint entry and signed results while excluding extra history payloads', () => {
  const summary = {
    currency: 'USD',
    revenueMicros: '10000000000000000000',
    costMicros: '20000000000000000001',
    resultMicros: '-10000000000000000001',
    draftCount: 0,
    postedCount: 4,
    voidCount: 0,
    projects: [
      {
        projectId: null,
        projectName: null,
        revenueMicros: '0',
        costMicros: '20000000000000000001',
        resultMicros: '-20000000000000000001',
        postedCount: 2,
        privatePayload: 'hidden',
      },
    ],
    privatePayload: 'hidden',
  };
  const projected = financePeriodSummariesSchema.parse([summary]);
  expect(projected[0].costMicros).toBe('20000000000000000001');
  expect(projected[0].resultMicros).toBe('-10000000000000000001');
  expect(JSON.stringify(projected)).not.toContain('privatePayload');
});
