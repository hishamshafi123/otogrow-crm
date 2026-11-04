import { BadRequestException } from '@nestjs/common';
import {
  type LanguageModelV3CallOptions,
  type LanguageModelV3Usage,
  type SharedV3ProviderOptions,
} from '@ai-sdk/provider';
import { z } from 'zod';
import { ToolCategory } from 'twenty-shared/ai';
import { type ToolIndexEntry } from 'src/engine/core-modules/tool-provider/types/tool-index-entry.type';
import { type OtogrowAiUsage } from 'src/modules/otogrow-ai-budget/otogrow-ai-budget.types';

const cacheControl = z
  .object({
    type: z.literal('ephemeral'),
    ttl: z.literal('5m').optional(),
  })
  .strict();
const thinking = z
  .object({
    type: z.literal('enabled'),
    budgetTokens: z.number().int().positive(),
  })
  .strict();
const providerOptionsSchema = z
  .object({
    anthropic: z
      .object({
        cacheControl: cacheControl.optional(),
        thinking: thinking.optional(),
      })
      .strict()
      .optional(),
    bedrock: z
      .object({
        cachePoint: z
          .object({ type: z.literal('default') })
          .strict()
          .optional(),
        thinking: thinking.optional(),
      })
      .strict()
      .optional(),
    openai: z
      .object({
        store: z.literal(false).optional(),
        promptCacheKey: z.string().max(256).optional(),
      })
      .strict()
      .optional(),
    azure: z
      .object({ store: z.literal(false).optional() })
      .strict()
      .optional(),
  })
  .strict();

const assertOptions = (
  options: SharedV3ProviderOptions | undefined,
  reasoningBound?: number,
) => {
  if (!options || Object.keys(options).length === 0) return;
  const parsed = providerOptionsSchema.safeParse(options);
  if (!parsed.success)
    throw new BadRequestException(
      'This CRM AI provider option has no verified spending bound. Use the supported text configuration.',
    );
  if (
    reasoningBound !== undefined &&
    [parsed.data.anthropic?.thinking, parsed.data.bedrock?.thinking].some(
      (value) => value && value.budgetTokens > reasoningBound,
    )
  )
    throw new BadRequestException(
      'The requested reasoning exceeds its verified AI spending bound.',
    );
};

export const isBoundedNativeAiTool = (entry: ToolIndexEntry) => {
  if (entry.executionRef.kind === 'logic_function') return false;
  if (entry.category === ToolCategory.ACTION)
    return ['navigate_app', 'extract_json_paths', 'search_output'].includes(
      entry.name,
    );
  return [
    ToolCategory.DATABASE_CRUD,
    ToolCategory.METADATA,
    ToolCategory.VIEW,
    ToolCategory.DASHBOARD,
    ToolCategory.NAVIGATION_MENU_ITEM,
    ToolCategory.ROLE,
  ].includes(entry.category);
};

export const assertNativeAiRequest = (
  params: LanguageModelV3CallOptions,
  reasoningBound?: number,
) => {
  if (
    params.headers &&
    Object.entries(params.headers).some(
      ([name, value]) =>
        value !== undefined && name.toLowerCase() !== 'user-agent',
    )
  )
    throw new BadRequestException(
      'Custom provider headers are not supported by the CRM AI spending guard.',
    );
  assertOptions(params.providerOptions, reasoningBound);
  for (const tool of params.tools ?? []) {
    if (tool.type !== 'function')
      throw new BadRequestException(
        'Provider-hosted search and tools need verified cost bounds before they can run in CRM AI.',
      );
    assertOptions(tool.providerOptions, reasoningBound);
  }
  for (const message of params.prompt) {
    assertOptions(message.providerOptions, reasoningBound);
    if (typeof message.content === 'string') continue;
    for (const part of message.content) {
      assertOptions(part.providerOptions, reasoningBound);
      if (part.type === 'file')
        throw new BadRequestException(
          'Use the creative image or video workflow for media. CRM AI currently has verified text spending bounds only.',
        );
      if (part.type === 'tool-result') {
        if (part.output.type === 'content') {
          for (const value of part.output.value) {
            if (value.type !== 'text')
              throw new BadRequestException(
                'Media tool results do not have a verified CRM AI spending bound.',
              );
            assertOptions(value.providerOptions, reasoningBound);
          }
        } else assertOptions(part.output.providerOptions, reasoningBound);
      }
    }
  }
};

export const nativeAiUsage = (
  usage: LanguageModelV3Usage,
): Partial<OtogrowAiUsage> => ({
  inputTokens: usage.inputTokens.total,
  outputTokens: usage.outputTokens.total,
  reasoningTokens: usage.outputTokens.reasoning,
  cacheReadTokens: usage.inputTokens.cacheRead,
  cacheWriteTokens: usage.inputTokens.cacheWrite,
});
