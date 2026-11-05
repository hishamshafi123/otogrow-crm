import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { type DataSource, type EntityManager } from 'typeorm';
import { generateText } from 'ai';
import { type MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type AiModelRegistryService } from 'src/engine/metadata-modules/ai/ai-models/services/ai-model-registry.service';
import { type DeliveryService } from 'src/modules/delivery/delivery.service';
import { type DeliveryNativeTaskAccessService } from 'src/modules/delivery/delivery-native-task-access.service';
import { DeliveryAgentService } from 'src/modules/delivery/agents/delivery-agent.service';
import { DeliveryAssistantsService } from 'src/modules/delivery/agents/reads/delivery-assistants.service';
import { type DeliveryAgentConfiguration } from 'src/modules/delivery/agents/delivery-agent.types';
import { verifyDeliverySeo } from 'src/modules/delivery/agents/delivery-seo-verifier';
import { DeliveryAgentEntity } from 'src/modules/delivery/entities/delivery-agent.entity';
import { DeliveryAgentRunEntity } from 'src/modules/delivery/entities/delivery-agent-run.entity';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { DeliveryTaskEntity } from 'src/modules/delivery/entities/delivery-task.entity';
import { type OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { type OtogrowAiBudgetService } from 'src/modules/otogrow-ai-budget/otogrow-ai-budget.service';

jest.mock('ai', () => ({
  generateText: jest.fn(),
  Output: { object: jest.fn() },
  NoObjectGeneratedError: { isInstance: () => false },
}));
jest.mock('src/modules/delivery/agents/delivery-seo-verifier', () => ({
  verifyDeliverySeo: jest.fn(),
  validateDeliveryPublicUrl: jest.fn(),
}));
jest.mock('src/modules/otogrow-activity/record-otogrow-activity', () => ({
  recordOtogrowActivity: jest.fn(),
}));
jest.mock('src/modules/delivery/knowledge/delivery-knowledge-context', () => ({
  readDeliveryKnowledgeContext: jest.fn(),
  assertDeliveryKnowledgeCurrent: jest.fn(),
}));
jest.mock(
  'src/modules/delivery/commitments/record-delivery-commitment',
  () => ({ syncStoredDeliveryCommitment: jest.fn() }),
);

const WORKSPACE = '70000000-0000-4000-8000-000000000001';
const PROJECT = '70000000-0000-4000-8000-000000000002';
const MEMBER = '70000000-0000-4000-8000-000000000003';
const MEMBERSHIP = '70000000-0000-4000-8000-000000000004';
const TASK = '70000000-0000-4000-8000-000000000005';
const AGENT = '70000000-0000-4000-8000-000000000006';
const RUN = '70000000-0000-4000-8000-000000000007';
const REQUEST = '70000000-0000-4000-8000-000000000008';
const RESULT = {
  summary: 'Private result',
  findings: [],
  suggestedBrief: 'Corrected brief',
  suggestedCopy: null,
};
const setup = () => {
  const state = {
    access: 'ALLOW' as 'ALLOW' | 'DENY' | 'HIDDEN' | 'STALE',
    active: true,
    manager: true,
    project: true,
    revokeBeforeDispatch: false,
    revokeDuringProvider: false,
    cancelDuringProvider: false,
  };
  const workspace = { id: WORKSPACE } as WorkspaceEntity;
  const configuration: DeliveryAgentConfiguration = {
    name: 'Brief assistant',
    purpose: 'Check brief',
    instructions: 'Use evidence',
    kind: 'BRIEF',
    enabled: true,
    requiredInputs: ['brief'],
    outputFormat: 'findings_and_edits',
    tools: [],
    modelId: 'model',
    projectIds: [PROJECT],
    roles: ['ADMIN', 'MANAGER', 'MEMBER'],
    roleIds: null,
    dailyRunLimit: 10,
    maxOutputTokens: 1024,
    humanConfirmation: true,
  };
  const task = Object.assign(new DeliveryTaskEntity(), {
    workspaceId: WORKSPACE,
    taskId: TASK,
    projectId: PROJECT,
    revision: 1,
    details: {
      brief: 'Private brief',
      service: 'VIDEO',
      state: 'PLANNED',
      checklist: [],
      submissions: [],
      evidence: [],
      events: [],
    },
  });
  const run: DeliveryAgentRunEntity = Object.assign(
    new DeliveryAgentRunEntity(),
    {
      id: RUN,
      workspaceId: WORKSPACE,
      taskId: TASK,
      agentId: AGENT,
      initiatorId: MEMBER,
      userWorkspaceId: MEMBERSHIP,
      requestId: REQUEST,
      taskRevision: 1,
      agentVersion: 1,
      configuration,
      status: 'QUEUED',
      activity: [],
      context: {
        title: 'Private title',
        brief: 'Private brief',
        service: 'VIDEO',
        checklist: [],
        submittedCopy: '',
        evidenceLinks: [],
        inputs: { copy: '', requirements: '' },
      },
      result: null,
      usage: null,
      decision: null,
      error: null,
    },
  );
  const agent = Object.assign(new DeliveryAgentEntity(), {
    id: AGENT,
    workspaceId: WORKSPACE,
    configuration,
    version: 1,
  });
  const taskReads = jest.fn(async () => task);
  const saves = jest.fn(async (current: DeliveryAgentRunEntity) => current);
  const runRepository = {
    findOneBy: async (criteria: { id?: string; status?: string }) =>
      (!criteria.id || criteria.id === RUN) &&
      (!criteria.status || criteria.status === run.status)
        ? run
        : null,
    findOneByOrFail: async () => run,
    save: saves,
  };
  const manager = {
    queryRunner: { isTransactionActive: true },
    query: jest.fn(async (sql: string) => {
      if (sql.includes('pg_advisory')) return [];
      if (sql.includes('SELECT m.id'))
        return state.active ? [{ id: MEMBER }] : [];
      if (sql.includes('SELECT project.id'))
        return [{ id: PROJECT, name: 'Current project', revision: 1 }];
      if (sql.includes('SELECT title')) return [{ title: 'Private title' }];
      if (sql.includes('SELECT "assigneeId"')) return [{ assigneeId: MEMBER }];
      throw new Error('Unexpected query');
    }),
    getRepository: (entity: unknown) => {
      if (entity === DeliveryAgentRunEntity) return runRepository;
      if (entity === DeliveryTaskEntity)
        return { findOneBy: taskReads, save: async () => task };
      if (entity === DeliveryProjectEntity)
        return {
          findOneBy: async () =>
            state.project ? { id: PROJECT, memberIds: [MEMBER] } : null,
        };
      if (entity === DeliveryAgentEntity)
        return {
          findOneBy: async () => agent,
          findOneByOrFail: async () => agent,
        };
      if (entity === WorkspaceEntity)
        return { findOneByOrFail: async () => workspace };
      throw new Error('Unexpected repository');
    },
  } as unknown as EntityManager;
  const dataSource = {
    getRepository: manager.getRepository,
    transaction: async <TResult>(
      callback: (manager: EntityManager) => Promise<TResult>,
    ) => callback(manager),
  } as unknown as DataSource;
  const delivery = {
    schema: () => 'workspace_fixture',
    actor: async () => ({
      memberId: MEMBER,
      isAdmin: state.manager,
      isManager: state.manager,
      roleIds: [],
      capabilities: [],
    }),
  } as unknown as DeliveryService;
  const nativeChecks = jest.fn(async (transaction: EntityManager) => {
    expect(transaction.queryRunner?.isTransactionActive).toBe(true);
    if (state.access === 'DENY')
      throw new ForbiddenException('Native task denied.');
    if (state.access === 'HIDDEN')
      throw new NotFoundException('Native task unavailable.');
    if (state.access === 'STALE')
      throw new ConflictException('Refresh native task access.');
    return { fingerprint: 'policy', sql: 'true', parameters: {} };
  });
  const budget = {
    quote: jest.fn(async () => ({ budgetReady: true })),
    dispatch: jest.fn(
      async (
        _source: unknown,
        _membership: string,
        authorize: (manager: EntityManager) => Promise<void>,
      ) => {
        if (state.revokeBeforeDispatch) state.access = 'DENY';
        await authorize(manager);
      },
    ),
    settle: jest.fn(async () => ({ actualMicroUsd: '1000' })),
    stop: jest.fn(),
    fail: jest.fn(),
    reserve: jest.fn(),
  };
  jest.mocked(generateText).mockImplementation(async () => {
    if (state.revokeDuringProvider) state.access = 'DENY';
    if (state.cancelDuringProvider) run.status = 'CANCELLED';
    return {
      output: RESULT,
      usage: { inputTokens: 10, outputTokens: 20 },
    } as unknown as Awaited<ReturnType<typeof generateText>>;
  });
  jest.mocked(verifyDeliverySeo).mockImplementation(async () => {
    if (state.revokeDuringProvider) state.access = 'DENY';
    return RESULT;
  });
  const engine = new DeliveryAgentService(
    dataSource,
    delivery,
    {
      getModel: () => ({ model: {} }),
      validateModelAvailability: jest.fn(),
    } as unknown as AiModelRegistryService,
    { add: jest.fn() } as unknown as MessageQueueService,
    budget as unknown as OtogrowAiBudgetService,
    {} as OtogrowAccessService,
    { assert: nativeChecks } as unknown as DeliveryNativeTaskAccessService,
  );
  const reads = new DeliveryAssistantsService(
    dataSource,
    delivery,
    engine,
    {} as AiModelRegistryService,
    { visibility: nativeChecks } as unknown as DeliveryNativeTaskAccessService,
  );
  return {
    state,
    workspace,
    configuration,
    task,
    run,
    engine,
    nativeChecks,
    taskReads,
    budget,
    saves,
    reads,
  };
};

describe('task assistant native permission lifecycle', () => {
  beforeEach(() => jest.clearAllMocks());
  it.each(['DENY', 'HIDDEN', 'STALE'] as const)(
    'rejects %s before task context, preview pricing or paid start',
    async (access) => {
      const fixture = setup();
      fixture.state.access = access;
      for (const type of ['preview', 'start']) {
        await expect(
          fixture.engine.command(fixture.workspace, MEMBER, MEMBERSHIP, {
            type,
            taskId: TASK,
            agentId: AGENT,
            inputs: {},
            ...(type === 'start'
              ? { requestId: REQUEST, taskRevision: 1, agentVersion: 1 }
              : {}),
          }),
        ).rejects.toThrow();
      }
      expect(fixture.taskReads).not.toHaveBeenCalled();
      expect(fixture.budget.quote).not.toHaveBeenCalled();
      expect(fixture.budget.reserve).not.toHaveBeenCalled();
    },
  );
  it('keeps exact cancellation and budget stopping available after native revocation', async () => {
    const fixture = setup();
    fixture.state.access = 'DENY';
    await expect(
      fixture.engine.command(fixture.workspace, MEMBER, MEMBERSHIP, {
        type: 'cancel',
        runId: RUN,
      }),
    ).resolves.toEqual({ runId: RUN });
    expect(fixture.run.status).toBe('CANCELLED');
    expect(fixture.budget.stop).toHaveBeenCalledWith(
      expect.anything(),
      { workspaceId: WORKSPACE, sourceKind: 'TASK_AGENT', sourceRunId: RUN },
      true,
    );
    expect(fixture.nativeChecks).not.toHaveBeenCalled();
    expect(fixture.run.result).toBeNull();
  });
  it('commits typed cancellation once while refusing its receipt and subsequent request recovery after revocation', async () => {
    const fixture = setup();
    fixture.state.access = 'DENY';
    await expect(
      fixture.reads.cancel(fixture.workspace, MEMBER, MEMBERSHIP, {
        runId: RUN,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(fixture.run.status).toBe('CANCELLED');
    expect(fixture.budget.stop).toHaveBeenCalledTimes(1);
    await expect(
      fixture.reads.request(fixture.workspace, MEMBER, MEMBERSHIP, {
        requestId: REQUEST,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(fixture.budget.stop).toHaveBeenCalledTimes(1);
    expect(fixture.run.result).toBeNull();
  });
  it('rechecks a previous request before returning its replay identity', async () => {
    const fixture = setup();
    fixture.nativeChecks
      .mockResolvedValueOnce({
        fingerprint: 'policy',
        sql: 'true',
        parameters: {},
      })
      .mockRejectedValueOnce(
        new NotFoundException('Previous task is unavailable.'),
      );
    await expect(
      fixture.engine.command(fixture.workspace, MEMBER, MEMBERSHIP, {
        type: 'start',
        taskId: TASK,
        agentId: AGENT,
        requestId: REQUEST,
        taskRevision: 1,
        agentVersion: 1,
        inputs: {},
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(fixture.nativeChecks).toHaveBeenCalledTimes(2);
    expect(fixture.budget.reserve).not.toHaveBeenCalled();
    expect(fixture.run.status).toBe('QUEUED');
  });
  it.each(['account', 'project', 'initiator'])(
    'still denies cancellation without current %s authority',
    async (lost) => {
      const fixture = setup();
      fixture.state.access = 'DENY';
      if (lost === 'account') fixture.state.active = false;
      if (lost === 'project') fixture.state.project = false;
      if (lost === 'initiator') {
        fixture.state.manager = false;
        fixture.run.initiatorId = REQUEST;
      }
      await expect(
        fixture.engine.command(fixture.workspace, MEMBER, MEMBERSHIP, {
          type: 'cancel',
          runId: RUN,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(fixture.run.status).toBe('QUEUED');
      expect(fixture.budget.stop).not.toHaveBeenCalled();
    },
  );
  it('does not apply an accepted result after native access is lost', async () => {
    const fixture = setup();
    fixture.run.status = 'WAITING_REVIEW';
    fixture.run.result = RESULT;
    fixture.state.access = 'HIDDEN';
    await expect(
      fixture.engine.command(fixture.workspace, MEMBER, MEMBERSHIP, {
        type: 'decide',
        runId: RUN,
        action: 'ACCEPT',
        field: 'brief',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(fixture.task.details.brief).toBe('Private brief');
    expect(fixture.run.decision).toBeNull();
  });
  it('permits a manager to accept a core brief with native read access', async () => {
    const fixture = setup();
    fixture.run.status = 'WAITING_REVIEW';
    fixture.run.result = RESULT;
    await fixture.engine.command(fixture.workspace, MEMBER, MEMBERSHIP, {
      type: 'decide',
      runId: RUN,
      action: 'ACCEPT',
      field: 'brief',
    });
    expect(fixture.task.details.brief).toBe('Corrected brief');
    expect(fixture.task.revision).toBe(2);
    expect(fixture.run.status).toBe('SUCCEEDED');
    expect(fixture.nativeChecks).toHaveBeenCalledWith(
      expect.anything(),
      fixture.workspace,
      { memberId: MEMBER, userWorkspaceId: MEMBERSHIP },
      TASK,
      ['id', 'title', 'assigneeId'],
    );
  });
  it('rechecks the actual initiator before paid dispatch and stops denied runs without provider calls', async () => {
    const fixture = setup();
    fixture.state.revokeBeforeDispatch = true;
    await fixture.engine.execute(RUN);
    expect(fixture.nativeChecks).toHaveBeenCalledTimes(2);
    for (const call of fixture.nativeChecks.mock.calls)
      expect(call).toEqual([
        expect.anything(),
        fixture.workspace,
        { memberId: MEMBER, userWorkspaceId: MEMBERSHIP },
        TASK,
        ['id', 'title', 'assigneeId'],
      ]);
    expect(generateText).not.toHaveBeenCalled();
    expect(fixture.run.status).toBe('FAILED');
    expect(fixture.budget.fail).toHaveBeenCalledTimes(1);
    expect(fixture.budget.stop).toHaveBeenCalledTimes(1);
  });
  it('settles actual usage but never publishes the result after revocation during provider work', async () => {
    const fixture = setup();
    fixture.state.revokeDuringProvider = true;
    await fixture.engine.execute(RUN);
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(fixture.budget.settle).toHaveBeenCalledTimes(1);
    expect(fixture.nativeChecks).toHaveBeenCalledTimes(3);
    expect(fixture.run.status).toBe('FAILED');
    expect(fixture.run.result).toBeNull();
    expect(fixture.budget.fail).toHaveBeenCalledTimes(1);
  });
  it('never resurrects a cancelled run when paid work returns', async () => {
    const fixture = setup();
    fixture.state.cancelDuringProvider = true;
    await fixture.engine.execute(RUN);
    expect(fixture.budget.settle).toHaveBeenCalledTimes(1);
    expect(fixture.run.status).toBe('CANCELLED');
    expect(fixture.run.result).toBeNull();
  });
  it('checks SEO before its external work and before publishing free results', async () => {
    const fixture = setup();
    fixture.configuration.kind = 'SEO';
    fixture.configuration.tools = ['public_page_check'];
    fixture.state.revokeDuringProvider = true;
    await fixture.engine.execute(RUN);
    expect(verifyDeliverySeo).toHaveBeenCalledTimes(1);
    expect(fixture.nativeChecks).toHaveBeenCalledTimes(2);
    expect(fixture.run.status).toBe('FAILED');
    expect(fixture.run.result).toBeNull();
    expect(generateText).not.toHaveBeenCalled();
    expect(fixture.budget.settle).not.toHaveBeenCalled();
  });
  it('saves a reviewable result only when native authority remains valid', async () => {
    const fixture = setup();
    await fixture.engine.execute(RUN);
    expect(fixture.run.status).toBe('WAITING_REVIEW');
    expect(fixture.run.result).toEqual(RESULT);
    expect(fixture.run.usage).toEqual({
      inputTokens: 10,
      outputTokens: 20,
      cost: 0.001,
    });
    expect(fixture.nativeChecks).toHaveBeenCalledTimes(3);
  });
});
