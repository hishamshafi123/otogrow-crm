import { type BusinessRecord } from 'src/modules/delivery/business/delivery-business.types';
import { financeCashSnapshot } from 'src/modules/delivery/finance/delivery-finance-reconciliation.policy';
import { projectFinanceForecastCash } from 'src/modules/delivery/finance/read-delivery-forecast-cash';

type FinanceRecord = Extract<BusinessRecord, { kind: 'FINANCE' }>;
type CashState = Parameters<typeof projectFinanceForecastCash>[0];
const INVOICE_ID = '11111111-1111-4111-8111-111111111111';
const RECEIPT_ID = '22222222-2222-4222-8222-222222222222';
const WORKSPACE_ID = '33333333-3333-4333-8333-333333333333';
const ACTOR_ID = '44444444-4444-4444-8444-444444444444';

const invoice = (fields: Partial<FinanceRecord> = {}): FinanceRecord => ({
  kind: 'FINANCE',
  id: INVOICE_ID,
  revision: 1,
  createdBy: ACTOR_ID,
  createdAt: '2026-10-27T12:00:00Z',
  updatedAt: '2026-10-27T12:00:00Z',
  title: 'Recorded invoice',
  projectId: null,
  currency: 'USD',
  amount: 100000,
  date: '2026-10-27',
  dueDate: '2026-11-01',
  category: 'RECEIVABLE',
  externalReference: '',
  evidenceUrl: null,
  notes: 'Recorded invoice evidence.',
  status: 'OPEN',
  decisionBy: null,
  evidence: null,
  taskId: null,
  history: [],
  ...fields,
});
const receipt = (fields: Partial<FinanceRecord> = {}) =>
  invoice({
    id: RECEIPT_ID,
    title: 'Actual payment',
    category: 'INCOME',
    status: 'POSTED',
    amount: 40000,
    date: '2026-10-28',
    dueDate: null,
    ...fields,
  });
const state = (fields: Partial<CashState> = {}): CashState => ({
  workspaceId: WORKSPACE_ID,
  currency: 'USD',
  businessDate: '2026-10-28',
  records: [invoice(), receipt()],
  projects: [],
  storedSources: [],
  settlements: [],
  ...fields,
});
const settlement = (
  fields: Partial<CashState['settlements'][number]> = {},
): CashState['settlements'][number] => ({
  id: '55555555-5555-4555-8555-555555555555',
  cashId: RECEIPT_ID,
  receivableId: INVOICE_ID,
  currency: 'USD',
  amountMicros: '400000000',
  ...fields,
});
const normalized = (
  record: FinanceRecord,
): CashState['storedSources'][number] => {
  const snapshot = financeCashSnapshot(record, []);
  if (!snapshot) throw new Error('Expected a valid financial test source.');
  return {
    id: record.id,
    kind: record.category === 'RECEIVABLE' ? 'RECEIVABLE' : 'CASH',
    currency: record.currency,
    amountMicros: snapshot.amountMicros,
    snapshot,
  };
};

it('keeps cash and known partial invoice debt separate without inventing a receipt', () => {
  const result = projectFinanceForecastCash(
    state({ settlements: [settlement()] }),
  );
  expect(result.cash[0]).toMatchObject({
    eligible: true,
    snapshot: { amountMicros: '400000000' },
    createdAt: '2026-10-27T12:00:00Z',
  });
  expect(result.receivables[0]).toMatchObject({
    eligible: true,
    settledMicros: '400000000',
    outstandingMicros: '600000000',
  });
  expect(result.anomalies).toEqual([]);
});

it('does not make a reliable dated balance before the reporting date is configured', () => {
  const result = projectFinanceForecastCash(state({ businessDate: null }));
  expect(result.cash[0].eligible).toBe(false);
  expect(result.receivables[0]).toMatchObject({
    eligible: false,
    settledMicros: null,
    outstandingMicros: null,
  });
  expect(result.anomalies).toContainEqual(
    expect.objectContaining({
      code: 'REPORTING_DATE_NOT_SET',
      sourceType: null,
    }),
  );
});

it('counts a valid legacy receipt once and validates a paid invoice from its evidence', () => {
  const result = projectFinanceForecastCash(
    state({
      records: [
        invoice({ status: 'PAID' }),
        receipt({
          amount: 100000,
          externalReference: `receivable:${INVOICE_ID}`,
        }),
      ],
    }),
  );
  expect(result.receivables[0]).toMatchObject({
    eligible: true,
    settledMicros: '1000000000',
    outstandingMicros: '0',
  });
  expect(result.cash[0].eligible).toBe(true);
});

