import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { type DataSource, type EntityManager } from 'typeorm';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type DeliveryService } from 'src/modules/delivery/delivery.service';
import { type DeliveryNativeTaskAccessService } from 'src/modules/delivery/delivery-native-task-access.service';
import { DeliveryTaskEntity } from 'src/modules/delivery/entities/delivery-task.entity';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { DeliveryOperationsEntity } from 'src/modules/delivery/entities/delivery-operations.entity';
import { DeliveryRevisionEntity } from 'src/modules/delivery/revisions/entities/delivery-revision.entity';
import { DeliveryRevisionsService } from 'src/modules/delivery/revisions/delivery-revisions.service';
import { DeliveryWorkflowsService } from 'src/modules/delivery/workflows/delivery-workflows.service';
import { DeliveryWorkflowArchiveEntity } from 'src/modules/delivery/workflows/entities/delivery-workflow-archive.entity';
import { DeliveryCreativeService } from 'src/modules/delivery/creative/delivery-creative.service';
import { newCreativeDocument } from 'src/modules/delivery/creative/delivery-creative.types';
import { DeliveryOperationsService } from 'src/modules/delivery/operations/delivery-operations.service';
import { newDeliveryOperations } from 'src/modules/delivery/operations/delivery-operations.types';
import { recordDeliveryRevision } from 'src/modules/delivery/revisions/record-delivery-revision';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';
import { applyPublishedDeliveryWorkflow } from 'src/modules/delivery/workflows/apply-delivery-workflow';

jest.mock('src/modules/delivery/revisions/record-delivery-revision', () => ({
  recordDeliveryRevision: jest.fn(async () => undefined),
}));
jest.mock('src/modules/otogrow-activity/record-otogrow-activity', () => ({
  recordOtogrowActivity: jest.fn(async () => undefined),
}));
jest.mock(
  'src/modules/delivery/commitments/record-delivery-commitment',
  () => ({
    syncStoredDeliveryCommitment: jest.fn(async () => undefined),
    syncDeliveryCommitment: jest.fn(async () => undefined),
  }),
);
jest.mock('src/modules/delivery/workflows/apply-delivery-workflow', () => ({
  getPublishedDeliveryWorkflow: jest.fn(async () => ({ published: {} })),
  applyPublishedDeliveryWorkflow: jest.fn(async () => undefined),
}));

const workspaceId = '11111111-1111-4111-8111-111111111111';
const memberId = '22222222-2222-4222-8222-222222222222';
const userWorkspaceId = '33333333-3333-4333-8333-333333333333';
const taskId = '44444444-4444-4444-8444-444444444444';
const projectId = '55555555-5555-4555-8555-555555555555';
const assigneeId = '66666666-6666-4666-8666-666666666666';
const revisionId = '77777777-7777-4777-8777-777777777777';
const templateId = '88888888-8888-4888-8888-888888888888';
const workspace = {
  id: workspaceId,
  databaseSchema: 'fixture',
} as WorkspaceEntity;
const now = new Date('2026-11-05T10:00:00.000Z');

