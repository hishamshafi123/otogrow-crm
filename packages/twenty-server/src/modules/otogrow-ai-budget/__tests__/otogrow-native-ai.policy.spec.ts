import {
  type LanguageModelV3CallOptions,
  type SharedV3ProviderOptions,
} from '@ai-sdk/provider';
import { ToolCategory } from 'twenty-shared/ai';
import { type ToolIndexEntry } from 'src/engine/core-modules/tool-provider/types/tool-index-entry.type';
import {
  assertNativeAiRequest,
  isBoundedNativeAiTool,
  nativeAiUsage,
} from 'src/modules/otogrow-ai-budget/otogrow-native-ai.policy';

const request: LanguageModelV3CallOptions = {
  prompt: [
    { role: 'user', content: [{ type: 'text', text: 'Review this task.' }] },
  ],
};

describe('Native CRM AI bounded request policy', () => {
  it('keeps ordinary text and local function tools available', () => {
    expect(() =>
      assertNativeAiRequest({
        ...request,
        tools: [
          {
            type: 'function',
            name: 'find_tasks',
            inputSchema: { type: 'object' },
          },
        ],
        providerOptions: { openai: { store: false, promptCacheKey: 'thread' } },
      }),
    ).not.toThrow();
  });

  it('rejects separately billed provider-hosted tools before reserving or dispatching', () => {
    expect(() =>
      assertNativeAiRequest({
        ...request,
        tools: [
          {
            type: 'provider',
            id: 'openai.web_search',
            name: 'web_search',
            args: {},
          },
        ],
      }),
    ).toThrow('verified cost bounds');
  });

  it.each<SharedV3ProviderOptions>([
    { openai: { serviceTier: 'priority' } },
    { xai: { searchParameters: { mode: 'auto' } } },
    { anthropic: { cacheControl: { type: 'ephemeral', ttl: '1h' } } },
    { google: { responseModalities: ['TEXT', 'IMAGE'] } },
  ])('rejects unverified provider options %p', (providerOptions) => {
    expect(() =>
      assertNativeAiRequest({ ...request, providerOptions }),
    ).toThrow('verified spending bound');
  });

  it('bounds reasoning options including nested message options', () => {
    const params = {
      ...request,
      providerOptions: {
        bedrock: { thinking: { type: 'enabled', budgetTokens: 100 } },
      },
    };
    expect(() => assertNativeAiRequest(params, 100)).not.toThrow();
    expect(() => assertNativeAiRequest(params, 99)).toThrow('reasoning');
    expect(() =>
      assertNativeAiRequest(
        {
          prompt: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Task',
                  providerOptions: params.providerOptions,
                },
              ],
            },
          ],
        },
        99,
      ),
    ).toThrow('reasoning');
  });

  it('rejects files and media returned by local function tools', () => {
    expect(() =>
      assertNativeAiRequest({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                mediaType: 'image/png',
                data: new Uint8Array([1]),
              },
            ],
          },
        ],
      }),
    ).toThrow('creative image or video');
    expect(() =>
      assertNativeAiRequest({
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call',
                toolName: 'image',
                output: {
                  type: 'content',
                  value: [
                    { type: 'file-data', mediaType: 'image/png', data: 'AA==' },
                  ],
                },
              },
            ],
          },
        ],
      }),
    ).toThrow('Media tool results');
  });

  it('checks options on tool result content and custom request headers', () => {
    expect(() =>
      assertNativeAiRequest({
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call',
                toolName: 'task',
                output: {
                  type: 'content',
                  value: [
                    {
                      type: 'text',
                      text: 'Task',
                      providerOptions: { openai: { serviceTier: 'priority' } },
                    },
                  ],
                },
              },
            ],
          },
        ],
      }),
    ).toThrow('verified spending bound');
    expect(() =>
      assertNativeAiRequest({
        ...request,
        headers: { 'openai-project': 'another-billing-project' },
      }),
    ).toThrow('Custom provider headers');
  });

  it('preserves missing usage rather than inventing free input, reasoning or cache usage', () => {
    expect(
      nativeAiUsage({
        inputTokens: {
          total: 12,
          noCache: undefined,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: { total: 5, text: undefined, reasoning: undefined },
      }),
    ).toEqual({
      inputTokens: 12,
      outputTokens: 5,
      reasoningTokens: undefined,
      cacheReadTokens: undefined,
      cacheWriteTokens: undefined,
    });
  });

  const entry = (
    name: string,
    category: ToolCategory,
    executionRef: ToolIndexEntry['executionRef'] = {
      kind: 'static',
      toolId: name,
    },
  ): ToolIndexEntry => ({
    name,
    label: name,
    description: name,
    category,
    executionRef,
  });

  it.each([
    'app_exa_web_search',
    'http_request',
    'code_interpreter',
    'search_help_center',
    'send_email',
    'draft_email',
    'create_calendar_event',
    'unknown_new_tool',
  ])('withholds unpriced external function tool %s', (name) => {
    expect(isBoundedNativeAiTool(entry(name, ToolCategory.ACTION))).toBe(false);
  });

  it('withholds app logic and workflow execution even with a harmless-looking name', () => {
    expect(
      isBoundedNativeAiTool(
        entry('navigate_app', ToolCategory.ACTION, {
          kind: 'logic_function',
          logicFunctionId: 'app',
        }),
      ),
    ).toBe(false);
    expect(
      isBoundedNativeAiTool(entry('run_workflow', ToolCategory.WORKFLOW)),
    ).toBe(false);
  });

  it.each(['navigate_app', 'extract_json_paths', 'search_output'])(
    'retains local action %s',
    (name) => {
      expect(isBoundedNativeAiTool(entry(name, ToolCategory.ACTION))).toBe(
        true,
      );
    },
  );

  it.each([
    ToolCategory.DATABASE_CRUD,
    ToolCategory.METADATA,
    ToolCategory.VIEW,
    ToolCategory.DASHBOARD,
    ToolCategory.NAVIGATION_MENU_ITEM,
    ToolCategory.ROLE,
  ])('retains scoped local %s tools', (category) => {
    expect(isBoundedNativeAiTool(entry('local', category))).toBe(true);
  });
});
