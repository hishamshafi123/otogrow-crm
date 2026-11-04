export type OtogrowAiBudgetScope = 'WORKSPACE' | 'CLIENT' | 'TASK';
export type OtogrowAiPriceKind =
  | 'TEXT'
  | 'INSPECTION'
  | 'VIDEO_QA'
  | 'IMAGE'
  | 'CLIP';
export type OtogrowAiSpendState =
  | 'RESERVED'
  | 'DISPATCHED'
  | 'SETTLED'
  | 'UNCERTAIN'
  | 'RELEASED';
export type OtogrowAiSpendSource =
  | 'TASK_AGENT'
  | 'INBOX_DRAFT'
  | 'MEDIA'
  | 'ADVERTISING_DRAFT'
  | 'ACTIVITY_ANALYSIS'
  | 'NATIVE_CRM';

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

export type OtogrowAiTokenPriceSnapshot = {
  billingType?: 'TOKENS';
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

export type OtogrowAiMediaPriceSnapshot = {
  billingType: 'ATLAS_MEDIA';
  profileId: string;
  revision: number;
  modelId: string;
  kind: 'IMAGE' | 'CLIP';
  source: string;
  verifiedAt: string;
  boundSource: 'ADMIN_MEDIA_LIMIT';
  maximumCostUsd: string;
  quotedCostUsd: string;
  quotedAt: string;
  requestHash: string;
  catalogSchemaRevision: string;
};

export type OtogrowAiPriceSnapshot =
  | OtogrowAiTokenPriceSnapshot
  | OtogrowAiMediaPriceSnapshot;

export type OtogrowAiMediaReservation = {
  workspaceId: string;
  actorId: string;
  projectId: string;
  taskId: string;
  sourceRunId: string;
  modelId: string;
  kind: 'IMAGE' | 'CLIP';
  limit: {
    id: string;
    revision: number;
    maximumCostUsd: string;
    source: string;
    verifiedAt: string;
  };
  quotedCostUsd: string;
  quoteEstimated: boolean;
  quotedAt: string;
  requestHash: string;
  catalogSchemaRevision: string;
};

export type OtogrowAiSpendQuote = {
  maximumCostUsd: string | null;
  pricingRevision: number | null;
  budgetReady: boolean;
  blockedReason: string | null;
  boundSource: string | null;
};