it('accepts fully evidenced normalized settlement for a PAID status without adding an assumed legacy payment', () => {
  const result = projectFinanceForecastCash(
    state({
      records: [invoice({ status: 'PAID' }), receipt({ amount: 100000 })],
      settlements: [settlement({ amountMicros: '1000000000' })],
    }),
  );
  expect(result.receivables[0]).toMatchObject({
    eligible: true,
    settledMicros: '1000000000',
    outstandingMicros: '0',
  });
});

it.each([
  [[], 'LEGACY_PAID_WITHOUT_RECEIPT'],
  [[settlement()], 'PAID_BALANCE_MISMATCH'],
])(
  'does not infer missing cash from a PAID status with incomplete receipt evidence',
  (settlements, warning) => {
    const result = projectFinanceForecastCash(
      state({ records: [invoice({ status: 'PAID' }), receipt()], settlements }),
    );
    expect(result.receivables[0]).toMatchObject({
      eligible: false,
      settledMicros: null,
      outstandingMicros: null,
    });
    expect(result.receivables[0].warnings).toContain(warning);
    expect(result.cash[0].snapshot.amountMicros).toBe('400000000');
  },
);

it.each([false, true])(
  'quarantines future-dated normalized or legacy receipt evidence without converting it to zero debt',
  (legacy) => {
    const result = projectFinanceForecastCash(
      state({
        records: [
          invoice(),
          receipt({
            date: '2026-10-29',
            externalReference: legacy ? `receivable:${INVOICE_ID}` : '',
          }),
        ],
        settlements: legacy ? [] : [settlement()],
      }),
    );
    expect(result.cash[0].eligible).toBe(false);
    expect(result.receivables[0]).toMatchObject({
      eligible: false,
      outstandingMicros: null,
    });
    expect(result.anomalies).toContainEqual(
      expect.objectContaining({
        code: 'FUTURE_CASH',
        sourceType: 'RECEIVABLE',
      }),
    );
  },
);

it.each(['missing', 'void', 'invalid'] as const)(
  'quarantines an active settlement whose actual payment is %s',
  (kind) => {
    const records =
      kind === 'missing'
        ? [invoice()]
        : [
            invoice(),
            kind === 'void'
              ? receipt({ status: 'VOID' })
              : { ...receipt(), amount: 'not an amount' },
          ];
    const result = projectFinanceForecastCash(
      state({ records, settlements: [settlement()] }),
    );
    expect(result.receivables[0]).toMatchObject({
      eligible: false,
      settledMicros: null,
      outstandingMicros: null,
    });
    expect(result.anomalies).toContainEqual(
      expect.objectContaining({ id: INVOICE_ID, sourceType: 'RECEIVABLE' }),
    );
  },
);

it('keeps a valid actual cash receipt while quarantining overallocated invoice debt', () => {
  const result = projectFinanceForecastCash(
    state({ settlements: [settlement({ amountMicros: '500000000' })] }),
  );
  expect(result.cash[0]).toMatchObject({
    eligible: true,
    snapshot: { amountMicros: '400000000' },
  });
  expect(result.cash[0].warnings).toContain('OVER_SETTLED');
  expect(result.receivables[0]).toMatchObject({
    eligible: false,
    outstandingMicros: null,
  });
});

it('rejects duplicate normalized and legacy application without double-counting actual cash', () => {
  const result = projectFinanceForecastCash(
    state({
      records: [
        invoice(),
        receipt({ externalReference: `receivable:${INVOICE_ID}` }),
      ],
      settlements: [settlement()],
    }),
  );
  expect(result.cash).toHaveLength(1);
  expect(result.cash[0].eligible).toBe(true);
  expect(result.receivables[0].outstandingMicros).toBeNull();
  expect(result.receivables[0].warnings).toContain('OVER_SETTLED');
});

it('keeps currencies separate and rejects a cross-currency receipt link', () => {
  const result = projectFinanceForecastCash(
    state({
      records: [invoice(), receipt({ currency: 'EUR' })],
      settlements: [settlement()],
    }),
  );
  expect(result.cash).toEqual([]);
  expect(result.receivables[0].outstandingMicros).toBeNull();
  expect(result.receivables[0].warnings).toContain('LEGACY_RECEIPT_MISMATCH');
});

