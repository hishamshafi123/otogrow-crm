import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';

@InputType('DeliveryReviewQueueInput')
export class DeliveryReviewQueueInput {
  @Field(() => ID, { nullable: true }) projectId?: string | null;
  @Field(() => ID, { nullable: true }) reviewerId?: string | null;
  @Field(() => Boolean, { nullable: true }) mine?: boolean | null;
  @Field(() => String, { nullable: true }) after?: string | null;
  @Field(() => Int, { nullable: true }) limit?: number | null;
}
@InputType('DeliveryTaskReviewInput')
export class DeliveryTaskReviewInput {
  @Field(() => ID) taskId: string;
}
@InputType('DeliveryReviewAssignmentInput')
export class DeliveryReviewAssignmentInput {
  @Field(() => ID) commandId: string;
  @Field(() => ID) taskId: string;
  @Field(() => Int) taskRevision: number;
  @Field(() => Int) submissionVersion: number;
  @Field(() => Int) assignmentRevision: number;
  @Field() mode: string;
  @Field(() => ID, { nullable: true }) reviewerId: string | null;
  @Field() reason: string;
}
@InputType('DeliveryReviewAssignmentHistoryInput')
export class DeliveryReviewAssignmentHistoryInput {
  @Field(() => ID) taskId: string;
  @Field(() => Int) submissionVersion: number;
  @Field(() => ID, { nullable: true }) beforeId?: string | null;
}
@InputType('DeliveryReviewAssignmentSeenInput')
export class DeliveryReviewAssignmentSeenInput {
  @Field(() => ID) taskId: string;
  @Field(() => Int) taskRevision: number;
  @Field(() => Int) submissionVersion: number;
  @Field(() => Int) assignmentRevision: number;
  @Field(() => ID) noticeId: string;
}
@InputType('DeliveryReviewAssignmentAcknowledgeInput')
export class DeliveryReviewAssignmentAcknowledgeInput {
  @Field(() => ID) taskId: string;
  @Field(() => Int) taskRevision: number;
  @Field(() => Int) submissionVersion: number;
  @Field(() => Int) assignmentRevision: number;
  @Field(() => ID) noticeId: string;
}
@ObjectType('DeliveryReviewAssignmentAcknowledgement')
export class DeliveryReviewAssignmentAcknowledgementDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field(() => ID) taskId: string;
  @Field(() => Int) taskRevision: number;
  @Field(() => Int) submissionVersion: number;
  @Field(() => Int) assignmentRevision: number;
  @Field(() => ID) noticeId: string;
  @Field() acknowledgedAt: string;
}
@ObjectType('DeliveryReviewAssignmentNotice')
export class DeliveryReviewAssignmentNoticeDTO {
  @Field(() => ID) id: string;
  @Field(() => Int) submissionVersion: number;
  @Field(() => ID, { nullable: true }) assignmentId: string | null;
  @Field(() => Int) assignmentRevision: number;
  @Field(() => ID) recipientId: string;
  @Field() createdAt: string;
  @Field() remindAt: string;
  @Field(() => String, { nullable: true }) seenAt: string | null;
  @Field(() => String, { nullable: true }) acknowledgedAt: string | null;
  @Field() sendState: string;
}
@ObjectType('DeliveryReviewOption')
export class DeliveryReviewOptionDTO {
  @Field(() => ID) id: string;
  @Field() name: string;
}
@ObjectType('DeliveryReviewAssignment')
export class DeliveryReviewAssignmentDTO {
  @Field(() => ID, { nullable: true }) id: string | null;
  @Field(() => ID) taskId: string;
  @Field(() => Int) submissionVersion: number;
  @Field(() => Int) revision: number;
  @Field() mode: string;
  @Field(() => ID, { nullable: true }) reviewerId: string | null;
  @Field(() => String, { nullable: true }) reviewerName: string | null;
  @Field(() => String, { nullable: true }) reason: string | null;
  @Field(() => String, { nullable: true }) changedByName: string | null;
  @Field(() => String, { nullable: true }) changedAt: string | null;
}
@ObjectType('DeliveryReviewQueueItem')
export class DeliveryReviewQueueItemDTO {
  @Field(() => ID) taskId: string;
  @Field() title: string;
  @Field(() => ID) projectId: string;
  @Field() projectName: string;
  @Field() service: string;
  @Field(() => Int) taskRevision: number;
  @Field(() => Int, { nullable: true }) submissionVersion: number | null;
  @Field(() => String, { nullable: true }) submittedAt: string | null;
  @Field(() => Int, { nullable: true }) ageSeconds: number | null;
  @Field() ageState: string;
  @Field(() => ID, { nullable: true }) primaryReviewerId: string | null;
  @Field() primaryReviewerName: string;
  @Field(() => ID, { nullable: true }) effectiveReviewerId: string | null;
  @Field() effectiveReviewerName: string;
  @Field() reviewerState: string;
  @Field() assignmentMode: string;
  @Field(() => Int) assignmentRevision: number;
  @Field(() => Int, { nullable: true }) creativeVersion: number | null;
  @Field(() => ID, { nullable: true }) finalAssetId: string | null;
  @Field(() => Int, { nullable: true }) requiredCheckCount: number | null;
  @Field() canReviewSubmission: boolean;
  @Field(() => [String]) warnings: string[];
}
@ObjectType('DeliveryReviewQueueSnapshot')
export class DeliveryReviewQueueSnapshotDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field() observedAt: string;
  @Field() canManage: boolean;
  @Field() canReviewAssigned: boolean;
  @Field(() => [DeliveryReviewOptionDTO]) projects: DeliveryReviewOptionDTO[];
  @Field(() => [DeliveryReviewOptionDTO]) reviewers: DeliveryReviewOptionDTO[];
  @Field(() => Int) totalCount: number;
  @Field(() => Int) unknownAgeCount: number;
  @Field(() => Int) unavailableReviewerCount: number;
  @Field(() => [DeliveryReviewQueueItemDTO])
  items: DeliveryReviewQueueItemDTO[];
  @Field(() => String, { nullable: true }) nextCursor: string | null;
}
@ObjectType('DeliveryTaskReviewSnapshot')
export class DeliveryTaskReviewSnapshotDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field() observedAt: string;
  @Field(() => ID) taskId: string;
  @Field(() => Int) taskRevision: number;
  @Field() state: string;
  @Field(() => DeliveryReviewQueueItemDTO, { nullable: true })
  pending: DeliveryReviewQueueItemDTO | null;
  @Field(() => DeliveryReviewAssignmentDTO, { nullable: true })
  assignment: DeliveryReviewAssignmentDTO | null;
  @Field() canManageAssignment: boolean;
  @Field() canReviewSubmission: boolean;
  @Field() canApprove: boolean;
  @Field(() => [DeliveryReviewOptionDTO])
  eligibleReviewers: DeliveryReviewOptionDTO[];
  @Field(() => DeliveryReviewAssignmentNoticeDTO, { nullable: true })
  assignmentNotice: DeliveryReviewAssignmentNoticeDTO | null;
}
@ObjectType('DeliveryReviewAssignmentEvent')
export class DeliveryReviewAssignmentEventDTO {
  @Field(() => ID) id: string;
  @Field(() => Int) revision: number;
  @Field() mode: string;
  @Field(() => ID, { nullable: true }) reviewerId: string | null;
  @Field(() => String, { nullable: true }) reviewerName: string | null;
  @Field() primaryReviewerName: string;
  @Field() previousMode: string;
  @Field(() => ID, { nullable: true }) primaryReviewerId: string | null;
  @Field(() => ID, { nullable: true }) previousReviewerId: string | null;
  @Field(() => String, { nullable: true }) previousReviewerName: string | null;
  @Field() reason: string;
  @Field() actorName: string;
  @Field() createdAt: string;
}
@ObjectType('DeliveryReviewAssignmentHistory')
export class DeliveryReviewAssignmentHistoryDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field(() => ID) taskId: string;
  @Field(() => Int) submissionVersion: number;
  @Field(() => [DeliveryReviewAssignmentEventDTO])
  events: DeliveryReviewAssignmentEventDTO[];
  @Field(() => ID, { nullable: true }) nextBeforeId: string | null;
}
@ObjectType('DeliveryReviewAssignmentResult')
export class DeliveryReviewAssignmentResultDTO {
  @Field(() => DeliveryReviewAssignmentDTO)
  assignment: DeliveryReviewAssignmentDTO;
  @Field(() => DeliveryTaskReviewSnapshotDTO)
  taskReview: DeliveryTaskReviewSnapshotDTO;
  @Field() replayed: boolean;
}
