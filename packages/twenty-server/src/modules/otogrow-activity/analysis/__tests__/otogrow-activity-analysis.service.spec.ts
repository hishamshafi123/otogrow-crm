import { ConflictException, ForbiddenException } from '@nestjs/common';
import { type DataSource, type EntityManager } from 'typeorm';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type AiModelRegistryService } from 'src/engine/metadata-modules/ai/ai-models/services/ai-model-registry.service';
import { type MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { type OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { type OtogrowAiBudgetService } from 'src/modules/otogrow-ai-budget/otogrow-ai-budget.service';
import { type OtogrowActivityService } from 'src/modules/otogrow-activity/otogrow-activity.service';
import { type OtogrowActivityCurrentWorkService } from 'src/modules/otogrow-activity/analysis/current-work/otogrow-activity-current-work.service';
import { OtogrowActivityAnalysisService } from 'src/modules/otogrow-activity/analysis/otogrow-activity-analysis.service';
import { OtogrowActivityAnalysisRunEntity } from 'src/modules/otogrow-activity/analysis/entities/otogrow-activity-analysis-run.entity';
import {
  buildActivityAnalysisContext,
  activityAnalysisBody,
  activityAnalysisContextFingerprint,
  activityAnalysisEvidenceFingerprint,
} from 'src/modules/otogrow-activity/analysis/otogrow-activity-analysis.policy';
import {
  type ActivityAnalysisReceipt,
  type StartActivityAnalysisInput,
} from 'src/modules/otogrow-activity/analysis/otogrow-activity-analysis.types';
import { advertisingHash } from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy';
import {
  activityAnalysisFixture,
  WORKSPACE_ID,
  MEMBER_ID,
  USER_WORKSPACE_ID,
  RUN_ID,
  REQUEST_ID,
  OTHER_MEMBER_ID,
} from 'src/modules/otogrow-activity/analysis/__tests__/activity-analysis.fixture';

const setup = () => {
  const fixture = activityAnalysisFixture();
  const { input, agent, evidence, identity } = fixture;
  const context = buildActivityAnalysisContext(input, agent, evidence);
  const command: StartActivityAnalysisInput = {
    ...input,
    id: RUN_ID,
    requestId: REQUEST_ID,
    bodyFingerprint: advertisingHash(activityAnalysisBody(input)),
    contextFingerprint: activityAnalysisContextFingerprint(context, agent),
    evidenceFingerprint: activityAnalysisEvidenceFingerprint(context),
    capturedAt: context.capturedAt,
    agentVersion: 1,
    pricingRevision: 1,
  };
  const receipt: ActivityAnalysisReceipt = {
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
  const run = Object.assign(new OtogrowActivityAnalysisRunEntity(), {
    id: RUN_ID,
    workspaceId: WORKSPACE_ID,
    requestId: REQUEST_ID,
    initiatorId: MEMBER_ID,
    initiatorName: 'Founder',
    userWorkspaceId: USER_WORKSPACE_ID,
    agentId: agent.id,
    agentVersion: 1,
    agent: {
      id: agent.id,
      version: 1,
      name: agent.configuration.name,
      modelId: 'mock-model',
      maxOutputTokens: 1024,
    },
    configuration: agent.configuration,
    input: command,
    inputHash: receipt.inputHash,
    bodyFingerprint: command.bodyFingerprint,
    contextFingerprint: command.contextFingerprint,
    basis: {
      evidenceFingerprint: command.evidenceFingerprint,
      containsFinance: false,
      includedCount: 1,
      omittedCount: 0,
      promptVersion: context.promptVersion,
      outputContractVersion: context.outputContractVersion,
    },
    context,
    startReceipt: receipt,
    status: 'QUEUED',
    revision: 1,
    result: null,
    usage: null,
    error: null,
    cancelRequestId: null,
    cancelInputHash: null,
    cancelReceipt: null,
    createdAt: new Date(receipt.createdAt),
    updatedAt: new Date(receipt.createdAt),
    startedAt: null,
    finishedAt: null,
  });
  const repository = {
    findOne: jest.fn().mockResolvedValue(run),
    insert: jest.fn(),
    update: jest.fn(),
  };
  const manager = {
    queryRunner: { isTransactionActive: true },
    query: jest.fn(),
    getRepository: jest.fn(() => repository),
  } as unknown as EntityManager;
  const dataSource = {
    transaction: jest.fn(
      async (operation: (manager: EntityManager) => Promise<unknown>) =>
        operation(manager),
    ),
  } as unknown as DataSource;
  const activity = {
    authority: jest.fn().mockImplementation(async () => identity),
    evidence: jest.fn(),
  };
  const budget = { reserve: jest.fn(), stop: jest.fn(), quote: jest.fn() };
  const queue = { add: jest.fn() };
  const service = new OtogrowActivityAnalysisService(
    dataSource,
    {} as OtogrowAccessService,
    activity as unknown as OtogrowActivityService,
    {} as AiModelRegistryService,
    queue as unknown as MessageQueueService,
    budget as unknown as OtogrowAiBudgetService,
    {} as OtogrowActivityCurrentWorkService,
  );
  const workspace = { id: WORKSPACE_ID } as WorkspaceEntity;
  return {
    ...fixture,
    context,
    command,
    receipt,
    run,
    repository,
    manager,
    activity,
    budget,
    queue,
    service,
    workspace,
  };
};
describe('activity analysis durable request boundaries', () => {
  it('returns the original start receipt without another reservation or evidence rebuild', async () => {
    const f = setup();
    const response = await f.service.start(
      f.workspace,
      MEMBER_ID,
      USER_WORKSPACE_ID,
      f.command,
      f.manager,
    );
    expect(response.receipt).toEqual(f.receipt);
    expect(f.budget.reserve).not.toHaveBeenCalled();
    expect(f.repository.insert).not.toHaveBeenCalled();
    expect(f.activity.evidence).not.toHaveBeenCalled();
    expect(f.queue.add).not.toHaveBeenCalled();
  });
  it('rejects reuse of a request UUID for a changed question before spending', async () => {
    const f = setup();
    await expect(
      f.service.start(
        f.workspace,
        MEMBER_ID,
        USER_WORKSPACE_ID,
        { ...f.command, question: 'Changed question' },
        f.manager,
      ),
    ).rejects.toThrow(ConflictException);
    expect(f.budget.reserve).not.toHaveBeenCalled();
  });
  it('does not let another current administrator replay the original issuer request', async () => {
    const f = setup();
    f.identity.memberId = OTHER_MEMBER_ID;
    f.identity.actor.memberId = OTHER_MEMBER_ID;
    await expect(
      f.service.start(
        f.workspace,
        OTHER_MEMBER_ID,
        USER_WORKSPACE_ID,
        f.command,
        f.manager,
      ),
    ).rejects.toThrow(ConflictException);
    const response = await f.service.request(
      f.workspace,
      OTHER_MEMBER_ID,
      USER_WORKSPACE_ID,
      { requestId: REQUEST_ID, action: 'STARTED' },
      f.manager,
    );
    expect(response.receipt).toBeNull();
    expect(response.run).toBeNull();
  });
  it('checks current membership before receipt recovery and returns no private payload after revocation', async () => {
    const f = setup();
    f.activity.authority.mockRejectedValue(new ForbiddenException('Revoked'));
    await expect(
      f.service.request(
        f.workspace,
        MEMBER_ID,
        USER_WORKSPACE_ID,
        { requestId: REQUEST_ID, action: 'STARTED' },
        f.manager,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(f.repository.findOne).not.toHaveBeenCalled();
  });
  it('keeps light state reads free of question/evidence/result/configuration selection', async () => {
    const f = setup();
    const response = await f.service.state(
      f.workspace,
      MEMBER_ID,
      USER_WORKSPACE_ID,
      { id: RUN_ID },
      f.manager,
    );
    expect(response).not.toHaveProperty('context');
    expect(response).not.toHaveProperty('result');
    const options = f.repository.findOne.mock.calls[0][0] as {
      select: string[];
    };
    for (const key of ['context', 'result', 'input', 'configuration', 'usage'])
      expect(options.select).not.toContain(key);
    expect(response.run.includedCount).toBe(1);
  });
  it('denies a finance-bearing saved context and receipt after finance access loss while admin remains', async () => {
    const f = setup();
    f.run.basis.containsFinance = true;
    f.identity.actor.capabilities = ['workspace.admin'];
    await expect(
      f.service.detail(
        f.workspace,
        MEMBER_ID,
        USER_WORKSPACE_ID,
        { id: RUN_ID },
        f.manager,
      ),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      f.service.request(
        f.workspace,
        MEMBER_ID,
        USER_WORKSPACE_ID,
        { requestId: REQUEST_ID, action: 'STARTED' },
        f.manager,
      ),
    ).rejects.toThrow(ForbiddenException);
  });
  it('preserves historical reading independently of current model/config availability', async () => {
    const f = setup();
    f.run.status = 'SUCCEEDED';
    const response = await f.service.detail(
      f.workspace,
      MEMBER_ID,
      USER_WORKSPACE_ID,
      { id: RUN_ID },
      f.manager,
    );
    expect(response.context).toEqual(f.context);
    expect(response.run.resultAvailable).toBe(true);
    expect(f.activity.evidence).not.toHaveBeenCalled();
  });
  it('rejects cancellation after another terminal state without touching budget exposure', async () => {
    const f = setup();
    f.run.status = 'FAILED';
    await expect(
      f.service.cancel(
        f.workspace,
        MEMBER_ID,
        USER_WORKSPACE_ID,
        { id: RUN_ID, requestId: OTHER_MEMBER_ID, revision: 1 },
        f.manager,
      ),
    ).rejects.toThrow(ConflictException);
    expect(f.budget.stop).not.toHaveBeenCalled();
    expect(f.repository.update).not.toHaveBeenCalled();
  });
});
