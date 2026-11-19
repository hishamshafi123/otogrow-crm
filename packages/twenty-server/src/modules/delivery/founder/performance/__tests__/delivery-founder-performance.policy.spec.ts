import { BadRequestException } from '@nestjs/common';
import {
  calculateFounderPerformance,
  founderPerformanceSchema,
  performancePeriod,
  previousPerformanceMonth,
  type PerformanceCalculationInput,
  type PerformanceEntry,
  type PerformanceTask,
} from 'src/modules/delivery/founder/performance/delivery-founder-performance.policy';
import {
  type FinanceForecastCashRead,
  type FinanceForecastCashSource,
  type FinanceForecastReceivableSource,
} from 'src/modules/delivery/finance/read-delivery-forecast-cash';

const PROJECT_ID = '22cb9daf-4cdd-461d-bc1d-1a81f8b502b6';
const SECOND_PROJECT_ID = 'f3d4642d-c33d-4b3d-a5a6-fa87cb4eb64b';
const MEMBER_ID = 'a3d6cbb0-95ad-4f2a-85cd-f342ff471c81';
const SECOND_MEMBER_ID = 'b19c157e-0e72-4f1d-9e2d-c9ba47093331';
const ENTRY_REVENUE = '7bd50155-96fc-45f0-a658-3f1a28a1b1ab';
const ENTRY_SALARY = 'ee08f342-1ab9-44b4-861c-dad6f38c2c42';
const ENTRY_AI = '6950bfa7-c50f-4489-8e74-caf15a50827d';
const ENTRY_OVERHEAD = '64a79c1c-8e3c-4f21-a368-51823352f923';
const ENTRY_PREVIOUS_REVENUE = '9ec26f9e-667e-4f7b-a999-66a79291b464';
const ENTRY_PREVIOUS_COST = '1e6f96e5-71c4-4c4e-bb6a-0a8f5a4ef5f3';
const ENTRY_DRAFT = '29dd4322-23fb-4f23-876e-cf50ef2c2e4d';
const TASK_BLOCKED = 'aec83cc5-799f-43a2-a50b-9462efe5ee66';
const TASK_APPROVED = 'c34409de-ab3d-4a13-85f1-2bba40cf5e20';
const TASK_REVIEWED = '4a74e983-498f-46e6-a219-121252321ee5';
const TASK_WAITING = 'f24ce0a5-556f-463a-b61b-55b7b96c7f54';

