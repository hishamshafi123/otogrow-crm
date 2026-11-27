import { randomUUID } from 'node:crypto';
import { deterministicClientReceivableInvoiceId } from 'src/modules/delivery/finance-v2/finance-v2-client-sync.util';

import {
  applyClientRosterUpdate,
  buildClientHubSnapshot,
  includeCompanyInClientRoster,
  parseClientRosterUpdate,
  resolveEffectiveClientCompanyIds,
} from 'src/modules/delivery/clients/delivery-client-hub.policy';
import { type DeliveryDetails } from 'src/modules/delivery/delivery.types';
import { type ClientEngagement } from 'src/modules/delivery/clients/delivery-clients.types';
import { type BusinessRecord } from 'src/modules/delivery/business/delivery-business.types';

const makeDetails = (
  overrides: Partial<DeliveryDetails> = {},
): DeliveryDetails => ({
  brief: 'Deliver Q4 audit',
  service: 'SEO',
  priority: 'NORMAL',
  scheduledDate: null,
  reviewerId: randomUUID(),
  state: 'IN_PROGRESS',
  blocker: '',
  checklist: [],
  evidence: [],
  submissions: [],
  events: [],
  ...overrides,
});

describe('delivery-client-hub.policy', () => {
  it('includes explicitly added, project-backed, and engagement-backed companies while honoring explicit exclusions', () => {
    const explicitId = randomUUID();
    const projectId = randomUUID();
    const engagementId = randomUUID();
    const excludedId = randomUUID();

    const effective = resolveEffectiveClientCompanyIds(
      {
        includedIds: [explicitId, excludedId],
        excludedIds: [excludedId],
      },
      [projectId, excludedId, null],
      [engagementId],
    );

    expect(effective).toEqual([explicitId, projectId, engagementId].sort());
    expect(effective).not.toContain(excludedId);
  });

  it('syncs a company into clientRoster while respecting forceReinclude for previously excluded companies', () => {
    const companyA = randomUUID();
    const excludedB = randomUUID();

    const added = includeCompanyInClientRoster(undefined, companyA);
    expect(added.changed).toBe(true);
    expect(added.roster).toEqual({ includedIds: [companyA], excludedIds: [] });

    const idempotent = includeCompanyInClientRoster(added.roster, companyA);
    expect(idempotent.changed).toBe(false);

    const preservedExclusion = includeCompanyInClientRoster(
      { includedIds: [], excludedIds: [excludedB] },
      excludedB,
      { forceReinclude: false },
    );
    expect(preservedExclusion.changed).toBe(false);
    expect(preservedExclusion.roster.excludedIds).toEqual([excludedB]);

    const reincluded = includeCompanyInClientRoster(
      { includedIds: [], excludedIds: [excludedB] },
      excludedB,
      { forceReinclude: true },
    );
    expect(reincluded.changed).toBe(true);
    expect(reincluded.roster).toEqual({
      includedIds: [excludedB],
      excludedIds: [],
    });
  });

  it('applies add, remove, batch set, and parses fee commands cleanly', () => {
    const a = randomUUID();
    const b = randomUUID();
    const c = randomUUID();

    const added = applyClientRosterUpdate(
      { includedIds: [], excludedIds: [a] },
      parseClientRosterUpdate({ action: 'add', companyIds: [a, b] }),
    );
    expect(added.includedIds).toEqual([a, b].sort());
    expect(added.excludedIds).toEqual([]);

    const updated = applyClientRosterUpdate(
      added,
      parseClientRosterUpdate({
        action: 'set',
        addIds: [c],
        removeIds: [b],
      }),
    );
    expect(updated.includedIds).toEqual([a, c].sort());
    expect(updated.excludedIds).toEqual([b]);

    const feeCmd = parseClientRosterUpdate({
      action: 'setFee',
      companyId: a,
      amount: 350000,
      currency: 'USD',
      cadence: 'MONTHLY',
      notes: 'Due on 1st',
    });
    expect(feeCmd.action).toBe('setFee');
    expect(applyClientRosterUpdate(updated, feeCmd)).toEqual(updated);
  });

  it('aggregates due/overdue work, portal status, fees, and deduplicated finance only when finance access is granted', () => {
    const companyA = randomUUID();
    const companyB = randomUUID();
    const projectA = randomUUID();
    const engagementA = randomUUID();
    const memberId = randomUUID();
    const paidReceivableId = randomUUID();
    const now = new Date('2026-11-24T12:00:00.000Z');

    const companies = [
      {
        id: companyA,
        name: 'Acme Studio',
        domainName: 'acme.studio',
        updatedAt: now.toISOString(),
        sourceToken: 'a'.repeat(64),
      },
      {
        id: companyB,
        name: 'Beta Labs',
        domainName: null,
        updatedAt: now.toISOString(),
        sourceToken: 'b'.repeat(64),
      },
    ];

    const engagements: ClientEngagement[] = [
      {
        id: engagementA,
        companyId: companyA,
        projectId: projectA,
        revision: 1,
        name: 'Monthly Growth Retainer',
        services: ['SEO', 'Paid Ads'],
        billing: 'RETAINER',
        scope: 'Monthly campaign growth',
        allowance: '10 assets/month',
        contact: 'ceo@acme.studio',
        fields: [],
        assets: [],
        submissions: [
          {
            id: randomUUID(),
            at: now.toISOString(),
            formRevision: 1,
            answers: [{ label: 'Website', value: 'https://acme.studio' }],
            acceptedBy: null,
          },
        ],
      },
    ];

    const businessRecords = [
      {
        id: randomUUID(),
        revision: 1,
        kind: 'FINANCE',
        projectId: projectA,
        title: 'November Retainer',
        currency: 'USD',
        amount: 450000,
        date: '2026-11-01',
        category: 'RECEIVABLE',
        dueDate: '2026-11-15',
        externalReference: 'INV-101',
        evidenceUrl: null,
        notes: '',
        status: 'OPEN',
        createdBy: memberId,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        history: [],
      },
      {
        id: paidReceivableId,
        revision: 2,
        kind: 'FINANCE',
        projectId: null,
        companyId: companyB,
        title: 'October Retainer',
        currency: 'USD',
        amount: 200000,
        date: '2026-10-01',
        category: 'RECEIVABLE',
        dueDate: '2026-10-10',
        externalReference: 'INV-099',
        evidenceUrl: null,
        notes: '',
        status: 'PAID',
        createdBy: memberId,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        history: [],
      },
      {
        id: randomUUID(),
        revision: 1,
        kind: 'FINANCE',
        projectId: null,
        companyId: companyB,
        title: 'Payment receipt: October Retainer',
        currency: 'USD',
        amount: 200000,
        date: '2026-10-09',
        category: 'INCOME',
        dueDate: null,
        externalReference: `receivable:${paidReceivableId}`,
        evidenceUrl: null,
        notes: '',
        status: 'POSTED',
        createdBy: memberId,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        history: [],
      },
    ] as unknown as BusinessRecord[];

    const baseInput = {
      companies,
      roster: { includedIds: [companyA, companyB], excludedIds: [] },
      clientFees: {
        [companyA]: {
          amount: 450000,
          currency: 'USD',
          cadence: 'MONTHLY' as const,
          notes: '1st of every month',
          updatedAt: now.toISOString(),
        },
      },
      projects: [
        {
          id: projectA,
          name: 'Acme Growth',
          companyId: companyA,
          memberIds: [memberId],
        },
      ],
      tasks: [
        {
          id: randomUUID(),
          title: 'Launch Q4 audit',
          projectId: projectA,
          assigneeId: memberId,
          dueAt: '2026-11-20T12:00:00.000Z',
          details: makeDetails({ state: 'BLOCKED', priority: 'HIGH' }),
        },
        {
          id: randomUUID(),
          title: 'Draft landing copy',
          projectId: projectA,
          assigneeId: memberId,
          dueAt: '2026-11-27T12:00:00.000Z',
          details: makeDetails({ state: 'IN_REVIEW' }),
        },
        {
          id: randomUUID(),
          title: 'Completed task',
          projectId: projectA,
          assigneeId: memberId,
          dueAt: '2026-11-10T12:00:00.000Z',
          details: makeDetails({ state: 'APPROVED' }),
        },
      ],
      engagements,
      links: [
        {
          id: randomUUID(),
          engagementId: engagementA,
          expiresAt: '2026-12-24T12:00:00.000Z',
          revokedAt: null,
        },
      ],
      shares: [],
      businessRecords,
      memberNamesById: new Map([[memberId, 'Maya']]),
      now,
    };

    const withFinance = buildClientHubSnapshot({
      ...baseInput,
      canReadFinance: true,
      canManageFinance: true,
    });
    expect(withFinance.summary.totalClients).toBe(2);
    expect(withFinance.summary.clientsNeedingAttention).toBe(1);
    expect(withFinance.summary.totalOverdueTasks).toBe(1);
    expect(withFinance.summary.totalDueSoonTasks).toBe(1);
    expect(withFinance.summary.totalBlockedTasks).toBe(1);
    expect(withFinance.summary.totalPendingOnboarding).toBe(1);
    expect(withFinance.summary.canManageFinance).toBe(true);
    expect(withFinance.summary.totalOpenReceivablesByCurrency).toEqual([
      { currency: 'USD', amount: 450000, count: 1 },
    ]);

    const acme = withFinance.clients[0];
    expect(acme.id).toBe(companyA);
    expect(acme.dueTasks).toHaveLength(2);
    expect(acme.dueTasks[0].isOverdue).toBe(true);
    expect(acme.dueTasks[0].assigneeName).toBe('Maya');
    expect(acme.portal.activeLinksCount).toBe(1);
    expect(acme.portal.pendingSubmissionsCount).toBe(1);
    expect(acme.finance?.overdueReceivablesCount).toBe(1);
    expect(acme.finance?.fee?.amount).toBe(450000);
    expect(acme.finance?.entries).toHaveLength(1);

    const beta = withFinance.clients[1];
    expect(beta.id).toBe(companyB);
    expect(beta.finance?.collectedByCurrency).toEqual([
      { currency: 'USD', amount: 200000, count: 1 },
    ]);
    expect(beta.finance?.entries).toHaveLength(1);

    const withoutFinance = buildClientHubSnapshot({
      ...baseInput,
      canReadFinance: false,
      canManageFinance: false,
    });
    expect(withoutFinance.summary.canReadFinance).toBe(false);
    expect(withoutFinance.summary.totalOpenReceivablesByCurrency).toEqual([]);
    expect(withoutFinance.clients[0].finance).toBeNull();
  });

  it('reconciles Finance V2 invoices and payments with client billing without double-counting', () => {
    const workspaceId = randomUUID();
    const companyId = randomUUID();
    const projectId = randomUUID();
    const memberId = randomUUID();
    const syncedPaymentId = randomUUID();
    const syncedReceivableId = randomUUID();
    const nativeV2InvoiceId = randomUUID();
    const now = new Date('2026-11-26T12:00:00.000Z');

    const snapshot = buildClientHubSnapshot({
      workspaceId,
      companies: [
        {
          id: companyId,
          name: 'Apex Media',
          domainName: 'apex.media',
          updatedAt: now.toISOString(),
          sourceToken: 'a'.repeat(64),
        },
      ],
      roster: { includedIds: [companyId], excludedIds: [] },
      clientFees: {},
      projects: [
        {
          id: projectId,
          name: 'Apex Retainer',
          companyId,
          memberIds: [memberId],
        },
      ],
      tasks: [],
      engagements: [],
      links: [],
      shares: [],
      businessRecords: [
        {
          id: syncedPaymentId,
          revision: 1,
          kind: 'FINANCE',
          projectId,
          companyId,
          title: 'Apex Media deposit',
          currency: 'USD',
          amount: 100000, // $1,000
          date: '2026-11-10',
          category: 'INCOME',
          dueDate: null,
          externalReference: 'DEP-1',
          evidenceUrl: null,
          notes: '',
          status: 'POSTED',
          createdBy: memberId,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          history: [],
        },
        {
          id: syncedReceivableId,
          revision: 1,
          kind: 'FINANCE',
          projectId,
          companyId,
          title: 'November Retainer',
          currency: 'USD',
          amount: 400000, // $4,000
          date: '2026-11-01',
          category: 'RECEIVABLE',
          dueDate: '2026-11-30',
          externalReference: 'INV-201',
          evidenceUrl: null,
          notes: '',
          status: 'OPEN',
          createdBy: memberId,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          history: [],
        },
      ] as unknown as BusinessRecord[],
      financeV2Invoices: [
        // Synced invoice for syncedReceivableId — partially paid ($1,500 paid in Business -> Finance)
        {
          id: deterministicClientReceivableInvoiceId(
            workspaceId,
            syncedReceivableId,
          ),
          invoiceNumber: 'INV-201',
          clientName: 'Apex Media',
          projectId,
          currency: 'USD',
          totalMicros: '4000000000', // $4,000
          paidMicros: '1500000000', // $1,500
          status: 'PARTIALLY_PAID',
          issueDate: '2026-11-01',
          dueDate: '2026-11-30',
          notes: '',
        },
        // Native Finance V2 invoice created directly in Business -> Finance
        {
          id: nativeV2InvoiceId,
          invoiceNumber: 'INV-900',
          clientName: 'Apex Media',
          projectId: null,
          currency: 'USD',
          totalMicros: '2500000000', // $2,500
          paidMicros: '0',
          status: 'SENT',
          issueDate: '2026-11-20',
          dueDate: '2026-12-05',
          notes: '',
        },
      ],
      financeV2PaymentJournals: [
        // Mirrored payment journal for syncedPaymentId — must NOT double-count!
        {
          id: randomUUID(),
          entryDate: '2026-11-10',
          title: 'Client payment: Apex Media deposit',
          notes: '',
          currency: 'USD',
          amountMicros: '1000000000',
          projectId,
          sourceRefType: 'CLIENT_BUSINESS_PAYMENT',
          sourceRefId: syncedPaymentId,
          status: 'POSTED',
        },
      ],
      memberNamesById: new Map([[memberId, 'Maya']]),
      canReadFinance: true,
      canManageFinance: true,
      now,
    });

    const apex = snapshot.clients[0];
    // Collected: $1,000 synced payment + $1,500 partial payment from Finance V2 = $2,500 (no double-counting!)
    expect(apex.finance?.collectedByCurrency).toEqual([
      { currency: 'USD', amount: 250000, count: 2 },
    ]);
    // Open: ($4,000 - $1,500) = $2,500 remaining on synced invoice + $2,500 native V2 invoice = $5,000
    expect(apex.finance?.openReceivablesByCurrency).toEqual([
      { currency: 'USD', amount: 500000, count: 2 },
    ]);

    const syncedReceivableEntry = apex.finance?.entries.find(
      (entry) => entry.id === syncedReceivableId,
    );
    expect(syncedReceivableEntry?.status).toBe('PARTIALLY_PAID');

    const nativeEntry = apex.finance?.entries.find(
      (entry) => entry.id === nativeV2InvoiceId,
    );
    expect(nativeEntry).toMatchObject({
      id: nativeV2InvoiceId,
      revision: 0,
      category: 'RECEIVABLE',
      status: 'OPEN',
      amount: 250000,
    });
  });

  it('exposes actual paidDate and editable paymentTarget for direct payments, paid receivables with auto-receipts, and native Finance V2 invoices', () => {
    const workspaceId = randomUUID();
    const companyId = randomUUID();
    const projectId = randomUUID();
    const memberId = randomUUID();
    const directPaymentId = randomUUID();
    const paidReceivableId = randomUUID();
    const autoReceiptId = randomUUID();
    const nativeInvoiceId = randomUUID();
    const nativePaymentJournal1 = randomUUID();
    const nativePaymentJournal2 = randomUUID();
    const now = new Date('2026-11-26T12:00:00.000Z');
    const syncedReceivableInvId = deterministicClientReceivableInvoiceId(
      workspaceId,
      paidReceivableId,
    );

    const snapshot = buildClientHubSnapshot({
      workspaceId,
      companies: [
        {
          id: companyId,
          name: 'Apex Media',
          domainName: 'apex.media',
          updatedAt: now.toISOString(),
          sourceToken: 'a'.repeat(64),
        },
      ],
      roster: { includedIds: [companyId], excludedIds: [] },
      clientFees: {},
      projects: [
        {
          id: projectId,
          name: 'Apex Retainer',
          companyId,
          memberIds: [memberId],
        },
      ],
      tasks: [],
      engagements: [],
      links: [],
      shares: [],
      businessRecords: [
        {
          id: directPaymentId,
          revision: 2,
          kind: 'FINANCE',
          projectId,
          companyId,
          title: 'Direct retainer payment',
          currency: 'USD',
          amount: 100000,
          date: '2026-11-05',
          category: 'INCOME',
          dueDate: null,
          externalReference: 'PAY-1',
          evidenceUrl: null,
          notes: '',
          status: 'POSTED',
          createdBy: memberId,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          history: [],
        },
        {
          id: paidReceivableId,
          revision: 2,
          kind: 'FINANCE',
          projectId,
          companyId,
          title: 'October Invoice',
          currency: 'USD',
          amount: 200000,
          date: '2026-10-01', // issue date
          category: 'RECEIVABLE',
          dueDate: '2026-10-15',
          externalReference: 'INV-100',
          evidenceUrl: null,
          notes: '',
          status: 'PAID',
          createdBy: memberId,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          history: [],
        },
        {
          id: autoReceiptId,
          revision: 1,
          kind: 'FINANCE',
          projectId,
          companyId,
          title: 'Payment: October Invoice',
          currency: 'USD',
          amount: 200000,
          date: '2026-11-18', // actual date paid
          category: 'INCOME',
          dueDate: null,
          externalReference: `receivable:${paidReceivableId}`,
          evidenceUrl: 'https://receipt.example/1',
          notes: '',
          status: 'POSTED',
          createdBy: memberId,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          history: [],
        },
      ] as unknown as BusinessRecord[],
      financeV2Invoices: [
        {
          id: syncedReceivableInvId,
          invoiceNumber: 'INV-100',
          clientName: 'Apex Media',
          projectId,
          currency: 'USD',
          totalMicros: '2000000000',
          paidMicros: '2000000000',
          status: 'PAID',
          issueDate: '2026-10-01',
          dueDate: '2026-10-15',
          notes: '',
        },
        {
          id: nativeInvoiceId,
          invoiceNumber: 'INV-901',
          clientName: 'Apex Media',
          projectId,
          currency: 'USD',
          totalMicros: '3000000000',
          paidMicros: '3000000000',
          status: 'PAID',
          issueDate: '2026-11-01',
          dueDate: '2026-11-15',
          notes: '',
        },
      ],
      financeV2PaymentJournals: [
        {
          id: randomUUID(),
          entryDate: '2026-11-18',
          title: 'Payment: October Invoice',
          notes: '',
          currency: 'USD',
          amountMicros: '2000000000',
          projectId,
          sourceRefType: 'INVOICE_PAYMENT',
          sourceRefId: `${syncedReceivableInvId}:client-business-pay-${autoReceiptId}`,
          status: 'POSTED',
        },
        {
          id: nativePaymentJournal1,
          entryDate: '2026-11-08',
          title: 'Invoice payment 1',
          notes: '',
          currency: 'USD',
          amountMicros: '1500000000',
          projectId,
          sourceRefType: 'INVOICE_PAYMENT',
          sourceRefId: `${nativeInvoiceId}:pay-1`,
          status: 'POSTED',
        },
        {
          id: nativePaymentJournal2,
          entryDate: '2026-11-22',
          title: 'Invoice payment 2',
          notes: '',
          currency: 'USD',
          amountMicros: '1500000000',
          projectId,
          sourceRefType: 'INVOICE_PAYMENT',
          sourceRefId: `${nativeInvoiceId}:pay-2`,
          status: 'POSTED',
        },
      ],
      memberNamesById: new Map([[memberId, 'Maya']]),
      canReadFinance: true,
      canManageFinance: true,
      now,
    });

    const entries = snapshot.clients[0].finance?.entries ?? [];
    // Sorted newest paidDate first: nativeInvoice (2026-11-22), paidReceivable (2026-11-18), directPayment (2026-11-05)
    expect(entries.map((entry) => entry.id)).toEqual([
      nativeInvoiceId,
      paidReceivableId,
      directPaymentId,
    ]);

    const directEntry = entries.find((entry) => entry.id === directPaymentId);
    expect(directEntry?.paidDate).toBe('2026-11-05');
    expect(directEntry?.paymentTarget).toEqual({
      kind: 'BUSINESS_RECORD',
      id: directPaymentId,
      revision: 2,
    });

    // Paid receivable surfaces its linked receipt's paid date and targets the receipt for editing
    const receivableEntry = entries.find(
      (entry) => entry.id === paidReceivableId,
    );
    expect(receivableEntry?.date).toBe('2026-10-01');
    expect(receivableEntry?.paidDate).toBe('2026-11-18');
    expect(receivableEntry?.paymentTarget).toEqual({
      kind: 'BUSINESS_RECORD',
      id: autoReceiptId,
      revision: 1,
    });

    // Multi-payment native Finance V2 invoice exposes each individual payment target
    const nativeEntry = entries.find((entry) => entry.id === nativeInvoiceId);
    expect(nativeEntry?.paidDate).toBe('2026-11-22');
    expect(nativeEntry?.paymentTarget).toBeNull();
    expect(nativeEntry?.payments).toEqual([
      {
        id: nativePaymentJournal2,
        date: '2026-11-22',
        amount: 150000,
        currency: 'USD',
        target: { kind: 'FINANCE_V2_JOURNAL', id: nativePaymentJournal2 },
      },
      {
        id: nativePaymentJournal1,
        date: '2026-11-08',
        amount: 150000,
        currency: 'USD',
        target: { kind: 'FINANCE_V2_JOURNAL', id: nativePaymentJournal1 },
      },
    ]);
  });
});
