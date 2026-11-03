import { ConflictException, ForbiddenException } from '@nestjs/common';
import { type EntityManager } from 'typeorm';
import { DeliveryAgentEntity } from 'src/modules/delivery/entities/delivery-agent.entity';
import { DeliveryAdvertisingDraftRunEntity } from 'src/modules/delivery/advertising/drafts/entities/delivery-advertising-draft-run.entity';
import {
  advertisingDraftBlockingReasons,
  validateAdvertisingActionOrigin,
} from 'src/modules/delivery/advertising/drafts/read-advertising-draft-basis';
import {
  buildAdvertisingDraftContext,
  validateAdvertisingDraftOutput,
} from 'src/modules/delivery/advertising/drafts/delivery-advertising-draft.policy';
import { advertisingHash } from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy';
import {
  advertisingDraftFixture,
  RUN_ID,
  WORKSPACE_ID,
} from 'src/modules/delivery/advertising/drafts/__tests__/advertising-draft.fixture';

const fixture = () => {
  const value = advertisingDraftFixture();
  const { input, source, goal, agent, knowledge, output } = value;
  const context = buildAdvertisingDraftContext(
    input,
    source,
    goal,
    agent,
    knowledge,
  );
  const run = Object.assign(new DeliveryAdvertisingDraftRunEntity(), {
    id: RUN_ID,
    workspaceId: WORKSPACE_ID,
    projectId: source.project!.id,
    companyId: null,
    sourceKind: 'META' as const,
    sourceId: source.source.id,
    status: 'SUCCEEDED' as const,
    agentId: agent.id,
    agentVersion: agent.version,
    basis: {
      sourceFingerprint: source.fingerprint,
      evidenceFingerprint: source.evidenceFingerprint,
      goalFingerprint: advertisingHash(goal),
      knowledgeFingerprint: knowledge.fingerprint,
      promptVersion: context.promptVersion,
      outputVersion: context.outputVersion,
    },
    result: validateAdvertisingDraftOutput(output, context),
  });
  let knowledgeFingerprint = knowledge.fingerprint;
  const runRead = jest.fn().mockResolvedValue(run);
  const agentRead = jest.fn().mockResolvedValue(agent);
  const manager = {
    queryRunner: { isTransactionActive: true },
    query: jest.fn(async (sql: string) =>
      sql.includes('SELECT md5') ? [{ fingerprint: knowledgeFingerprint }] : [],
    ),
    getRepository: jest.fn((entity: unknown) => {
      if (entity === DeliveryAdvertisingDraftRunEntity)
        return { findOne: runRead };
      if (entity === DeliveryAgentEntity) return { findOneBy: agentRead };
      throw new Error('Unexpected repository');
    }),
  } as unknown as EntityManager;
  const suggestion = run.result.suggestions[0];
  const action = {
    ...suggestion,
    origin: { runId: run.id, suggestionId: suggestion.id },
  };
  return {
    ...value,
    run,
    manager,
    action,
    runRead,
    agentRead,
    setKnowledge: (next: string) => {
      knowledgeFingerprint = next;
    },
  };
};

describe('advertising suggestion provenance', () => {
  it('allows ordinary manual actions without reading AI state', async () => {
    const { manager, source, goal, action } = fixture();
    await expect(
      validateAdvertisingActionOrigin(manager, WORKSPACE_ID, source, goal, {
        ...action,
        origin: null,
      }),
    ).resolves.toBeNull();
    expect(manager.getRepository).not.toHaveBeenCalled();
  });
  it('keeps model origin while deriving whether the human changed its text', async () => {
    const { manager, source, goal, action, runRead } = fixture();
    await expect(
      validateAdvertisingActionOrigin(
        manager,
        WORKSPACE_ID,
        source,
        goal,
        action,
      ),
    ).resolves.toEqual({ ...action.origin, humanEdited: false });
    await expect(
      validateAdvertisingActionOrigin(manager, WORKSPACE_ID, source, goal, {
        ...action,
        evidence: 'Manager added verified evidence.',
      }),
    ).resolves.toEqual({ ...action.origin, humanEdited: true });
    expect(runRead).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: WORKSPACE_ID, id: RUN_ID },
      }),
    );
  });
  it('refuses foreign, failed or fabricated suggestion identities', async () => {
    const { manager, source, goal, action, run, runRead } = fixture();
    for (const replacement of [
      null,
      { ...run, sourceId: RUN_ID },
      { ...run, status: 'FAILED' },
      { ...run, result: null },
    ]) {
      runRead.mockResolvedValueOnce(replacement);
      await expect(
        validateAdvertisingActionOrigin(
          manager,
          WORKSPACE_ID,
          source,
          goal,
          action,
        ),
      ).rejects.toThrow(ConflictException);
    }
    await expect(
      validateAdvertisingActionOrigin(manager, WORKSPACE_ID, source, goal, {
        ...action,
        origin: { runId: RUN_ID, suggestionId: RUN_ID },
      }),
    ).rejects.toThrow(ConflictException);
  });
  it('rechecks current manager and original client access before exposing a reusable result', async () => {
    const { manager, source, goal, action } = fixture();
    for (const changed of [
      { ...source, actor: { ...source.actor, isManager: false } },
      { ...source, canManageDraft: false },
      { ...source, project: null },
      { ...source, source: { ...source.source, companyId: RUN_ID } },
    ])
      await expect(
        validateAdvertisingActionOrigin(
          manager,
          WORKSPACE_ID,
          changed,
          goal,
          action,
        ),
      ).rejects.toThrow(ForbiddenException);
  });
  it('blocks reuse after report, primary outcome, published knowledge or assistant changes', async () => {
    const { manager, source, goal, action, agent, setKnowledge } = fixture();
    await expect(
      validateAdvertisingActionOrigin(
        manager,
        WORKSPACE_ID,
        { ...source, fingerprint: 'd'.repeat(64) },
        goal,
        action,
      ),
    ).rejects.toThrow(ConflictException);
    await expect(
      validateAdvertisingActionOrigin(
        manager,
        WORKSPACE_ID,
        source,
        { ...goal, targetCostMicros: '10' },
        action,
      ),
    ).rejects.toThrow(ConflictException);
    setKnowledge('d'.repeat(32));
    await expect(
      validateAdvertisingActionOrigin(
        manager,
        WORKSPACE_ID,
        source,
        goal,
        action,
      ),
    ).rejects.toThrow(ConflictException);
    setKnowledge('c'.repeat(32));
    agent.version += 1;
    await expect(
      validateAdvertisingActionOrigin(
        manager,
        WORKSPACE_ID,
        source,
        goal,
        action,
      ),
    ).rejects.toThrow(ConflictException);
  });
  it('invalidates reusable output when the assistant role grant or output contract changes', async () => {
    const { manager, source, run, agent } = fixture();
    agent.configuration.roleIds = [RUN_ID];
    await expect(
      advertisingDraftBlockingReasons(manager, run, source),
    ).resolves.toContain('ASSISTANT_CHANGED_OR_UNAVAILABLE');
    run.basis.outputVersion = 'older-output';
    await expect(
      advertisingDraftBlockingReasons(manager, run, source),
    ).resolves.toContain('OUTPUT_CONTRACT_CHANGED');
  });
});
