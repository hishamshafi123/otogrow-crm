import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';
import { DeliveryAssistantBudgetDTO } from 'src/modules/delivery/agents/reads/delivery-assistants.dto';
import { OtogrowActivityCurrentWorkSnapshotDTO } from 'src/modules/otogrow-activity/analysis/current-work/activity-current-work.dto';
import {
  OtogrowActivityIdentityDTO,
  OtogrowActivityFiltersInput,
  OtogrowActivityFiltersDTO,
  OtogrowActivityEventDTO,
} from 'src/modules/otogrow-activity/otogrow-activity.dto';

@InputType('OtogrowActivityAnalysisPreviewInput')
export class OtogrowActivityAnalysisPreviewInput {
  @Field(() => OtogrowActivityFiltersInput)
  filters: OtogrowActivityFiltersInput;
  @Field() question: string;
  @Field(() => ID) agentId: string;
  @Field(() => Boolean, { nullable: true }) includeCurrentWork?: boolean;
}
@InputType('StartOtogrowActivityAnalysisInput')
export class StartOtogrowActivityAnalysisInput extends OtogrowActivityAnalysisPreviewInput {
  @Field(() => ID) id: string;
  @Field(() => ID) requestId: string;
  @Field() bodyFingerprint: string;
  @Field() contextFingerprint: string;
  @Field() evidenceFingerprint: string;
  @Field() capturedAt: string;
  @Field(() => Int) agentVersion: number;
  @Field(() => Int) pricingRevision: number;
}
@InputType('CancelOtogrowActivityAnalysisInput')
export class CancelOtogrowActivityAnalysisInput {
  @Field(() => ID) id: string;
  @Field(() => ID) requestId: string;
  @Field(() => Int) revision: number;
}
@InputType('OtogrowActivityAnalysisRunInput')
export class OtogrowActivityAnalysisRunInput {
  @Field(() => ID) id: string;
}
@InputType('OtogrowActivityAnalysisRequestInput')
export class OtogrowActivityAnalysisRequestInput {
  @Field(() => ID) requestId: string;
  @Field() action: string;
}
@InputType('OtogrowActivityAnalysisRunsInput')
export class OtogrowActivityAnalysisRunsInput {
  @Field(() => String, { nullable: true }) after?: string | null;
  @Field(() => Int, { nullable: true }) limit?: number | null;
}
@ObjectType('OtogrowActivityAnalysisAgent')
export class OtogrowActivityAnalysisAgentDTO {
  @Field(() => ID) id: string;
  @Field() name: string;
  @Field(() => Int) version: number;
  @Field() modelId: string;
  @Field(() => Int) maxOutputTokens: number;
}
@ObjectType('OtogrowActivityAnalysisCitation')
export class OtogrowActivityAnalysisCitationDTO {
  @Field() id: string;
  @Field() kind: string;
  @Field() label: string;
  @Field(() => ID, { nullable: true }) eventId?: string | null;
  @Field(() => String, { nullable: true }) occurredAt?: string | null;
  @Field(() => ID, { nullable: true }) taskId?: string | null;
  @Field(() => String, { nullable: true }) capturedAt?: string | null;
  @Field() href: string;
}
@ObjectType('OtogrowActivityAnalysisContext')
export class OtogrowActivityAnalysisContextDTO {
  @Field() capturedAt: string;
  @Field() from: string;
  @Field() through: string;
  @Field(() => OtogrowActivityFiltersDTO) filters: OtogrowActivityFiltersDTO;
  @Field(() => String, { nullable: true }) coverageStartedAt: string | null;
  @Field(() => Int) totalCount: number;
  @Field(() => Int) includedCount: number;
  @Field(() => Int) omittedCount: number;
  @Field(() => Int) truncatedFieldCount: number;
  @Field(() => Int) omittedBytes: number;
  @Field() containsFinance: boolean;
  @Field(() => [OtogrowActivityEventDTO]) events: OtogrowActivityEventDTO[];
  @Field(() => [OtogrowActivityAnalysisCitationDTO])
  citations: OtogrowActivityAnalysisCitationDTO[];
  @Field(() => [String]) limitations: string[];
  @Field() question: string;
  @Field(() => String, { nullable: true }) assistantInstructions: string | null;
  @Field() promptVersion: string;
  @Field() outputContractVersion: string;
  @Field(() => OtogrowActivityCurrentWorkSnapshotDTO, { nullable: true })
  currentWork?: OtogrowActivityCurrentWorkSnapshotDTO | null;
}
@ObjectType('OtogrowActivityAnalysisFinding')
export class OtogrowActivityAnalysisFindingDTO {
  @Field(() => ID) id: string;
  @Field() kind: string;
  @Field() text: string;
  @Field(() => [String]) citationIds: string[];
}
@ObjectType('OtogrowActivityAnalysisResult')
export class OtogrowActivityAnalysisResultDTO {
  @Field() summary: string;
  @Field(() => [String]) summaryCitationIds: string[];
  @Field(() => [OtogrowActivityAnalysisFindingDTO])
  findings: OtogrowActivityAnalysisFindingDTO[];
  @Field(() => [String]) unknowns: string[];
  @Field(() => [String]) limitations: string[];
}
@ObjectType('OtogrowActivityAnalysisPreview')
export class OtogrowActivityAnalysisPreviewDTO extends OtogrowActivityIdentityDTO {
  @Field() bodyFingerprint: string;
  @Field() contextFingerprint: string;
  @Field() evidenceFingerprint: string;
  @Field(() => OtogrowActivityAnalysisAgentDTO)
  agent: OtogrowActivityAnalysisAgentDTO;
  @Field(() => OtogrowActivityAnalysisContextDTO)
  context: OtogrowActivityAnalysisContextDTO;
  @Field(() => DeliveryAssistantBudgetDTO) budget: DeliveryAssistantBudgetDTO;
  @Field() canStart: boolean;
  @Field(() => [String]) blockedReasons: string[];
}
@ObjectType('OtogrowActivityAnalysisRunSummary')
export class OtogrowActivityAnalysisRunSummaryDTO {
  @Field(() => ID) id: string;
  @Field(() => ID) requestId: string;
  @Field(() => ID) initiatorId: string;
  @Field() initiatorName: string;
  @Field() status: string;
  @Field(() => Int) revision: number;
  @Field(() => OtogrowActivityAnalysisAgentDTO)
  agent: OtogrowActivityAnalysisAgentDTO;
  @Field() bodyFingerprint: string;
  @Field() contextFingerprint: string;
  @Field() createdAt: string;
  @Field() updatedAt: string;
  @Field(() => String, { nullable: true }) startedAt: string | null;
  @Field(() => String, { nullable: true }) finishedAt: string | null;
  @Field(() => String, { nullable: true }) error: string | null;
  @Field() resultAvailable: boolean;
  @Field(() => Int) includedCount: number;
  @Field(() => Int) omittedCount: number;
}
@ObjectType('OtogrowActivityAnalysisUsage')
export class OtogrowActivityAnalysisUsageDTO {
  @Field(() => Int, { nullable: true }) inputTokens: number | null;
  @Field(() => Int, { nullable: true }) outputTokens: number | null;
  @Field(() => String, { nullable: true }) costUsd: string | null;
}
@ObjectType('OtogrowActivityAnalysisRunState')
export class OtogrowActivityAnalysisRunStateDTO extends OtogrowActivityIdentityDTO {
  @Field(() => OtogrowActivityAnalysisRunSummaryDTO)
  run: OtogrowActivityAnalysisRunSummaryDTO;
  @Field() canCancel: boolean;
}
@ObjectType('OtogrowActivityAnalysisRunDetail')
export class OtogrowActivityAnalysisRunDetailDTO extends OtogrowActivityAnalysisRunStateDTO {
  @Field(() => OtogrowActivityAnalysisContextDTO)
  context: OtogrowActivityAnalysisContextDTO;
  @Field(() => OtogrowActivityAnalysisResultDTO, { nullable: true })
  result: OtogrowActivityAnalysisResultDTO | null;
  @Field(() => OtogrowActivityAnalysisUsageDTO, { nullable: true })
  usage: OtogrowActivityAnalysisUsageDTO | null;
}
@ObjectType('OtogrowActivityAnalysisRuns')
export class OtogrowActivityAnalysisRunsDTO extends OtogrowActivityIdentityDTO {
  @Field(() => [OtogrowActivityAnalysisRunSummaryDTO])
  items: OtogrowActivityAnalysisRunSummaryDTO[];
  @Field(() => Int) totalCount: number;
  @Field(() => String, { nullable: true }) nextCursor: string | null;
}
@ObjectType('OtogrowActivityAnalysisReceipt')
export class OtogrowActivityAnalysisReceiptDTO {
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
@ObjectType('OtogrowActivityAnalysisRequest')
export class OtogrowActivityAnalysisRequestDTO extends OtogrowActivityIdentityDTO {
  @Field(() => OtogrowActivityAnalysisReceiptDTO, { nullable: true })
  receipt: OtogrowActivityAnalysisReceiptDTO | null;
  @Field(() => OtogrowActivityAnalysisRunSummaryDTO, { nullable: true })
  run: OtogrowActivityAnalysisRunSummaryDTO | null;
}
