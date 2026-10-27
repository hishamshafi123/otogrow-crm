import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';

@InputType('DeliveryWorkflowCheckInput')
export class DeliveryWorkflowCheckInput {
  @Field() id: string;
  @Field() label: string;
  @Field() required: boolean;
}
@ObjectType('DeliveryWorkflowCheck')
export class DeliveryWorkflowCheckDTO {
  @Field() id: string;
  @Field() label: string;
  @Field() required: boolean;
}
@InputType('DeliveryWorkflowEvidenceInput')
export class DeliveryWorkflowEvidenceInput {
  @Field() id: string;
  @Field() label: string;
  @Field() instructions: string;
  @Field() kind: string;
  @Field() required: boolean;
}
@ObjectType('DeliveryWorkflowEvidence')
export class DeliveryWorkflowEvidenceDTO {
  @Field() id: string;
  @Field() label: string;
  @Field() instructions: string;
  @Field() kind: string;
  @Field() required: boolean;
}
@InputType('DeliveryWorkflowDefinitionInput')
export class DeliveryWorkflowDefinitionInput {
  @Field() name: string;
  @Field() description: string;
  @Field() service: string;
  @Field() definitionOfDone: string;
  @Field(() => [DeliveryWorkflowCheckInput])
  checklist: DeliveryWorkflowCheckInput[];
  @Field(() => [DeliveryWorkflowEvidenceInput])
  evidence: DeliveryWorkflowEvidenceInput[];
  @Field(() => [DeliveryWorkflowCheckInput])
  reviewChecks: DeliveryWorkflowCheckInput[];
}
@ObjectType('DeliveryWorkflowDefinition')
export class DeliveryWorkflowDefinitionDTO {
  @Field() name: string;
  @Field() description: string;
  @Field() service: string;
  @Field() definitionOfDone: string;
  @Field(() => [DeliveryWorkflowCheckDTO])
  checklist: DeliveryWorkflowCheckDTO[];
  @Field(() => [DeliveryWorkflowEvidenceDTO])
  evidence: DeliveryWorkflowEvidenceDTO[];
  @Field(() => [DeliveryWorkflowCheckDTO])
  reviewChecks: DeliveryWorkflowCheckDTO[];
}
@InputType('DeliveryWorkflowCatalogInput')
export class DeliveryWorkflowCatalogInput {
  @Field(() => Boolean, { nullable: true }) includeArchived?: boolean;
  @Field(() => ID, { nullable: true }) templateId?: string;
}
@InputType('DeliveryWorkflowSaveInput')
export class DeliveryWorkflowSaveInput {
  @Field(() => ID) id: string;
  @Field(() => Int) revision: number;
  @Field(() => DeliveryWorkflowDefinitionInput)
  definition: DeliveryWorkflowDefinitionInput;
  @Field() reason: string;
}
@InputType('DeliveryWorkflowArchiveInput')
export class DeliveryWorkflowArchiveInput {
  @Field(() => ID) id: string;
  @Field(() => Int) revision: number;
  @Field() archived: boolean;
  @Field() reason: string;
}
@ObjectType('DeliveryWorkflowVersion')
export class DeliveryWorkflowVersionDTO {
  @Field(() => ID) templateId: string;
  @Field(() => Int) version: number;
  @Field(() => DeliveryWorkflowDefinitionDTO)
  definition: DeliveryWorkflowDefinitionDTO;
  @Field() publishedAt: string;
  @Field() publishedByName: string;
  @Field() reason: string;
}
@ObjectType('DeliveryWorkflowTemplate')
export class DeliveryWorkflowTemplateDTO {
  @Field(() => ID) id: string;
  @Field(() => Int) revision: number;
  @Field() archived: boolean;
  @Field() stateReason: string;
  @Field(() => DeliveryWorkflowVersionDTO) current: DeliveryWorkflowVersionDTO;
}
@ObjectType('DeliveryWorkflowStarter')
export class DeliveryWorkflowStarterDTO {
  @Field() key: string;
  @Field(() => DeliveryWorkflowDefinitionDTO)
  definition: DeliveryWorkflowDefinitionDTO;
}
@ObjectType('DeliveryWorkflowCatalog')
export class DeliveryWorkflowCatalogDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field(() => [DeliveryWorkflowTemplateDTO])
  templates: DeliveryWorkflowTemplateDTO[];
  @Field(() => [DeliveryWorkflowVersionDTO])
  versions: DeliveryWorkflowVersionDTO[];
  @Field(() => [DeliveryWorkflowStarterDTO])
  starters: DeliveryWorkflowStarterDTO[];
}
@InputType('DeliveryTaskWorkflowInput')
export class DeliveryTaskWorkflowInput {
  @Field(() => ID) taskId: string;
  @Field(() => String, { nullable: true }) historyCursor?: string;
  @Field(() => Int, { nullable: true }) limit?: number;
}
@InputType('DeliveryWorkflowApplyInput')
export class DeliveryWorkflowApplyInput {
  @Field(() => ID) taskId: string;
  @Field(() => Int) taskRevision: number;
  @Field(() => ID) templateId: string;
  @Field(() => Int) templateRevision: number;
  @Field(() => Int) version: number;
  @Field() reopen: boolean;
  @Field() reason: string;
}
@InputType('DeliveryWorkflowAnswerInput')
export class DeliveryWorkflowAnswerInput {
  @Field() requirementId: string;
  @Field() value: string;
}
@ObjectType('DeliveryWorkflowAnswer')
export class DeliveryWorkflowAnswerDTO {
  @Field() requirementId: string;
  @Field() value: string;
}
@InputType('DeliveryWorkflowProgressInput')
export class DeliveryWorkflowProgressInput {
  @Field(() => ID) taskId: string;
  @Field(() => Int) taskRevision: number;
  @Field(() => Int) workflowRevision: number;
  @Field(() => [String]) checkedIds: string[];
  @Field(() => [DeliveryWorkflowAnswerInput])
  evidence: DeliveryWorkflowAnswerInput[];
}
@ObjectType('DeliveryAppliedWorkflow')
export class DeliveryAppliedWorkflowDTO {
  @Field(() => ID) templateId: string;
  @Field(() => Int) version: number;
  @Field(() => Int) revision: number;
  @Field(() => DeliveryWorkflowDefinitionDTO)
  definition: DeliveryWorkflowDefinitionDTO;
  @Field(() => [String]) checkedIds: string[];
  @Field(() => [DeliveryWorkflowAnswerDTO])
  evidence: DeliveryWorkflowAnswerDTO[];
  @Field() appliedAt: string;
  @Field() appliedByName: string;
}
@ObjectType('DeliveryTaskWorkflow')
export class DeliveryTaskWorkflowDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field(() => ID) taskId: string;
  @Field(() => Int) taskRevision: number;
  @Field() canManage: boolean;
  @Field() canEdit: boolean;
  @Field() locked: boolean;
  @Field(() => DeliveryAppliedWorkflowDTO, { nullable: true })
  workflow: DeliveryAppliedWorkflowDTO | null;
  @Field(() => [DeliveryAppliedWorkflowDTO])
  previousApplications: DeliveryAppliedWorkflowDTO[];
  @Field(() => [String]) missingRequirements: string[];
  @Field(() => String, { nullable: true }) nextHistoryCursor: string | null;
}
