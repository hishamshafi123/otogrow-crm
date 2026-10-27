import { type EntityManager } from 'typeorm';
import {
  financeLegacyReceiptTarget,
  financeReceivableBalances,
  financeReceivableSettledTotals,
} from 'src/modules/delivery/finance/delivery-finance-reconciliation.hooks';
import { financialSummary } from 'src/modules/delivery/business/delivery-business.policy';
import { type BusinessRecord } from 'src/modules/delivery/business/delivery-business.types';
import {
  financeCashAmountSchema,
  financeCashSnapshot,
  financeCashSourceMatches,
  type FinanceCashSnapshot,
  financeCashMatchSchema,
  financePaymentSchema,
  financeReviewToken,
  financeSettlementSchema,
} from 'src/modules/delivery/finance/delivery-finance-reconciliation.policy';

const CASH_ID = 'e090d6e5-41b8-4fbc-94aa-f762277cd137';
const INVOICE_ID = '714b4f29-d850-441b-bbec-515c25a69f48';
const REQUEST_ID = '2b5a73d7-2055-410c-a9ea-cedc9ca75824';
const TOKEN = 'a'.repeat(64);
const payment = {
  id: CASH_ID,
  title: 'Actual payment',
  category: 'INCOME',
  currency: 'USD',
  amountMicros: '1230000',
  date: '2020-02-20',
  projectId: null,
  note: 'Bank transfer',
  evidenceUrl: null,
};

const record = (
  id: string,
  category: 'INCOME' | 'RECEIVABLE',
  amount: number,
): Extract<BusinessRecord, { kind: 'FINANCE' }> => ({
  id,
  revision: 1,
  kind: 'FINANCE',
  title: category,
  category,
  amount,
  currency: 'USD',
  date: '2020-02-20',
  dueDate: category === 'RECEIVABLE' ? '2020-02-21' : null,
  projectId: null,
  externalReference: '',
  evidenceUrl: null,
  notes: 'Bank source',
  status: category === 'RECEIVABLE' ? 'OPEN' : 'POSTED',
  createdBy: CASH_ID,
  createdAt: '2020-02-20T00:00:00Z',
  updatedAt: '2020-02-20T00:00:00Z',
  decisionBy: null,
  evidence: null,
  taskId: null,
  history: [],
});

it.each([
  '1.0',
  '1e6',
  '-10000',
  '00010000',
  'not-money',
  '9223372036854775808',
  '0',
  '1',
  '1000000000000001',
])(
  'rejects invalid cash money %s without throwing inside validation',
  (value) => {
    expect(() => financeCashAmountSchema.safeParse(value)).not.toThrow();
    expect(financeCashAmountSchema.safeParse(value).success).toBe(false);
  },
);
it('accepts the exact legacy cash maximum and retains an explicitly supplied payment date', () => {
  expect(financeCashAmountSchema.parse('1000000000000000')).toBe(
    '1000000000000000',
  );
  expect(financePaymentSchema.parse(payment)).toEqual(payment);
});
it.each(['not-a-url', 'javascript:alert(1)', 'ftp://example.com/receipt'])(
  'rejects unsupported payment evidence %s without a raw URL error',
  (value) => {
    expect(() =>
      financePaymentSchema.safeParse({ ...payment, evidenceUrl: value }),
    ).not.toThrow();
    expect(
      financePaymentSchema.safeParse({ ...payment, evidenceUrl: value })
        .success,
    ).toBe(false);
  },
);
it('requires explicit evidence and validates real calendar dates', () => {
  expect(financePaymentSchema.safeParse({ ...payment, note: '' }).success).toBe(
    false,
  );
  expect(
    financePaymentSchema.safeParse({ ...payment, date: '2020-02-30' }).success,
  ).toBe(false);
  expect(
    financePaymentSchema.safeParse({
      ...payment,
      note: '',
      evidenceUrl: 'https://example.com/receipt',
    }).success,
  ).toBe(true);
});
it('requires cent precision for settlements while retaining exact monthly micro allocations', () => {
  const common = {
    id: REQUEST_ID,
    cashId: CASH_ID,
    amountMicros: '1',
    expectedCashToken: TOKEN,
  };
  expect(
    financeSettlementSchema.safeParse({
      ...common,
      receivableId: INVOICE_ID,
      expectedReceivableToken: TOKEN,
    }).success,
  ).toBe(false);
  expect(
    financeCashMatchSchema.parse({
      ...common,
      entryId: INVOICE_ID,
      projectId: null,
      expectedEntryToken: TOKEN,
    }),
  ).toMatchObject({ amountMicros: '1', acknowledgeUnassignedCash: false });
});
it('changes the review token when a relation revision changes even if amounts return to the same balance', () => {
  expect(financeReviewToken({ amountMicros: '10000', revision: 1 })).not.toBe(
    financeReviewToken({ amountMicros: '10000', revision: 2 }),
  );
});
it('accepts a JSONB-reordered immutable source while detecting a changed financial amount', () => {
  const original = financeCashSnapshot(record(CASH_ID, 'INCOME', 4000), []);
  if (!original) throw new Error('Expected a valid payment fixture.');
  const reordered = Object.fromEntries(
    Object.entries(original).reverse(),
  ) as FinanceCashSnapshot;
  expect(financeCashSourceMatches(reordered, original)).toBe(true);
  expect(
    financeCashSourceMatches(reordered, {
      ...original,
      amountMicros: '50000000',
    }),
  ).toBe(false);
  expect(
    financeCashSourceMatches(reordered, {
      ...original,
      revision: 2,
      status: 'VOID',
      projectName: 'Renamed project',
    }),
  ).toBe(true);
});
it('subtracts partial settlements from receivables without changing actual cash', () => {
  const records = [
    record(INVOICE_ID, 'RECEIVABLE', 10000),
    record(CASH_ID, 'INCOME', 4000),
  ];
  const now = new Date('2020-02-22T00:00:00Z');
  const before = financialSummary(records, now);
  const after = financialSummary(
    records,
    now,
    new Map([[INVOICE_ID, BigInt('40000000')]]),
  );
  expect(after[0]).toMatchObject({
    cash: 4000,
    receivables: 6000,
    overdue: 6000,
  });
  expect(after[0].cash).toBe(before[0].cash);
});