const entry = (
  id: string,
  fields: Partial<PerformanceEntry> = {},
): PerformanceEntry => ({
  id,
  month: '2026-11',
  currency: 'USD',
  kind: 'REVENUE',
  category: 'RETAINER',
  status: 'POSTED',
  amountMicros: '10000000000',
  sourceType: 'MANUAL',
  sourceMemberId: null,
  ...fields,
});
const task = (
  id: string,
  fields: Partial<PerformanceTask> = {},
): PerformanceTask => ({
  id,
  projectId: PROJECT_ID,
  assigneeId: MEMBER_ID,
  state: 'IN_PROGRESS',
  dueAt: null,
  submissions: [],
  ...fields,
});
const baseInput = (): PerformanceCalculationInput => ({
  month: '2026-11',
  previousMonth: '2026-10',
  periodStart: '2026-11-01T00:00:00.000Z',
  periodEnd: '2026-12-01T00:00:00.000Z',
  currency: null,
  canReadFinance: true,
  periodStatus: 'OPEN',
  projects: [
    {
      id: PROJECT_ID,
      name: 'Client Alpha',
      companyId: null,
      memberIds: [MEMBER_ID],
    },
    {
      id: SECOND_PROJECT_ID,
      name: 'Client Beta',
      companyId: null,
      memberIds: [SECOND_MEMBER_ID],
    },
  ],
  members: [
    { id: MEMBER_ID, name: 'Amna', roleLabel: 'Project manager' },
    { id: SECOND_MEMBER_ID, name: 'Editor', roleLabel: 'Editor' },
  ],
  entries: [
    entry(ENTRY_REVENUE),
    entry(ENTRY_SALARY, {
      kind: 'COST',
      category: 'SALARY',
      amountMicros: '4000000000',
      sourceType: 'PLAN',
      sourceMemberId: MEMBER_ID,
    }),
    entry(ENTRY_AI, {
      kind: 'COST',
      category: 'OS production AI',
      amountMicros: '500000000',
      sourceType: 'AI_SPEND',
    }),
    entry(ENTRY_OVERHEAD, {
      kind: 'COST',
      category: 'OVERHEAD',
      amountMicros: '1000000000',
    }),
    entry(ENTRY_PREVIOUS_REVENUE, {
      month: '2026-10',
      amountMicros: '8000000000',
    }),
    entry(ENTRY_PREVIOUS_COST, {
      month: '2026-10',
      kind: 'COST',
      category: 'SALARY',
      amountMicros: '2000000000',
    }),
    entry(ENTRY_DRAFT, { status: 'DRAFT', amountMicros: '999000000' }),
  ],
  allocations: [
    {
      entryId: ENTRY_REVENUE,
      projectId: PROJECT_ID,
      amountMicros: '10000000000',
    },
    {
      entryId: ENTRY_SALARY,
      projectId: PROJECT_ID,
      amountMicros: '4000000000',
    },
    { entryId: ENTRY_AI, projectId: PROJECT_ID, amountMicros: '500000000' },
    {
      entryId: ENTRY_OVERHEAD,
      projectId: PROJECT_ID,
      amountMicros: '700000000',
    },
    { entryId: ENTRY_OVERHEAD, projectId: null, amountMicros: '300000000' },
    {
      entryId: ENTRY_PREVIOUS_REVENUE,
      projectId: PROJECT_ID,
      amountMicros: '8000000000',
    },
    {
      entryId: ENTRY_PREVIOUS_COST,
      projectId: PROJECT_ID,
      amountMicros: '2000000000',
    },
  ],
  tasks: [
    task(TASK_BLOCKED, {
      state: 'BLOCKED',
      dueAt: '2026-11-10T09:00:00.000Z',
    }),
    task(TASK_APPROVED, {
      state: 'APPROVED',
      dueAt: '2026-11-05T09:00:00.000Z',
      submissions: [
        {
          version: 1,
          decision: 'APPROVED',
          reviewedAt: '2026-11-04T09:00:00.000Z',
        },
      ],
    }),
    task(TASK_REVIEWED, {
      assigneeId: SECOND_MEMBER_ID,
      state: 'CHANGES_REQUESTED',
      dueAt: '2026-11-20T09:00:00.000Z',
      submissions: [
        {
          version: 1,
          decision: 'CHANGES_REQUESTED',
          reviewedAt: '2026-11-12T09:00:00.000Z',
        },
      ],
    }),
    task(TASK_WAITING, {
      projectId: SECOND_PROJECT_ID,
      assigneeId: SECOND_MEMBER_ID,
      state: 'IN_REVIEW',
      dueAt: '2026-11-01T09:00:00.000Z',
    }),
  ],
  revisions: [
    {
      taskId: TASK_APPROVED,
      projectId: PROJECT_ID,
      cause: 'INTERNAL_DEFECT',
      createdAt: '2026-11-15T09:00:00.000Z',
    },
    {
      taskId: TASK_REVIEWED,
      projectId: PROJECT_ID,
      cause: 'CLIENT_PREFERENCE',
      createdAt: '2026-11-16T09:00:00.000Z',
    },
  ],
  cash: {},
  cashReporting: {},
  afterProjectId: null,
  afterMemberId: null,
  now: new Date('2026-11-18T12:00:00.000Z'),
});

it('calculates exact current/previous results, client contribution and salary allocation without mixing drafts', () => {
  const result = calculateFounderPerformance(baseInput());
  expect(result.currencies).toHaveLength(1);
  expect(result.currencies[0]).toMatchObject({
    currency: 'USD',
    revenueMicros: '10000000000',
    costMicros: '5500000000',
    resultMicros: '4500000000',
    previousRevenueMicros: '8000000000',
    previousCostMicros: '2000000000',
    previousResultMicros: '6000000000',
    salaryCostMicros: '4000000000',
    overheadCostMicros: '1000000000',
    aiCostMicros: '500000000',
    otherCostMicros: '0',
    unassignedRevenueMicros: '0',
    unassignedCostMicros: '300000000',
    draftEntryCount: 1,
    postedEntryCount: 4,
    financeComplete: true,
  });
  expect(result.clients[0]).toMatchObject({
    projectId: PROJECT_ID,
    teamCount: 1,
    finance: [
      {
        revenueMicros: '10000000000',
        costMicros: '5200000000',
        resultMicros: '4800000000',
        salaryCostMicros: '4000000000',
      },
    ],
  });
  expect(result.employees[0]).toMatchObject({
    memberId: MEMBER_ID,
    clientCount: 1,
    salaryCosts: [{ currency: 'USD', amountMicros: '4000000000' }],
  });
  expect(result.warnings).toEqual(
    expect.arrayContaining([
      'MONTHLY_DRAFTS_EXCLUDED',
      'UNASSIGNED_FINANCE',
      'COST_COMPLETENESS_NOT_VERIFIED',
    ]),
  );
});