const fixture = () => {
  const policy = {
    read: true,
    write: true,
    afterWrite: true,
    fingerprint: 'native-policy',
  };
  const actor = {
    memberId,
    isAdmin: false,
    isManager: true,
    capabilities: ['delivery.manage'],
    roleIds: [] as string[],
  };
  const task: DeliveryTaskEntity = {
    id: taskId,
    workspace,
    createdAt: now,
    updatedAt: now,
    taskId,
    workspaceId,
    projectId,
    revision: 1,
    details: {
      brief: 'Private brief',
      service: 'Design',
      priority: 'NORMAL',
      scheduledDate: null,
      reviewerId: memberId,
      state: 'APPROVED',
      blocker: '',
      checklist: [],
      evidence: [],
      events: [],
      creative: newCreativeDocument(),
      submissions: [
        {
          version: 1,
          description: 'Approved work',
          evidence: [],
          submittedBy: assigneeId,
          submittedAt: '2026-11-05T07:00:00.000Z',
          decision: 'APPROVED',
          reviewedBy: memberId,
          reviewedAt: '2026-11-05T08:00:00.000Z',
        },
      ],
    },
  };
  const project = {
    id: projectId,
    workspaceId,
    revision: 1,
    memberIds: [memberId, assigneeId],
  };
  const round = {
    id: revisionId,
    workspaceId,
    taskId,
    projectId,
    round: 1,
    revision: 1,
    submissionVersion: 1,
    source: 'INTERNAL_REVIEW',
    reason: 'Private revision reason',
    cause: 'UNCLASSIFIED',
    createdAt: now,
    effortMinutes: null,
    internalCost: 1250,
    proposedCharge: 0,
    currency: 'USD',
  } as DeliveryRevisionEntity;
  const state = newDeliveryOperations();
  state.fulfilments.push({
    taskId,
    cycle: 1,
    status: 'WAITING',
    deliveredSubmissionVersion: 1,
    deliveredAt: '2026-11-05T09:00:00.000Z',
    nextCheckAt: '2026-11-05T21:00:00.000Z',
    history: [],
  });
  let updated = false;
  const queries = jest.fn(async (sql: string) => {
    if (sql.includes('UPDATE') && sql.includes('SET status')) {
      updated = true;
      return [];
    }
    if (sql.includes('AS "userWorkspaceId"')) return [{ userWorkspaceId }];
    if (sql.includes('SELECT m.id')) return [{ id: memberId }];
    if (sql.includes('SELECT "assigneeId"')) return [{ assigneeId }];
    if (sql.includes('GROUP BY'))
      return [
        {
          projectId,
          projectName: 'Brand',
          cause: 'INTERNAL_DEFECT',
          currency: 'USD',
          rounds: 3,
          missingCostCount: 0,
          missingEffortCount: 0,
          recordedCost: 3750,
          proposedCharges: 0,
          recordedEffortMinutes: 90,
        },
      ];
    return [];
  });
  const taskRepository = {
    findOneBy: jest.fn(async () => task),
    save: jest.fn(async () => task),
  };
  const roundRepository = {
    find: jest.fn(async () => [round]),
    findOne: jest.fn(async () => round),
    countBy: jest.fn(async () => 1),
    save: jest.fn(async () => round),
  };
  const archiveRows = [] as {
    id: string;
    createdAt: Date;
    snapshot: unknown;
  }[];
  const archive = {
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn(async () => archiveRows),
  };
  const operationsRepository = {
    findOneBy: jest.fn(async () => ({ workspaceId, state })),
    save: jest.fn(async () => undefined),
  };
  const getRepository = jest.fn((entity: unknown) => {
    if (entity === DeliveryTaskEntity) return taskRepository;
    if (entity === DeliveryProjectEntity)
      return { findOneBy: jest.fn(async () => project) };
    if (entity === DeliveryRevisionEntity) return roundRepository;
    if (entity === DeliveryWorkflowArchiveEntity)
      return { createQueryBuilder: () => archive };
    if (entity === DeliveryOperationsEntity) return operationsRepository;
    throw new Error('Unexpected repository');
  });
  const manager = { query: queries, getRepository } as unknown as EntityManager;
  const source = {
    transaction: (operation: (manager: EntityManager) => Promise<unknown>) =>
      operation(manager),
  } as DataSource;
  const delivery = {
    actor: jest.fn(async () => actor),
    schema: () => 'fixture',
  } as unknown as DeliveryService;
  const assertNative = jest.fn(
    async (
      _manager: EntityManager,
      _workspace: WorkspaceEntity,
      _identity: unknown,
      _taskId: string,
      _columns: string[],
      operation?: { type: string },
    ) => {
      if (!policy.read) throw new ForbiddenException('Native task read denied');
      if (operation && !policy.write)
        throw new ForbiddenException('Native status write denied');
      if (operation && updated && !policy.afterWrite)
        throw new NotFoundException('Native task excluded after update');
      return { sql: 'TRUE', parameters: {}, fingerprint: policy.fingerprint };
    },
  );
  const native = {
    assert: assertNative,
  } as unknown as DeliveryNativeTaskAccessService;
  const creative = new DeliveryCreativeService(
    source,
    delivery,
    {} as ConstructorParameters<typeof DeliveryCreativeService>[2],
    native,
  );
  const operations = new DeliveryOperationsService(
    source,
    delivery,
    creative,
    {} as ConstructorParameters<typeof DeliveryOperationsService>[3],
    {} as ConstructorParameters<typeof DeliveryOperationsService>[4],
    {} as ConstructorParameters<typeof DeliveryOperationsService>[5],
    native,
  );
  jest
    .spyOn(operations, 'snapshot')
    .mockResolvedValue(
      {} as Awaited<ReturnType<DeliveryOperationsService['snapshot']>>,
    );
  return {
    policy,
    actor,
    task,
    project,
    round,
    state,
    queries,
    getRepository,
    taskRepository,
    roundRepository,
    archive,
    archiveRows,
    operationsRepository,
    assertNative,
    native,
    source,
    delivery,
    creative,
    operations,
    revisions: new DeliveryRevisionsService(source, delivery, native),
    workflows: new DeliveryWorkflowsService(source, delivery, native),
  };
};
const applyInput = {
  taskId,
  taskRevision: 1,
  templateId,
  templateRevision: 1,
  version: 1,
  reopen: true,
  reason: 'Updated client requirements',
};
const revisionInput = {
  taskId,
  id: revisionId,
  revision: 1,
  cause: 'CLIENT_PREFERENCE',
  effortMinutes: 30,
};

