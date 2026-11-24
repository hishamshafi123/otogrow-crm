import { randomUUID } from 'node:crypto';
import {
  applyClientRosterUpdate,
  buildClientHubSnapshot,
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
  it('resolves designated clients from explicit roster plus delivery work while honoring exclusions', () => {
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

  it('applies add, remove, and batch set roster updates cleanly', () => {
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
  });

  it('aggregates due/overdue work, portal status, and finance only when finance access is granted', () => {
    const companyA = randomUUID();
    const companyB = randomUUID();
    const projectA = randomUUID();
    const engagementA = randomUUID();
    const memberId = randomUUID();
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
        amount: 4500,
        date: '2026-11-01',
        category: 'RECEIVABLE',
        dueDate: '2026-11-15',
        externalReference: 'INV-101',
        evidenceUrl: null,
        notes: '',
        status: 'APPROVED',
        createdBy: memberId,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        updatedBy: memberId,
        history: [],
      },
    ] as unknown as BusinessRecord[];

    const baseInput = {
      companies,
      roster: { includedIds: [companyB], excludedIds: [] },
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
    });
    expect(withFinance.summary.totalClients).toBe(2);
    expect(withFinance.summary.clientsNeedingAttention).toBe(1);
    expect(withFinance.summary.totalOverdueTasks).toBe(1);
    expect(withFinance.summary.totalDueSoonTasks).toBe(1);
    expect(withFinance.summary.totalBlockedTasks).toBe(1);
    expect(withFinance.summary.totalPendingOnboarding).toBe(1);
    expect(withFinance.summary.totalOpenReceivablesByCurrency).toEqual([
      { currency: 'USD', amount: 4500, count: 1 },
    ]);

    const acme = withFinance.clients[0];
    expect(acme.id).toBe(companyA);
    expect(acme.dueTasks).toHaveLength(2);
    expect(acme.dueTasks[0].isOverdue).toBe(true);
    expect(acme.dueTasks[0].assigneeName).toBe('Maya');
    expect(acme.portal.activeLinksCount).toBe(1);
    expect(acme.portal.pendingSubmissionsCount).toBe(1);
    expect(acme.finance?.overdueReceivablesCount).toBe(1);

    const withoutFinance = buildClientHubSnapshot({
      ...baseInput,
      canReadFinance: false,
    });
    expect(withoutFinance.summary.canReadFinance).toBe(false);
    expect(withoutFinance.summary.totalOpenReceivablesByCurrency).toEqual([]);
    expect(withoutFinance.clients[0].finance).toBeNull();
  });
});
