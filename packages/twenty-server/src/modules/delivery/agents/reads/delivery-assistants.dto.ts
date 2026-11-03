import { Field, Float, ID, InputType, Int, ObjectType } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-type-json';
import { type DeliveryAgentContext } from 'src/modules/delivery/agents/delivery-agent.types';

@InputType('DeliveryAssistantContextInput')
export class DeliveryAssistantContextInput {
  @Field(() => ID, { nullable: true }) taskId?: string | null;
}
@InputType('DeliveryAssistantCatalogInput')
export class DeliveryAssistantCatalogInput {
  @Field(() => ID, { nullable: true }) taskId?: string | null;
  @Field(() => ID, { nullable: true }) projectId?: string | null;
  @Field(() => String, { nullable: true }) search?: string | null;
  @Field(() => String, { nullable: true }) kind?: string | null;
  @Field(() => Boolean, { nullable: true }) enabled?: boolean | null;
  @Field(() => String, { nullable: true }) after?: string | null;
  @Field(() => Int, { nullable: true }) limit?: number | null;
}
@InputType('DeliveryAssistantSelectionInput')
export class DeliveryAssistantSelectionInput {
  @Field(() => ID) agentId: string;
  @Field(() => ID, { nullable: true }) taskId?: string | null;
}
@InputType('DeliveryAssistantRunsInput')
export class DeliveryAssistantRunsInput {
  @Field(() => ID, { nullable: true }) taskId?: string | null;
  @Field(() => ID, { nullable: true }) projectId?: string | null;
  @Field(() => ID, { nullable: true }) agentId?: string | null;
  @Field(() => String, { nullable: true }) status?: string | null;
  @Field(() => String, { nullable: true }) after?: string | null;
  @Field(() => Int, { nullable: true }) limit?: number | null;
}
@InputType('DeliveryAssistantRunInput')
export class DeliveryAssistantRunInput {
  @Field(() => ID) runId: string;
}
@InputType('DeliveryAssistantRequestInput')
export class DeliveryAssistantRequestInput {
  @Field(() => ID) requestId: string;
}
@InputType('DeliveryAssistantConfigurationInput')
export class DeliveryAssistantConfigurationInput {
  @Field() name: string;
  @Field() purpose: string;
  @Field() kind: string;
  @Field() enabled: boolean;
  @Field() instructions: string;
  @Field(() => [String]) requiredInputs: string[];
  @Field() outputFormat: string;
  @Field(() => [String]) tools: string[];
  @Field(() => String, { nullable: true }) modelId: string | null;
  @Field(() => [ID]) projectIds: string[];
  @Field(() => [String]) roles: string[];
  @Field(() => [ID], { nullable: true }) roleIds?: string[] | null;
  @Field(() => Int) dailyRunLimit: number;
  @Field(() => Int) maxOutputTokens: number;
  @Field() humanConfirmation: boolean;
}
@InputType('SaveDeliveryAssistantInput')
export class SaveDeliveryAssistantInput {
  @Field(() => ID, { nullable: true }) createId?: string | null;
  @Field(() => ID, { nullable: true }) id?: string | null;
  @Field(() => Int, { nullable: true }) version?: number | null;
  @Field(() => DeliveryAssistantConfigurationInput)
  configuration: DeliveryAssistantConfigurationInput;
}
@InputType('DeliveryAssistantInputs')
export class DeliveryAssistantInputs {
  @Field(() => String, { nullable: true }) copy?: string | null;
  @Field(() => String, { nullable: true }) requirements?: string | null;
  @Field(() => String, { nullable: true }) sourceUrl?: string | null;
  @Field(() => String, { nullable: true }) targetUrl?: string | null;
  @Field(() => String, { nullable: true }) anchor?: string | null;
}
@InputType('PreviewDeliveryAssistantInput')
export class PreviewDeliveryAssistantInput {
  @Field(() => ID) taskId: string;
  @Field(() => ID) agentId: string;
  @Field(() => DeliveryAssistantInputs) inputs: DeliveryAssistantInputs;
}
@InputType('StartDeliveryAssistantInput')
export class StartDeliveryAssistantInput {
  @Field(() => ID) taskId: string;
  @Field(() => ID) agentId: string;
  @Field(() => ID) requestId: string;
  @Field(() => Int) taskRevision: number;
  @Field(() => Int) agentVersion: number;
  @Field(() => Int, { nullable: true }) pricingRevision?: number | null;
  @Field(() => String, { nullable: true }) knowledgeFingerprint?: string | null;
  @Field(() => DeliveryAssistantInputs) inputs: DeliveryAssistantInputs;
}
@InputType('DecideDeliveryAssistantInput')
export class DecideDeliveryAssistantInput {
  @Field(() => ID) runId: string;
  @Field() action: string;
  @Field(() => String, { nullable: true }) field: string | null;
}
@ObjectType('DeliveryAssistantActor')
export class DeliveryAssistantActorDTO {
  @Field(() => ID) memberId: string;
  @Field() isAdmin: boolean;
  @Field() isManager: boolean;
  @Field(() => [ID]) roleIds: string[];
  @Field(() => [String]) capabilities: string[];
}
@ObjectType('DeliveryAssistantProject')
export class DeliveryAssistantProjectDTO {
  @Field(() => ID) id: string;
  @Field() name: string;
  @Field(() => Int) revision: number;
}
@ObjectType('DeliveryAssistantModel')
export class DeliveryAssistantModelDTO {
  @Field() id: string;
  @Field() provider: string;
}
@ObjectType('DeliveryAssistantTask')
export class DeliveryAssistantTaskDTO {
  @Field(() => ID) id: string;
  @Field() title: string;
  @Field(() => ID) projectId: string;
  @Field(() => Int) revision: number;
  @Field() state: string;
  @Field(() => ID, { nullable: true }) assigneeId: string | null;
  @Field() brief: string;
  @Field() draftCopy: string;
}
@ObjectType('DeliveryAssistantContext')
export class DeliveryAssistantContextDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field() observedAt: string;
  @Field(() => DeliveryAssistantActorDTO) actor: DeliveryAssistantActorDTO;
  @Field() canConfigure: boolean;
  @Field(() => [DeliveryAssistantProjectDTO])
  projects: DeliveryAssistantProjectDTO[];
  @Field(() => [DeliveryAssistantModelDTO]) models: DeliveryAssistantModelDTO[];
  @Field(() => DeliveryAssistantTaskDTO, { nullable: true })
  selectedTask: DeliveryAssistantTaskDTO | null;
}
@ObjectType('DeliveryAssistantSummary')
export class DeliveryAssistantSummaryDTO {
  @Field(() => ID) id: string;
  @Field() name: string;
  @Field() purpose: string;
  @Field() kind: string;
  @Field() enabled: boolean;
  @Field(() => Int) version: number;
  @Field() createdAt: string;
  @Field() updatedAt: string;
  @Field(() => [String]) requiredInputs: string[];
  @Field() canRun: boolean;
}
@ObjectType('DeliveryAssistantCatalog')
export class DeliveryAssistantCatalogDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field() observedAt: string;
  @Field(() => Int) totalCount: number;
  @Field(() => [DeliveryAssistantSummaryDTO])
  items: DeliveryAssistantSummaryDTO[];
  @Field(() => String, { nullable: true }) nextCursor: string | null;
}
@ObjectType('DeliveryAssistantSelection')
export class DeliveryAssistantSelectionDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field() observedAt: string;
  @Field(() => DeliveryAssistantSummaryDTO)
  assistant: DeliveryAssistantSummaryDTO;
}
@ObjectType('DeliveryAssistantConfiguration')
export class DeliveryAssistantConfigurationDTO {
  @Field() name: string;
  @Field() purpose: string;
  @Field() kind: string;
  @Field() enabled: boolean;
  @Field() instructions: string;
  @Field(() => [String]) requiredInputs: string[];
  @Field() outputFormat: string;
  @Field(() => [String]) tools: string[];
  @Field(() => String, { nullable: true }) modelId: string | null;
  @Field(() => [ID]) projectIds: string[];
  @Field(() => [String]) roles: string[];
  @Field(() => [ID], { nullable: true }) roleIds: string[] | null;
  @Field(() => Int) dailyRunLimit: number;
  @Field(() => Int) maxOutputTokens: number;
  @Field() humanConfirmation: boolean;
}
@ObjectType('DeliveryAssistantConfigurationDetail')
export class DeliveryAssistantConfigurationDetailDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field() observedAt: string;
  @Field(() => ID) id: string;
  @Field(() => Int) version: number;
  @Field() createdAt: string;
  @Field() updatedAt: string;
  @Field(() => DeliveryAssistantConfigurationDTO)
  configuration: DeliveryAssistantConfigurationDTO;
}
@ObjectType('DeliveryAssistantStatusCount')
export class DeliveryAssistantStatusCountDTO {
  @Field() status: string;
  @Field(() => Int) count: number;
}
@ObjectType('DeliveryAssistantRunSummary')
export class DeliveryAssistantRunSummaryDTO {
  @Field(() => ID) id: string;
  @Field(() => ID) taskId: string;
  @Field() taskTitle: string;
  @Field(() => ID) projectId: string;
  @Field() projectName: string;
  @Field(() => ID) agentId: string;
  @Field() agentName: string;
  @Field() kind: string;
  @Field(() => ID) initiatorId: string;
  @Field(() => Int) taskRevision: number;
  @Field(() => Int) agentVersion: number;
  @Field() status: string;
  @Field() createdAt: string;
  @Field() updatedAt: string;
  @Field(() => String, { nullable: true }) decisionAt: string | null;
  @Field(() => String, { nullable: true }) decisionAction: string | null;
  @Field() hasFindings: boolean;
  @Field() hasSuggestedBrief: boolean;
  @Field() hasSuggestedCopy: boolean;
}
@ObjectType('DeliveryAssistantRuns')
export class DeliveryAssistantRunsDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field() observedAt: string;
  @Field(() => Int) totalCount: number;
  @Field(() => [DeliveryAssistantStatusCountDTO])
  byStatus: DeliveryAssistantStatusCountDTO[];
  @Field(() => [DeliveryAssistantRunSummaryDTO])
  items: DeliveryAssistantRunSummaryDTO[];
  @Field(() => String, { nullable: true }) nextCursor: string | null;
}
@ObjectType('DeliveryAssistantFinding')
export class DeliveryAssistantFindingDTO {
  @Field() severity: string;
  @Field() evidence: string;
  @Field() correction: string;
}
@ObjectType('DeliveryAssistantResult')
export class DeliveryAssistantResultDTO {
  @Field() summary: string;
  @Field(() => [DeliveryAssistantFindingDTO])
  findings: DeliveryAssistantFindingDTO[];
  @Field(() => String, { nullable: true }) suggestedBrief: string | null;
  @Field(() => String, { nullable: true }) suggestedCopy: string | null;
}
@ObjectType('DeliveryAssistantActivity')
export class DeliveryAssistantActivityDTO {
  @Field() at: string;
  @Field() message: string;
}
@ObjectType('DeliveryAssistantUsage')
export class DeliveryAssistantUsageDTO {
  @Field(() => Int, { nullable: true }) inputTokens: number | null;
  @Field(() => Int, { nullable: true }) outputTokens: number | null;
  @Field(() => Float, { nullable: true }) cost: number | null;
}
@ObjectType('DeliveryAssistantDecision')
export class DeliveryAssistantDecisionDTO {
  @Field(() => ID) memberId: string;
  @Field() at: string;
  @Field() action: string;
  @Field(() => String, { nullable: true }) field: string | null;
}
@ObjectType('DeliveryAssistantRunDetail')
export class DeliveryAssistantRunDetailDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field() observedAt: string;
  @Field(() => DeliveryAssistantRunSummaryDTO)
  run: DeliveryAssistantRunSummaryDTO;
  @Field(() => ID) requestId: string;
  @Field(() => DeliveryAssistantConfigurationDTO)
  configuration: DeliveryAssistantConfigurationDTO;
  @Field(() => GraphQLJSON) context: DeliveryAgentContext;
  @Field(() => DeliveryAssistantResultDTO, { nullable: true })
  result: DeliveryAssistantResultDTO | null;
  @Field(() => [DeliveryAssistantActivityDTO])
  activity: DeliveryAssistantActivityDTO[];
  @Field(() => DeliveryAssistantUsageDTO, { nullable: true })
  usage: DeliveryAssistantUsageDTO | null;
  @Field(() => String, { nullable: true }) error: string | null;
  @Field(() => DeliveryAssistantDecisionDTO, { nullable: true })
  decision: DeliveryAssistantDecisionDTO | null;
  @Field() canCancel: boolean;
  @Field() canReject: boolean;
  @Field() canAcceptFindings: boolean;
  @Field() canAcceptBrief: boolean;
  @Field() canAcceptCopy: boolean;
  @Field(() => String, { nullable: true }) acceptanceBlockedReason:
    | string
    | null;
}
@ObjectType('DeliveryAssistantBudget')
export class DeliveryAssistantBudgetDTO {
  @Field(() => String, { nullable: true }) maximumCostUsd: string | null;
  @Field(() => Int, { nullable: true }) pricingRevision: number | null;
  @Field() budgetReady: boolean;
  @Field(() => String, { nullable: true }) blockedReason: string | null;
  @Field(() => String, { nullable: true }) boundSource: string | null;
}
@ObjectType('DeliveryAssistantPreview')
export class DeliveryAssistantPreviewDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field(() => ID) taskId: string;
  @Field(() => ID) agentId: string;
  @Field(() => Int) taskRevision: number;
  @Field(() => Int) agentVersion: number;
  @Field(() => GraphQLJSON) context: DeliveryAgentContext;
  @Field(() => DeliveryAssistantBudgetDTO) budget: DeliveryAssistantBudgetDTO;
}
@ObjectType('DeliveryAssistantSaveReceipt')
export class DeliveryAssistantSaveReceiptDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field(() => ID) saved: string;
  @Field(() => Int) version: number;
  @Field() replayed: boolean;
}
@ObjectType('DeliveryAssistantRunReceipt')
export class DeliveryAssistantRunReceiptDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field(() => ID) runId: string;
  @Field(() => ID) taskId: string;
  @Field(() => ID) agentId: string;
  @Field() status: string;
  @Field() updatedAt: string;
}
@ObjectType('DeliveryAssistantRequest')
export class DeliveryAssistantRequestDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field(() => ID) requestId: string;
  @Field(() => DeliveryAssistantRunReceiptDTO, { nullable: true })
  receipt: DeliveryAssistantRunReceiptDTO | null;
}
