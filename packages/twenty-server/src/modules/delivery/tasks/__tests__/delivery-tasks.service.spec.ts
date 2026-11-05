import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { type DataSource, type EntityManager } from 'typeorm';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type DeliveryService } from 'src/modules/delivery/delivery.service';
import { type DeliveryOperationsService } from 'src/modules/delivery/operations/delivery-operations.service';
import { type DeliveryNativeTaskAccessService } from 'src/modules/delivery/delivery-native-task-access.service';
import { type OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { DeliveryTaskEntity } from 'src/modules/delivery/entities/delivery-task.entity';
import { DeliveryMemberEntity } from 'src/modules/delivery/entities/delivery-member.entity';
import { DeliveryTasksService } from 'src/modules/delivery/tasks/delivery-tasks.service';
import {
  REVIEW_WORKSPACE_ID,
  REVIEW_MEMBER_ID,
  REVIEW_MEMBERSHIP_ID,
  REVIEW_ASSIGNEE_ID,
  REVIEW_PROJECT_ID,
  REVIEW_TASK_ID,
  reviewDetails,
} from 'src/modules/delivery/creative/review/__tests__/creative-review.fixtures';

const workspace = {
  id: REVIEW_WORKSPACE_ID,
  databaseSchema: 'workspace_fixture',
} as WorkspaceEntity;
const setup = () => {
  const state = {
    allowed: true,
    manager: true,
    finance: false,
    nativeExists: true,
    nativeAllowed: true,
    nativeVisible: true,
    nativeFingerprint: 'initial-native-permissions',
    commandCommitted: false,
    projectMembers: [REVIEW_ASSIGNEE_ID],
    projectRevision: 1,
    details: reviewDetails(),
    revision: 7,
    rows: [
      {
        id: REVIEW_TASK_ID,
        title: 'Exact task',
        projectId: REVIEW_PROJECT_ID,
        projectName: 'Client',
        revision: 7,
        assigneeId: REVIEW_ASSIGNEE_ID,
        dueAt: null,
        service: 'Design',
        state: 'IN_REVIEW',
        priority: 'NORMAL',
        scheduledDate: null,
        primaryReviewerId: REVIEW_MEMBER_ID,
        workGroup: 'review',
        groupRank: 6,
        priorityRank: 1,
        dueSort: '9999',
        scheduleSort: '9999',
        latest: { version: 1 },
        checklistDone: 1,
        checklistTotal: 2,
        checklistValid: true,
        hasCreative: true,
        blockerPreview: '',
        blockerTruncated: false,
        privateHistory: 'DO_NOT_PROJECT',
      },
    ],
  };
  const projects = () => [
    Object.assign(new DeliveryProjectEntity(), {
      id: REVIEW_PROJECT_ID,
      workspaceId: REVIEW_WORKSPACE_ID,
      revision: state.projectRevision,
      name: 'Client',
      memberIds: state.projectMembers,
      companyId: null,
    }),
  ];
  const projectQuery = {
    where: () => projectQuery,
    andWhere: () => projectQuery,
    orderBy: () => projectQuery,
    take: () => projectQuery,
    getMany: async () => projects(),
  };
  const queries: { sql: string; parameters: unknown[] }[] = [];
  const manager = {
    queryRunner: { isTransactionActive: true },
    getRepository: (entity: unknown) => {
      if (entity === DeliveryProjectEntity)
        return {
          createQueryBuilder: () => projectQuery,
          findOneBy: async () => projects()[0],
        };
      if (entity === DeliveryTaskEntity)
        return {
          findOneBy: async ({ taskId }: { taskId: string }) =>
            taskId === REVIEW_TASK_ID
              ? {
                  taskId,
                  workspaceId: REVIEW_WORKSPACE_ID,
                  projectId: REVIEW_PROJECT_ID,
                  revision: state.revision,
                  details: state.details,
                }
              : null,
        };
      if (entity === DeliveryMemberEntity) return { findBy: async () => [] };
      throw new Error('Unexpected repository');
    },
    query: async (sql: string, parameters: unknown[] = []) => {
      queries.push({ sql, parameters });
      if (sql.includes('pg_advisory')) return [];
      if (sql.includes('SELECT DISTINCT owners.id'))
        return [{ id: REVIEW_MEMBER_ID }];
      if (sql.includes('"company"'))
        return [{ id: REVIEW_PROJECT_ID, name: 'Current company' }];
      if (sql.includes('AS overview'))
        return [
          {
            totalCount: 53,
            byState: [{ key: 'IN_REVIEW', count: 53 }],
            byWorkGroup: [{ key: 'review', count: 53 }],
            overview: {
              totalCount: 60,
              blockedCount: 2,
              approvedCount: 3,
              overdueCount: 4,
              reviewCount: 53,
              dueTodayCount: 2,
            },
            serviceOptions: ['Design'],
          },
        ];
      if (sql.includes('page AS MATERIALIZED')) return state.rows;
      if (
        sql.includes('deliveryReviewAssignment') ||
        sql.includes('deliveryOperations')
      )
        return [];
      if (sql.includes('SELECT revision'))
        return [{ revision: state.revision, state: state.details.state }];
      if (sql.includes('SELECT id,title'))
        return state.nativeExists
          ? [
              {
                id: REVIEW_TASK_ID,
                title: 'Exact task',
                assigneeId: REVIEW_ASSIGNEE_ID,
                dueAt: null,
              },
            ]
          : [];
      throw new Error('Unexpected query');
    },
  } as unknown as EntityManager;
  const dataSource = {
    transaction: async (read: (manager: EntityManager) => Promise<unknown>) =>
      read(manager),
  } as DataSource;
  const actor = async () => {
    if (!state.allowed) throw new ForbiddenException();
    return {
      memberId: REVIEW_MEMBER_ID,
      isManager: state.manager,
      isAdmin: false,
      capabilities: state.finance ? ['finance.read'] : [],
      roleIds: [],
    };
  };
  const command = jest.fn(
    async (
      _workspace: WorkspaceEntity,
      _memberId: string,
      _userWorkspaceId: string,
      input: { action: string },
      transactionManager: EntityManager,
    ) => {
      if (transactionManager !== manager)
        throw new Error('Command lost its transaction manager');
      await actor();
      state.revision++;
      state.commandCommitted = true;
      return input.action === 'create' ? REVIEW_TASK_ID : undefined;
    },
  );
  const snapshot = jest.fn(async () => {
    throw new Error('Full workspace snapshot must never be called');
  });
  const delivery = {
    actor,
    schema: () => '"workspace_fixture"',
    command,
    snapshot,
  } as unknown as DeliveryService;
  const access = {
    listActiveMembers: async () => [
      { memberId: REVIEW_MEMBER_ID, name: 'Reviewer' },
      { memberId: REVIEW_ASSIGNEE_ID, name: 'Editor' },
    ],
    listAccess: async () => [
      { memberId: REVIEW_MEMBER_ID, capabilities: ['delivery.manage'] },
    ],
  } as unknown as OtogrowAccessService;
  const visibility = jest.fn(async () => {
    if (!state.nativeAllowed) throw new ForbiddenException();
    return {
      sql: 'TRUE',
      parameters: {},
      fingerprint: state.nativeFingerprint,
    };
  });
  const nativeTasks = {
    visibility,
    predicate: () => 'native_task_is_visible',
    query: (current: EntityManager, sql: string, values: unknown[]) =>
      current.query(sql, values),
    assert: async () => {
      await visibility();
      if (!state.nativeVisible) throw new NotFoundException();
    },
  } as unknown as DeliveryNativeTaskAccessService;
  return {
    state,
    queries,
    manager,
    command,
    snapshot,
    visibility,
    service: new DeliveryTasksService(
      dataSource,
      delivery,
      access,
      {
        seeAssignment: async () => {
          throw new Error(
            'This read test must not create an assignment receipt.',
          );
        },
      } as unknown as DeliveryOperationsService,
      nativeTasks,
    ),
  };
};

it('returns verified task-free context with companies and current permitted owner options', async () => {
  const { service, state, queries } = setup();
  state.manager = false;
  const before = structuredClone(state.details);
  const context = await service.context(
    workspace,
    REVIEW_MEMBER_ID,
    REVIEW_MEMBERSHIP_ID,
  );
  expect(context).toMatchObject({
    workspaceId: REVIEW_WORKSPACE_ID,
    memberId: REVIEW_MEMBER_ID,
    userWorkspaceId: REVIEW_MEMBERSHIP_ID,
    companies: [{ id: REVIEW_PROJECT_ID, name: 'Current company' }],
  });
  expect(context).not.toHaveProperty('tasks');
  expect(context.members.map((person) => person.name)).toEqual(['Reviewer']);
  expect(state.details).toEqual(before);
  expect(
    queries.every(({ sql }) => !/^\s*(UPDATE|INSERT|DELETE)\b/i.test(sql)),
  ).toBe(true);
});

it('does not return task counts, context or saved details when native reading is denied', async () => {
  const { service, state, queries } = setup();
  state.nativeAllowed = false;
  await expect(
    service.context(workspace, REVIEW_MEMBER_ID, REVIEW_MEMBERSHIP_ID),
  ).rejects.toBeInstanceOf(ForbiddenException);
  await expect(
    service.list(workspace, REVIEW_MEMBER_ID, REVIEW_MEMBERSHIP_ID, {
      view: 'HOME',
      timezone: 'UTC',
    }),
  ).rejects.toBeInstanceOf(ForbiddenException);
  await expect(
    service.detail(workspace, REVIEW_MEMBER_ID, REVIEW_MEMBERSHIP_ID, {
      taskId: REVIEW_TASK_ID,
    }),
  ).rejects.toBeInstanceOf(ForbiddenException);
  expect(queries.every(({ sql }) => sql.includes('pg_advisory'))).toBe(true);
});

it('does not expose an off-page task hidden by the current native row policy', async () => {
  const { service, state, queries } = setup();
  state.nativeVisible = false;
  await expect(
    service.detail(workspace, REVIEW_MEMBER_ID, REVIEW_MEMBERSHIP_ID, {
      taskId: REVIEW_TASK_ID,
    }),
  ).rejects.toBeInstanceOf(NotFoundException);
  expect(queries.every(({ sql }) => sql.includes('pg_advisory'))).toBe(true);
});

it('invalidates a task page when native permissions change without a project revision', async () => {
  const { service, state } = setup();
  state.rows.push({ ...state.rows[0], id: REVIEW_ASSIGNEE_ID });
  const now = new Date('2026-10-29T10:00:00Z');
  const first = await service.list(
    workspace,
    REVIEW_MEMBER_ID,
    REVIEW_MEMBERSHIP_ID,
    { view: 'HOME', timezone: 'UTC', limit: 1 },
    undefined,
    now,
  );
  state.nativeFingerprint = 'changed-native-permissions';
  await expect(
    service.list(
      workspace,
      REVIEW_MEMBER_ID,
      REVIEW_MEMBERSHIP_ID,
      { view: 'HOME', timezone: 'UTC', limit: 1, after: first.nextCursor },
      undefined,
      now,
    ),
  ).rejects.toThrow('first page');
});

it('returns complete counts independently of the bounded page and never projects private history', async () => {
  const { service } = setup();
  const result = await service.list(
    workspace,
    REVIEW_MEMBER_ID,
    REVIEW_MEMBERSHIP_ID,
    { view: 'HOME', timezone: 'Asia/Qatar' },
    undefined,
    new Date('2026-10-29T22:30:00Z'),
  );
  expect(result).toMatchObject({
    businessDate: '2026-10-30',
    totalCount: 53,
    overview: { totalCount: 60, blockedCount: 2 },
    byState: expect.arrayContaining([{ key: 'IN_REVIEW', count: 53 }]),
  });
  expect(result.items).toHaveLength(1);
  expect(result.items[0]).toMatchObject({
    id: REVIEW_TASK_ID,
    checklistDone: 1,
    checklistTotal: 2,
    review: { effectiveReviewerId: REVIEW_MEMBER_ID, submissionVersion: 1 },
  });
  expect(JSON.stringify(result)).not.toContain('DO_NOT_PROJECT');
  expect(result.items[0]).not.toHaveProperty('details');
});
it('preserves a page reference clock and rejects changed project access before reading another page', async () => {
  const { service, state } = setup();
  state.rows.push({ ...state.rows[0], id: REVIEW_ASSIGNEE_ID });
  const first = await service.list(
    workspace,
    REVIEW_MEMBER_ID,
    REVIEW_MEMBERSHIP_ID,
    { view: 'HOME', timezone: 'UTC', limit: 1 },
    undefined,
    new Date('2026-10-29T10:00:00Z'),
  );
  const next = await service.list(
    workspace,
    REVIEW_MEMBER_ID,
    REVIEW_MEMBERSHIP_ID,
    { view: 'HOME', timezone: 'UTC', limit: 1, after: first.nextCursor },
    undefined,
    new Date('2026-10-29T10:01:00Z'),
  );
  expect(next.pageReferenceAt).toBe(first.pageReferenceAt);
  expect(next.observedAt).toBe('2026-10-29T10:01:00.000Z');
  expect(first.observedAt).toBe('2026-10-29T10:00:00.000Z');
  state.projectRevision++;
  await expect(
    service.list(
      workspace,
      REVIEW_MEMBER_ID,
      REVIEW_MEMBERSHIP_ID,
      { view: 'HOME', timezone: 'UTC', limit: 1, after: first.nextCursor },
      undefined,
      new Date('2026-10-29T10:02:00Z'),
    ),
  ).rejects.toThrow('first page');
});
it('accepts equivalent reordered/null filters without binding cursors to property insertion or page size', async () => {
  const { service, state } = setup();
  state.rows.push({ ...state.rows[0], id: REVIEW_ASSIGNEE_ID });
  const first = await service.list(
    workspace,
    REVIEW_MEMBER_ID,
    REVIEW_MEMBERSHIP_ID,
    { view: 'HOME', timezone: 'UTC', limit: 1 },
    undefined,
    new Date('2026-10-29T10:00:00Z'),
  );
  const next = await service.list(
    workspace,
    REVIEW_MEMBER_ID,
    REVIEW_MEMBERSHIP_ID,
    {
      after: first.nextCursor,
      limit: 2,
      attention: null,
      scheduledThrough: null,
      scheduledFrom: null,
      search: '',
      state: null,
      service: null,
      assigneeId: null,
      projectId: null,
      timezone: 'UTC',
      view: 'HOME',
    },
    undefined,
    new Date('2026-10-29T10:01:00Z'),
  );
  expect(next.pageReferenceAt).toBe(first.pageReferenceAt);
});
it('keeps malformed checklist counts unknown instead of reporting a fabricated empty checklist', async () => {
  const { service, state } = setup();
  state.rows[0].checklistValid = false;
  const result = await service.list(
    workspace,
    REVIEW_MEMBER_ID,
    REVIEW_MEMBERSHIP_ID,
    { view: 'MINE', timezone: 'UTC' },
  );
  expect(result.items[0]).toMatchObject({
    checklistDone: null,
    checklistTotal: null,
    warnings: ['CHECKLIST_UNAVAILABLE'],
  });
});
it('keeps invalid task state/lifecycle unavailable and rejects stale calendars', async () => {
  const { service, state } = setup();
  state.rows[0].state = 'UNKNOWN';
  state.rows.push({ ...state.rows[0], id: REVIEW_ASSIGNEE_ID });
  const result = await service.list(
    workspace,
    REVIEW_MEMBER_ID,
    REVIEW_MEMBERSHIP_ID,
    { view: 'MINE', timezone: 'UTC', limit: 1 },
    undefined,
    new Date('2026-10-29T23:59:00Z'),
  );
  expect(result.items[0]).toMatchObject({
    state: 'UNKNOWN',
    delivery: { status: 'UNAVAILABLE' },
    warnings: ['TASK_STATE_UNAVAILABLE'],
  });
  await expect(
    service.list(
      workspace,
      REVIEW_MEMBER_ID,
      REVIEW_MEMBERSHIP_ID,
      { view: 'MINE', timezone: 'UTC', limit: 1, after: result.nextCursor },
      undefined,
      new Date('2026-10-30T00:01:00Z'),
    ),
  ).rejects.toThrow('first page');
});
it('loads the requested off-page task and applies current finance redaction without modifying source details', async () => {
  const { service, state } = setup();
  state.details.creative!.revisionCharge = 123;
  const result = await service.detail(
    workspace,
    REVIEW_MEMBER_ID,
    REVIEW_MEMBERSHIP_ID,
    { taskId: REVIEW_TASK_ID },
  );
  expect(result.task.id).toBe(REVIEW_TASK_ID);
  expect(result.task.details.creative?.revisionCharge).toBe(0);
  expect(state.details.creative?.revisionCharge).toBe(123);
  state.finance = true;
  expect(
    (
      await service.detail(workspace, REVIEW_MEMBER_ID, REVIEW_MEMBERSHIP_ID, {
        taskId: REVIEW_TASK_ID,
      })
    ).task.details.creative?.revisionCharge,
  ).toBe(123);
});
it('rejects missing, native-deleted and newly unshared exact task details without choosing another task', async () => {
  const { service, state } = setup();
  await expect(
    service.detail(workspace, REVIEW_MEMBER_ID, REVIEW_MEMBERSHIP_ID, {
      taskId: REVIEW_ASSIGNEE_ID,
    }),
  ).rejects.toThrow(NotFoundException);
  state.nativeExists = false;
  await expect(
    service.detail(workspace, REVIEW_MEMBER_ID, REVIEW_MEMBERSHIP_ID, {
      taskId: REVIEW_TASK_ID,
    }),
  ).rejects.toThrow(NotFoundException);
  state.nativeExists = true;
  state.manager = false;
  await expect(
    service.detail(workspace, REVIEW_MEMBER_ID, REVIEW_MEMBERSHIP_ID, {
      taskId: REVIEW_TASK_ID,
    }),
  ).rejects.toThrow(NotFoundException);
});
it('executes the existing command in the active manager and returns only its committed source receipt', async () => {
  const { service, command, snapshot, state } = setup();
  const result = await service.command(
    workspace,
    REVIEW_MEMBER_ID,
    REVIEW_MEMBERSHIP_ID,
    {
      action: 'comment',
      taskId: REVIEW_TASK_ID,
      revision: 7,
      text: 'Source-bound note',
    },
  );
  expect(result).toEqual({
    workspaceId: REVIEW_WORKSPACE_ID,
    memberId: REVIEW_MEMBER_ID,
    userWorkspaceId: REVIEW_MEMBERSHIP_ID,
    taskId: REVIEW_TASK_ID,
    revision: 8,
    state: 'IN_REVIEW',
  });
  expect(state.commandCommitted).toBe(true);
  expect(command).toHaveBeenCalledTimes(1);
  expect(snapshot).not.toHaveBeenCalled();
});
it('returns a newly created task identity while preserving authoritative command validation and revoked access', async () => {
  const { service, state, snapshot } = setup();
  const fields = {
    title: 'New task',
    brief: '',
    service: 'Design',
    priority: 'NORMAL',
    scheduledDate: null,
    dueAt: null,
    assigneeId: REVIEW_ASSIGNEE_ID,
    reviewerId: REVIEW_MEMBER_ID,
    checklist: [],
    evidence: [],
  };
  expect(
    (
      await service.command(workspace, REVIEW_MEMBER_ID, REVIEW_MEMBERSHIP_ID, {
        action: 'create',
        projectId: REVIEW_PROJECT_ID,
        fields,
      })
    ).taskId,
  ).toBe(REVIEW_TASK_ID);
  state.allowed = false;
  await expect(
    service.command(workspace, REVIEW_MEMBER_ID, REVIEW_MEMBERSHIP_ID, {
      action: 'comment',
      taskId: REVIEW_TASK_ID,
      revision: 8,
      text: 'Revoked',
    }),
  ).rejects.toThrow(ForbiddenException);
  expect(snapshot).not.toHaveBeenCalled();
});
