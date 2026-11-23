import { ForbiddenException, ConflictException } from '@nestjs/common';
import { type DataSource, type EntityManager } from 'typeorm';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type DeliveryService } from 'src/modules/delivery/delivery.service';
import { type DeliveryNativeTaskAccessService } from 'src/modules/delivery/delivery-native-task-access.service';
import { DeliveryNativeTaskPermissionDeniedException } from 'src/modules/delivery/native-task-visibility';
import { DeliveryCommitmentsService } from 'src/modules/delivery/commitments/delivery-commitments.service';
import { DeliveryCommitmentAllocationEntity } from 'src/modules/delivery/commitments/entities/delivery-commitment-allocation.entity';
import { DeliveryCommitmentEventEntity } from 'src/modules/delivery/commitments/entities/delivery-commitment-event.entity';
import { DeliveryCommitmentPeriodEntity } from 'src/modules/delivery/commitments/entities/delivery-commitment-period.entity';
import { DeliveryCommitmentLineEntity } from 'src/modules/delivery/commitments/entities/delivery-commitment-line.entity';
import { DeliveryOperationsEntity } from 'src/modules/delivery/entities/delivery-operations.entity';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { DeliveryTaskEntity } from 'src/modules/delivery/entities/delivery-task.entity';
import { recordDeliveryCommitment } from 'src/modules/delivery/commitments/record-delivery-commitment';
import { newDeliveryOperations } from 'src/modules/delivery/operations/delivery-operations.types';
import { type ClientEngagement } from 'src/modules/delivery/clients/delivery-clients.types';

jest.mock(
  'src/modules/delivery/commitments/record-delivery-commitment',
  () => ({
    recordDeliveryCommitment: jest.fn(),
    syncDeliveryCommitment: jest.fn(),
  }),
);
const identifier = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const workspaceId = identifier(1);
const memberId = identifier(2);
const userWorkspaceId = identifier(3);
const projectId = identifier(4);
const companyId = identifier(5);
const engagementId = identifier(6);
const periodId = identifier(7);
const lineId = identifier(8);
const taskId = identifier(9);
const allocationId = identifier(10);
const workspace = {
  id: workspaceId,
  databaseSchema: 'fixture',
} as WorkspaceEntity;
const now = new Date('2026-11-05T12:00:00Z');
const input = () => ({
  requestId: identifier(11),
  engagementId,
  periodId,
  periodRevision: 2,
  allocationId,
  allocationRevision: 3,
  confirm: true as const,
});