it('counts factual workload, elapsed due work, approval quality and current-assignment revisions', () => {
  const result = calculateFounderPerformance(baseInput());
  expect(result.operations).toEqual({
    openTaskCount: 3,
    overdueTaskCount: 2,
    blockedTaskCount: 1,
    waitingReviewCount: 1,
    approvedTaskCount: 1,
    dueTaskCount: 3,
    onTimeApprovedTaskCount: 1,
    reviewedTaskCount: 2,
    firstPassApprovedTaskCount: 1,
    revisionCount: 2,
    internalRevisionCount: 1,
  });
  expect(result.employees[0].operations).toMatchObject({
    openTaskCount: 1,
    overdueTaskCount: 1,
    approvedTaskCount: 1,
    dueTaskCount: 2,
    onTimeApprovedTaskCount: 1,
    reviewedTaskCount: 1,
    firstPassApprovedTaskCount: 1,
    revisionCount: 1,
    internalRevisionCount: 1,
  });
  expect(result.employees[1].operations).toMatchObject({
    openTaskCount: 2,
    overdueTaskCount: 1,
    reviewedTaskCount: 1,
    firstPassApprovedTaskCount: 0,
    revisionCount: 1,
    internalRevisionCount: 0,
  });
});

const cashSource = (
  id: string,
  fields: Partial<FinanceForecastCashSource['snapshot']> = {},
): FinanceForecastCashSource => ({
  snapshot: {
    id,
    revision: 1,
    title: 'Recorded payment',
    category: 'INCOME',
    currency: 'USD',
    amountMicros: '6000000000',
    date: '2026-11-03',
    dueDate: null,
    projectId: PROJECT_ID,
    projectName: 'Client Alpha',
    status: 'POSTED',
    evidenceUrl: null,
    note: '',
    ...fields,
  },
  sourceToken: 'source',
  createdAt: null,
  eligible: true,
  warnings: [],
});

it('reuses eligible cash and partial invoice balances while separating periods and currencies', () => {
  const input = baseInput();
  const invoice: FinanceForecastReceivableSource = {
    ...cashSource('29dd4322-23fb-4f23-876e-cf50ef2c2e4d', {
      category: 'RECEIVABLE',
      amountMicros: '3000000000',
      dueDate: '2026-11-01',
      status: 'OPEN',
    }),
    outstandingMicros: '2000000000',
    settledMicros: '1000000000',
  };
  const cash: FinanceForecastCashRead = {
    cash: [
      cashSource('f24ce0a5-556f-463a-b61b-55b7b96c7f54'),
      cashSource('4a74e983-498f-46e6-a219-121252321ee5', {
        amountMicros: '1000000000',
        date: '2026-10-31',
      }),
    ],
    receivables: [invoice],
    anomalies: [],
  };
  input.cash = { USD: cash };
  input.cashReporting = {
    USD: { businessDate: '2026-11-18', confirmed: true },
  };
  const result = calculateFounderPerformance(input);
  expect(result.currencies[0]).toMatchObject({
    cashCollectedMicros: '6000000000',
    receivablesMicros: '2000000000',
    overdueReceivablesMicros: '2000000000',
    cashReportingConfirmed: true,
    cashComplete: true,
  });
  expect(result.clients[0].finance[0]).toMatchObject({
    cashCollectedMicros: '6000000000',
    receivablesMicros: '2000000000',
  });
});

it('keeps malformed allocations out of totals and marks their currency incomplete', () => {
  const input = baseInput();
  input.allocations = input.allocations.filter(
    (allocation) => allocation.entryId !== ENTRY_SALARY,
  );
  const result = calculateFounderPerformance(input);
  expect(result.currencies[0]).toMatchObject({
    revenueMicros: '10000000000',
    costMicros: '1500000000',
    salaryCostMicros: '0',
    financeComplete: false,
  });
  expect(result.employees[0].salaryCosts).toEqual([]);
  expect(result.warnings).toContain('INVALID_MONTHLY_SOURCE');
});

it('does not turn unsupported history or future evidence into performance', () => {
  const input = baseInput();
  input.tasks[1].submissions = [
    {
      version: 1,
      decision: 'APPROVED',
      reviewedAt: '2027-01-01T00:00:00.000Z',
    },
  ];
  const result = calculateFounderPerformance(input);
  expect(result.operations.approvedTaskCount).toBe(0);
  expect(result.operations.onTimeApprovedTaskCount).toBe(0);
  expect(result.warnings).toContain('INVALID_SUBMISSION_HISTORY');
});

