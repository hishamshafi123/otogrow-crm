import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';

export type FounderDomain =
  | 'DELIVERY'
  | 'COMMITMENTS'
  | 'FINANCE'
  | 'CAMPAIGNS'
  | 'MANUAL_RISKS';
export type FounderSourceType =
  | 'TASK'
  | 'COMMITMENT'
  | 'FORECAST_ITEM'
  | 'FORECAST_SOURCE'
  | 'FORECAST_ANCHOR'
  | 'MONTHLY_RESULT'
  | 'MANUAL_REPORT'
  | 'META_REPORT'
  | 'CAMPAIGN_SETUP'
  | 'MANUAL_RISK';
export type FounderActionType =
  | 'TASK'
  | 'COMMITMENT'
  | 'FORECAST'
  | 'MONTHLY'
  | 'MANUAL_REPORT'
  | 'META_REPORT'
  | 'READINESS';

@InputType('DeliveryFounderExceptionsInput')
export class DeliveryFounderExceptionsInput {
  @Field(() => String, { nullable: true }) domain?: string;
  @Field(() => ID, { nullable: true }) projectId?: string;
  @Field(() => ID, { nullable: true }) ownerId?: string;
  @Field(() => String, { nullable: true }) currency?: string;
  @Field(() => String, { nullable: true }) serviceMonth?: string;
  @Field(() => String, { nullable: true }) after?: string;
  @Field(() => Int, { nullable: true }) limit?: number;
}

@ObjectType('DeliveryFounderOption')
export class DeliveryFounderOptionDTO {
  @Field(() => ID) id: string;
  @Field() name: string;
}

@ObjectType('DeliveryFounderCoverage')
export class DeliveryFounderCoverageDTO {
  @Field(() => String) domain: FounderDomain;
  @Field() status: string;
  @Field(() => [String]) codes: string[];
}

@ObjectType('DeliveryFounderCount')
export class DeliveryFounderCountDTO {
  @Field(() => String) domain: FounderDomain;
  @Field(() => Int) count: number;
}

@ObjectType('DeliveryFounderEvidence')
export class DeliveryFounderEvidenceDTO {
  @Field(() => String, { nullable: true }) state: string | null;
  @Field(() => String, { nullable: true }) date: string | null;
  @Field(() => String, { nullable: true }) timezone: string | null;
  @Field(() => String, { nullable: true }) currency: string | null;
  @Field(() => String, { nullable: true }) amountMicros: string | null;
  @Field(() => String, { nullable: true }) revenueMicros: string | null;
  @Field(() => String, { nullable: true }) costMicros: string | null;
  @Field(() => String, { nullable: true }) resultMicros: string | null;
  @Field(() => Int, { nullable: true }) promisedQuantity: number | null;
  @Field(() => Int, { nullable: true }) fulfilledQuantity: number | null;
  @Field(() => Int, { nullable: true }) remainingQuantity: number | null;
  @Field(() => String, { nullable: true }) reviewSubmittedAt: string | null;
  @Field(() => Int, { nullable: true }) reviewSubmissionVersion: number | null;
  @Field(() => Int, { nullable: true }) reviewAssignmentRevision: number | null;
  @Field(() => [String]) warnings: string[];
}

@ObjectType('DeliveryFounderAction')
export class DeliveryFounderActionDTO {
  @Field() code: string;
  @Field(() => String) targetType: FounderActionType;
  @Field(() => ID, { nullable: true }) targetId: string | null;
  @Field(() => ID, { nullable: true }) engagementId: string | null;
  @Field(() => ID, { nullable: true }) periodId: string | null;
  @Field(() => String, { nullable: true }) currency: string | null;
  @Field(() => String, { nullable: true }) serviceMonth: string | null;
  @Field(() => String, { nullable: true }) sourceKind: string | null;
  @Field(() => Int, { nullable: true }) submissionVersion: number | null;
}

@ObjectType('DeliveryFounderException')
export class DeliveryFounderExceptionDTO {
  @Field() key: string;
  @Field(() => String) domain: FounderDomain;
  @Field() reasonCode: string;
  @Field(() => String) sourceType: FounderSourceType;
  @Field(() => ID, { nullable: true }) sourceId: string | null;
  @Field(() => String, { nullable: true }) sourceRevision: string | null;
  @Field(() => ID, { nullable: true }) projectId: string | null;
  @Field(() => String, { nullable: true }) projectName: string | null;
  @Field() title: string;
  @Field(() => String, { nullable: true }) occurredAt: string | null;
  @Field(() => String, { nullable: true }) dueAt: string | null;
  @Field(() => ID, { nullable: true }) ownerId: string | null;
  @Field(() => String, { nullable: true }) ownerName: string | null;
  @Field() ownerState: string;
  @Field(() => DeliveryFounderEvidenceDTO) evidence: DeliveryFounderEvidenceDTO;
  @Field(() => DeliveryFounderActionDTO) nextAction: DeliveryFounderActionDTO;
}

@ObjectType('DeliveryFounderExceptionsSnapshot')
export class DeliveryFounderExceptionsSnapshotDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field() observedAt: string;
  @Field() canReadFinance: boolean;
  @Field(() => [DeliveryFounderOptionDTO]) projects: DeliveryFounderOptionDTO[];
  @Field(() => [DeliveryFounderOptionDTO]) owners: DeliveryFounderOptionDTO[];
  @Field(() => [DeliveryFounderCoverageDTO])
  coverage: DeliveryFounderCoverageDTO[];
  @Field(() => [DeliveryFounderCountDTO]) counts: DeliveryFounderCountDTO[];
  @Field(() => Int) totalCount: number;
  @Field(() => [DeliveryFounderExceptionDTO])
  items: DeliveryFounderExceptionDTO[];
  @Field(() => String, { nullable: true }) nextCursor: string | null;
}
