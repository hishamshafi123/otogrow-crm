import {
  assertBusinessTransition,
  canReadBusinessRecord,
  canDraftConversation,
  financialSummary,
} from 'src/modules/delivery/business/delivery-business.policy';
import { type BusinessRecord } from 'src/modules/delivery/business/delivery-business.types';

const actor = { memberId: 'employee', isAdmin: false, isManager: false };
const manager = { memberId: 'manager', isAdmin: true, isManager: true };
const base = {
  id: 'record',
  revision: 1,
  projectId: 'project',
  title: 'Fixture',
  createdBy: 'employee',
  createdAt: '',
  updatedAt: '',
  status: 'DRAFT' as const,
  decisionBy: null,
  evidence: null,
  taskId: null,
  history: [],
};
const conversation: BusinessRecord = {
  ...base,
  kind: 'CONVERSATION',
  channel: 'EMAIL',
  sourceUrl: null,
  ownerId: 'founder',
  private: false,
  grants: [],
};
const budget: BusinessRecord = {
  ...base,
  kind: 'BUDGET',
  channel: 'META',
  currency: 'USD',
  amount: 10000,
  period: 'DAILY',
  marketerId: 'employee',
  reason: 'Campaign test',
};
const finance = (
  category: 'OPENING_BALANCE' | 'INCOME' | 'EXPENSE' | 'SALARY' | 'RECEIVABLE',
  amount: number,
  extra: Partial<BusinessRecord> = {},
): BusinessRecord =>
  ({
    ...base,
    kind: 'FINANCE',
    category,
    amount,
    currency: 'USD',
    date: '2026-10-10',
    dueDate: '2026-10-15',
    externalReference: '',
    evidenceUrl: null,
    notes: '',
    ...extra,
  }) as BusinessRecord;

describe('business permissions and transitions', () => {
  it('does not turn project membership into conversation access', () => {
    expect(
      canReadBusinessRecord(conversation, actor, new Set(['project'])),
    ).toBe(false);
    const shared = {
      ...conversation,
      grants: [{ memberId: 'employee', read: true, send: false }],
    };
    expect(canReadBusinessRecord(shared, actor, new Set())).toBe(true);
    expect(canDraftConversation(shared, actor)).toBe(false);
    expect(
      canDraftConversation(
        {
          ...shared,
          grants: [{ memberId: 'employee', read: true, send: true }],
        },
        actor,
      ),
    ).toBe(true);
    expect(
      canReadBusinessRecord({ ...shared, private: true }, manager, new Set()),
    ).toBe(false);
  });
  it('keeps finance admin-only even on assigned projects', () => {
    expect(
      canReadBusinessRecord(
        finance('INCOME', 100),
        actor,
        new Set(['project']),
      ),
    ).toBe(false);
    expect(
      canReadBusinessRecord(finance('INCOME', 100), manager, new Set()),
    ).toBe(true);
  });
  it('requires an independent review and marketer evidence before budget verification', () => {
    expect(() =>
      assertBusinessTransition(
        { ...budget, status: 'REVIEW' },
        { ...actor, isManager: true },
        'APPROVED',
        null,
      ),
    ).toThrow();
    expect(() =>
      assertBusinessTransition(
        { ...budget, status: 'REVIEW' },
        manager,
        'APPROVED',
        null,
      ),
    ).not.toThrow();
    expect(() =>
      assertBusinessTransition(
        { ...budget, status: 'APPROVED' },
        actor,
        'APPLIED',
        null,
      ),
    ).toThrow();
    expect(() =>
      assertBusinessTransition(
        { ...budget, status: 'APPROVED' },
        actor,
        'APPLIED',
        'https://example.com/change',
      ),
    ).not.toThrow();
    expect(() =>
      assertBusinessTransition(
        { ...budget, status: 'APPLIED' },
        { ...actor, isManager: true },
        'VERIFIED',
        'https://example.com/verify',
      ),
    ).toThrow();
    expect(() =>
      assertBusinessTransition(
        { ...budget, status: 'APPLIED' },
        manager,
        'VERIFIED',
        'https://example.com/verify',
      ),
    ).not.toThrow();
  });
  it('does not let another employee submit someone else’s work', () => {
    expect(() =>
      assertBusinessTransition(
        budget,
        { ...actor, memberId: 'outsider' },
        'REVIEW',
        null,
      ),
    ).toThrow();
  });
  it('requires release checks and a separate final reviewer', () => {
    const release: BusinessRecord = {
      ...base,
      kind: 'RELEASE',
      ownerId: 'employee',
      targetDate: '2026-10-24',
      repositoryUrl: 'https://example.com/repo',
      notes: 'Rollback',
      checks: [{ id: 'check', label: 'Tests', done: false }],
    };
    expect(() =>
      assertBusinessTransition(release, actor, 'REVIEW', null),
    ).toThrow();
    expect(() =>
      assertBusinessTransition(
        { ...release, checks: [{ id: 'check', label: 'Tests', done: true }] },
        actor,
        'REVIEW',
        null,
      ),
    ).not.toThrow();
    expect(() =>
      assertBusinessTransition(
        { ...release, status: 'APPROVED' },
        manager,
        'RELEASED',
        null,
      ),
    ).toThrow();
  });
});
describe('cash reporting', () => {
  it('separates currencies, excludes receivables and voided/future entries from cash', () => {
    const report = financialSummary(
      [
        finance('OPENING_BALANCE', 100000),
        finance('INCOME', 20000),
        finance('EXPENSE', 30000),
        finance('SALARY', 10000),
        finance('RECEIVABLE', 50000),
        finance('INCOME', 90000, { status: 'VOID' }),
        finance('INCOME', 80000, { date: '2026-11-01' }),
        finance('INCOME', 500, { currency: 'AED' }),
      ],
      new Date('2026-10-24T12:00:00Z'),
    );
    expect(report[0]).toMatchObject({
      currency: 'USD',
      cash: 80000,
      receivables: 50000,
      overdue: 50000,
      income30: 20000,
      expense30: 40000,
      netBurn: 20000,
      runwayMonths: 4,
      revenueGrowth: null,
      spendingGrowth: null,
    });
    expect(report[1]).toMatchObject({ currency: 'AED', cash: 500 });
    expect(report[0].projects[0]).toMatchObject({
      cashContribution: -20000,
      margin: -1,
    });
  });
  it('does not report infinite runway or invented growth with no comparison period', () => {
    expect(
      financialSummary(
        [finance('INCOME', 10000)],
        new Date('2026-10-24T00:00:00Z'),
      )[0],
    ).toMatchObject({
      runwayMonths: null,
      revenueGrowth: null,
      spendingGrowth: null,
    });
  });
});