it('exposes exact partial balances and omits invalid legacy amounts instead of inventing zero', () => {
  const invoice = record(INVOICE_ID, 'RECEIVABLE', 10000);
  const invalidInvoice = record(REQUEST_ID, 'RECEIVABLE', Number.NaN);
  expect(
    financeReceivableBalances(
      [invoice, invalidInvoice],
      new Map([[INVOICE_ID, BigInt('40000000')]]),
    ),
  ).toEqual([
    {
      id: INVOICE_ID,
      settledMicros: '40000000',
      outstandingMicros: '60000000',
      sourceWarnings: [],
    },
  ]);
});
it('rejects a preserved legacy receipt with a different currency or client project', () => {
  const invoice = record(INVOICE_ID, 'RECEIVABLE', 10000);
  const receipt = {
    ...record(CASH_ID, 'INCOME', 10000),
    externalReference: `receivable:${INVOICE_ID}`,
  };
  expect(financeLegacyReceiptTarget([invoice, receipt], receipt)?.id).toBe(
    INVOICE_ID,
  );
  expect(
    financeLegacyReceiptTarget([invoice, receipt], {
      ...receipt,
      currency: 'EUR',
    }),
  ).toBeNull();
  expect(
    financeLegacyReceiptTarget([invoice, receipt], {
      ...receipt,
      projectId: REQUEST_ID,
    }),
  ).toBeNull();
});
it('ignores a malformed legacy receipt reference before reading its target', async () => {
  const invoice = record(INVOICE_ID, 'RECEIVABLE', 10000);
  const malformedReceipt = {
    ...record(CASH_ID, 'INCOME', 10000),
    externalReference: 123,
  } as unknown as BusinessRecord;
  const records = [invoice, malformedReceipt];
  expect(financeLegacyReceiptTarget(records, malformedReceipt)).toBeNull();
  const manager = {
    query: jest.fn().mockResolvedValue([]),
  } as unknown as EntityManager;
  await expect(
    financeReceivableSettledTotals(manager, REQUEST_ID, records),
  ).resolves.toEqual(new Map());
});
it('keeps an encoded legacy paid balance visibly unverified when the receipt is missing', async () => {
  const invoice = {
    ...record(INVOICE_ID, 'RECEIVABLE', 10000),
    status: 'PAID' as const,
  };
  const records = [invoice];
  const manager = {
    query: jest.fn().mockResolvedValue([]),
  } as unknown as EntityManager;
  const totals = await financeReceivableSettledTotals(
    manager,
    REQUEST_ID,
    records,
  );
  expect(financeReceivableBalances(records, totals)).toEqual([
    {
      id: INVOICE_ID,
      settledMicros: '100000000',
      outstandingMicros: '0',
      sourceWarnings: ['LEGACY_PAID_WITHOUT_RECEIPT'],
    },
  ]);
  expect(records).toEqual([invoice]);
});