beforeEach(() => jest.clearAllMocks());

describe('revision history and economics access', () => {
  it('denies private history and correction before loading any round', async () => {
    const value = fixture();
    value.policy.read = false;
    await expect(
      value.revisions.snapshot(workspace, memberId, userWorkspaceId, {
        taskId,
      }),
    ).rejects.toThrow('read denied');
    await expect(
      value.revisions.save(workspace, memberId, userWorkspaceId, revisionInput),
    ).rejects.toThrow('read denied');
    expect(value.roundRepository.find).not.toHaveBeenCalled();
    expect(value.roundRepository.countBy).not.toHaveBeenCalled();
    expect(value.roundRepository.findOne).not.toHaveBeenCalled();
    expect(recordOtogrowActivity).not.toHaveBeenCalled();
  });
  it('allows an authorized manager with native read-only access to classify without exposing finance', async () => {
    const value = fixture();
    value.policy.write = false;
    const history = await value.revisions.snapshot(
      workspace,
      memberId,
      userWorkspaceId,
      { taskId },
    );
    expect(history.rounds[0]).toMatchObject({
      reason: 'Private revision reason',
      internalCost: null,
      currency: null,
    });
    await expect(
      value.revisions.save(workspace, memberId, userWorkspaceId, revisionInput),
    ).resolves.toBe(true);
    expect(value.round).toMatchObject({
      cause: 'CLIENT_PREFERENCE',
      effortMinutes: 30,
      revision: 2,
    });
    expect(
      value.assertNative.mock.calls.every((call) => call[5] === undefined),
    ).toBe(true);
    expect(value.taskRepository.save).not.toHaveBeenCalled();
  });
  it('does not turn revision classification into finance permission', async () => {
    const value = fixture();
    await expect(
      value.revisions.save(workspace, memberId, userWorkspaceId, {
        ...revisionInput,
        internalCost: 500,
      }),
    ).rejects.toThrow('Finance editing');
    expect(value.roundRepository.save).not.toHaveBeenCalled();
    expect(recordOtogrowActivity).not.toHaveBeenCalled();
  });
  it('preserves independent recorded finance totals when native task reads are denied', async () => {
    const value = fixture();
    value.policy.read = false;
    value.actor.capabilities.push('finance.read');
    const totals = await value.revisions.costs(
      workspace,
      memberId,
      userWorkspaceId,
      { startDate: '2026-11-01', endDate: '2026-11-05' },
    );
    expect(totals.groups[0]).toMatchObject({
      rounds: 3,
      recordedCost: 3750,
      recordedEffortMinutes: 90,
    });
    expect(value.assertNative).not.toHaveBeenCalled();
    expect(JSON.stringify(totals)).not.toContain('Private revision reason');
  });
});

