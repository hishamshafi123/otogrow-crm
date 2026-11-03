import { ConflictException, ForbiddenException } from '@nestjs/common';
import { type DataSource, type EntityManager } from 'typeorm';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type AiModelRegistryService } from 'src/engine/metadata-modules/ai/ai-models/services/ai-model-registry.service';
import { type MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { type DeliveryService } from 'src/modules/delivery/delivery.service';
import { type OtogrowAiBudgetService } from 'src/modules/otogrow-ai-budget/otogrow-ai-budget.service';
import { type OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { type DeliveryAdvertisingSourcesService } from 'src/modules/delivery/advertising/workbench/delivery-advertising-sources.service';
import { DeliveryAgentEntity } from 'src/modules/delivery/entities/delivery-agent.entity';
import { DeliveryAdvertisingDraftRunEntity } from 'src/modules/delivery/advertising/drafts/entities/delivery-advertising-draft-run.entity';
import { DeliveryAdvertisingDraftService } from 'src/modules/delivery/advertising/drafts/delivery-advertising-draft.service';
import { advertisingHash } from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy';
import {
  advertisingDraftBody,
  advertisingDraftContextFingerprint,
  buildAdvertisingDraftContext,
} from 'src/modules/delivery/advertising/drafts/delivery-advertising-draft.policy';
import {
  type AdvertisingDraftReceipt,
  type StartAdvertisingDraftInput,
} from 'src/modules/delivery/advertising/drafts/delivery-advertising-draft.types';
import {
  advertisingDraftFixture,
  MEMBER_ID,
  REQUEST_ID,
  RUN_ID,
  USER_WORKSPACE_ID,
  WORKSPACE_ID,
} from 'src/modules/delivery/advertising/drafts/__tests__/advertising-draft.fixture';

const fixture = () => {
  const values = advertisingDraftFixture();
  const { input, source, goal, agent, knowledge } = values;
  const context = buildAdvertisingDraftContext(
    input,
    source,
    goal,
    agent,
    knowledge,
  );
  const command: StartAdvertisingDraftInput = {
    ...input,
    id: RUN_ID,
    requestId: REQUEST_ID,
    bodyFingerprint: advertisingHash(advertisingDraftBody(input)),
    contextFingerprint: advertisingDraftContextFingerprint(context, agent),
    agentVersion: agent.version,
    knowledgeFingerprint: knowledge.fingerprint,
    pricingRevision: 1,
  };
  const receipt: AdvertisingDraftReceipt = {
    action: 'STARTED',
    requestId: REQUEST_ID,
    runId: RUN_ID,
    actorId: MEMBER_ID,
    userWorkspaceId: USER_WORKSPACE_ID,
    inputHash: advertisingHash(command),
    bodyFingerprint: command.bodyFingerprint,
    createdAt: '2026-11-01T06:00:00.000Z',
    revision: 1,
    status: 'QUEUED',
  };
  const run: DeliveryAdvertisingDraftRunEntity = Object.assign(
    new DeliveryAdvertisingDraftRunEntity(),
    {
      id: RUN_ID,
      workspaceId: WORKSPACE_ID,
      requestId: REQUEST_ID,
      projectId: source.project!.id,
      companyId: null,
      sourceKind: input.sourceKind,
      sourceId: input.sourceId,
      initiatorId: MEMBER_ID,
      initiatorName: 'Original manager',
      userWorkspaceId: USER_WORKSPACE_ID,
      agentId: agent.id,
      agentVersion: agent.version,
      agent: {
        id: agent.id,
        version: agent.version,
        name: agent.configuration.name,
        modelId: 'mock-model',
        maxOutputTokens: 1024,
      },
      basis: {
        sourceFingerprint: source.fingerprint,
        evidenceFingerprint: source.evidenceFingerprint,
        goalFingerprint: advertisingHash(goal),
        knowledgeFingerprint: knowledge.fingerprint,
        promptVersion: context.promptVersion,
        outputVersion: context.outputVersion,
      },
      input: command,
      inputHash: receipt.inputHash,
      bodyFingerprint: receipt.bodyFingerprint,
      contextFingerprint: command.contextFingerprint,
      context,
      startReceipt: receipt,
      status: 'QUEUED' as const,
      revision: 1,
      result: null,
      usage: null,
      error: null,
      cancelRequestId: null,
      cancelInputHash: null,
      cancelReceipt: null,
      createdAt: new Date(receipt.createdAt),
      startedAt: null,
      finishedAt: null,
    },
  );
  const repository = {
    findOneBy: jest.fn().mockResolvedValue(run),
    findOne: jest.fn().mockResolvedValue(run),
    insert: jest.fn(),
    update: jest.fn(),
  };
  const query = jest.fn(
    async (sql: string): Promise<unknown[]> =>
      sql.includes('SELECT md5')
        ? [{ fingerprint: knowledge.fingerprint }]
        : [],
  );
  const manager = {
    queryRunner: { isTransactionActive: true },
    query,
    getRepository: jest.fn((entity: unknown) =>
      entity === DeliveryAgentEntity
        ? { findOneBy: jest.fn().mockResolvedValue(agent) }
        : repository,
    ),
  } as unknown as EntityManager;
  const dataSource = {
    transaction: jest.fn(
      async (operation: (current: EntityManager) => Promise<unknown>) =>
        operation(manager),
    ),
  } as unknown as DataSource;
  const delivery = {
    actor: jest.fn().mockImplementation(async () => source.actor),
  };
  const sources = {
    read: jest.fn().mockImplementation(async () => source),
    validateGoal: jest.fn().mockReturnValue(goal),
  };
  const budget = {
    reserve: jest.fn(),
    stop: jest.fn(),
    quote: jest.fn().mockResolvedValue({
      maximumCostUsd: '0.01',
      pricingRevision: 1,
      budgetReady: true,
      blockedReason: null,
      boundSource: 'MODEL_CONTEXT',
    }),
  };
  const models = {
    getModel: jest.fn().mockReturnValue({ model: {} }),
    validateModelAvailability: jest.fn(),
  };
  const queue = { add: jest.fn() };
  const service = new DeliveryAdvertisingDraftService(
    dataSource,
    delivery as unknown as DeliveryService,
    sources as unknown as DeliveryAdvertisingSourcesService,
    models as unknown as AiModelRegistryService,
    queue as unknown as MessageQueueService,
    budget as unknown as OtogrowAiBudgetService,
    {} as OtogrowAccessService,
  );
  const workspace = { id: WORKSPACE_ID } as WorkspaceEntity;
  return {
    ...values,
    command,
    receipt,
    run,
    repository,
    manager,
    dataSource,
    delivery,
    sources,
    budget,
    queue,
    service,
    workspace,
    query,
  };
};

describe('advertising draft request recovery', () => {
  it('redacts private assistant instructions for managers without changing the frozen execution context', async () => {
    const {
      service,
      workspace,
      manager,
      run,
      source,
      input,
      query,
      knowledge,
    } = fixture();
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT md5'))
        return [{ fingerprint: knowledge.fingerprint, totalSources: 1 }];
      if (sql.includes('SELECT s.id')) return knowledge.sources;
      if (sql.includes('COALESCE(sum(source.count)')) return [{ count: 0 }];
      return [];
    });
    const managerPreview = await service.preview(
      workspace,
      MEMBER_ID,
      USER_WORKSPACE_ID,
      input,
      manager,
    );
    const managerRead = await service.detail(
      workspace,
      MEMBER_ID,
      USER_WORKSPACE_ID,
      { id: RUN_ID },
      manager,
    );
    expect(managerPreview.context.assistantInstructions).toBeNull();
    expect(managerRead.run.context?.assistantInstructions).toBeNull();
    expect(run.context.assistantInstructions).toBe(
      'Use only supplied evidence.',
    );
    source.actor.isAdmin = true;
    const adminPreview = await service.preview(
      workspace,
      MEMBER_ID,
      USER_WORKSPACE_ID,
      input,
      manager,
    );
    const adminRead = await service.detail(
      workspace,
      MEMBER_ID,
      USER_WORKSPACE_ID,
      { id: RUN_ID },
      manager,
    );
    expect(adminPreview.context.assistantInstructions).toBe(
      run.context.assistantInstructions,
    );
    expect(adminRead.run.context?.assistantInstructions).toBe(
      run.context.assistantInstructions,
    );
    expect(adminPreview.contextFingerprint).toBe(
      managerPreview.contextFingerprint,
    );
  });
  it('returns the immutable original receipt for an exact retry without reserving or inserting again', async () => {
    const {
      service,
      workspace,
      command,
      manager,
      receipt,
      repository,
      budget,
      run,
    } = fixture();
    run.status = 'SUCCEEDED';
    run.revision = 3;
    const recovered = await service.start(
      workspace,
      MEMBER_ID,
      USER_WORKSPACE_ID,
      command,
      manager,
    );
    expect(recovered.receipt).toEqual(receipt);
    expect(recovered.receipt.status).toBe('QUEUED');
    expect(recovered.run.status).toBe('SUCCEEDED');
    expect(repository.insert).not.toHaveBeenCalled();
    expect(budget.reserve).not.toHaveBeenCalled();
  });
  it('rejects another actor, a replacement membership and a changed body under the same request identity', async () => {
    const { service, workspace, command, manager, budget } = fixture();
    for (const [member, membership, body] of [
      [RUN_ID, USER_WORKSPACE_ID, command],
      [MEMBER_ID, RUN_ID, command],
      [
        MEMBER_ID,
        USER_WORKSPACE_ID,
        { ...command, instructions: 'Changed request' },
      ],
    ] as const)
      await expect(
        service.start(workspace, member, membership, body, manager),
      ).rejects.toThrow(ConflictException);
    expect(budget.reserve).not.toHaveBeenCalled();
  });
  it('does not replay a saved request after current report access or its client anchor is lost', async () => {
    const { service, workspace, command, manager, source } = fixture();
    source.canManageDraft = false;
    await expect(
      service.start(workspace, MEMBER_ID, USER_WORKSPACE_ID, command, manager),
    ).rejects.toThrow(ForbiddenException);
    source.canManageDraft = true;
    source.source.companyId = RUN_ID;
    await expect(
      service.start(workspace, MEMBER_ID, USER_WORKSPACE_ID, command, manager),
    ).rejects.toThrow(ForbiddenException);
  });
  it('does not expose somebody else’s start receipt through exact recovery', async () => {
    const { service, workspace, manager, run } = fixture();
    run.startReceipt = { ...run.startReceipt, actorId: RUN_ID };
    const response = await service.request(
      workspace,
      MEMBER_ID,
      USER_WORKSPACE_ID,
      { requestId: REQUEST_ID, action: 'STARTED' },
      manager,
    );
    expect(response.receipt).toBeNull();
    expect(response.run).toBeNull();
  });
  it('recovers only the exact original cancellation without releasing a hold again', async () => {
    const { service, workspace, manager, run, receipt, budget } = fixture();
    const command = { id: RUN_ID, requestId: RUN_ID, revision: 1 };
    run.status = 'CANCELLED';
    run.revision = 2;
    run.cancelRequestId = command.requestId;
    run.cancelInputHash = advertisingHash(command);
    run.cancelReceipt = {
      ...receipt,
      action: 'CANCELLED',
      requestId: command.requestId,
      inputHash: run.cancelInputHash,
      revision: 2,
      status: 'CANCELLED',
    };
    await expect(
      service.cancel(workspace, MEMBER_ID, USER_WORKSPACE_ID, command, manager),
    ).resolves.toMatchObject({ receipt: run.cancelReceipt });
    await expect(
      service.cancel(workspace, RUN_ID, USER_WORKSPACE_ID, command, manager),
    ).rejects.toThrow(ConflictException);
    expect(budget.stop).not.toHaveBeenCalled();
  });
  it('polls state without returning instructions, report context or generated output', async () => {
    const { service, workspace, manager, repository } = fixture();
    const response = await service.state(
      workspace,
      MEMBER_ID,
      USER_WORKSPACE_ID,
      { id: RUN_ID },
      manager,
    );
    expect(response.run).not.toHaveProperty('context');
    expect(response.run).not.toHaveProperty('result');
    expect(response.run).not.toHaveProperty('input');
    expect(repository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.not.arrayContaining(['context', 'result', 'input']),
      }),
    );
  });
  it('denies private run reads before querying run evidence for a current staff member', async () => {
    const { service, workspace, manager, source, repository } = fixture();
    source.actor.isManager = false;
    await expect(
      service.detail(
        workspace,
        MEMBER_ID,
        USER_WORKSPACE_ID,
        { id: RUN_ID },
        manager,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(repository.findOne).not.toHaveBeenCalled();
  });
});
