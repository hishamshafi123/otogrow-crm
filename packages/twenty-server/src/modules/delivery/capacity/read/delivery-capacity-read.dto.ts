import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';

@InputType('DeliveryCapacitySummaryInput')
export class DeliveryCapacitySummaryInput {
  @Field() startDate: string;
  @Field() timezone: string;
  @Field(() => String, { nullable: true }) after?: string | null;
  @Field(() => Int, { nullable: true }) limit?: number | null;
}
@InputType('DeliveryCapacityAssignmentsInput')
export class DeliveryCapacityAssignmentsInput {
  @Field() startDate: string;
  @Field() timezone: string;
  @Field(() => ID, { nullable: true }) memberId?: string | null;
  @Field() bucket: string;
  @Field(() => String, { nullable: true }) date?: string | null;
  @Field(() => String, { nullable: true }) after?: string | null;
  @Field(() => Int, { nullable: true }) limit?: number | null;
}
@ObjectType('DeliveryCapacityWarning')
export class DeliveryCapacityWarningDTO {
  @Field() code: string;
  @Field() scope: string;
  @Field(() => Int) count: number;
}
@ObjectType('DeliveryCapacityDay')
export class DeliveryCapacityDayDTO {
  @Field() date: string;
  @Field(() => Int, { nullable: true }) availableMinutes: number | null;
  @Field(() => Int) availabilityRevision: number;
  @Field() availabilityInvalid: boolean;
  @Field(() => Int) assignmentCount: number;
  @Field(() => Int) workMinutes: number;
  @Field(() => Int) productionMinutes: number;
  @Field(() => Int) revisionMinutes: number;
  @Field(() => Int) reviewMinutes: number;
  @Field(() => Int) waitMinutes: number;
  @Field(() => Int) unknownCount: number;
  @Field() unknownWait: boolean;
  @Field(() => Int) overloadMinutes: number;
  @Field(() => Int) unavailableReviewCount: number;
}
@ObjectType('DeliveryCapacityMemberSummary')
export class DeliveryCapacityMemberSummaryDTO {
  @Field(() => ID) memberId: string;
  @Field() name: string;
  @Field(() => Int) overloadDays: number;
  @Field(() => Int) incompleteDays: number;
  @Field(() => Int) needsPlanningCount: number;
  @Field(() => [DeliveryCapacityDayDTO]) days: DeliveryCapacityDayDTO[];
}
@ObjectType('DeliveryCapacitySummary')
export class DeliveryCapacitySummaryDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field() observedAt: string;
  @Field() timezone: string;
  @Field() startDate: string;
  @Field() endDate: string;
  @Field(() => Int) totalMemberCount: number;
  @Field() warningScope: string;
  @Field(() => [DeliveryCapacityWarningDTO])
  warnings: DeliveryCapacityWarningDTO[];
  @Field(() => [DeliveryCapacityMemberSummaryDTO])
  members: DeliveryCapacityMemberSummaryDTO[];
  @Field(() => String, { nullable: true }) nextCursor: string | null;
}
@ObjectType('DeliveryCapacityAssignment')
export class DeliveryCapacityAssignmentDTO {
  @Field(() => ID) taskId: string;
  @Field() title: string;
  @Field(() => ID) projectId: string;
  @Field() projectName: string;
  @Field(() => Int) revision: number;
  @Field() state: string;
  @Field() kind: string;
  @Field(() => String, { nullable: true }) date: string | null;
  @Field(() => ID, { nullable: true }) ownerId: string | null;
  @Field(() => String, { nullable: true }) ownerName: string | null;
  @Field(() => Int, { nullable: true }) workMinutes: number | null;
  @Field(() => Int, { nullable: true }) revisionMinutes: number | null;
  @Field(() => Int, { nullable: true }) waitMinutes: number | null;
  @Field() unknownEffort: boolean;
  @Field() unknownWait: boolean;
  @Field(() => String, { nullable: true }) reviewerState: string | null;
  @Field(() => Int, { nullable: true }) submissionVersion: number | null;
  @Field(() => Int) reviewAssignmentRevision: number;
  @Field(() => [String]) warnings: string[];
}
@ObjectType('DeliveryCapacityAssignments')
export class DeliveryCapacityAssignmentsDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field() observedAt: string;
  @Field() timezone: string;
  @Field() startDate: string;
  @Field() endDate: string;
  @Field(() => ID, { nullable: true }) selectedMemberId: string | null;
  @Field() bucket: string;
  @Field() selectionScope: string;
  @Field(() => String, { nullable: true }) date: string | null;
  @Field(() => Int) totalCount: number;
  @Field(() => [DeliveryCapacityAssignmentDTO])
  items: DeliveryCapacityAssignmentDTO[];
  @Field(() => String, { nullable: true }) nextCursor: string | null;
}
