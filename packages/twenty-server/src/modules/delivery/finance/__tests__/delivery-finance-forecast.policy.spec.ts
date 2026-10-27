import {
  financeForecastAnchorSchema,
  financeForecastBusinessDate,
  financeForecastItemSchema,
  financeForecastSignedAmountSchema,
  financeForecastSourcesSchema,
} from 'src/modules/delivery/finance/delivery-finance-forecast.policy';
import {
  forecastItemDTO,
  forecastPlanSource,
  type FinanceForecastState,
} from 'src/modules/delivery/finance/read-delivery-finance-forecast';
import { DeliveryFinanceForecastItemEntity } from 'src/modules/delivery/finance/entities/delivery-finance-forecast-item.entity';
import { DeliveryFinancePlanEntity } from 'src/modules/delivery/finance/entities/delivery-finance-plan.entity';

const MEMBER_ID = '00000000-0000-4000-8000-000000000001';
const ITEM_ID = '00000000-0000-4000-8000-000000000002';
const PLAN_ID = '00000000-0000-4000-8000-000000000003';
describe('reviewed cash forecast policy', () => {
  it.each(['0', '-1', '1', '-9223372036854775808', '9223372036854775807'])(
    'retains exact signed anchor %s',
    (amount) => {
      expect(financeForecastSignedAmountSchema.parse(amount)).toBe(amount);
    },
  );
  it.each([
    '-0',
    '01',
    '1.2',
    '-9223372036854775809',
    '9223372036854775808',
    'abc',
  ])(
    'rejects unsupported anchor %s without throwing a conversion error',
    (amount) => {
      expect(financeForecastSignedAmountSchema.safeParse(amount).success).toBe(
        false,
      );
    },
  );
  it('derives calendar today in the confirmed timezone across a year boundary', () => {
    const instant = new Date('2026-12-31T23:30:00.000Z');
    expect(financeForecastBusinessDate('Asia/Makassar', instant)).toBe(
      '2027-01-01',
    );
    expect(financeForecastBusinessDate('America/Los_Angeles', instant)).toBe(
      '2026-12-31',
    );
  });
  it('requires a plan month and rejects unsupported source kinds', () => {
    expect(
      financeForecastSourcesSchema.safeParse({ currency: 'USD', kind: 'PLAN' })
        .success,
    ).toBe(false);
    expect(
      financeForecastSourcesSchema.safeParse({
        currency: 'USD',
        kind: 'ENTRY',
        month: '2026-10',
      }).success,
    ).toBe(false);
    expect(
      financeForecastSourcesSchema.parse({
        currency: 'USD',
        kind: 'PLAN',
        month: '2026-10',
      }).month,
    ).toBe('2026-10');
  });
  it('rejects malformed URLs and unconfirmed anchor coverage as normal validation failures', () => {
    const anchor = {
      id: ITEM_ID,
      revision: 0,
      currency: 'USD',
      amountMicros: '0',
      closingDate: '2026-10-01',
      timezone: 'Asia/Makassar',
      note: 'Reviewed cash record',
      evidenceUrl: 'broken URL',
      acknowledgeCoverage: true,
      reason: 'Confirmed statement',
    };
    expect(financeForecastAnchorSchema.safeParse(anchor).success).toBe(false);
    expect(
      financeForecastAnchorSchema.safeParse({
        ...anchor,
        evidenceUrl: null,
        acknowledgeCoverage: false,
      }).success,
    ).toBe(false);
    expect(
      financeForecastAnchorSchema.safeParse({
        ...anchor,
        evidenceUrl: null,
        timezone: 'Unknown/Zone',
      }).success,
    ).toBe(false);
  });
  it('requires a deliberate invoice date and full source identity, preserving explicit zero outflows', () => {
    const fields = {
      commandId: ITEM_ID,
      id: ITEM_ID,
      revision: 0,
      status: 'ACTIVE',
      sourceType: 'MANUAL',
      currency: 'USD',
      title: 'Explicit free assumption',
      amountMicros: '0',
      ownerId: MEMBER_ID,
      nextActionDate: '2026-10-28',
      note: 'Confirmed no payment',
      reason: 'Reviewed assumption',
    };
    expect(financeForecastItemSchema.parse(fields).amountMicros).toBe('0');
    expect(
      financeForecastItemSchema.safeParse({
        ...fields,
        sourceType: 'RECEIVABLE',
        sourceId: PLAN_ID,
      }).success,
    ).toBe(false);
    expect(
      financeForecastItemSchema.safeParse({ ...fields, reason: '' }).success,
    ).toBe(false);
  });
  const plan = Object.assign(new DeliveryFinancePlanEntity(), {
    id: PLAN_ID,
    revision: 2,
    type: 'OVERHEAD' as const,
    name: 'Reviewed rent',
    currency: 'USD' as const,
    monthlyAmountMicros: '5000000',
    memberId: null,
    startMonth: '2026-10',
    endMonth: null,
    dueDay: 31,
    active: false,
  });
  const item = (): DeliveryFinanceForecastItemEntity =>
    Object.assign(new DeliveryFinanceForecastItemEntity(), {
      id: ITEM_ID,
      revision: 1,
      status: 'ACTIVE' as const,
      kind: 'OUTFLOW' as const,
      sourceType: 'PLAN' as const,
      planId: PLAN_ID,
      receivableId: null,
      planMonth: '2026-11',
      currency: 'USD',
      title: 'Reviewed rent',
      amountMicros: '4000000',
      expectedDate: '2026-11-30',
      ownerId: MEMBER_ID,
      ownerName: 'Reviewer',
      nextActionDate: '2026-10-28',
      note: 'Pay supplier',
      sourceToken: forecastPlanSource(plan, '2026-11', ITEM_ID)
        .sourceReviewToken,
      sourceSnapshot: {},
      changedAt: new Date('2026-10-28T00:00:00.000Z'),
      changedByName: 'Reviewer',
    });
  const state = (): FinanceForecastState => ({
    anchor: null,
    businessDate: '2026-10-28',
    cashData: { cash: [], receivables: [], anomalies: [] },
    plans: [plan],
    items: [],
    totals: [],
    owners: [{ id: MEMBER_ID, name: 'Reviewer' }],
  });
  it('quarantines changed or unacknowledged inactive plan sources, then retains explicitly reviewed amounts', () => {
    const row = item();
    expect(forecastItemDTO(row, state()).eligible).toBe(false);
    row.sourceSnapshot = { acknowledgedWarnings: ['PLAN_INACTIVE'] };
    const reviewed = forecastItemDTO(row, state());
    expect(reviewed.eligible).toBe(true);
    expect(reviewed.remainingMicros).toBe('4000000');
    expect(reviewed.warnings).toContain('PLAN_INACTIVE');
    row.sourceToken = 'a'.repeat(64);
    expect(forecastItemDTO(row, state()).warnings).toContain('SOURCE_CHANGED');
    expect(forecastItemDTO(row, state()).eligible).toBe(false);
  });
  it('does not silently move overdue expectations and removes departed owners from dated projections', () => {
    const row = item();
    row.sourceSnapshot = { acknowledgedWarnings: ['PLAN_INACTIVE'] };
    row.expectedDate = '2026-10-27';
    expect(forecastItemDTO(row, state()).warnings).toContain(
      'OVERDUE_EXPECTATION',
    );
    expect(forecastItemDTO(row, state()).expectedDate).toBe('2026-10-27');
    expect(forecastItemDTO(row, state()).eligible).toBe(false);
    const current = state();
    current.owners = [];
    expect(forecastItemDTO(row, current).warnings).toContain(
      'OWNER_INELIGIBLE',
    );
  });
  it('conserves partial applications and keeps cancellation separate from actual applied cash', () => {
    const row = item();
    row.sourceSnapshot = { acknowledgedWarnings: ['PLAN_INACTIVE'] };
    const current = state();
    current.totals = [
      {
        itemId: ITEM_ID,
        cashId: PLAN_ID,
        amount: '1500001',
        version: 'version1',
      },
    ];
    expect(forecastItemDTO(row, current).remainingMicros).toBe('2499999');
    row.status = 'CANCELLED';
    expect(forecastItemDTO(row, current)).toMatchObject({
      remainingMicros: '0',
      appliedMicros: '1500001',
      eligible: false,
    });
  });
  it('clamps plan due-day suggestions without replacing a confirmed item date', () => {
    expect(forecastPlanSource(plan, '2027-02', null).suggestedDate).toBe(
      '2027-02-28',
    );
    expect(forecastItemDTO(item(), state()).expectedDate).toBe('2026-11-30');
  });
});
