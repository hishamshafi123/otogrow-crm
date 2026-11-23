import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { type DataSource, type EntityManager } from 'typeorm';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type DeliveryService } from 'src/modules/delivery/delivery.service';
import { type OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { DeliveryFounderPerformanceService } from 'src/modules/delivery/founder/performance/delivery-founder-performance.service';

const WORKSPACE_ID = '0a420537-0122-45c3-a2f5-18298b636227';
const MEMBER_ID = '2a3587de-498f-48bf-a1a8-9939109f877a';
const MEMBERSHIP_ID = '3516f2eb-0554-49db-a56c-306e3273cb16';
const PROJECT_ID = 'dc95aebb-52a0-4aa0-bc8f-f93b24b11689';
const TASK_ID = 'd908d75f-00c9-4e91-8071-27c4b3216a79';
const workspace = {
  id: WORKSPACE_ID,
  databaseSchema: 'workspace_founder_performance_test',
} as WorkspaceEntity;
const actor = {
  memberId: MEMBER_ID,
  isAdmin: true,
  isManager: true,
  capabilities: ['workspace.admin'],
  roleIds: [],
};

const setup = () => {
  let tasks: unknown[] = [];
  const query = jest.fn(async (sql: string): Promise<unknown[]> => {
    if (sql.includes('pg_advisory_xact_lock')) return [];
    if (sql.includes('SELECT to_char'))
      return [
        {
          periodStart: '2026-10-31T21:00:00.000Z',
          periodEnd: '2026-11-30T21:00:00.000Z',
        },
      ];
    if (sql.includes('FROM core."deliveryTask"')) return tasks;
    return [];
  });
  const repositories = new Map<
    string,
    {
      find?: jest.Mock;
      findBy?: jest.Mock;
      findOneBy?: jest.Mock;
    }
  >();
  const manager = {
    query,
    getRepository: (entity: { name: string }) => {
      const existing = repositories.get(entity.name);
      if (existing) return existing;
      const repository = {
        find: jest.fn().mockResolvedValue([]),
        findBy: jest.fn().mockResolvedValue([]),
        findOneBy: jest.fn().mockResolvedValue(null),
      };
      if (entity.name === 'DeliveryProjectEntity')
        repository.find.mockResolvedValue([
          {
            id: PROJECT_ID,
            name: 'Client Alpha',
            companyId: null,
            memberIds: [MEMBER_ID],
          },
        ]);
      repositories.set(entity.name, repository);
      return repository;
    },
  } as unknown as EntityManager;
  const dataSource = {
    transaction: (read: (manager: EntityManager) => Promise<unknown>) =>
      read(manager),
  } as unknown as DataSource;
  const authorize = jest.fn().mockResolvedValue(actor);
  const delivery = {
    actor: authorize,
    schema: () => '"workspace_founder_performance_test"',
  } as unknown as DeliveryService;
  const access = {
    listActiveMembers: jest.fn().mockResolvedValue([
      {
        memberId: MEMBER_ID,
        userWorkspaceId: MEMBERSHIP_ID,
        name: 'Active founder',
      },
    ]),
  } as unknown as OtogrowAccessService;
  return {
    service: new DeliveryFounderPerformanceService(
      dataSource,
      delivery,
      access,
    ),
    authorize,
    query,
    setTasks: (rows: unknown[]) => {
      tasks = rows;
    },
  };
};
const input = { month: '2026-11', timezone: 'Asia/Qatar', currency: 'USD' };

it('requires administrator authority before reading performance sources', async () => {
  const { service, authorize, query } = setup();
  authorize.mockResolvedValue({ ...actor, isAdmin: false });
  await expect(
    service.snapshot(workspace, MEMBER_ID, MEMBERSHIP_ID, input),
  ).rejects.toThrow(ForbiddenException);
  expect(query.mock.calls.some(([sql]) => sql.includes('deliveryTask'))).toBe(
    false,
  );
});

it('returns bounded factual reporting without private task payloads', async () => {
  const { service, setTasks } = setup();
  setTasks([
    {
      id: TASK_ID,
      projectId: PROJECT_ID,
      assigneeId: MEMBER_ID,
      state: 'BLOCKED',
      dueAt: '2026-11-10T09:00:00.000Z',
      submissions: [],
      privateBrief: 'PRIVATE_BRIEF',
    },
  ]);
  const result = await service.snapshot(
    workspace,
    MEMBER_ID,
    MEMBERSHIP_ID,
    input,
    new Date('2026-11-18T12:00:00.000Z'),
  );
  expect(result).toMatchObject({
    workspaceId: WORKSPACE_ID,
    memberId: MEMBER_ID,
    userWorkspaceId: MEMBERSHIP_ID,
    month: '2026-11',
    previousMonth: '2026-10',
    timezone: 'Asia/Qatar',
    canReadFinance: true,
    operations: { openTaskCount: 1, overdueTaskCount: 1, blockedTaskCount: 1 },
    clients: [{ projectId: PROJECT_ID, operations: { openTaskCount: 1 } }],
    employees: [{ memberId: MEMBER_ID, operations: { openTaskCount: 1 } }],
  });
  expect(JSON.stringify(result)).not.toContain('PRIVATE_');
});

it('rejects access revocation during collection', async () => {
  const { service, authorize } = setup();
  authorize
    .mockResolvedValueOnce(actor)
    .mockResolvedValueOnce({ ...actor, isAdmin: false });
  await expect(
    service.snapshot(workspace, MEMBER_ID, MEMBERSHIP_ID, input),
  ).rejects.toThrow(ForbiddenException);
});

it('fails source overflow instead of returning a partial dashboard', async () => {
  const { service, setTasks } = setup();
  setTasks(Array.from({ length: 2001 }, () => ({ id: TASK_ID })));
  await expect(
    service.snapshot(workspace, MEMBER_ID, MEMBERSHIP_ID, input),
  ).rejects.toThrow(BadRequestException);
});
