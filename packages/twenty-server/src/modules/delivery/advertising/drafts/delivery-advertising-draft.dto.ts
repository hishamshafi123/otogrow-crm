import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';
import {
  DeliveryAdvertisingGoalDTO,
  DeliveryAdvertisingGoalInput,
  DeliveryAdvertisingIdentityDTO,
  DeliveryAdvertisingMetricDTO,
  DeliveryAdvertisingSourceSnapshotDTO,
} from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.dto';
import { DeliveryAssistantBudgetDTO } from 'src/modules/delivery/agents/reads/delivery-assistants.dto';

@InputType('DeliveryAdvertisingDraftPreviewInput')
export class DeliveryAdvertisingDraftPreviewInput {
  @Field() sourceKind: string;
  @Field(() => ID) sourceId: string;
  @Field() sourceFingerprint: string;
  @Field(() => ID) agentId: string;
  @Field(() => DeliveryAdvertisingGoalInput) goal: DeliveryAdvertisingGoalInput;
  @Field() instructions: string;
}
@InputType('StartDeliveryAdvertisingDraftInput')
export class StartDeliveryAdvertisingDraftInput extends DeliveryAdvertisingDraftPreviewInput {
  @Field(() => ID) id: string;
  @Field(() => ID) requestId: string;
  @Field() bodyFingerprint: string;
  @Field() contextFingerprint: string;
  @Field(() => Int) agentVersion: number;
  @Field() knowledgeFingerprint: string;
  @Field(() => Int) pricingRevision: number;
}
@InputType('CancelDeliveryAdvertisingDraftInput')
export class CancelDeliveryAdvertisingDraftInput {
  @Field(() => ID) id: string;
  @Field(() => ID) requestId: string;
  @Field(() => Int) revision: number;
}
@InputType('DeliveryAdvertisingDraftRunInput')
export class DeliveryAdvertisingDraftRunInput {
  @Field(() => ID) id: string;
}
@InputType('DeliveryAdvertisingDraftRequestInput')
export class DeliveryAdvertisingDraftRequestInput {
  @Field(() => ID) requestId: string;
  @Field() action: string;
}
@InputType('DeliveryAdvertisingDraftRunsInput')
export class DeliveryAdvertisingDraftRunsInput {
  @Field() sourceKind: string;
  @Field(() => ID) sourceId: string;
  @Field(() => String, { nullable: true }) after?: string | null;
  @Field(() => Int, { nullable: true }) limit?: number | null;
}
@ObjectType('DeliveryAdvertisingDraftAgent')
export class DeliveryAdvertisingDraftAgentDTO {
  @Field(() => ID) id: string;
  @Field() name: string;
  @Field(() => Int) version: number;
  @Field() modelId: string;
  @Field(() => Int) maxOutputTokens: number;
}
@ObjectType('DeliveryAdvertisingDraftReference')
export class DeliveryAdvertisingDraftReferenceDTO {
  @Field() id: string;
  @Field() kind: string;
  @Field() label: string;
  @Field(() => ID) sourceId: string;
  @Field(() => Int, { nullable: true }) version: number | null;
  @Field(() => String, { nullable: true }) value: string | null;
  @Field(() => String, { nullable: true }) unit: string | null;
  @Field(() => String, { nullable: true }) href: string | null;
}
@ObjectType('DeliveryAdvertisingDraftKnowledgeSource')
export class DeliveryAdvertisingDraftKnowledgeSourceDTO {
  @Field(() => ID) sourceId: string;
  @Field(() => Int) version: number;
  @Field() title: string;
  @Field(() => String, { nullable: true }) category?: string;
  @Field() meetingDate: string;
  @Field() knowledge: string;
  @Field() truncated: boolean;
}
@ObjectType('DeliveryAdvertisingDraftKnowledge')
export class DeliveryAdvertisingDraftKnowledgeDTO {
  @Field() fingerprint: string;
  @Field(() => Int) totalSources: number;
  @Field(() => Int) omittedSources: number;
  @Field(() => [DeliveryAdvertisingDraftKnowledgeSourceDTO])
  sources: DeliveryAdvertisingDraftKnowledgeSourceDTO[];
}
@ObjectType('DeliveryAdvertisingDraftContext')
export class DeliveryAdvertisingDraftContextDTO {
  @Field(() => DeliveryAdvertisingSourceSnapshotDTO)
  source: DeliveryAdvertisingSourceSnapshotDTO;
  @Field(() => DeliveryAdvertisingGoalDTO) goal: DeliveryAdvertisingGoalDTO;
  @Field(() => [DeliveryAdvertisingMetricDTO])
  metrics: DeliveryAdvertisingMetricDTO[];
  @Field(() => DeliveryAdvertisingDraftKnowledgeDTO)
  knowledge: DeliveryAdvertisingDraftKnowledgeDTO;
  @Field(() => [DeliveryAdvertisingDraftReferenceDTO])
  references: DeliveryAdvertisingDraftReferenceDTO[];
  @Field() instructions: string;
  @Field(() => String, { nullable: true }) assistantInstructions: string | null;
  @Field() coverage: string;
  @Field(() => [String]) limitations: string[];
  @Field() promptVersion: string;
  @Field() outputVersion: string;
}
@ObjectType('DeliveryAdvertisingDraftPreview')
export class DeliveryAdvertisingDraftPreviewDTO extends DeliveryAdvertisingIdentityDTO {
  @Field() bodyFingerprint: string;
  @Field() contextFingerprint: string;
  @Field() sourceFingerprint: string;
  @Field() knowledgeFingerprint: string;
  @Field(() => DeliveryAdvertisingDraftAgentDTO)
  agent: DeliveryAdvertisingDraftAgentDTO;
  @Field(() => DeliveryAdvertisingDraftContextDTO)
  context: DeliveryAdvertisingDraftContextDTO;
  @Field(() => DeliveryAssistantBudgetDTO) budget: DeliveryAssistantBudgetDTO;
}
@ObjectType('DeliveryAdvertisingDraftSuggestion')
export class DeliveryAdvertisingDraftSuggestionDTO {
  @Field(() => ID) id: string;
  @Field() title: string;
  @Field() rationale: string;
  @Field() expectedResult: string;
  @Field() evidence: string;
  @Field(() => [String]) citations: string[];
}
@ObjectType('DeliveryAdvertisingDraftResult')
export class DeliveryAdvertisingDraftResultDTO {
  @Field() summary: string;
  @Field(() => [String]) limitations: string[];
  @Field(() => [String]) citations: string[];
  @Field(() => String, { nullable: true }) noChangeReason: string | null;
  @Field(() => [DeliveryAdvertisingDraftSuggestionDTO])
  suggestions: DeliveryAdvertisingDraftSuggestionDTO[];
}
@ObjectType('DeliveryAdvertisingDraftUsage')
export class DeliveryAdvertisingDraftUsageDTO {
  @Field(() => Int, { nullable: true }) inputTokens: number | null;
  @Field(() => Int, { nullable: true }) outputTokens: number | null;
  @Field(() => String, { nullable: true }) costUsd: string | null;
}
@ObjectType('DeliveryAdvertisingDraftRunSummary')
export class DeliveryAdvertisingDraftRunSummaryDTO {
  @Field(() => ID) id: string;
  @Field(() => ID) requestId: string;
  @Field(() => ID) initiatorId: string;
  @Field() initiatorName: string;
  @Field() sourceKind: string;
  @Field(() => ID) sourceId: string;
  @Field(() => ID) projectId: string;
  @Field() status: string;
  @Field(() => Int) revision: number;
  @Field(() => DeliveryAdvertisingDraftAgentDTO)
  agent: DeliveryAdvertisingDraftAgentDTO;
  @Field() createdAt: string;
  @Field(() => String, { nullable: true }) startedAt: string | null;
  @Field(() => String, { nullable: true }) finishedAt: string | null;
  @Field(() => String, { nullable: true }) error: string | null;
}
@ObjectType('DeliveryAdvertisingDraftRun')
export class DeliveryAdvertisingDraftRunDTO extends DeliveryAdvertisingDraftRunSummaryDTO {
  @Field() bodyFingerprint: string;
  @Field() contextFingerprint: string;
  @Field(() => DeliveryAdvertisingDraftContextDTO)
  context: DeliveryAdvertisingDraftContextDTO;
  @Field(() => DeliveryAdvertisingDraftResultDTO, { nullable: true })
  result: DeliveryAdvertisingDraftResultDTO | null;
  @Field(() => DeliveryAdvertisingDraftUsageDTO, { nullable: true })
  usage: DeliveryAdvertisingDraftUsageDTO | null;
}
@ObjectType('DeliveryAdvertisingDraftRunDetail')
export class DeliveryAdvertisingDraftRunDetailDTO extends DeliveryAdvertisingIdentityDTO {
  @Field(() => DeliveryAdvertisingDraftRunDTO)
  run: DeliveryAdvertisingDraftRunDTO;
  @Field() currentSourceFingerprint: string;
  @Field() canUseResult: boolean;
  @Field() canCancel: boolean;
  @Field(() => [String]) blockingReasons: string[];
}
@ObjectType('DeliveryAdvertisingDraftRunState')
export class DeliveryAdvertisingDraftRunStateDTO extends DeliveryAdvertisingIdentityDTO {
  @Field(() => DeliveryAdvertisingDraftRunSummaryDTO)
  run: DeliveryAdvertisingDraftRunSummaryDTO;
  @Field() currentSourceFingerprint: string;
  @Field() canUseResult: boolean;
  @Field() canCancel: boolean;
  @Field(() => [String]) blockingReasons: string[];
}
@ObjectType('DeliveryAdvertisingDraftRuns')
export class DeliveryAdvertisingDraftRunsDTO extends DeliveryAdvertisingIdentityDTO {
  @Field(() => [DeliveryAdvertisingDraftRunSummaryDTO])
  items: DeliveryAdvertisingDraftRunSummaryDTO[];
  @Field(() => Int) totalCount: number;
  @Field(() => String, { nullable: true }) nextCursor: string | null;
  @Field() scope: string;
}
@ObjectType('DeliveryAdvertisingDraftCommandReceipt')
export class DeliveryAdvertisingDraftCommandReceiptDTO {
  @Field() action: string;
  @Field(() => ID) requestId: string;
  @Field(() => ID) runId: string;
  @Field(() => ID) actorId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field() inputHash: string;
  @Field() bodyFingerprint: string;
  @Field() createdAt: string;
  @Field(() => Int) revision: number;
  @Field() status: string;
}
@ObjectType('DeliveryAdvertisingDraftRequest')
export class DeliveryAdvertisingDraftRequestDTO extends DeliveryAdvertisingIdentityDTO {
  @Field(() => DeliveryAdvertisingDraftCommandReceiptDTO, { nullable: true })
  receipt: DeliveryAdvertisingDraftCommandReceiptDTO | null;
  @Field(() => DeliveryAdvertisingDraftRunSummaryDTO, { nullable: true })
  run: DeliveryAdvertisingDraftRunSummaryDTO | null;
}
