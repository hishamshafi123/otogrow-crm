import {
  CLIENT_BUSINESS_INVOICE_PAYMENT_PREFIX,
  CLIENT_BUSINESS_PAYMENT_REF_TYPE,
  deterministicClientReceivableInvoiceId,
} from 'src/modules/delivery/finance-v2/finance-v2-client-sync.util';
import { computeProjectedMrrSnapshot } from 'src/modules/delivery/finance-v2/finance-v2-mrr.util';
import { type BusinessRecord } from 'src/modules/delivery/business/delivery-business.types';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const CLIENT_MONTHLY_USD = '22222222-2222-4222-8222-222222222201';
const CLIENT_QUARTERLY_AED = '22222222-2222-4222-8222-222222222202';
const CLIENT_UNPAID_AED = '22222222-2222-4222-8222-222222222203';
const CLIENT_ONETIME_USD = '22222222-2222-4222-8222-222222222204';
const CLIENT_EXCLUDED = '22222222-2222-4222-8222-222222222299';
const PROJECT_MONTHLY = '33333333-3333-4333-8333-333333333301';
const PROJECT_QUARTERLY = '33333333-3333-4333-8333-333333333302';

const makeFinanceRecord = (
  overrides: Partial<Extract<BusinessRecord, { kind: 'FINANCE' }>> & {
    id: string;
    category: 'INCOME' | 'RECEIVABLE';
    currency: 'AED' | 'USD' | 'INR' | 'QAR';
    amount: number;
    date: string;
  },
): Extract<BusinessRecord, { kind: 'FINANCE' }> => ({
  kind: 'FINANCE',
  revision: 1,
  projectId: null,
  companyId: null,
  taskId: null,
  title: 'Payment',
  dueDate: null,
  externalReference: '',
  evidenceUrl: null,
  notes: '',
  status: 'POSTED',
  createdBy: '99999999-9999-4999-8999-999999999999',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  decisionBy: null,
  evidence: null,
  history: [],
  ...overrides,
});

