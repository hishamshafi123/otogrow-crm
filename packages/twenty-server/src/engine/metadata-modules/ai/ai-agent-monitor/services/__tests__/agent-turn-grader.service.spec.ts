import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { generateText } from 'ai';
import { AgentTurnEntity } from 'src/engine/metadata-modules/ai/ai-agent-execution/entities/agent-turn.entity';
import { type AgentTurnEvaluationEntity } from 'src/engine/metadata-modules/ai/ai-agent-monitor/entities/agent-turn-evaluation.entity';
import { AgentTurnGraderService } from 'src/engine/metadata-modules/ai/ai-agent-monitor/services/agent-turn-grader.service';
import { type AiModelRegistryService } from 'src/engine/metadata-modules/ai/ai-models/services/ai-model-registry.service';
import {
  AiException,
  AiExceptionCode,
} from 'src/engine/metadata-modules/ai/ai.exception';
import { type WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';
import { type OtogrowNativeAiService } from 'src/modules/otogrow-ai-budget/otogrow-native-ai.service';

jest.mock('ai', () => ({
  ...jest.requireActual('ai'),
  generateText: jest.fn(),
}));

const WORKSPACE_ID = randomUUID(),
  TURN_ID = randomUUID(),
  OWNER_ID: string = randomUUID(),
  REVIEWER_ID = randomUUID();
const setup = () => {
  const turn = Object.assign(new AgentTurnEntity(), {
    id: TURN_ID,
    workspaceId: WORKSPACE_ID,
    threadId: randomUUID(),
    agentId: null,
    thread: { userWorkspaceId: OWNER_ID },
    messages: [
      {
        role: 'user',
        parts: [{ textContent: 'Summarize the client request.' }],
      },
      {
        role: 'assistant',
        parts: [{ textContent: 'The client requested three edits.' }],
      },
    ],
  });
  const turns = { findOne: jest.fn(async () => turn) };
  const evaluations = {
    insertAndReturnOne: jest.fn(
      async (
        _workspaceId: string,
        values: Partial<AgentTurnEvaluationEntity>,
      ) => ({ id: randomUUID(), ...values }),
    ),
  };
  const model = { modelId: 'test/reviewer', model: {} };
  const models = {
    getDefaultSpeedModel: jest.fn(() => model),
    getEffectiveModelConfig: jest.fn(() => ({
      modelId: model.modelId,
      contextWindowTokens: 1000,
      maxOutputTokens: 512,
    })),
  };
  const nativeAi = { wrap: jest.fn(() => model.model) };
  const service = new AgentTurnGraderService(
    turns as unknown as WorkspaceScopedRepository<AgentTurnEntity>,
    evaluations as unknown as WorkspaceScopedRepository<AgentTurnEvaluationEntity>,
    models as unknown as AiModelRegistryService,
    nativeAi as unknown as OtogrowNativeAiService,
  );
  return { service, turn, turns, evaluations, models, nativeAi, model };
};

const respond = (text: string) =>
  jest
    .mocked(generateText)
    .mockResolvedValueOnce({ text } as Awaited<
      ReturnType<typeof generateText>
    >);

describe('Agent turn grading requires a completed AI review', () => {
  beforeEach(() => {
    jest.mocked(generateText).mockReset();
  });

  it('saves the successful model assessment against the requested turn and responsible reviewer', async () => {
    const { service, evaluations, nativeAi, model } = setup();
    respond(
      '{"score":82.4,"comment":"  The response addressed the requested edits.  "}',
    );
    const saved = await service.evaluateTurn({
      turnId: TURN_ID,
      workspaceId: WORKSPACE_ID,
      userWorkspaceId: REVIEWER_ID,
    });
    expect(saved).toMatchObject({
      turnId: TURN_ID,
      score: 82,
      comment: 'The response addressed the requested edits.',
    });
    expect(evaluations.insertAndReturnOne).toHaveBeenCalledTimes(1);
    expect(nativeAi.wrap).toHaveBeenCalledWith(
      model.model,
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        userWorkspaceId: REVIEWER_ID,
      }),
    );
  });

  it('uses the persisted thread owner for an attributed background review', async () => {
    const { service, nativeAi, model } = setup();
    respond('{"score":75,"comment":"The answer needs more detail."}');
    await service.evaluateTurn({ turnId: TURN_ID, workspaceId: WORKSPACE_ID });
    expect(nativeAi.wrap).toHaveBeenCalledWith(
      model.model,
      expect.objectContaining({ userWorkspaceId: OWNER_ID }),
    );
  });

  it.each([
    new BadRequestException('Configure the production AI budget.'),
    new ForbiddenException('AI access was revoked.'),
    new ConflictException('Pricing changed before dispatch.'),
    new AiException(
      'Selected model is disabled.',
      AiExceptionCode.AGENT_EXECUTION_FAILED,
    ),
  ])(
    'does not turn a controlled refusal into a successful score: %s',
    async (error) => {
      const { service, evaluations } = setup();
      jest.mocked(generateText).mockRejectedValueOnce(error);
      await expect(
        service.evaluateTurn({ turnId: TURN_ID, workspaceId: WORKSPACE_ID }),
      ).rejects.toBe(error);
      expect(evaluations.insertAndReturnOne).not.toHaveBeenCalled();
    },
  );

  it('does not grade an unattributed request or invoke the provider', async () => {
    const { service, turn, evaluations, nativeAi } = setup();
    turn.thread.userWorkspaceId = '';
    await expect(
      service.evaluateTurn({ turnId: TURN_ID, workspaceId: WORKSPACE_ID }),
    ).rejects.toThrow('active person');
    expect(nativeAi.wrap).not.toHaveBeenCalled();
    expect(generateText).not.toHaveBeenCalled();
    expect(evaluations.insertAndReturnOne).not.toHaveBeenCalled();
  });

  it('does not persist a perfect heuristic score when the provider fails', async () => {
    const { service, evaluations } = setup();
    jest
      .mocked(generateText)
      .mockRejectedValueOnce(
        new Error('Provider unavailable; private diagnostic'),
      );
    await expect(
      service.evaluateTurn({ turnId: TURN_ID, workspaceId: WORKSPACE_ID }),
    ).rejects.toThrow('No evaluation was saved');
    expect(evaluations.insertAndReturnOne).not.toHaveBeenCalled();
  });

  it.each([
    'not JSON',
    '{"score":null,"comment":"Completed"}',
    '{"score":"100","comment":"Completed"}',
    '{"score":101,"comment":"Completed"}',
    '{"score":50,"comment":"  "}',
    '{"comment":"Completed"}',
  ])(
    'does not invent or coerce an assessment from invalid model output %s',
    async (text) => {
      const { service, evaluations } = setup();
      respond(text);
      await expect(
        service.evaluateTurn({ turnId: TURN_ID, workspaceId: WORKSPACE_ID }),
      ).rejects.toThrow('No evaluation was saved');
      expect(evaluations.insertAndReturnOne).not.toHaveBeenCalled();
    },
  );

  it('preserves actionable missing-model errors without storing an assessment', async () => {
    const { service, models, evaluations } = setup();
    const failure = new AiException(
      'Configure a model first.',
      AiExceptionCode.API_KEY_NOT_CONFIGURED,
    );
    models.getDefaultSpeedModel.mockImplementationOnce(() => {
      throw failure;
    });
    await expect(
      service.evaluateTurn({ turnId: TURN_ID, workspaceId: WORKSPACE_ID }),
    ).rejects.toBe(failure);
    expect(generateText).not.toHaveBeenCalled();
    expect(evaluations.insertAndReturnOne).not.toHaveBeenCalled();
  });
});
