import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-type-json';
import { type DeliveryDetails } from 'src/modules/delivery/delivery.types';

@ObjectType('DeliveryTaskActor')
export class DeliveryTaskActorDTO {
  @Field(() => ID) memberId: string;
  @Field() isAdmin: boolean;
  @Field() isManager: boolean;
  @Field(() => [String]) capabilities: string[];
  @Field(() => [ID]) roleIds: string[];
}
@ObjectType('DeliveryTaskProject')
export class DeliveryTaskProjectDTO {
  @Field(() => ID) id: string;
  @Field(() => Int) revision: number;
  @Field() name: string;
  @Field(() => ID, { nullable: true }) companyId: string | null;
  @Field(() => [ID]) memberIds: string[];
}
@ObjectType('DeliveryTaskMember')
export class DeliveryTaskMemberDTO {
  @Field(() => ID) id: string;
  @Field() name: string;
  @Field() access: string;
  @Field() roleLabel: string;
}
@ObjectType('DeliveryTaskCompany')
export class DeliveryTaskCompanyDTO {
  @Field(() => ID) id: string;
  @Field() name: string;
}
@ObjectType('DeliveryWorkspaceContext')
export class DeliveryWorkspaceContextDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field() observedAt: string;
  @Field(() => DeliveryTaskActorDTO) actor: DeliveryTaskActorDTO;
  @Field(() => [DeliveryTaskProjectDTO]) projects: DeliveryTaskProjectDTO[];
  @Field(() => [DeliveryTaskMemberDTO]) members: DeliveryTaskMemberDTO[];
  @Field(() => [DeliveryTaskCompanyDTO]) companies: DeliveryTaskCompanyDTO[];
}
@InputType('DeliveryTaskListInput')
export class DeliveryTaskListInput {
  @Field() view: string;
  @Field() timezone: string;
  @Field(() => ID, { nullable: true }) projectId?: string | null;
  @Field(() => ID, { nullable: true }) assigneeId?: string | null;
  @Field(() => String, { nullable: true }) service?: string | null;
  @Field(() => String, { nullable: true }) state?: string | null;
  @Field(() => String, { nullable: true }) search?: string | null;
  @Field(() => String, { nullable: true }) scheduledFrom?: string | null;
  @Field(() => String, { nullable: true }) scheduledThrough?: string | null;
  @Field(() => String, { nullable: true }) attention?: string | null;
  @Field(() => String, { nullable: true }) after?: string | null;
  @Field(() => Int, { nullable: true }) limit?: number | null;
}
@ObjectType('DeliveryTaskReviewAuthority')
export class DeliveryTaskReviewAuthorityDTO {
  @Field(() => Int, { nullable: true }) submissionVersion: number | null;
  @Field(() => ID, { nullable: true }) primaryReviewerId: string | null;
  @Field(() => ID, { nullable: true }) effectiveReviewerId: string | null;
  @Field(() => Int) assignmentRevision: number;
  @Field() assignmentMode: string;
  @Field() reviewerState: string;
  @Field() canReview: boolean;
}
@ObjectType('DeliveryTaskLifecycle')
export class DeliveryTaskLifecycleDTO {
  @Field() status: string;
  @Field(() => Int) cycle: number;
  @Field(() => String, { nullable: true }) deliveredAt: string | null;
  @Field(() => String, { nullable: true }) nextCheckAt: string | null;
  @Field(() => Int, { nullable: true }) deliveredSubmissionVersion:
    | number
    | null;
  @Field() timezone: string;
}
@ObjectType('DeliveryTaskSummary')
export class DeliveryTaskSummaryDTO {
  @Field(() => ID) id: string;
  @Field() title: string;
  @Field(() => ID) projectId: string;
  @Field() projectName: string;
  @Field(() => Int) revision: number;
  @Field(() => ID, { nullable: true }) assigneeId: string | null;
  @Field(() => String, { nullable: true }) assigneeName: string | null;
  @Field() service: string;
  @Field() state: string;
  @Field() priority: string;
  @Field(() => String, { nullable: true }) scheduledDate: string | null;
  @Field(() => String, { nullable: true }) dueAt: string | null;
  @Field() workGroup: string;
  @Field() blockerPreview: string;
  @Field() blockerTruncated: boolean;
  @Field(() => Int, { nullable: true }) checklistDone: number | null;
  @Field(() => Int, { nullable: true }) checklistTotal: number | null;
  @Field() hasCreative: boolean;
  @Field(() => DeliveryTaskReviewAuthorityDTO)
  review: DeliveryTaskReviewAuthorityDTO;
  @Field(() => DeliveryTaskLifecycleDTO) delivery: DeliveryTaskLifecycleDTO;
  @Field(() => [String]) warnings: string[];
}
@ObjectType('DeliveryTaskCount')
export class DeliveryTaskCountDTO {
  @Field() key: string;
  @Field(() => Int) count: number;
}
@ObjectType('DeliveryTaskOverview')
export class DeliveryTaskOverviewDTO {
  @Field(() => Int) totalCount: number;
  @Field(() => Int) blockedCount: number;
  @Field(() => Int) approvedCount: number;
  @Field(() => Int) overdueCount: number;
  @Field(() => Int) reviewCount: number;
  @Field(() => Int) dueTodayCount: number;
}
@ObjectType('DeliveryTaskList')
export class DeliveryTaskListDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field() observedAt: string;
  @Field() pageReferenceAt: string;
  @Field() timezone: string;
  @Field() businessDate: string;
  @Field(() => Int) totalCount: number;
  @Field(() => [DeliveryTaskCountDTO]) byState: DeliveryTaskCountDTO[];
  @Field(() => [DeliveryTaskCountDTO]) byWorkGroup: DeliveryTaskCountDTO[];
  @Field(() => DeliveryTaskOverviewDTO) overview: DeliveryTaskOverviewDTO;
  @Field(() => [String]) serviceOptions: string[];
  @Field(() => [DeliveryTaskSummaryDTO]) items: DeliveryTaskSummaryDTO[];
  @Field(() => String, { nullable: true }) nextCursor: string | null;
}
@InputType('DeliveryTaskDetailInput')
export class DeliveryTaskDetailInput {
  @Field(() => ID) taskId: string;
}
@InputType('DeliveryTaskAssignmentSeenInput')
export class DeliveryTaskAssignmentSeenInput {
  @Field(() => ID) taskId: string;
  @Field() expectedAssignmentKey: string;
}
@ObjectType('DeliveryTaskAssignmentSeen')
export class DeliveryTaskAssignmentSeenDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field(() => ID) taskId: string;
  @Field() seen: boolean;
}
@ObjectType('DeliveryTaskDetailTask')
export class DeliveryTaskDetailTaskDTO {
  @Field(() => ID) id: string;
  @Field() title: string;
  @Field(() => ID, { nullable: true }) assigneeId: string | null;
  @Field(() => String, { nullable: true }) dueAt: string | null;
  @Field(() => ID) projectId: string;
  @Field(() => Int) revision: number;
  @Field(() => DeliveryTaskReviewAuthorityDTO)
  review: DeliveryTaskReviewAuthorityDTO;
  @Field(() => DeliveryTaskLifecycleDTO) delivery: DeliveryTaskLifecycleDTO;
  @Field(() => GraphQLJSON) details: DeliveryDetails;
}
@ObjectType('DeliveryTaskDetail')
export class DeliveryTaskDetailDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field() observedAt: string;
  @Field(() => DeliveryTaskDetailTaskDTO) task: DeliveryTaskDetailTaskDTO;
}
@InputType('DeliveryTaskChecklistInput')
export class DeliveryTaskChecklistInput {
  @Field(() => ID) id: string;
  @Field() text: string;
  @Field() done: boolean;
}
@InputType('DeliveryTaskFieldsInput')
export class DeliveryTaskFieldsInput {
  @Field() title: string;
  @Field() brief: string;
  @Field() service: string;
  @Field() priority: string;
  @Field(() => String, { nullable: true }) scheduledDate: string | null;
  @Field(() => String, { nullable: true }) dueAt: string | null;
  @Field(() => ID) assigneeId: string;
  @Field(() => ID) reviewerId: string;
  @Field(() => [DeliveryTaskChecklistInput])
  checklist: DeliveryTaskChecklistInput[];
  @Field(() => [String]) evidence: string[];
}
@InputType('DeliveryTaskCommandInput')
export class DeliveryTaskCommandInput {
  @Field() action: string;
  @Field(() => ID, { nullable: true }) taskId?: string | null;
  @Field(() => Int, { nullable: true }) revision?: number | null;
  @Field(() => ID, { nullable: true }) projectId?: string | null;
  @Field(() => DeliveryTaskFieldsInput, { nullable: true })
  fields?: DeliveryTaskFieldsInput | null;
  @Field(() => String, { nullable: true }) state?: string | null;
  @Field(() => String, { nullable: true }) blocker?: string | null;
  @Field(() => [DeliveryTaskChecklistInput], { nullable: true }) checklist?:
    | DeliveryTaskChecklistInput[]
    | null;
  @Field(() => [String], { nullable: true }) evidence?: string[] | null;
  @Field(() => String, { nullable: true }) description?: string | null;
  @Field(() => String, { nullable: true }) decision?: string | null;
  @Field(() => String, { nullable: true }) feedback?: string | null;
  @Field(() => String, { nullable: true }) text?: string | null;
  @Field(() => Int, { nullable: true }) selectedSubmissionVersion?:
    | number
    | null;
  @Field(() => Int, { nullable: true }) reviewAssignmentRevision?:
    | number
    | null;
  @Field(() => Int, { nullable: true }) creativeVersion?: number | null;
  @Field(() => ID, { nullable: true }) finalAssetId?: string | null;
  @Field(() => GraphQLJSON, { nullable: true }) plan?: unknown;
  @Field(() => GraphQLJSON, { nullable: true }) workflow?: unknown;
  @Field(() => GraphQLJSON, { nullable: true }) workflowReview?: unknown;
}
@ObjectType('DeliveryTaskCommandResult')
export class DeliveryTaskCommandResultDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field(() => ID) taskId: string;
  @Field(() => Int) revision: number;
  @Field() state: string;
}
