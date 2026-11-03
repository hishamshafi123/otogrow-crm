import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { type DataSource, type EntityManager } from 'typeorm';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type DeliveryService } from 'src/modules/delivery/delivery.service';
import { type DeliveryTasksService } from 'src/modules/delivery/tasks/delivery-tasks.service';
import { type OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { type DeliveryWorkspaceContextDTO } from 'src/modules/delivery/tasks/delivery-tasks.dto';
import { type DeliveryCapacityMemberSummaryDTO } from 'src/modules/delivery/capacity/read/delivery-capacity-read.dto';
import { DeliveryCapacityReadService } from 'src/modules/delivery/capacity/read/delivery-capacity-read.service';

const WORKSPACE_ID = '35cf9cc7-5f97-46b5-a42c-7b3d9042907c';
const MEMBER_ID = '748e2175-f020-4b10-b242-0cd1cecb8414';
const MEMBERSHIP_ID = '748e2175-f020-4b10-b242-0cd1cecb8415';
const PROJECT_ID = '748e2175-f020-4b10-b242-0cd1cecb8416';
const calendar = { startDate: '2026-10-29', timezone: 'Asia/Qatar' };
const workspace = {
  id: WORKSPACE_ID,
  databaseSchema: 'workspace_fixture',
} as WorkspaceEntity;
const setup = (invalidAvailability = false) => {
  const context: DeliveryWorkspaceContextDTO = {
    workspaceId: WORKSPACE_ID,
    memberId: MEMBER_ID,
    userWorkspaceId: MEMBERSHIP_ID,
    observedAt: '2026-10-29T00:00:00.000Z',
    actor: {
      memberId: MEMBER_ID,
      isAdmin: false,
      isManager: true,
      capabilities: ['delivery.manage'],
      roleIds: [],
    },
    members: Array.from({ length: 30 }, (_, index) => ({
      id: `748e2175-f020-4b10-b242-${String(index).padStart(12, '0')}`,
      name: 'Teammate',
      access: 'MEMBER',
      roleLabel: '',
    })),
    projects: [
      {
        id: PROJECT_ID,
        name: 'Brand',
        revision: 1,
        companyId: null,
        memberIds: [MEMBER_ID],
      },
    ],
    companies: [],
  };
  const members: DeliveryCapacityMemberSummaryDTO[] = context.members
    .slice(0, 26)
    .map((person) => ({
      memberId: person.id,
      name: person.name,
      overloadDays: 0,
      incompleteDays: 7,
      needsPlanningCount: 0,
      days: [],
    }));
  if (invalidAvailability)
    members[0].days.push({
      date: calendar.startDate,
      availableMinutes: null,
      availabilityRevision: 5,
      availabilityInvalid: true,
      assignmentCount: 0,
      workMinutes: 0,
      productionMinutes: 0,
      revisionMinutes: 0,
      reviewMinutes: 0,
      waitMinutes: 0,
      unknownCount: 0,
      unknownWait: false,
      overloadMinutes: 0,
      unavailableReviewCount: 0,
    });
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('pg_advisory')) return [];
    if (sql.includes('warning_rows'))
      return [
        {
          warnings: [
            {
              code: 'UNAVAILABLE_REVIEW_OWNER',
              scope: 'OPEN_PLANNING',
              count: 2,
            },
            ...(invalidAvailability
              ? [{ code: 'INVALID_AVAILABILITY', scope: 'SELECTED_WEEK', count: 1 }]
              : []),
          ],
          rows: members,
        },
      ];
    if (sql.includes('AS count FROM filtered')) return [{ count: 0 }];
    return [];
  });
  const manager = {
    queryRunner: { isTransactionActive: true },
    query,
  } as unknown as EntityManager;
  const dataSource = {
    transaction: async (read: (manager: EntityManager) => Promise<unknown>) =>
      read(manager),
  } as DataSource;
  const tasksContext = jest.fn(async () => context);
  const tasks = { context: tasksContext } as unknown as DeliveryTasksService;
  const access = {
    listAccess: async () =>
      context.members.map((person) => ({
        memberId: person.id,
        capabilities: [],
      })),
  } as unknown as OtogrowAccessService;
  const service = new DeliveryCapacityReadService(
    dataSource,
    { schema: () => '"workspace_fixture"' } as unknown as DeliveryService,
    tasks,
    access,
  );
  const summary = (input: Record<string, unknown> = {}) =>
    service.summary(
      workspace,
      MEMBER_ID,
      MEMBERSHIP_ID,
      { ...calendar, ...input },
      manager,
    );
  const assignments = (input: Record<string, unknown> = {}) =>
    service.assignments(
      workspace,
      MEMBER_ID,
      MEMBERSHIP_ID,
      {
        ...calendar,
        memberId: null,
        bucket: 'UNAVAILABLE_OWNER',
        date: null,
        ...input,
      },
      manager,
    );
  return { context, query, manager, tasksContext, summary, assignments };
};
it('uses the same transaction for current task-free authority and caps visible teammates independently of complete counts', async () => {
  const test = setup();
  const result = await test.summary();
  expect(test.tasksContext).toHaveBeenCalledWith(
    workspace,
    MEMBER_ID,
    MEMBERSHIP_ID,
    test.manager,
  );
  expect(result.members).toHaveLength(25);
  expect(result.totalMemberCount).toBe(30);
  expect(result.nextCursor).toBeTruthy();
  expect(result.warningScope).toBe('OPEN_PLANNING');
  expect(result.warnings).toEqual([
    { code: 'UNAVAILABLE_REVIEW_OWNER', scope: 'OPEN_PLANNING', count: 2 },
  ]);
});
it('reads warning counts and exact invalid slots together without a second availability snapshot', async () => {
  const test = setup(true);
  const result = await test.summary();
  expect(result.warnings).toContainEqual({
    code: 'INVALID_AVAILABILITY',
    scope: 'SELECTED_WEEK',
    count: 1,
  });
  expect(result.members[0].days[0]).toMatchObject({
    date: calendar.startDate,
    availableMinutes: null,
    availabilityRevision: 5,
    availabilityInvalid: true,
  });
  expect(
    test.query.mock.calls.filter(([sql]) => !sql.includes('pg_advisory')),
  ).toHaveLength(1);
});
it('rejects manager revocation before any planning source can be read', async () => {
  const test = setup();
  test.context.actor.isManager = false;
  await expect(test.summary()).rejects.toThrow(ForbiddenException);
  await expect(test.assignments()).rejects.toThrow(ForbiddenException);
  expect(
    test.query.mock.calls.every(([sql]) => sql.includes('pg_advisory')),
  ).toBe(true);
});
it('invalidates a page after project membership changes rather than returning another current-scope page', async () => {
  const test = setup();
  const first = await test.summary();
  test.context.projects[0].revision++;
  await expect(test.summary({ after: first.nextCursor })).rejects.toThrow(
    BadRequestException,
  );
});
it('rejects unknown teammates, out-of-range days and unrelated client filters', async () => {
  const test = setup();
  await expect(test.assignments({ memberId: MEMBER_ID })).rejects.toThrow(
    BadRequestException,
  );
  await expect(
    test.assignments({ bucket: 'DAY', date: '2026-11-05' }),
  ).rejects.toThrow(BadRequestException);
  await expect(
    test.assignments({ bucket: 'NEEDS_PLANNING', memberId: MEMBER_ID }),
  ).rejects.toThrow(NotFoundException);
  await expect(test.summary({ projectId: PROJECT_ID })).rejects.toThrow(
    BadRequestException,
  );
});
it('labels unresolved-owner sources as all open planning rather than seven-day capacity', async () => {
  const result = await setup().assignments();
  expect(result).toMatchObject({
    bucket: 'UNAVAILABLE_OWNER',
    selectionScope: 'OPEN_PLANNING',
    selectedMemberId: null,
    date: null,
    totalCount: 0,
    items: [],
    nextCursor: null,
  });
});