it('keeps currencies separate and marks cash anomalies incomplete', () => {
  const input = baseInput();
  input.entries.push(
    entry('ab8ec836-2bca-47eb-b080-e432a79ad44b', {
      currency: 'AED',
      amountMicros: '2000000000',
    }),
  );
  input.allocations.push({
    entryId: 'ab8ec836-2bca-47eb-b080-e432a79ad44b',
    projectId: SECOND_PROJECT_ID,
    amountMicros: '2000000000',
  });
  input.cash = {
    USD: {
      cash: [],
      receivables: [],
      anomalies: [
        {
          id: null,
          title: null,
          code: 'INVALID_CASH',
          date: null,
          amountMicros: null,
          sourceType: null,
        },
      ],
    },
  };
  const result = calculateFounderPerformance(input);
  expect(result.currencies.map((summary) => summary.currency)).toEqual([
    'AED',
    'USD',
  ]);
  expect(result.currencies[0].revenueMicros).toBe('2000000000');
  expect(result.currencies[1].revenueMicros).toBe('10000000000');
  expect(result.currencies[1].cashComplete).toBe(false);
});

it('uses stable bounded pages and rejects an unavailable cursor', () => {
  const input = baseInput();
  input.projects = Array.from({ length: 26 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    name: `Client ${String(index + 1).padStart(2, '0')}`,
    companyId: null,
    memberIds: [],
  }));
  const first = calculateFounderPerformance(input);
  expect(first.clients).toHaveLength(25);
  expect(first.clientTotal).toBe(26);
  expect(first.nextProjectId).toBe(input.projects[24].id);
  const second = calculateFounderPerformance({
    ...input,
    afterProjectId: first.nextProjectId,
  });
  expect(second.clients).toHaveLength(1);
  expect(second.nextProjectId).toBeNull();
  expect(() =>
    calculateFounderPerformance({ ...input, afterProjectId: MEMBER_ID }),
  ).toThrow(BadRequestException);
});

it('validates reporting filters and handles year rollover', () => {
  expect(previousPerformanceMonth('2026-01')).toBe('2025-12');
  expect(
    founderPerformanceSchema.safeParse({
      month: '2026-11',
      timezone: 'Asia/Qatar',
      currency: 'USD',
    }).success,
  ).toBe(true);
  expect(
    founderPerformanceSchema.safeParse({
      month: '2026-13',
      timezone: 'Asia/Qatar',
    }).success,
  ).toBe(false);
  expect(
    founderPerformanceSchema.safeParse({
      month: '2026-11',
      timezone: 'Not/Atimezone',
    }).success,
  ).toBe(false);
});

it('supports IANA aliases and daylight-saving month boundaries', () => {
  expect(performancePeriod('2026-11', 'Asia/Calcutta')).toEqual({
    periodStart: '2026-10-31T18:30:00.000Z',
    periodEnd: '2026-11-30T18:30:00.000Z',
  });
  expect(performancePeriod('2026-11', 'Asia/Kolkata')).toEqual({
    periodStart: '2026-10-31T18:30:00.000Z',
    periodEnd: '2026-11-30T18:30:00.000Z',
  });
  expect(performancePeriod('2026-03', 'America/New_York')).toEqual({
    periodStart: '2026-03-01T05:00:00.000Z',
    periodEnd: '2026-04-01T04:00:00.000Z',
  });
});

it('never counts custom-labelled revenue in the cost breakdown', () => {
  const input = baseInput();
  for (const [id, category] of [
    ['ab8ec836-2bca-47eb-b080-e432a79ad44b', 'OVERHEAD'],
    ['b319f512-4129-4344-aabc-c88952a54ed4', 'OS production AI'],
  ] as const) {
    input.entries.push(entry(id, { category, amountMicros: '200000000' }));
    input.allocations.push({
      entryId: id,
      projectId: PROJECT_ID,
      amountMicros: '200000000',
    });
  }
  const result = calculateFounderPerformance(input);
  expect(result.currencies[0]).toMatchObject({
    revenueMicros: '10400000000',
    overheadCostMicros: '1000000000',
    aiCostMicros: '500000000',
    otherCostMicros: '0',
  });
});

it('does not invent an empty finance month when financial access is restricted', () => {
  const input = baseInput();
  input.canReadFinance = false;
  input.entries = [];
  input.allocations = [];
  const result = calculateFounderPerformance(input);
  expect(result.currencies).toEqual([]);
  expect(result.warnings).not.toContain('NO_MONTHLY_ENTRIES');
});
