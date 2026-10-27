import { type LanguageModelUsage, NoObjectGeneratedError } from 'ai';
import { type OtogrowAiUsage } from 'src/modules/otogrow-ai-budget/otogrow-ai-budget.types';

export const usageFromAiSdk = (
  usage: LanguageModelUsage | undefined,
): Partial<OtogrowAiUsage> | null =>
  usage
    ? {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        reasoningTokens:
          usage.outputTokenDetails?.reasoningTokens ?? usage.reasoningTokens,
        cacheReadTokens:
          usage.inputTokenDetails?.cacheReadTokens ?? usage.cachedInputTokens,
        cacheWriteTokens: usage.inputTokenDetails?.cacheWriteTokens,
      }
    : null;
export const usageFromAiError = (error: unknown) =>
  NoObjectGeneratedError.isInstance(error) ? usageFromAiSdk(error.usage) : null;
