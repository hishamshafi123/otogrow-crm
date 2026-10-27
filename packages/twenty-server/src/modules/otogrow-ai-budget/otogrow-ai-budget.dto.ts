import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';

@InputType('OtogrowAiPricingInput')
export class OtogrowAiPricingInput {
  @Field() inputUsdPerMillionTokens: string;
  @Field() outputUsdPerMillionTokens: string;
  @Field() reasoningUsdPerMillionTokens: string;
  @Field() cacheReadUsdPerMillionTokens: string;
  @Field() cacheWriteUsdPerMillionTokens: string;
  @Field(() => Int) maxInputTokens: number;
  @Field(() => Int) maxOutputTokens: number;
  @Field(() => Int) maxReasoningTokens: number;
  @Field() outputIncludesReasoning: boolean;
  @Field(() => Int, { nullable: true }) longContextThresholdTokens?: number;
  @Field(() => String, { nullable: true })
  longInputUsdPerMillionTokens?: string;
  @Field(() => String, { nullable: true })
  longOutputUsdPerMillionTokens?: string;
  @Field(() => String, { nullable: true })
  longReasoningUsdPerMillionTokens?: string;
  @Field(() => String, { nullable: true })
  longCacheReadUsdPerMillionTokens?: string;
  @Field(() => String, { nullable: true })
  longCacheWriteUsdPerMillionTokens?: string;
}

@ObjectType('OtogrowAiPricing')
export class OtogrowAiPricingDTO {
  @Field() inputUsdPerMillionTokens: string;
  @Field() outputUsdPerMillionTokens: string;
  @Field() reasoningUsdPerMillionTokens: string;
  @Field() cacheReadUsdPerMillionTokens: string;
  @Field() cacheWriteUsdPerMillionTokens: string;
  @Field(() => Int) maxInputTokens: number;
  @Field(() => Int) maxOutputTokens: number;
  @Field(() => Int) maxReasoningTokens: number;
  @Field() outputIncludesReasoning: boolean;
  @Field(() => Int, { nullable: true }) longContextThresholdTokens:
    | number
    | null;
  @Field(() => String, { nullable: true }) longInputUsdPerMillionTokens:
    | string
    | null;
  @Field(() => String, { nullable: true }) longOutputUsdPerMillionTokens:
    | string
    | null;
  @Field(() => String, { nullable: true }) longReasoningUsdPerMillionTokens:
    | string
    | null;
  @Field(() => String, { nullable: true }) longCacheReadUsdPerMillionTokens:
    | string
    | null;
  @Field(() => String, { nullable: true }) longCacheWriteUsdPerMillionTokens:
    | string
    | null;
}

@InputType('OtogrowAiBudgetSaveInput')
export class OtogrowAiBudgetSaveInput {
  @Field() scope: string;
  @Field(() => ID) scopeId: string;
  @Field(() => Int) revision: number;
  @Field() capUsd: string;
  @Field() enabled: boolean;
  @Field(() => String, { nullable: true }) openingSpentUsd?: string;
  @Field() confirmOpeningBalance: boolean;
}

@InputType('OtogrowAiPriceSaveInput')
export class OtogrowAiPriceSaveInput {
  @Field(() => ID, { nullable: true }) id?: string;
  @Field(() => Int) revision: number;
  @Field() modelId: string;
  @Field() kind: string;
  @Field() source: string;
  @Field() verifiedAt: string;
  @Field() enabled: boolean;
  @Field(() => OtogrowAiPricingInput) pricing: OtogrowAiPricingInput;
}

@InputType('OtogrowAiSpendReconcileInput')
export class OtogrowAiSpendReconcileInput {
  @Field(() => ID) spendId: string;
  @Field(() => Int) revision: number;
  @Field() actualUsd: string;
  @Field() evidenceReference: string;
  @Field() reason: string;
}

@InputType('OtogrowAiBudgetSnapshotInput')
export class OtogrowAiBudgetSnapshotInput {
  @Field(() => Boolean, { nullable: true })
  needsAttention?: boolean;
  @Field(() => String, { nullable: true }) cursor?: string;
  @Field(() => Int, { nullable: true }) limit?: number;
}

@ObjectType('OtogrowAiBudget')
export class OtogrowAiBudgetDTO {
  @Field(() => ID) id: string;
  @Field() scope: string;
  @Field(() => ID) scopeId: string;
  @Field() scopeName: string;
  @Field(() => Int) revision: number;
  @Field() enabled: boolean;
  @Field() capUsd: string;
  @Field() openingSpentUsd: string;
  @Field() chargedUsd: string;
  @Field() heldUsd: string;
  @Field() remainingUsd: string;
}

@ObjectType('OtogrowAiPriceProfile')
export class OtogrowAiPriceProfileDTO {
  @Field(() => ID) id: string;
  @Field() modelId: string;
  @Field() kind: string;
  @Field(() => Int) revision: number;
  @Field() enabled: boolean;
  @Field() source: string;
  @Field() verifiedAt: string;
  @Field(() => OtogrowAiPricingDTO) pricing: OtogrowAiPricingDTO;
}

@ObjectType('OtogrowAiSpend')
export class OtogrowAiSpendDTO {
  @Field(() => ID) id: string;
  @Field(() => Int) revision: number;
  @Field() sourceKind: string;
  @Field(() => ID) sourceRunId: string;
  @Field() state: string;
  @Field() modelId: string;
  @Field() kind: string;
  @Field(() => String, { nullable: true }) clientName: string | null;
  @Field(() => String, { nullable: true }) taskName: string | null;
  @Field() reservedUsd: string;
  @Field(() => String, { nullable: true }) actualUsd: string | null;
  @Field(() => String, { nullable: true }) reportedActualUsd: string | null;
  @Field() heldUsd: string;
  @Field() boundSource: string;
  @Field() priceSource: string;
  @Field(() => Int) priceRevision: number;
  @Field() priceVerifiedAt: string;
  @Field() createdAt: string;
  @Field(() => String, { nullable: true }) dispatchedAt: string | null;
  @Field(() => String, { nullable: true }) settledAt: string | null;
  @Field(() => String, { nullable: true }) attentionReason: string | null;
}

@ObjectType('OtogrowAiBudgetOption')
export class OtogrowAiBudgetOptionDTO {
  @Field(() => ID) id: string;
  @Field() name: string;
}

@ObjectType('OtogrowAiBudgetSnapshot')
export class OtogrowAiBudgetSnapshotDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field(() => String, { nullable: true }) coverageStartedAt: string | null;
  @Field() configured: boolean;
  @Field() chargedUsd: string;
  @Field() heldUsd: string;
  @Field(() => Int) unresolvedCount: number;
  @Field(() => [OtogrowAiBudgetDTO]) budgets: OtogrowAiBudgetDTO[];
  @Field(() => [OtogrowAiPriceProfileDTO])
  priceProfiles: OtogrowAiPriceProfileDTO[];
  @Field(() => [OtogrowAiSpendDTO]) recentSpend: OtogrowAiSpendDTO[];
  @Field(() => [OtogrowAiBudgetOptionDTO]) clients: OtogrowAiBudgetOptionDTO[];
  @Field(() => [OtogrowAiBudgetOptionDTO]) tasks: OtogrowAiBudgetOptionDTO[];
  @Field(() => String, { nullable: true }) nextCursor: string | null;
}