it('excludes old opening-balance records and never exposes unrelated or arbitrary legacy payloads', () => {
  const result = projectFinanceForecastCash(
    state({
      records: [
        null,
        {
          kind: 'CONVERSATION',
          title: 'Private conversation',
          notes: 'private-message',
        },
        receipt({ category: 'OPENING_BALANCE' }),
        { ...invoice(), hiddenProviderPayload: 'private-prompt' },
      ],
    }),
  );
  expect(result.cash).toEqual([]);
  expect(result.receivables[0].outstandingMicros).toBe('1000000000');
  expect(JSON.stringify(result)).not.toMatch(
    /private-message|private-prompt|Private conversation|hiddenProviderPayload/,
  );
});

it.each(['CASH', 'RECEIVABLE'] as const)(
  'keeps an immutable normalized %s source mismatch quarantined',
  (kind) => {
    const record = kind === 'CASH' ? receipt() : invoice();
    const result = projectFinanceForecastCash(
      state({
        records: [{ ...record, amount: record.amount + 1 }],
        storedSources: [normalized(record)],
      }),
    );
    const source = kind === 'CASH' ? result.cash[0] : result.receivables[0];
    expect(source.eligible).toBe(false);
    expect(source.warnings).toContain('SOURCE_CHANGED');
  },
);

it('keeps the structural invoice token stable through routine receipt totals, revision, status and project-name changes', () => {
  const projectId = '66666666-6666-4666-8666-666666666666';
  const original = invoice({ projectId });
  const before = projectFinanceForecastCash(
    state({
      records: [original],
      projects: [{ id: projectId, name: 'Before rename' }],
    }),
  );
  const after = projectFinanceForecastCash(
    state({
      records: [
        invoice({ projectId, revision: 2, status: 'PAID' }),
        receipt({ amount: 100000 }),
      ],
      settlements: [settlement({ amountMicros: '1000000000' })],
      projects: [{ id: projectId, name: 'After rename' }],
    }),
  );
  expect(after.receivables[0].sourceToken).toBe(
    before.receivables[0].sourceToken,
  );
  expect(before.receivables[0].outstandingMicros).toBe('1000000000');
  expect(after.receivables[0]).toMatchObject({
    eligible: true,
    outstandingMicros: '0',
  });
});

it('changes the structural token when the financial source is voided', () => {
  const before = projectFinanceForecastCash(state({ records: [invoice()] }));
  const after = projectFinanceForecastCash(
    state({ records: [invoice({ status: 'VOID', revision: 2 })] }),
  );
  expect(after.receivables[0].sourceToken).not.toBe(
    before.receivables[0].sourceToken,
  );
  expect(after.receivables[0].eligible).toBe(false);
});

it('turns duplicate legacy identities into unknown sources instead of double-counted cash', () => {
  const result = projectFinanceForecastCash(
    state({ records: [receipt(), receipt()] }),
  );
  expect(result.cash).toHaveLength(1);
  expect(result.cash[0].eligible).toBe(false);
  expect(result.cash[0].warnings).toContain('INVALID_CASH');
});

it('preserves missing normalized source provenance for an actionable exception', () => {
  const result = projectFinanceForecastCash(
    state({ records: [], storedSources: [normalized(invoice())] }),
  );
  expect(result.receivables).toEqual([]);
  expect(result.anomalies).toContainEqual(
    expect.objectContaining({
      id: INVOICE_ID,
      sourceType: 'RECEIVABLE',
      code: 'MISSING_CASH',
    }),
  );
});

it('does not fabricate record creation evidence and rejects malformed source containers', () => {
  const result = projectFinanceForecastCash(
    state({ records: [receipt({ createdAt: 'unknown' })] }),
  );
  expect(result.cash[0]).toMatchObject({ eligible: true, createdAt: null });
  expect(
    projectFinanceForecastCash(state({ records: {} })).anomalies,
  ).toContainEqual(
    expect.objectContaining({ code: 'INVALID_CASH', sourceType: null }),
  );
});

it('makes a valid dated receipt current on its business day without changing structural evidence', () => {
  const before = projectFinanceForecastCash(
    state({ records: [receipt({ date: '2026-10-29' })] }),
  );
  const after = projectFinanceForecastCash(
    state({
      records: [receipt({ date: '2026-10-29' })],
      businessDate: '2026-10-29',
    }),
  );
  expect(before.cash[0].eligible).toBe(false);
  expect(after.cash[0].eligible).toBe(true);
  expect(after.cash[0].sourceToken).toBe(before.cash[0].sourceToken);
});
