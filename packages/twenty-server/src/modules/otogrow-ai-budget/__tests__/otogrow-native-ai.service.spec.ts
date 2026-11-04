import { randomUUID } from 'node:crypto';
import {
  type LanguageModelV3,
  type LanguageModelV3CallOptions,
  type LanguageModelV3GenerateResult,
  type LanguageModelV3StreamPart,
  type LanguageModelV3Usage,
} from '@ai-sdk/provider';
import { generateText, stepCountIs, tool } from 'ai';
import { z } from 'zod';
import { WorkspaceActivationStatus } from 'twenty-shared/workspace';
import { type DataSource, type EntityManager } from 'typeorm';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';
import { type AiModelRegistryService } from 'src/engine/metadata-modules/ai/ai-models/services/ai-model-registry.service';
import { type OtogrowAiBudgetService } from 'src/modules/otogrow-ai-budget/otogrow-ai-budget.service';
import { OtogrowNativeAiService } from 'src/modules/otogrow-ai-budget/otogrow-native-ai.service';

const WORKSPACE_ID = randomUUID(),
  USER_WORKSPACE_ID = randomUUID(),
  MEMBER_ID = randomUUID(),
  ROLE_ID = randomUUID();
const context = {
  workspaceId: WORKSPACE_ID,
  userWorkspaceId: USER_WORKSPACE_ID,
  modelId: 'test/bounded-model',
  modelConfig: {
    modelId: 'test/bounded-model',
    contextWindowTokens: 1000,
    maxOutputTokens: 500,
  },
};
const params: LanguageModelV3CallOptions = {
  prompt: [
    { role: 'user', content: [{ type: 'text', text: 'Review the plan.' }] },
  ],
};
const usage: LanguageModelV3Usage = {
  inputTokens: { total: 30, noCache: 20, cacheRead: 8, cacheWrite: 2 },
  outputTokens: { total: 12, text: 10, reasoning: 2 },
};
const response: LanguageModelV3GenerateResult = {
  content: [{ type: 'text', text: 'Reviewed.' }],
  finishReason: { unified: 'stop', raw: 'stop' },
  usage,
  warnings: [],
};
const finish: LanguageModelV3StreamPart = {
  type: 'finish',
  finishReason: { unified: 'stop', raw: 'stop' },
  usage,
};
const delta: LanguageModelV3StreamPart = {
  type: 'text-delta',
  id: 'text',
  delta: 'Reviewed.',
};

const setup = () => {
  const state = { active: true, permission: true };
  const manager = {
    query: jest.fn(async (sql: string) =>
      sql.includes('AS "memberId"')
        ? state.active
          ? [{ memberId: MEMBER_ID, roleId: ROLE_ID }]
          : []
        : [],
    ),
    getRepository: jest.fn((entity: unknown) => ({
      findOne: jest.fn(async () =>
        entity === WorkspaceEntity
          ? {
              id: WORKSPACE_ID,
              activationStatus: WorkspaceActivationStatus.ACTIVE,
              databaseSchema: 'workspace_test',
            }
          : { id: ROLE_ID },
      ),
    })),
  };
  const dataSource = {
    transaction: jest.fn(
      async <TData>(callback: (manager: EntityManager) => Promise<TData>) =>
        callback(manager as unknown as EntityManager),
    ),
  };
  const budget = {
    reserveNative: jest.fn(async () => ({
      actorId: MEMBER_ID,
      price: { outputTokenBound: 80, reasoningTokenBound: 40 },
    })),
    dispatch: jest.fn(
      async (
        _source: unknown,
        _membership: string,
        authorize: (manager: EntityManager) => Promise<void>,
      ) => authorize(manager as unknown as EntityManager),
    ),
    settle: jest.fn(async () => undefined),
    fail: jest.fn(async () => undefined),
  };
  const permissions = { checkRolePermissions: jest.fn(() => state.permission) };
  const models = { validateModelAvailability: jest.fn() };
  const service = new OtogrowNativeAiService(
    dataSource as unknown as DataSource,
    budget as unknown as OtogrowAiBudgetService,
    permissions as unknown as PermissionsService,
    models as unknown as AiModelRegistryService,
  );
  const model: LanguageModelV3 = {
    specificationVersion: 'v3',
    provider: 'test',
    modelId: 'bounded-model',
    supportedUrls: {},
    doGenerate: jest.fn(async () => response),
    doStream: jest.fn(async () => ({
      stream: new ReadableStream<LanguageModelV3StreamPart>({
        start(controller) {
          controller.enqueue(delta);
          controller.enqueue(finish);
          controller.close();
        },
      }),
    })),
  };
  const wrapped = service.wrap(model, context) as LanguageModelV3;
  return {
    service,
    budget,
    permissions,
    models,
    state,
    manager,
    model,
    wrapped,
  };
};

