import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { type DataSource, type EntityManager } from 'typeorm';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type DeliveryService } from 'src/modules/delivery/delivery.service';
import { type OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { DeliveryFounderService } from 'src/modules/delivery/founder/delivery-founder.service';

const WORKSPACE_ID = '0a420537-0122-45c3-a2f5-18298b636227';
const MEMBER_ID = '2a3587de-498f-48bf-a1a8-9939109f877a';
const MEMBERSHIP_ID = '3516f2eb-0554-49db-a56c-306e3273cb16';
const PROJECT_ID = 'dc95aebb-52a0-4aa0-bc8f-f93b24b11689';
const TASK_ID = 'd908d75f-00c9-4e91-8071-27c4b3216a79';
const workspace = {
  id: WORKSPACE_ID,
  databaseSchema: 'workspace_founder_test',
} as WorkspaceEntity;
const actor = {
  memberId: MEMBER_ID,
  isAdmin: true,
  isManager: true,
  capabilities: ['workspace.admin'],
  roleIds: [],
};

const setup = () => {
  let taskRows: unknown[] = [];
  let manualRows: unknown[] = [];
  let fulfilmentRows: unknown[] = [];
  let monthlyEntries: unknown[] = [];
  let monthlyAllocations: unknown[] = [];
  const sourceQuery = jest.fn(async (sql: string): Promise<unknown[]> => {
    if (sql.includes('FROM core."deliveryProject"'))
      return [{ id: PROJECT_ID, name: 'Client Alpha' }];
    if (sql.startsWith('SELECT jsonb_typeof(state'))
      return [
        {
          records: 'array',
          engagements: 'array',
          fulfilments: 'array',
          connections: 'array',
        },
      ];
    if (sql.includes('FROM core."deliveryTask"')) return taskRows;
    if (sql.includes("'{fulfilments}'")) return fulfilmentRows;
    if (sql.includes("'{alerts}'")) return manualRows;
    if (sql.includes('FROM core."deliveryFinanceEntry"')) return monthlyEntries;
    if (sql.includes('FROM core."deliveryFinanceAllocation"'))
      return monthlyAllocations;
    return [];
  });
  const manager = {
    query: sourceQuery,
    getRepository: () => ({ find: jest.fn().mockResolvedValue([]) }),
  } as unknown as EntityManager;
  const dataSource = {
    transaction: (read: (value: EntityManager) => Promise<unknown>) =>
      read(manager),
  } as unknown as DataSource;
  const authorize = jest.fn().mockResolvedValue(actor);
  const delivery = {
    actor: authorize,
    schema: () => '"workspace_founder_test"',
  } as unknown as DeliveryService;
  const access = {
    listAccess: jest.fn().mockResolvedValue([]),
    listActiveMembers: jest.fn().mockResolvedValue([
      {
        memberId: MEMBER_ID,
        userWorkspaceId: MEMBERSHIP_ID,
        name: 'Active founder',
      },
    ]),
  } as unknown as OtogrowAccessService;
  return {
    service: new DeliveryFounderService(dataSource, delivery, access),
    authorize,
    sourceQuery,
    manager,
    setRisks: (values: unknown[]) => {
      manualRows = values.map((value) => ({ value }));
    },
    setDeliveries: (values: unknown[]) => {
      fulfilmentRows = values.map((value) => ({ value }));
    },
    setMonthly: (entries: unknown[], allocations: unknown[]) => {
      monthlyEntries = entries;
      monthlyAllocations = allocations;
    },
    setTasks: (rows: unknown[]) => {
      taskRows = rows;
    },
  };
};

it('keeps Company overview administrator-only even for a delivery manager', async () => {
  const { service, authorize, sourceQuery } = setup();
  authorize.mockResolvedValue({ ...actor, isAdmin: false });
  await expect(
    service.snapshot(workspace, MEMBER_ID, MEMBERSHIP_ID, {
      domain: 'DELIVERY',
    }),
  ).rejects.toThrow(ForbiddenException);
  expect(
    sourceQuery.mock.calls.some(([sql]) => sql.includes('deliveryTask')),
  ).toBe(false);
});

it('rejects current identity revocation instead of returning already-collected evidence', async () => {
  const { service, authorize } = setup();
  authorize
    .mockResolvedValueOnce(actor)
    .mockResolvedValueOnce({ ...actor, isAdmin: false });
  await expect(
    service.snapshot(workspace, MEMBER_ID, MEMBERSHIP_ID, {
      domain: 'DELIVERY',
    }),
  ).rejects.toThrow(ForbiddenException);
});

it('returns current typed identity and source evidence without task submission/private payloads', async () => {
  const { service, setTasks } = setup();
  setTasks([
    {
      id: TASK_ID,
      title: 'Blocked deliverable',
      projectId: PROJECT_ID,
      revision: 3,
      state: 'BLOCKED',
      assigneeId: MEMBER_ID,
      reviewerId: MEMBER_ID,
      dueAt: null,
      updatedAt: '2026-10-28T00:00:00.000Z',
      nativeUpdatedAt: '2026-10-28T00:00:00.000Z',
      submissions: [
        {
          description: 'PRIVATE_SOURCE_PAYLOAD',
          feedback: 'PRIVATE_REVIEW_NOTES',
        },
      ],
      secret: 'PRIVATE_TOKEN',
    },
  ]);
  const result = await service.snapshot(workspace, MEMBER_ID, MEMBERSHIP_ID, {
    domain: 'DELIVERY',
  });
  expect(result).toMatchObject({
    workspaceId: WORKSPACE_ID,
    memberId: MEMBER_ID,
    userWorkspaceId: MEMBERSHIP_ID,
    totalCount: 1,
    items: [
      {
        sourceId: TASK_ID,
        reasonCode: 'TASK_BLOCKED',
        ownerName: 'Active founder',
        nextAction: { targetType: 'TASK', targetId: TASK_ID },
      },
    ],
  });
  expect(
    result.coverage.find((domain) => domain.domain === 'FINANCE')?.status,
  ).toBe('NOT_SELECTED');
  expect(JSON.stringify(result)).not.toContain('PRIVATE_');
});

it('does not imply healthy delivery when a current task has an unsupported state', async () => {
  const { service, setTasks } = setup();
  setTasks([{ id: TASK_ID, state: 'UNRECOGNIZED', projectId: PROJECT_ID }]);
  const result = await service.snapshot(workspace, MEMBER_ID, MEMBERSHIP_ID, {
    domain: 'DELIVERY',
  });
  expect(result.items).toEqual([]);
  expect(
    result.coverage.find((domain) => domain.domain === 'DELIVERY'),
  ).toMatchObject({ status: 'PARTIAL', codes: ['INVALID_TASK_SOURCE'] });
});

it('fails source overflow explicitly rather than presenting the first source page as complete', async () => {
  const { service, setTasks } = setup();
  setTasks(Array.from({ length: 2001 }, () => ({ id: TASK_ID })));
  await expect(
    service.snapshot(workspace, MEMBER_ID, MEMBERSHIP_ID, {
      domain: 'DELIVERY',
    }),
  ).rejects.toThrow(BadRequestException);
});

it('rejects a departed owner filter without selecting a replacement owner', async () => {
  const { service } = setup();
  await expect(
    service.snapshot(workspace, MEMBER_ID, MEMBERSHIP_ID, {
      domain: 'DELIVERY',
      ownerId: MEMBERSHIP_ID,
    }),
  ).rejects.toThrow('selected owner is unavailable');
});

const monthlyEntries = (revenue = '100000000') => [
  {
    id: TASK_ID,
    revision: 2,
    currency: 'USD',
    kind: 'REVENUE',
    status: 'POSTED',
    amountMicros: revenue,
  },
  {
    id: MEMBERSHIP_ID,
    revision: 2,
    currency: 'USD',
    kind: 'COST',
    status: 'POSTED',
    amountMicros: '25000000',
  },
];
const companyAllocations = (revenue = '100000000', cost = '25000000') => [
  {
    id: MEMBER_ID,
    entryId: TASK_ID,
    bucket: 'COMPANY',
    projectId: null,
    amountMicros: revenue,
  },
  {
    id: PROJECT_ID,
    entryId: MEMBERSHIP_ID,
    bucket: 'COMPANY',
    projectId: null,
    amountMicros: cost,
  },
];

it('treats valid explicit company allocations as neutral context instead of founder attention', async () => {
  const { service, setMonthly } = setup();
  setMonthly(monthlyEntries(), companyAllocations());
  const result = await service.snapshot(workspace, MEMBER_ID, MEMBERSHIP_ID, {
    domain: 'FINANCE',
    serviceMonth: '2026-10',
  });
  expect(result.items).toEqual([]);
  expect(result.totalCount).toBe(0);
  expect(
    result.coverage.find((coverage) => coverage.domain === 'FINANCE')?.codes,
  ).toContain('CLIENT_RESULTS_EXCLUDE_COMPANY_AMOUNTS');
});

it.each<[string, ReturnType<typeof companyAllocations>]>([
  ['missing', []],
  ['nonconserving', companyAllocations('100000000', '24000000')],
])(
  'still surfaces actually %s posted allocations as unknown results',
  async (_label, allocations) => {
    const { service, setMonthly } = setup();
    setMonthly(monthlyEntries(), allocations);
    const result = await service.snapshot(workspace, MEMBER_ID, MEMBERSHIP_ID, {
      domain: 'FINANCE',
      serviceMonth: '2026-10',
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      reasonCode: 'MONTHLY_RESULT_UNKNOWN',
      evidence: { resultMicros: null, warnings: ['INVALID_MONTHLY_SOURCE'] },
    });
    expect(
      result.coverage.find((coverage) => coverage.domain === 'FINANCE')?.codes,
    ).toContain('INVALID_MONTHLY_SOURCE');
  },
);

it('retains a genuine negative recorded company result while removing allocation noise', async () => {
  const { service, setMonthly } = setup();
  setMonthly(monthlyEntries('10000000'), companyAllocations('10000000'));
  const result = await service.snapshot(workspace, MEMBER_ID, MEMBERSHIP_ID, {
    domain: 'FINANCE',
    serviceMonth: '2026-10',
  });
  expect(result.items).toHaveLength(1);
  expect(result.items[0]).toMatchObject({
    reasonCode: 'MONTHLY_NEGATIVE_RESULT',
    evidence: {
      revenueMicros: '10000000',
      costMicros: '25000000',
      resultMicros: '-15000000',
    },
  });
  expect(
    result.items.some((item) => item.reasonCode === 'MONTHLY_UNASSIGNED'),
  ).toBe(false);
});

const approvedTask = () => ({
  id: TASK_ID,
  title: 'Approved but undelivered',
  projectId: PROJECT_ID,
  revision: 3,
  state: 'APPROVED',
  assigneeId: MEMBERSHIP_ID,
  reviewerId: MEMBER_ID,
  dueAt: '2020-02-12T00:00:00.000Z',
  updatedAt: '2020-02-11T11:00:00.000Z',
  nativeUpdatedAt: '2020-02-10T11:00:00.000Z',
  submissions: [
    {
      version: 2,
      decision: 'APPROVED',
      reviewedAt: '2020-02-11T11:00:00.000Z',
      description: '',
      evidence: [],
      submittedBy: MEMBERSHIP_ID,
      submittedAt: '2020-02-11T10:00:00.000Z',
    },
  ],
});
const recordedDelivery = (
  status: 'WAITING' | 'FULFILLED' | 'REDOING' = 'WAITING',
  version = 2,
  cycle = 2,
) => ({
  taskId: TASK_ID,
  status,
  cycle,
  deliveredSubmissionVersion: version,
  deliveredAt: '2020-02-11T12:00:00.000Z',
  nextCheckAt: null,
  history: [
    {
      at: '2020-02-11T13:00:00.000Z',
      actorId: MEMBER_ID,
      action: status === 'FULFILLED' ? 'FULFILLED' : 'DELIVERED',
      note: '',
    },
  ],
});

it('exposes past-due approved work with no recorded client delivery through the actual source reader', async () => {
  const { service, setTasks } = setup();
  setTasks([approvedTask()]);
  const result = await service.snapshot(workspace, MEMBER_ID, MEMBERSHIP_ID, {
    domain: 'DELIVERY',
  });
  expect(result.items).toHaveLength(1);
  expect(result.items[0]).toMatchObject({
    reasonCode: 'TASK_DELIVERY_OVERDUE',
    ownerId: MEMBER_ID,
    nextAction: { code: 'REVIEW_DELIVERY', targetId: TASK_ID },
  });
});

it.each(['WAITING', 'FULFILLED'] as const)(
  'suppresses delivery-only attention after matching current-version %s evidence',
  async (status) => {
    const { service, setTasks, setDeliveries } = setup();
    setTasks([approvedTask()]);
    setDeliveries([recordedDelivery(status)]);
    const result = await service.snapshot(workspace, MEMBER_ID, MEMBERSHIP_ID, {
      domain: 'DELIVERY',
    });
    expect(result.items).toEqual([]);
  },
);

it.each([
  recordedDelivery('WAITING', 1),
  recordedDelivery('REDOING', 2, 3),
  {
    ...recordedDelivery('FULFILLED', 2, 3),
    deliveredAt: '2020-02-12T12:00:00.000Z',
  },
])(
  'retains delivery overdue for stale version/redo or previous-cycle fulfilment evidence %j',
  async (evidence) => {
    const { service, setTasks, setDeliveries } = setup();
    setTasks([approvedTask()]);
    setDeliveries([evidence]);
    const result = await service.snapshot(workspace, MEMBER_ID, MEMBERSHIP_ID, {
      domain: 'DELIVERY',
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].reasonCode).toBe('TASK_DELIVERY_OVERDUE');
  },
);

const manualRisk = (fields: Record<string, unknown> = {}) => ({
  id: MEMBERSHIP_ID,
  taskId: TASK_ID,
  category: 'CLIENT',
  severity: 'URGENT',
  reason: 'Client raised a recorded concern',
  ownerId: MEMBER_ID,
  createdAt: '2026-10-28T10:00:00.000Z',
  resolvedAt: null,
  ...fields,
});
it('projects explicit client/contract/budget concerns with stored ownership and exact source action', async () => {
  const { service, setTasks, setRisks } = setup();
  setTasks([approvedTask()]);
  setRisks([manualRisk()]);
  const result = await service.snapshot(workspace, MEMBER_ID, MEMBERSHIP_ID, {
    domain: 'MANUAL_RISKS',
  });
  expect(result.items).toHaveLength(1);
  expect(result.items[0]).toMatchObject({
    reasonCode: 'MANUAL_CLIENT_CONCERN',
    sourceType: 'MANUAL_RISK',
    sourceId: MEMBERSHIP_ID,
    ownerId: MEMBER_ID,
    nextAction: { code: 'OPEN_ALERT', targetType: 'TASK', targetId: TASK_ID },
  });
});
it('retains positive clear proof for a resolved manual concern without returning it as attention', async () => {
  const { service, setTasks, setRisks, manager } = setup();
  setTasks([approvedTask()]);
  setRisks([manualRisk({ resolvedAt: '2026-10-28T11:00:00.000Z' })]);
  const result = await service.collect(
    workspace,
    MEMBER_ID,
    MEMBERSHIP_ID,
    { domain: 'MANUAL_RISKS' },
    manager,
  );
  expect(result.items).toEqual([]);
  expect(result.verifiedSourceKeys).toContain(`MANUAL_RISK:${MEMBERSHIP_ID}`);
});
it('does not turn malformed or missing manual-source evidence into positive resolution', async () => {
  const { service, setTasks, setRisks, manager } = setup();
  setTasks([]);
  setRisks([manualRisk(), { bad: 'source' }]);
  const result = await service.collect(
    workspace,
    MEMBER_ID,
    MEMBERSHIP_ID,
    { domain: 'MANUAL_RISKS' },
    manager,
  );
  expect(result.items).toEqual([]);
  expect(result.verifiedSourceKeys).not.toContain(
    `MANUAL_RISK:${MEMBERSHIP_ID}`,
  );
  expect(
    result.coverage.find((row) => row.domain === 'MANUAL_RISKS')?.codes,
  ).toEqual(
    expect.arrayContaining([
      'INVALID_MANUAL_RISK_SOURCE',
      'UNAVAILABLE_MANUAL_RISK_SOURCE',
    ]),
  );
});
it('positively verifies a zero client contribution after all valid allocations move to company', async () => {
  const { service, setMonthly, manager } = setup();
  setMonthly(monthlyEntries(), companyAllocations());
  const result = await service.collect(
    workspace,
    MEMBER_ID,
    MEMBERSHIP_ID,
    { domain: 'FINANCE', serviceMonth: '2026-10' },
    manager,
  );
  expect(result.verifiedSourceKeys).toContain(
    `MONTHLY_RESULT:USD:2026-10:${PROJECT_ID}`,
  );
  setMonthly(monthlyEntries(), []);
  const unknown = await service.collect(
    workspace,
    MEMBER_ID,
    MEMBERSHIP_ID,
    { domain: 'FINANCE', serviceMonth: '2026-10' },
    manager,
  );
  expect(unknown.verifiedSourceKeys).not.toContain(
    `MONTHLY_RESULT:USD:2026-10:${PROJECT_ID}`,
  );
});