const fixture = () => {
  const calls: string[] = [];
  const source = {
    present: true,
    deleted: true,
    managed: true,
    projectId,
    children: false,
  };
  const actor = {
    memberId,
    isManager: true,
    capabilities: ['delivery.manage'],
    roleIds: [],
  };
  const period = {
    id: periodId,
    workspaceId,
    engagementId,
    projectId,
    clientId: companyId,
    revision: 2,
    state: 'OPEN',
    label: 'November',
    billing: 'RETAINER',
    startDate: '2026-11-01',
    endDateExclusive: '2026-12-01',
    timezone: 'UTC',
  } as DeliveryCommitmentPeriodEntity;
  const line = {
    id: lineId,
    periodId,
    workspaceId,
    label: 'Unique videos',
    unit: 'UNIQUE_VIDEO',
    revision: 1,
    promisedQuantity: 5,
  } as DeliveryCommitmentLineEntity;
  const allocation = {
    id: allocationId,
    workspaceId,
    periodId,
    lineId,
    taskId,
    taskName: 'Private retained title',
    parentTaskId: identifier(12),
    revision: 3,
    state: 'ASSIGNED',
    creditedCycle: null,
    creditedSubmissionVersion: null,
    fulfilledAt: null,
    createdAt: now,
    updatedAt: now,
  } as DeliveryCommitmentAllocationEntity;
  const engagement = {
    id: engagementId,
    projectId,
    companyId,
    name: 'Agency retainer',
    allowance: '',
    billing: 'RETAINER',
  } as ClientEngagement;
  const operations = newDeliveryOperations();
  operations.clients = {
    engagements: [engagement],
    shares: [],
    links: [],
    audit: [],
  };
  const events = new Map<string, DeliveryCommitmentEventEntity>();
  const saveAllocation = jest.fn(
    async (value: DeliveryCommitmentAllocationEntity) => value,
  );
  const saveLine = jest.fn(
    async (value: DeliveryCommitmentLineEntity) => value,
  );
  const findManaged = jest.fn(async () => {
    calls.push('managed-lock');
    return source.managed ? { taskId, projectId: source.projectId } : null;
  });
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('pg_advisory') || sql.startsWith('SET LOCAL')) return [];
    if (sql.startsWith('LOCK TABLE')) {
      calls.push('table-lock');
      return [];
    }
    if (sql.startsWith('SELECT id,"deletedAt"')) {
      calls.push('native-lock');
      return source.present
        ? [{ id: taskId, deletedAt: source.deleted ? now : null }]
        : [];
    }
    if (sql.includes('.company')) return [{ id: companyId }];
    if (sql.startsWith('SELECT a.*, CASE'))
      return [{ ...allocation, liveDetails: null }];
    if (sql.startsWith('SELECT event.*')) return [...events.values()];
    if (sql.startsWith('SELECT a.*,EXISTS')) return [];
    return [];
  });
  const repository = (entity: unknown) => {
    if (entity === DeliveryOperationsEntity)
      return { findOneBy: async () => ({ state: operations }) };
    if (entity === DeliveryProjectEntity)
      return {
        findOneBy: async () => ({
          id: projectId,
          companyId,
          memberIds: [memberId],
          revision: 1,
        }),
      };
    if (entity === DeliveryCommitmentPeriodEntity)
      return { findOneBy: async () => period, find: async () => [period] };
    if (entity === DeliveryTaskEntity)
      return {
        findOne: findManaged,
        existsBy: async () => source.managed && source.projectId === projectId,
      };
    if (entity === DeliveryCommitmentLineEntity)
      return {
        findOneBy: async () => line,
        find: async () => [line],
        create: (value: unknown) => value,
        save: saveLine,
      };
    if (entity === DeliveryCommitmentEventEntity)
      return {
        findOneBy: async (where: { id: string }) =>
          events.get(where.id) ?? null,
      };
    if (entity === DeliveryCommitmentAllocationEntity)
      return {
        findOne: async () => allocation,
        findOneBy: async () => allocation,
        save: saveAllocation,
        createQueryBuilder: () => ({
          where: () => ({ getExists: async () => source.children }),
        }),
      };
    throw new Error('Unexpected fixture repository');
  };
  const manager = {
    query,
    getRepository: repository,
  } as unknown as EntityManager;
  const dataSource = {
    transaction: async (
      operation: (value: EntityManager) => Promise<unknown>,
    ) => operation(manager),
  } as unknown as DataSource;
  const native = {
    visibility: jest.fn(async () => ({
      fingerprint: 'policy',
      sql: 'TRUE',
      parameters: {},
    })),
    predicate: () => 'TRUE',
    query: jest.fn(async () => []),
    assert: jest.fn(async () => undefined),
  };
  const service = new DeliveryCommitmentsService(
    dataSource,
    {
      actor: async () => actor,
      schema: () => 'fixture',
    } as unknown as DeliveryService,
    native as unknown as DeliveryNativeTaskAccessService,
  );
  jest
    .mocked(recordDeliveryCommitment)
    .mockReset()
    .mockImplementation(async (_manager, targetPeriod, targetActor, event) => {
      const id = event.eventId ?? identifier(20 + events.size);
      events.set(id, {
        id,
        workspaceId,
        periodId: targetPeriod.id,
        ...targetActor,
        actorName: 'Manager',
        action: event.action,
        reason: event.reason,
        changes: event.changes,
        taskId: event.taskId ?? null,
        taskName: event.taskName ?? null,
        createdAt: now,
      } as DeliveryCommitmentEventEntity);
    });
  return {
    service,
    source,
    period,
    allocation,
    events,
    actor,
    native,
    saveAllocation,
    saveLine,
    calls,
  };
};

it('keeps complete contractual quantities and safe cleanup available under explicit native read denial', async () => {
  const test = fixture();
  test.native.visibility.mockRejectedValue(
    new DeliveryNativeTaskPermissionDeniedException(),
  );
  const result = await test.service.snapshot(
    workspace,
    memberId,
    userWorkspaceId,
    { engagementId, periodId },
  );
  expect(result.taskDetailsAvailable).toBe(false);
  expect(result.lines[0]).toMatchObject({
    assignedQuantity: 1,
    promisedQuantity: 5,
    fulfilledQuantity: 0,
  });
  expect(result.allocations).toEqual([]);
  expect(result.taskOptions).toEqual([]);
  expect(result.canManage).toBe(true);
  const removed = await test.service.removeOrphanAllocation(
    workspace,
    memberId,
    userWorkspaceId,
    input(),
  );
  expect(removed.state).toBe('REMOVED');
});

