import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';

@InputType('DeliveryCommitmentsInput')
export class DeliveryCommitmentsInput {
  @Field(() => ID) engagementId: string;
  @Field(() => ID, { nullable: true }) periodId?: string;
  @Field(() => String, { nullable: true }) taskSearch?: string;
  @Field(() => String, { nullable: true }) allocationCursor?: string;
  @Field(() => String, { nullable: true }) historyCursor?: string;
  @Field(() => Int, { nullable: true }) limit?: number;
}

@InputType('DeliveryCommitmentPeriodSaveInput')
export class DeliveryCommitmentPeriodSaveInput {
  @Field(() => ID) id: string;
  @Field(() => ID) engagementId: string;
  @Field(() => Int) revision: number;
  @Field() label: string;
  @Field() startDate: string;
  @Field(() => String, { nullable: true }) endDateExclusive: string | null;
  @Field() timezone: string;
  @Field() reason: string;
}

@InputType('DeliveryCommitmentPeriodStateInput')
export class DeliveryCommitmentPeriodStateInput {
  @Field(() => ID) engagementId: string;
  @Field(() => ID) periodId: string;
  @Field(() => Int) revision: number;
  @Field() state: string;
  @Field() reason: string;
}

@InputType('DeliveryCommitmentLineSaveInput')
export class DeliveryCommitmentLineSaveInput {
  @Field(() => ID) id: string;
  @Field(() => ID) engagementId: string;
  @Field(() => ID) periodId: string;
  @Field(() => Int) periodRevision: number;
  @Field(() => Int) revision: number;
  @Field() label: string;
  @Field() unit: string;
  @Field(() => Int) promisedQuantity: number;
  @Field() reason: string;
}

@InputType('DeliveryCommitmentTaskAssignInput')
export class DeliveryCommitmentTaskAssignInput {
  @Field(() => ID) engagementId: string;
  @Field(() => ID) periodId: string;
  @Field(() => ID) lineId: string;
  @Field(() => Int) lineRevision: number;
  @Field(() => Int) periodRevision: number;
  @Field(() => ID) taskId: string;
  @Field(() => Int) taskRevision: number;
  @Field(() => Int) revision: number;
  @Field(() => ID, { nullable: true }) parentTaskId: string | null;
  @Field() reason: string;
}

@InputType('DeliveryCommitmentTaskRemoveInput')
export class DeliveryCommitmentTaskRemoveInput {
  @Field(() => ID) engagementId: string;
  @Field(() => ID) periodId: string;
  @Field(() => ID) taskId: string;
  @Field(() => Int) revision: number;
  @Field() reason: string;
}

@ObjectType('DeliveryCommitmentPeriod')
export class DeliveryCommitmentPeriodDTO {
  @Field(() => ID) id: string;
  @Field() label: string;
  @Field() billing: string;
  @Field() startDate: string;
  @Field(() => String, { nullable: true }) endDateExclusive: string | null;
  @Field() timezone: string;
  @Field() state: string;
  @Field(() => Int) revision: number;
}

@ObjectType('DeliveryCommitmentLine')
export class DeliveryCommitmentLineDTO {
  @Field(() => ID) id: string;
  @Field(() => ID) periodId: string;
  @Field() label: string;
  @Field() unit: string;
  @Field(() => Int) revision: number;
  @Field(() => Int) promisedQuantity: number;
  @Field(() => Int) assignedQuantity: number;
  @Field(() => Int) fulfilledQuantity: number;
  @Field(() => Int) remainingQuantity: number;
  @Field(() => Int) overdeliveredQuantity: number;
}

@ObjectType('DeliveryCommitmentAllocation')
export class DeliveryCommitmentAllocationDTO {
  @Field(() => ID) taskId: string;
  @Field() taskName: string;
  @Field(() => ID) periodId: string;
  @Field(() => ID) lineId: string;
  @Field(() => ID, { nullable: true }) parentTaskId: string | null;
  @Field(() => Int) revision: number;
  @Field() state: string;
  @Field() credited: boolean;
  @Field(() => String, { nullable: true }) creditReason: string | null;
  @Field(() => String, { nullable: true }) fulfilledAt: string | null;
  @Field(() => Int, { nullable: true }) creditedCycle: number | null;
  @Field(() => Int, { nullable: true }) creditedSubmissionVersion:
    | number
    | null;
}

@ObjectType('DeliveryCommitmentTaskOption')
export class DeliveryCommitmentTaskOptionDTO {
  @Field(() => ID) taskId: string;
  @Field() name: string;
  @Field(() => Int) taskRevision: number;
  @Field() state: string;
  @Field(() => Int) allocationRevision: number;
  @Field(() => ID, { nullable: true }) allocatedPeriodId: string | null;
  @Field(() => ID, { nullable: true }) allocatedLineId: string | null;
  @Field(() => String, { nullable: true }) allocatedUnit: string | null;
}

@ObjectType('DeliveryCommitmentChange')
export class DeliveryCommitmentChangeDTO {
  @Field() field: string;
  @Field(() => String, { nullable: true }) before: string | null;
  @Field(() => String, { nullable: true }) after: string | null;
}

@ObjectType('DeliveryCommitmentEvent')
export class DeliveryCommitmentEventDTO {
  @Field(() => ID) id: string;
  @Field() action: string;
  @Field() actorName: string;
  @Field() actorType: string;
  @Field() occurredAt: string;
  @Field(() => ID, { nullable: true }) taskId: string | null;
  @Field(() => String, { nullable: true }) taskName: string | null;
  @Field(() => String, { nullable: true }) reason: string | null;
  @Field(() => [DeliveryCommitmentChangeDTO])
  changes: DeliveryCommitmentChangeDTO[];
}

@ObjectType('DeliveryCommitments')
export class DeliveryCommitmentsDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field(() => ID) engagementId: string;
  @Field() engagementName: string;
  @Field(() => ID) projectId: string;
  @Field() canManage: boolean;
  @Field(() => String, { nullable: true }) legacyAllowance: string | null;
  @Field(() => ID, { nullable: true }) selectedPeriodId: string | null;
  @Field(() => [DeliveryCommitmentPeriodDTO])
  periods: DeliveryCommitmentPeriodDTO[];
  @Field(() => [DeliveryCommitmentLineDTO]) lines: DeliveryCommitmentLineDTO[];
  @Field(() => [DeliveryCommitmentAllocationDTO])
  allocations: DeliveryCommitmentAllocationDTO[];
  @Field(() => [DeliveryCommitmentTaskOptionDTO])
  taskOptions: DeliveryCommitmentTaskOptionDTO[];
  @Field() moreTaskOptions: boolean;
  @Field(() => [DeliveryCommitmentEventDTO])
  history: DeliveryCommitmentEventDTO[];
  @Field(() => String, { nullable: true }) nextAllocationCursor: string | null;
  @Field(() => String, { nullable: true }) nextHistoryCursor: string | null;
}

@ObjectType('DeliveryCommitmentEngagement')
export class DeliveryCommitmentEngagementDTO {
  @Field(() => ID) id: string;
  @Field() name: string;
  @Field(() => ID) projectId: string;
  @Field() billing: string;
}

@ObjectType('DeliveryCommitmentEngagements')
export class DeliveryCommitmentEngagementsDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field(() => [DeliveryCommitmentEngagementDTO])
  engagements: DeliveryCommitmentEngagementDTO[];
}