describe('computeProjectedMrrSnapshot', () => {
  it('normalizes Monthly (100%), Quarterly (/3), excludes One-time into separate bucket, excludes non-roster clients, and computes per-client collected vs remaining accurately', () => {
    const paymentRecordId = '44444444-4444-4444-8444-444444444401';
    const receivableRecordId = '44444444-4444-4444-8444-444444444402';
    const receiptRecordId = '44444444-4444-4444-8444-444444444403';
    const syncedInvoiceId = deterministicClientReceivableInvoiceId(
      WORKSPACE_ID,
      receivableRecordId,
    );

    const snapshot = computeProjectedMrrSnapshot({
      workspaceId: WORKSPACE_ID,
      month: '2026-11',
      exchangeRates: {
        AED: '1',
        USD: '3.6725',
      },
      activeClients: [
        { id: CLIENT_MONTHLY_USD, name: 'Acme USD' },
        { id: CLIENT_QUARTERLY_AED, name: 'Beta Quarterly' },
        { id: CLIENT_UNPAID_AED, name: 'Gamma Unpaid' },
        { id: CLIENT_ONETIME_USD, name: 'Delta OneTime' },
      ],
      clientFees: {
        // $1,000/mo -> AED 3,672.50/mo
        [CLIENT_MONTHLY_USD]: {
          amount: 100000,
          currency: 'USD',
          cadence: 'MONTHLY',
          notes: 'Retainer',
          updatedAt: '2026-11-01T00:00:00.000Z',
        },
        // AED 9,000/qtr -> AED 3,000/mo
        [CLIENT_QUARTERLY_AED]: {
          amount: 900000,
          currency: 'AED',
          cadence: 'QUARTERLY',
          notes: 'Quarterly plan',
          updatedAt: '2026-11-01T00:00:00.000Z',
        },
        // AED 4,000/mo -> unpaid
        [CLIENT_UNPAID_AED]: {
          amount: 400000,
          currency: 'AED',
          cadence: 'MONTHLY',
          notes: '',
          updatedAt: '2026-11-01T00:00:00.000Z',
        },
        // $5,000 one-time -> excluded from MRR, tracked in oneTime
        [CLIENT_ONETIME_USD]: {
          amount: 500000,
          currency: 'USD',
          cadence: 'ONE_TIME',
          notes: 'Website build',
          updatedAt: '2026-11-01T00:00:00.000Z',
        },
        // Stale fee for excluded client -> MUST be ignored
        [CLIENT_EXCLUDED]: {
          amount: 999900,
          currency: 'AED',
          cadence: 'MONTHLY',
          notes: 'Old churned client',
          updatedAt: '2026-10-01T00:00:00.000Z',
        },
      },
      projects: [
        { id: PROJECT_MONTHLY, companyId: CLIENT_MONTHLY_USD },
        { id: PROJECT_QUARTERLY, companyId: CLIENT_QUARTERLY_AED },
      ],
      businessRecords: [
        // Acme USD overpaid ($1,500 in Nov) AND synced to Finance V2 journal (must NOT double count!)
        makeFinanceRecord({
          id: paymentRecordId,
          companyId: CLIENT_MONTHLY_USD,
          projectId: PROJECT_MONTHLY,
          category: 'INCOME',
          currency: 'USD',
          amount: 150000,
          date: '2026-11-05',
        }),
        // Beta Quarterly paid AED 1,500 (50% of AED 3,000 monthly equiv) via settled receivable
        makeFinanceRecord({
          id: receivableRecordId,
          companyId: CLIENT_QUARTERLY_AED,
          projectId: PROJECT_QUARTERLY,
          category: 'RECEIVABLE',
          currency: 'AED',
          amount: 150000,
          date: '2026-11-01',
          status: 'PAID',
        }),
        makeFinanceRecord({
          id: receiptRecordId,
          companyId: CLIENT_QUARTERLY_AED,
          projectId: PROJECT_QUARTERLY,
          category: 'INCOME',
          currency: 'AED',
          amount: 150000,
          date: '2026-11-10',
          externalReference: `receivable:${receivableRecordId}`,
        }),
        // Gamma Unpaid had a payment in OCTOBER (previous month) -> must NOT count for November!
        makeFinanceRecord({
          id: '44444444-4444-4444-8444-444444444409',
          companyId: CLIENT_UNPAID_AED,
          category: 'INCOME',
          currency: 'AED',
          amount: 400000,
          date: '2026-10-25',
        }),
      ],
      financeV2PaymentJournals: [
        // Synced journal for Acme USD ($1,500 = AED 5,508.75)
        {
          id: '55555555-5555-4555-8555-555555555501',
          entryDate: '2026-11-05',
          currency: 'USD',
          amountMicros: '1500000000',
          aedAmountMicros: '5508750000',
          projectId: PROJECT_MONTHLY,
          sourceRefType: CLIENT_BUSINESS_PAYMENT_REF_TYPE,
          sourceRefId: paymentRecordId,
          status: 'POSTED',
          reversed: false,
        },
        // Synced journal for Beta Quarterly partial settlement (AED 1,500)
        {
          id: '55555555-5555-4555-8555-555555555502',
          entryDate: '2026-11-10',
          currency: 'AED',
          amountMicros: '1500000000',
          aedAmountMicros: '1500000000',
          projectId: PROJECT_QUARTERLY,
          sourceRefType: 'INVOICE_PAYMENT',
          sourceRefId: `${syncedInvoiceId}:${CLIENT_BUSINESS_INVOICE_PAYMENT_PREFIX}${receiptRecordId}`,
          status: 'POSTED',
          reversed: false,
        },
      ],
    });

    // Projected MRR = AED 3,672.50 + AED 3,000 + AED 4,000 = AED 10,672.50
    expect(snapshot.projectedMrrAedMicros).toBe('10672500000');
    // Collected toward MRR = capped per-client: AED 3,672.50 (Acme) + AED 1,500 (Beta) + 0 (Gamma) = AED 5,172.50
    // (Acme's extra $500 overpayment MUST NOT hide Beta/Gamma's remaining balance!)
    expect(snapshot.collectedTowardMrrAedMicros).toBe('5172500000');
    // Remaining = AED 1,500 (Beta) + AED 4,000 (Gamma) = AED 5,500
    expect(snapshot.remainingAedMicros).toBe('5500000000');
    // Exact invariant: collectedTowardMrr + remaining === projectedMrr
    expect(
      BigInt(snapshot.collectedTowardMrrAedMicros) +
        BigInt(snapshot.remainingAedMicros),
    ).toBe(BigInt(snapshot.projectedMrrAedMicros));
    // Raw collected from MRR clients = AED 5,508.75 + AED 1,500 = AED 7,008.75 (no double-counting!)
    expect(snapshot.totalCollectedThisMonthAedMicros).toBe('7008750000');

    expect(snapshot.mrrClientCount).toBe(3);
    expect(snapshot.paidClientCount).toBe(1);
    expect(snapshot.partialClientCount).toBe(1);
    expect(snapshot.unpaidClientCount).toBe(1);

    // Ordering: UNPAID first, then PARTIAL, then PAID
    expect(snapshot.clients.map((c) => [c.companyName, c.status])).toEqual([
      ['Gamma Unpaid', 'UNPAID'],
      ['Beta Quarterly', 'PARTIAL'],
      ['Acme USD', 'PAID'],
    ]);
    expect(snapshot.clients[1].monthlyEquivalentMinor).toBe(300000);
    expect(snapshot.clients[1].collectionPercent).toBe(50);

    // Multi-currency breakdown
    expect(snapshot.byCurrency).toEqual([
      {
        currency: 'AED',
        projectedMrrMinor: 700000,
        projectedMrrMicros: '7000000000',
        projectedMrrAedMicros: '7000000000',
        clientCount: 2,
        paidCount: 0,
        partialCount: 1,
        unpaidCount: 1,
      },
      {
        currency: 'USD',
        projectedMrrMinor: 100000,
        projectedMrrMicros: '1000000000',
        projectedMrrAedMicros: '3672500000',
        clientCount: 1,
        paidCount: 1,
        partialCount: 0,
        unpaidCount: 0,
      },
    ]);

    // One-time tracked separately
    expect(snapshot.oneTime.clientCount).toBe(1);
    expect(snapshot.oneTime.totalAedMicros).toBe('18362500000');
    expect(snapshot.oneTime.byCurrency).toEqual([
      {
        currency: 'USD',
        amountMinor: 500000,
        amountMicros: '5000000000',
        aedMicros: '18362500000',
        clientCount: 1,
      },
    ]);
  });

  it('drops client back to UNPAID when its Finance V2 payment journal is reversed', () => {
    const paymentRecordId = '44444444-4444-4444-8444-444444444411';

    const snapshot = computeProjectedMrrSnapshot({
      workspaceId: WORKSPACE_ID,
      month: '2026-11',
      activeClients: [{ id: CLIENT_UNPAID_AED, name: 'Gamma' }],
      clientFees: {
        [CLIENT_UNPAID_AED]: {
          amount: 400000,
          currency: 'AED',
          cadence: 'MONTHLY',
          notes: '',
          updatedAt: '2026-11-01T00:00:00.000Z',
        },
      },
      projects: [],
      businessRecords: [
        makeFinanceRecord({
          id: paymentRecordId,
          companyId: CLIENT_UNPAID_AED,
          category: 'INCOME',
          currency: 'AED',
          amount: 400000,
          date: '2026-11-05',
        }),
      ],
      financeV2PaymentJournals: [
        {
          id: '55555555-5555-4555-8555-555555555511',
          entryDate: '2026-11-05',
          currency: 'AED',
          amountMicros: '4000000000',
          aedAmountMicros: '4000000000',
          projectId: null,
          sourceRefType: CLIENT_BUSINESS_PAYMENT_REF_TYPE,
          sourceRefId: paymentRecordId,
          status: 'POSTED',
          reversed: true,
        },
      ],
    });

    expect(snapshot.paidClientCount).toBe(0);
    expect(snapshot.unpaidClientCount).toBe(1);
    expect(snapshot.collectedTowardMrrAedMicros).toBe('0');
    expect(snapshot.remainingAedMicros).toBe('4000000000');
  });
});