it('does not hide metadata verification failures behind empty task projections', async () => {
  const test = fixture();
  test.native.visibility.mockRejectedValue(
    new ForbiddenException('Metadata cannot be verified'),
  );
  await expect(
    test.service.snapshot(workspace, memberId, userWorkspaceId, {
      engagementId,
      periodId,
    }),
  ).rejects.toThrow('Metadata cannot be verified');
});

it('allows task-free quantity edits when only the native task read permission is denied', async () => {
  const test = fixture();
  test.native.visibility.mockRejectedValue(
    new DeliveryNativeTaskPermissionDeniedException(),
  );
  const result = await test.service.saveLine(
    workspace,
    memberId,
    userWorkspaceId,
    {
      id: lineId,
      engagementId,
      periodId,
      periodRevision: 2,
      revision: 1,
      label: 'Unique videos',
      unit: 'UNIQUE_VIDEO',
      promisedQuantity: 8,
      reason: 'Adjusted service quantity',
    },
  );
  expect(test.saveLine).toHaveBeenCalledTimes(1);
  expect(result.taskDetailsAvailable).toBe(false);
});

it('returns an exact redacted cleanup receipt once and keeps replay historical after restoration and closure', async () => {
  const test = fixture();
  const request = input();
  expect(
    (
      await test.service.orphanCleanupReceipt(
        workspace,
        memberId,
        userWorkspaceId,
        request,
      )
    ).state,
  ).toBe('NOT_FOUND');
  const removed = await test.service.removeOrphanAllocation(
    workspace,
    memberId,
    userWorkspaceId,
    request,
  );
  expect(removed).toMatchObject({
    state: 'REMOVED',
    allocationId,
    requestedAllocationRevision: 3,
    removedAllocationRevision: 4,
  });
  expect(JSON.stringify(removed)).not.toContain(taskId);
  expect(JSON.stringify(removed)).not.toContain('Private retained title');
  expect([...test.events.values()][0]).toMatchObject({
    id: request.requestId,
    taskId: null,
    taskName: null,
  });
  test.source.deleted = false;
  test.period.state = 'CLOSED';
  expect(
    await test.service.removeOrphanAllocation(
      workspace,
      memberId,
      userWorkspaceId,
      request,
    ),
  ).toEqual(removed);
  expect(test.saveAllocation).toHaveBeenCalledTimes(1);
  expect(test.events.size).toBe(1);
});

it.each(['allocationRevision', 'periodRevision'] as const)(
  'rejects changed cleanup receipt %s without another mutation',
  async (field) => {
    const test = fixture();
    const request = input();
    await test.service.removeOrphanAllocation(
      workspace,
      memberId,
      userWorkspaceId,
      request,
    );
    await expect(
      test.service.orphanCleanupReceipt(workspace, memberId, userWorkspaceId, {
        ...request,
        [field]: request[field] + 1,
      }),
    ).rejects.toThrow(ConflictException);
    expect(test.saveAllocation).toHaveBeenCalledTimes(1);
  },
);

it('rechecks manager authority before exposing a known successful cleanup', async () => {
  const test = fixture();
  await test.service.removeOrphanAllocation(
    workspace,
    memberId,
    userWorkspaceId,
    input(),
  );
  test.actor.isManager = false;
  await expect(
    test.service.orphanCleanupReceipt(
      workspace,
      memberId,
      userWorkspaceId,
      input(),
    ),
  ).rejects.toThrow(ForbiddenException);
});

it.each([
  'live-hidden',
  'unknown-managed',
  'children',
  'closed',
  'stale',
] as const)('rejects unsafe orphan removal: %s', async (scenario) => {
  const test = fixture();
  const request = input();
  if (scenario === 'live-hidden' || scenario === 'unknown-managed')
    test.source.deleted = false;
  if (scenario === 'unknown-managed') test.source.managed = false;
  if (scenario === 'children') test.source.children = true;
  if (scenario === 'closed') test.period.state = 'CLOSED';
  if (scenario === 'stale') request.allocationRevision = 2;
  await expect(
    test.service.removeOrphanAllocation(
      workspace,
      memberId,
      userWorkspaceId,
      request,
    ),
  ).rejects.toThrow();
  expect(test.saveAllocation).not.toHaveBeenCalled();
  expect(test.events.size).toBe(0);
});