describe('task workflow permissions and history', () => {
  it('denies exact workflow and progress before private task hydration', async () => {
    const value = fixture();
    value.policy.read = false;
    await expect(
      value.workflows.task(workspace, memberId, userWorkspaceId, { taskId }),
    ).rejects.toThrow('read denied');
    await expect(
      value.workflows.progress(workspace, memberId, userWorkspaceId, {
        taskId,
        taskRevision: 1,
        workflowRevision: 1,
        checkedIds: [],
        evidence: [],
      }),
    ).rejects.toThrow('read denied');
    expect(value.taskRepository.findOneBy).not.toHaveBeenCalled();
    expect(recordOtogrowActivity).not.toHaveBeenCalled();
  });
  it('keeps locked work readable with a disabled reopen action for read-only managers', async () => {
    const value = fixture();
    value.policy.write = false;
    const result = await value.workflows.task(
      workspace,
      memberId,
      userWorkspaceId,
      { taskId },
    );
    expect(result).toMatchObject({
      taskId,
      locked: true,
      canManage: false,
      canEdit: false,
    });
  });
  it('allows unlocked OS-only requirements without native status writes', async () => {
    const value = fixture();
    value.policy.write = false;
    value.task.details.state = 'PLANNED';
    const result = await value.workflows.apply(
      workspace,
      memberId,
      userWorkspaceId,
      { ...applyInput, reopen: false },
    );
    expect(result.canManage).toBe(true);
    expect(
      value.assertNative.mock.calls.every((call) => call[5] === undefined),
    ).toBe(true);
    expect(recordDeliveryRevision).not.toHaveBeenCalled();
    expect(applyPublishedDeliveryWorkflow).toHaveBeenCalledTimes(1);
  });
  it('rejects a history cursor after native policy changes even for the same task', async () => {
    const value = fixture();
    value.archiveRows.push(
      { id: revisionId, createdAt: now, snapshot: {} },
      { id: templateId, createdAt: now, snapshot: {} },
    );
    const result = await value.workflows.task(
      workspace,
      memberId,
      userWorkspaceId,
      { taskId, limit: 1 },
    );
    expect(result.nextHistoryCursor).toBeTruthy();
    value.policy.fingerprint = 'changed-policy';
    await expect(
      value.workflows.task(workspace, memberId, userWorkspaceId, {
        taskId,
        limit: 1,
        historyCursor: result.nextHistoryCursor,
      }),
    ).rejects.toThrow('first page');
  });
});

for (const path of ['WORKFLOW', 'CREATIVE', 'FULFILMENT'] as const) {
  const reopen = (value: ReturnType<typeof fixture>) =>
    path === 'WORKFLOW'
      ? value.workflows.apply(workspace, memberId, userWorkspaceId, applyInput)
      : path === 'CREATIVE'
        ? value.creative.command(workspace, memberId, userWorkspaceId, {
            action: 'reopen',
            taskId,
            revision: 1,
            notes: 'Revise approved work',
          })
        : value.operations.command(
            workspace,
            memberId,
            userWorkspaceId,
            {
              action: 'fulfilment',
              taskId,
              cycle: 1,
              historyLength: 0,
              decision: 'REDOING',
              note: 'Revise delivered work',
            },
            now,
          );
  describe(`${path} reopening native status authority`, () => {
    it('checks write permission before revision, history or task effects', async () => {
      const value = fixture();
      value.policy.write = false;
      await expect(reopen(value)).rejects.toThrow('status write denied');
      expect(recordDeliveryRevision).not.toHaveBeenCalled();
      expect(applyPublishedDeliveryWorkflow).not.toHaveBeenCalled();
      expect(recordOtogrowActivity).not.toHaveBeenCalled();
      expect(value.state.fulfilments[0].history).toHaveLength(0);
      expect(
        value.queries.mock.calls.some(([sql]) => sql.includes('SET status')),
      ).toBe(false);
    });
    it('rejects a resulting row outside native permission after status changes', async () => {
      const value = fixture();
      value.policy.afterWrite = false;
      await expect(reopen(value)).rejects.toThrow('excluded after update');
      expect(
        value.assertNative.mock.calls.filter(
          (call) => call[5]?.type === 'update',
        ),
      ).toHaveLength(2);
      expect(
        value.queries.mock.calls.filter(([sql]) => sql.includes('SET status')),
      ).toHaveLength(1);
    });
    it('preserves the approved reopen lifecycle when both status checks pass', async () => {
      const value = fixture();
      await reopen(value);
      expect(value.task.details.state).toBe('CHANGES_REQUESTED');
      expect(recordDeliveryRevision).toHaveBeenCalledTimes(1);
      expect(
        value.assertNative.mock.calls.filter(
          (call) => call[5]?.type === 'update',
        ),
      ).toHaveLength(2);
    });
  });
}

it.each(['FULFILLED', 'NOT_FULFILLED'] as const)(
  'preserves native-read-only %s fulfilment without a status write',
  async (decision) => {
    const value = fixture();
    value.policy.write = false;
    await value.operations.command(
      workspace,
      memberId,
      userWorkspaceId,
      {
        action: 'fulfilment',
        taskId,
        cycle: 1,
        historyLength: 0,
        decision,
        note: 'Recorded delivery response',
      },
      now,
    );
    expect(value.task.details.state).toBe('APPROVED');
    expect(
      value.assertNative.mock.calls.every((call) => call[5] === undefined),
    ).toBe(true);
    expect(recordDeliveryRevision).not.toHaveBeenCalled();
  },
);