const collect = async (stream: ReadableStream<LanguageModelV3StreamPart>) => {
  const output: LanguageModelV3StreamPart[] = [];
  const reader = stream.getReader();
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    output.push(next.value);
  }
  return output;
};

describe('Native CRM AI actual model-call guard', () => {
  it('checks current administrator model availability before spending', async () => {
    const { wrapped, model, models, budget } = setup();
    models.validateModelAvailability.mockImplementationOnce(() => {
      throw new Error('Model disabled');
    });
    await expect(wrapped.doGenerate(params)).rejects.toThrow('Model disabled');
    expect(model.doGenerate).not.toHaveBeenCalled();
    expect(budget.reserveNative).not.toHaveBeenCalled();
  });
  it('reserves and dispatches before a provider call, enforces the output cap and awaits exact usage settlement', async () => {
    const { wrapped, model, budget } = setup();
    expect(
      await wrapped.doGenerate({ ...params, maxOutputTokens: 200 }),
    ).toEqual(response);
    expect(model.doGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ maxOutputTokens: 80 }),
    );
    expect(budget.reserveNative).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        actorId: MEMBER_ID,
        modelId: context.modelId,
        modelContextWindowTokens: 1000,
        maxOutputTokens: 200,
      }),
    );
    expect(budget.dispatch.mock.invocationCallOrder[0]).toBeLessThan(
      jest.mocked(model.doGenerate).mock.invocationCallOrder[0],
    );
    expect(budget.settle).toHaveBeenCalledWith(
      expect.objectContaining({ sourceKind: 'NATIVE_CRM' }),
      {
        inputTokens: 30,
        outputTokens: 12,
        reasoningTokens: 2,
        cacheReadTokens: 8,
        cacheWriteTokens: 2,
      },
    );
  });

  it('does not call the provider when the workspace cap or price is unavailable', async () => {
    const { wrapped, model, budget } = setup();
    budget.reserveNative.mockRejectedValueOnce(
      new Error('Workspace budget exhausted'),
    );
    await expect(wrapped.doGenerate(params)).rejects.toThrow(
      'budget exhausted',
    );
    expect(model.doGenerate).not.toHaveBeenCalled();
  });

  it('rechecks current membership and AI permission before reservation and dispatch', async () => {
    const { wrapped, model, budget, state, manager } = setup();
    state.permission = false;
    await expect(wrapped.doGenerate(params)).rejects.toThrow('current role');
    expect(budget.reserveNative).not.toHaveBeenCalled();
    state.permission = true;
    budget.dispatch.mockImplementationOnce(
      async (_source, _membership, authorize) => {
        state.active = false;
        await authorize(manager as unknown as EntityManager);
      },
    );
    await expect(wrapped.doGenerate(params)).rejects.toThrow('membership');
    expect(model.doGenerate).not.toHaveBeenCalled();
    expect(budget.fail).toHaveBeenCalledTimes(1);
  });

  it('retains incurred usage and withholds output when authority is lost during generation', async () => {
    const { wrapped, model, budget, state } = setup();
    jest.mocked(model.doGenerate).mockImplementationOnce(async () => {
      state.permission = false;
      return response;
    });
    await expect(wrapped.doGenerate(params)).rejects.toThrow('current role');
    expect(budget.settle).toHaveBeenCalledTimes(1);
    expect(budget.fail).toHaveBeenCalledTimes(1);
  });

  it('retains unknown dispatched cost after provider failure and uses a different reservation on a later request', async () => {
    const { wrapped, model, budget } = setup();
    jest
      .mocked(model.doGenerate)
      .mockRejectedValueOnce(new Error('Provider connection lost'));
    await expect(wrapped.doGenerate(params)).rejects.toThrow('connection lost');
    await wrapped.doGenerate(params);
    expect(budget.fail).toHaveBeenCalledTimes(1);
    expect(budget.settle).toHaveBeenCalledTimes(1);
    expect(budget.dispatch.mock.calls[0][0]).not.toEqual(
      budget.dispatch.mock.calls[1][0],
    );
  });

  it('does not return output when durable settlement fails', async () => {
    const { wrapped, budget } = setup();
    budget.settle.mockRejectedValueOnce(new Error('Database unavailable'));
    await expect(wrapped.doGenerate(params)).rejects.toThrow(
      'Database unavailable',
    );
    expect(budget.fail).toHaveBeenCalledTimes(1);
  });

  it('reserves independently for each SDK tool step', async () => {
    const { wrapped, model, budget } = setup();
    jest.mocked(model.doGenerate).mockResolvedValueOnce({
      ...response,
      content: [
        {
          type: 'tool-call',
          toolCallId: 'read-task',
          toolName: 'task',
          input: '{}',
        },
      ],
      finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
    });
    const result = await generateText({
      model: wrapped,
      prompt: 'Read the task.',
      tools: {
        task: tool({
          inputSchema: z.object({}),
          execute: async () => ({ title: 'Client brief' }),
        }),
      },
      stopWhen: stepCountIs(2),
      maxRetries: 0,
    });
    expect(result.text).toBe('Reviewed.');
    expect(budget.reserveNative).toHaveBeenCalledTimes(2);
    expect(budget.settle).toHaveBeenCalledTimes(2);
    expect(budget.dispatch.mock.calls[0][0]).not.toEqual(
      budget.dispatch.mock.calls[1][0],
    );
  });

  it('settles a completed stream only after its final close', async () => {
    const { wrapped, budget } = setup();
    const result = await wrapped.doStream(params);
    expect(budget.settle).not.toHaveBeenCalled();
    expect(await collect(result.stream)).toEqual([delta, finish]);
    expect(budget.settle).toHaveBeenCalledTimes(1);
    expect(budget.fail).not.toHaveBeenCalled();
  });

  it.each([
    [finish, { type: 'error', error: new Error('Late provider error') }],
    [finish, finish],
    [delta],
  ] satisfies LanguageModelV3StreamPart[][])(
    'keeps uncertainty for incomplete or contradictory stream evidence %p',
    async (...parts) => {
      const { wrapped, model, budget } = setup();
      jest.mocked(model.doStream).mockResolvedValueOnce({
        stream: new ReadableStream({
          start(controller) {
            for (const part of parts) controller.enqueue(part);
            controller.close();
          },
        }),
      });
      await collect((await wrapped.doStream(params)).stream);
      expect(budget.settle).not.toHaveBeenCalled();
      expect(budget.fail).toHaveBeenCalled();
    },
  );

  it('holds uncertainty if the consumer cancels after a finish event but before close', async () => {
    const { wrapped, model, budget } = setup();
    const cancelled = jest.fn();
    jest.mocked(model.doStream).mockResolvedValueOnce({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(finish);
        },
        cancel: cancelled,
      }),
    });
    const reader = (await wrapped.doStream(params)).stream.getReader();
    expect((await reader.read()).value).toEqual(finish);
    await reader.cancel();
    expect(budget.settle).not.toHaveBeenCalled();
    expect(budget.fail).toHaveBeenCalled();
    expect(cancelled).toHaveBeenCalled();
  });

  it('does not emit text or tool calls after permission is revoked before the first chunk', async () => {
    const { wrapped, model, budget, state } = setup();
    jest.mocked(model.doStream).mockImplementationOnce(async () => {
      state.permission = false;
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue(delta);
            controller.enqueue({
              type: 'tool-call',
              toolCallId: 'call',
              toolName: 'task',
              input: '{}',
            });
            controller.close();
          },
        }),
      };
    });
    const reader = (await wrapped.doStream(params)).stream.getReader();
    await expect(reader.read()).rejects.toThrow('current role');
    expect(budget.settle).not.toHaveBeenCalled();
    expect(budget.fail).toHaveBeenCalled();
  });

  it('errors the consumer and cancels the provider even when marking uncertainty fails', async () => {
    const { wrapped, model, budget, state } = setup();
    const cancelled = jest.fn();
    jest.mocked(model.doStream).mockImplementationOnce(async () => {
      state.permission = false;
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue(delta);
          },
          cancel: cancelled,
        }),
      };
    });
    budget.fail.mockRejectedValue(new Error('Database disconnected'));
    const reader = (await wrapped.doStream(params)).stream.getReader();
    await expect(reader.read()).rejects.toThrow('current role');
    expect(cancelled).toHaveBeenCalled();
  });

  it('aborting an unconsumed stream cancels its reader and retains the dispatched hold', async () => {
    const { wrapped, model, budget } = setup();
    const abort = new AbortController();
    const cancelled = jest.fn();
    jest.mocked(model.doStream).mockResolvedValueOnce({
      stream: new ReadableStream({ cancel: cancelled }),
    });
    await wrapped.doStream({ ...params, abortSignal: abort.signal });
    abort.abort();
    await Promise.resolve();
    expect(cancelled).toHaveBeenCalled();
    expect(budget.fail).toHaveBeenCalled();
    expect(budget.settle).not.toHaveBeenCalled();
  });

  it('rejects an aborted or unattributed request without calling the provider', async () => {
    const { wrapped, service, model, budget } = setup();
    const abort = new AbortController();
    abort.abort();
    await expect(
      wrapped.doGenerate({ ...params, abortSignal: abort.signal }),
    ).rejects.toThrow();
    const unattributed = service.wrap(model, {
      ...context,
      userWorkspaceId: null,
    }) as LanguageModelV3;
    await expect(unattributed.doGenerate(params)).rejects.toThrow(
      'active person',
    );
    expect(budget.reserveNative).not.toHaveBeenCalled();
    expect(model.doGenerate).not.toHaveBeenCalled();
  });
});