it('locks an absent native source before the managed row and records only the explicit allocation removal', async () => {
  const test = fixture();
  test.source.present = false;
  await test.service.removeOrphanAllocation(
    workspace,
    memberId,
    userWorkspaceId,
    input(),
  );
  expect(test.calls).toEqual([
    'native-lock',
    'table-lock',
    'native-lock',
    'managed-lock',
  ]);
  expect(test.allocation.state).toBe('REMOVED');
});

it('allows a definitively moved source but does not acquire a table lock for an existing source', async () => {
  const test = fixture();
  test.source.deleted = false;
  test.source.projectId = identifier(30);
  await test.service.removeOrphanAllocation(
    workspace,
    memberId,
    userWorkspaceId,
    input(),
  );
  expect(test.calls).toEqual(['native-lock', 'managed-lock']);
});

it('removes a readable child without requiring access to its unchanged parent', async () => {
  const test = fixture();
  await test.service.removeTask(workspace, memberId, userWorkspaceId, {
    engagementId,
    periodId,
    taskId,
    revision: 3,
    reason: 'Remove this variation',
  });
  expect(test.native.assert).toHaveBeenCalledTimes(2);
  for (const call of test.native.assert.mock.calls)
    expect(call).toEqual(expect.arrayContaining([taskId]));
  expect(test.allocation.parentTaskId).toBe(identifier(12));
});

it.each([
  'removeOrphanAllocation',
  'orphanCleanupReceipt',
  'cancelOrphanCleanup',
] as const)(
  'fails closed when %s cannot verify the native policy metadata',
  async (method) => {
    const test = fixture();
    test.native.visibility.mockRejectedValue(
      new ForbiddenException('Native metadata unavailable'),
    );
    await expect(
      test.service[method](workspace, memberId, userWorkspaceId, input()),
    ).rejects.toThrow('Native metadata unavailable');
    expect(test.saveAllocation).not.toHaveBeenCalled();
    expect(test.events.size).toBe(0);
  },
);

it('durably cancels an unknown stale cleanup even after restoration and period closure', async () => {
  const test = fixture();
  test.source.deleted = false;
  test.period.state = 'CLOSED';
  test.period.revision += 1;
  test.native.visibility.mockRejectedValue(
    new DeliveryNativeTaskPermissionDeniedException(),
  );
  const cancelled = await test.service.cancelOrphanCleanup(
    workspace,
    memberId,
    userWorkspaceId,
    input(),
  );
  expect(cancelled).toMatchObject({
    state: 'CANCELLED',
    removedAllocationRevision: null,
    occurredAt: now.toISOString(),
  });
  expect(
    await test.service.removeOrphanAllocation(
      workspace,
      memberId,
      userWorkspaceId,
      input(),
    ),
  ).toEqual(cancelled);
  expect(
    await test.service.cancelOrphanCleanup(
      workspace,
      memberId,
      userWorkspaceId,
      input(),
    ),
  ).toEqual(cancelled);
  expect(
    await test.service.orphanCleanupReceipt(
      workspace,
      memberId,
      userWorkspaceId,
      input(),
    ),
  ).toEqual(cancelled);
  expect(test.saveAllocation).not.toHaveBeenCalled();
  expect(test.events.size).toBe(1);
  expect([...test.events.values()][0]).toMatchObject({
    action: 'COMMITMENT_ORPHAN_CLEANUP_CANCELLED',
    taskId: null,
    taskName: null,
  });
});

it('reports an already completed removal when a later cancellation loses', async () => {
  const test = fixture();
  const removed = await test.service.removeOrphanAllocation(
    workspace,
    memberId,
    userWorkspaceId,
    input(),
  );
  expect(
    await test.service.cancelOrphanCleanup(
      workspace,
      memberId,
      userWorkspaceId,
      input(),
    ),
  ).toEqual(removed);
  expect(test.saveAllocation).toHaveBeenCalledTimes(1);
  expect(test.events.size).toBe(1);
});

it('rejects a cancelled request replay with another exact body', async () => {
  const test = fixture();
  await test.service.cancelOrphanCleanup(
    workspace,
    memberId,
    userWorkspaceId,
    input(),
  );
  await expect(
    test.service.removeOrphanAllocation(workspace, memberId, userWorkspaceId, {
      ...input(),
      allocationId: identifier(40),
    }),
  ).rejects.toThrow(ConflictException);
  expect(test.saveAllocation).not.toHaveBeenCalled();
});
