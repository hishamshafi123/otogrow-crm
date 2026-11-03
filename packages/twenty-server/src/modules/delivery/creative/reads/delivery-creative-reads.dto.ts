import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';
import { DeliveryCreativeDocumentDTO } from 'src/modules/delivery/creative/reads/delivery-creative-document.dto';

@InputType('DeliveryCreativeProjectsInput')
export class DeliveryCreativeProjectsInput {
  @Field(() => String, { nullable: true }) search?: string | null;
  @Field(() => String, { nullable: true }) after?: string | null;
  @Field(() => Int, { nullable: true }) limit?: number | null;
}
@InputType('DeliveryCreativeTasksInput')
export class DeliveryCreativeTasksInput extends DeliveryCreativeProjectsInput {
  @Field(() => ID, { nullable: true }) projectId?: string | null;
  @Field(() => String, { nullable: true }) state?: string | null;
  @Field(() => Boolean, { nullable: true }) mine?: boolean | null;
  @Field(() => String, { nullable: true }) production?: string | null;
}
@InputType('DeliveryCreativeSelectionInput')
export class DeliveryCreativeSelectionInput {
  @Field(() => ID) taskId: string;
}
@InputType('DeliveryCreativeReferencesInput')
export class DeliveryCreativeReferencesInput extends DeliveryCreativeProjectsInput {
  @Field(() => ID) taskId: string;
}
@ObjectType('DeliveryCreativeActor')
export class DeliveryCreativeActorDTO {
  @Field(() => ID) memberId: string;
  @Field() isAdmin: boolean;
  @Field() isManager: boolean;
  @Field(() => [ID]) roleIds: string[];
  @Field(() => [String]) capabilities: string[];
}
@ObjectType('DeliveryCreativeContext')
export class DeliveryCreativeContextDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field() observedAt: string;
  @Field() scope: string;
  @Field(() => DeliveryCreativeActorDTO) actor: DeliveryCreativeActorDTO;
}
@ObjectType('DeliveryCreativeProject')
export class DeliveryCreativeProjectDTO {
  @Field(() => ID) id: string;
  @Field() name: string;
  @Field(() => Int) revision: number;
}
@ObjectType('DeliveryCreativeProjects')
export class DeliveryCreativeProjectsDTO extends DeliveryCreativeContextDTO {
  @Field(() => [DeliveryCreativeProjectDTO])
  items: DeliveryCreativeProjectDTO[];
  @Field(() => Int) totalCount: number;
  @Field(() => String, { nullable: true }) nextCursor: string | null;
}
@ObjectType('DeliveryCreativeTaskSummary')
export class DeliveryCreativeTaskSummaryDTO {
  @Field(() => ID) id: string;
  @Field() title: string;
  @Field(() => ID) projectId: string;
  @Field() projectName: string;
  @Field(() => Int) projectRevision: number;
  @Field(() => Int) revision: number;
  @Field(() => ID, { nullable: true }) assigneeId: string | null;
  @Field(() => String, { nullable: true }) assigneeName: string | null;
  @Field(() => String, { nullable: true }) assignmentKey: string | null;
  @Field(() => String, { nullable: true }) dueAt: string | null;
  @Field() state: string;
  @Field() service: string;
  @Field() hasProduction: boolean;
  @Field() canEdit: boolean;
}
@ObjectType('DeliveryCreativeTasks')
export class DeliveryCreativeTasksDTO extends DeliveryCreativeContextDTO {
  @Field(() => [DeliveryCreativeTaskSummaryDTO])
  items: DeliveryCreativeTaskSummaryDTO[];
  @Field(() => Int) totalCount: number;
  @Field(() => String, { nullable: true }) nextCursor: string | null;
  @Field(() => DeliveryCreativeProjectDTO, { nullable: true })
  selectedProject: DeliveryCreativeProjectDTO | null;
}
@ObjectType('DeliveryCreativeState')
export class DeliveryCreativeStateDTO extends DeliveryCreativeContextDTO {
  @Field(() => DeliveryCreativeTaskSummaryDTO)
  task: DeliveryCreativeTaskSummaryDTO;
}
@ObjectType('DeliveryCreativeDetail')
export class DeliveryCreativeDetailDTO extends DeliveryCreativeStateDTO {
  @Field(() => DeliveryCreativeDocumentDTO, { nullable: true })
  document: DeliveryCreativeDocumentDTO | null;
}
@ObjectType('DeliveryCreativeApprovedReference')
export class DeliveryCreativeApprovedReferenceDTO {
  @Field(() => ID) id: string;
  @Field(() => Int) version: number;
  @Field() title: string;
  @Field() url: string;
  @Field() summaryPreview: string;
  @Field() summaryTruncated: boolean;
  @Field(() => ID) sourceTaskId: string;
  @Field() sourceTaskTitle: string;
  @Field(() => Int) sourceTaskRevision: number;
  @Field() approvedAt: string;
}
@ObjectType('DeliveryCreativeReferences')
export class DeliveryCreativeReferencesDTO extends DeliveryCreativeContextDTO {
  @Field(() => ID) taskId: string;
  @Field(() => ID) projectId: string;
  @Field(() => Int) projectRevision: number;
  @Field(() => [DeliveryCreativeApprovedReferenceDTO])
  items: DeliveryCreativeApprovedReferenceDTO[];
  @Field(() => Int) totalCount: number;
  @Field(() => String, { nullable: true }) nextCursor: string | null;
}
