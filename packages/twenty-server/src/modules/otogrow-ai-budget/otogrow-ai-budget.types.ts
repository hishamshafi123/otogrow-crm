export type OtogrowAiBudgetScope = 'WORKSPACE' | 'CLIENT' | 'TASK';
export type OtogrowAiPriceKind = 'TEXT' | 'INSPECTION' | 'IMAGE' | 'CLIP';
export type OtogrowAiSpendState =
  | 'RESERVED'
  | 'DISPATCHED'
  | 'SETTLED'
  | 'UNCERTAIN'
  | 'RELEASED';
export type OtogrowAiSpendSource = 'TASK_AGENT' | 'INBOX_DRAFT' | 'MEDIA';

export type OtogrowAiPricing = {
  inputUsdPerMillionTokens: string;
  outputUsdPerMillionTokens: string;
  reasoningUsdPerMillionTokens: string;
  cacheReadUsdPerMillionTokens: string;
  cacheWriteUsdPerMillionTokens: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxReasoningTokens: number;
  outputIncludesReasoning: boolean;
  longContextThresholdTokens: number | null;
  longInputUsdPerMillionTokens: string | null;
  longOutputUsdPerMillionTokens: string | null;
  longReasoningUsdPerMillionTokens: string | null;
  longCacheReadUsdPerMillionTokens: string | null;
  longCacheWriteUsdPerMillionTokens: string | null;
};

export type OtogrowAiUsage = {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export type OtogrowAiPriceSnapshot = {
  profileId: string;
  revision: number;
  modelId: string;
  kind: OtogrowAiPriceKind;
  source: string;
  verifiedAt: string;
  pricing: OtogrowAiPricing;
  inputTokenBound: number;
  outputTokenBound: number;
  reasoningTokenBound: number;
  boundSource: 'MODEL_CONTEXT' | 'PROVIDER_COUNT';
};

export type OtogrowAiSpendQuote = {
  maximumCostUsd: string | null;
  pricingRevision: number | null;
  budgetReady: boolean;
  blockedReason: string | null;
  boundSource: string | null;
};
