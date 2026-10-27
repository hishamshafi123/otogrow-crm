import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('DeliveryFinancePeriod')
export class DeliveryFinancePeriodDTO {
  @Field(() => ID, { nullable: true }) id: string | null;
  @Field() month: string;
  @Field() status: string;
  @Field(() => Int) revision: number;
  @Field(() => ID, { nullable: true }) changedBy: string | null;
  @Field(() => String, { nullable: true }) changedByName: string | null;
  @Field(() => String, { nullable: true }) changedAt: string | null;
  @Field(() => String, { nullable: true }) reason: string | null;
}

@ObjectType('DeliveryFinancePeriodProjectSummary')
export class DeliveryFinancePeriodProjectSummaryDTO {
  @Field(() => ID, { nullable: true }) projectId: string | null;
  @Field(() => String, { nullable: true }) projectName: string | null;
  @Field() revenueMicros: string;
  @Field() costMicros: string;
  @Field() resultMicros: string;
  @Field(() => Int) postedCount: number;
}

@ObjectType('DeliveryFinancePeriodCurrencySummary')
export class DeliveryFinancePeriodCurrencySummaryDTO {
  @Field() currency: string;
  @Field() revenueMicros: string;
  @Field() costMicros: string;
  @Field() resultMicros: string;
  @Field(() => Int) draftCount: number;
  @Field(() => Int) postedCount: number;
  @Field(() => Int) voidCount: number;
  @Field(() => [DeliveryFinancePeriodProjectSummaryDTO])
  projects: DeliveryFinancePeriodProjectSummaryDTO[];
}

@ObjectType('DeliveryFinancePeriodBlocker')
export class DeliveryFinancePeriodBlockerDTO {
  @Field(() => ID) entryId: string;
  @Field() month: string;
  @Field() title: string;
  @Field() sourceType: string;
  @Field() reason: string;
}

@ObjectType('DeliveryFinancePeriodSnapshot')
export class DeliveryFinancePeriodSnapshotDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field() canManage: boolean;
  @Field(() => DeliveryFinancePeriodDTO) period: DeliveryFinancePeriodDTO;
  @Field(() => [DeliveryFinancePeriodCurrencySummaryDTO])
  summaries: DeliveryFinancePeriodCurrencySummaryDTO[];
  @Field() recognitionHash: string;
  @Field() previewToken: string;
  @Field(() => Int) blockerCount: number;
  @Field(() => [DeliveryFinancePeriodBlockerDTO])
  blockers: DeliveryFinancePeriodBlockerDTO[];
  @Field(() => ID, { nullable: true }) nextBlockerId: string | null;
  @Field(() => [String]) limitations: string[];
  @Field() canLock: boolean;
  @Field() canReopen: boolean;
}

@ObjectType('DeliveryFinancePeriodChangeResult')
export class DeliveryFinancePeriodChangeResultDTO {
  @Field(() => DeliveryFinancePeriodDTO) period: DeliveryFinancePeriodDTO;
  @Field() replayed: boolean;
}

@ObjectType('DeliveryFinancePeriodEvent')
export class DeliveryFinancePeriodEventDTO {
  @Field(() => ID) id: string;
  @Field() action: string;
  @Field() beforeStatus: string;
  @Field() afterStatus: string;
  @Field(() => Int) revision: number;
  @Field() reason: string;
  @Field(() => ID) actorId: string;
  @Field() actorName: string;
  @Field() createdAt: string;
  @Field() recognitionHash: string;
  @Field(() => [DeliveryFinancePeriodCurrencySummaryDTO])
  summaries: DeliveryFinancePeriodCurrencySummaryDTO[];
}

@ObjectType('DeliveryFinancePeriodHistory')
export class DeliveryFinancePeriodHistoryDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field() month: string;
  @Field(() => [DeliveryFinancePeriodEventDTO])
  events: DeliveryFinancePeriodEventDTO[];
  @Field(() => ID, { nullable: true }) nextBeforeId: string | null;
}

@InputType('DeliveryFinancePeriodInput')
export class DeliveryFinancePeriodInput {
  @Field() month: string;
  @Field(() => ID, { nullable: true }) afterBlockerId?: string | null;
}

@InputType('DeliveryFinancePeriodChangeInput')
export class DeliveryFinancePeriodChangeInput {
  @Field(() => ID) id: string;
  @Field() month: string;
  @Field(() => Int) revision: number;
  @Field() expectedPreviewToken: string;
  @Field() status: string;
  @Field() reason: string;
  @Field() acknowledgeLimitations: boolean;
}

@InputType('DeliveryFinancePeriodHistoryInput')
export class DeliveryFinancePeriodHistoryInput {
  @Field() month: string;
  @Field(() => ID, { nullable: true }) beforeId?: string | null;
}
