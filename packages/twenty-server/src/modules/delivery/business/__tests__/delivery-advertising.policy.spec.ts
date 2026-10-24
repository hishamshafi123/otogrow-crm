import { advertisingInsights } from 'src/modules/delivery/business/delivery-advertising.policy';
import { type BusinessRecord } from 'src/modules/delivery/business/delivery-business.types';
const report: BusinessRecord = {
  id: 'report',
  revision: 1,
  kind: 'AD_REPORT',
  projectId: 'project',
  title: 'Daily report',
  date: '2026-10-24',
  channel: 'META',
  currency: 'USD',
  spend: 10000,
  attributedRevenue: 25000,
  shopifyRevenue: 50000,
  purchases: 4,
  qualifiedLeads: 10,
  bookedCalls: 2,
  webinarRegistrations: 20,
  goal: 'PURCHASES',
  targetCost: 2000,
  recommendation: 'Review',
  sourceUrl: 'https://example.com',
  marketerId: 'marketer',
  createdBy: 'manager',
  createdAt: '2026-10-25T00:00:00Z',
  updatedAt: '2026-10-25T00:00:00Z',
  status: 'DRAFT',
  decisionBy: null,
  evidence: null,
  taskId: null,
  history: [],
};
const insights = (changes: Partial<typeof report> = {}) =>
  advertisingInsights(
    [{ ...report, ...changes }],
    new Date('2026-10-25T12:00:00Z'),
  )[0];
it('uses the selected outcome and keeps store revenue out of attributed ROAS', () => {
  expect(insights()).toMatchObject({
    outcomes: 4,
    costPerOutcome: 2500,
    attributedRoas: 2.5,
    signal: 'ABOVE_TARGET',
    excessSpend: 2000,
  });
  expect(insights({ goal: 'LEADS' })).toMatchObject({
    outcomes: 10,
    costPerOutcome: 1000,
    signal: 'WITHIN_TARGET',
    excessSpend: 0,
  });
});
it('does not invent cost or ratios with zero denominators or an unset target', () => {
  expect(insights({ purchases: 0 })).toMatchObject({
    costPerOutcome: null,
    signal: 'NO_OUTCOMES',
  });
  expect(insights({ spend: 0 })).toMatchObject({
    attributedRoas: null,
    signal: 'NO_SPEND',
  });
  expect(insights({ targetCost: 0 })).toMatchObject({
    excessSpend: null,
    signal: 'NO_TARGET',
  });
});
it('flags stale and future observations and excludes voided reports', () => {
  expect(insights({ date: '2026-10-22' }).stale).toBe(true);
  expect(insights({ date: '2026-10-26' }).signal).toBe('FUTURE_DATE');
  expect(insights({ status: 'VOID' })).toBeUndefined();
});
