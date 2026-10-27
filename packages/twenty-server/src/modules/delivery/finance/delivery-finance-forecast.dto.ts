import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('DeliveryFinanceForecastAnchor')
export class DeliveryFinanceForecastAnchorDTO {
  @Field(() => ID) id: string;
  @Field(() => Int) revision: number;
  @Field() currency: string;
  @Field() amountMicros: string;
  @Field() closingDate: string;
  @Field() timezone: string;
  @Field() note: string;
  @Field(() => String, { nullable: true }) evidenceUrl: string | null;
  @Field(() => ID) changedBy: string;
  @Field() changedByName: string;
  @Field() changedAt: string;
}

@ObjectType('DeliveryFinanceForecastOwner')
export class DeliveryFinanceForecastOwnerDTO {
  @Field(() => ID) id: string;
  @Field() name: string;
}

@ObjectType('DeliveryFinanceForecastItem')
export class DeliveryFinanceForecastItemDTO {
  @Field(() => ID) id: string;
  @Field(() => Int) revision: number;
  @Field() status: string;
  @Field() kind: string;
  @Field() sourceType: string;
  @Field(() => ID, { nullable: true }) sourceId: string | null;
  @Field(() => String, { nullable: true }) planMonth: string | null;
  @Field() title: string;
  @Field() currency: string;
  @Field() amountMicros: string;
  @Field(() => String, { nullable: true }) remainingMicros: string | null;
  @Field() appliedMicros: string;
  @Field(() => String, { nullable: true }) expectedDate: string | null;
  @Field(() => String, { nullable: true }) contractualDueDate: string | null;
  @Field(() => ID) ownerId: string;
  @Field() ownerName: string;
  @Field() ownerEligible: boolean;
  @Field() nextActionDate: string;
  @Field() note: string;
  @Field(() => String, { nullable: true }) sourceReviewToken: string | null;
  @Field() reviewToken: string;
  @Field() eligible: boolean;
  @Field(() => [String]) warnings: string[];
  @Field() changedAt: string;
  @Field() changedByName: string;
}

@ObjectType('DeliveryFinanceForecastRealization')
export class DeliveryFinanceForecastRealizationDTO {
  @Field(() => ID) id: string;
  @Field(() => Int) revision: number;
  @Field(() => ID) itemId: string;
  @Field(() => ID) cashId: string;
  @Field() cashTitle: string;
  @Field() targetTitle: string;
  @Field() currency: string;
  @Field() amountMicros: string;
  @Field() status: string;
  @Field() note: string;
  @Field() createdAt: string;
  @Field() createdByName: string;
  @Field(() => String, { nullable: true }) reversedAt: string | null;
  @Field(() => String, { nullable: true }) reversedByName: string | null;
  @Field(() => String, { nullable: true }) reversalReason: string | null;
}

@ObjectType('DeliveryFinanceForecastException')
export class DeliveryFinanceForecastExceptionDTO {
  @Field() key: string;
  @Field() code: string;
  @Field(() => String, { nullable: true }) sourceType: string | null;
  @Field(() => ID, { nullable: true }) itemId: string | null;
  @Field(() => ID, { nullable: true }) sourceId: string | null;
  @Field(() => String, { nullable: true }) title: string | null;
  @Field(() => String, { nullable: true }) date: string | null;
  @Field(() => String, { nullable: true }) amountMicros: string | null;
}

@ObjectType('DeliveryFinanceForecastDay')
export class DeliveryFinanceForecastDayDTO {
  @Field() date: string;
  @Field() inflowMicros: string;
  @Field() outflowMicros: string;
  @Field() closingMicros: string;
  @Field(() => [ID]) itemIds: string[];
}

@ObjectType('DeliveryFinanceForecastSnapshot')
export class DeliveryFinanceForecastSnapshotDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field() canManage: boolean;
  @Field() currency: string;
  @Field(() => Int) horizonDays: number;
  @Field(() => String, { nullable: true }) businessDate: string | null;
  @Field(() => String, { nullable: true }) timezone: string | null;
  @Field(() => DeliveryFinanceForecastAnchorDTO, { nullable: true })
  anchor: DeliveryFinanceForecastAnchorDTO | null;
  @Field(() => String, { nullable: true }) actualInflowMicros: string | null;
  @Field(() => String, { nullable: true }) actualOutflowMicros: string | null;
  @Field(() => String, { nullable: true }) currentCashMicros: string | null;
  @Field(() => String, { nullable: true }) expectedInflowMicros: string | null;
  @Field(() => String, { nullable: true }) expectedOutflowMicros: string | null;
  @Field(() => String, { nullable: true }) endingCashMicros: string | null;
  @Field(() => String, { nullable: true }) firstNegativeDate: string | null;
  @Field() knownUnscheduledInflowMicros: string;
  @Field() knownUnscheduledOutflowMicros: string;
  @Field(() => Int) unknownCollectionCount: number;
  @Field() unappliedActualOutflowMicros: string;
  @Field() projectionComplete: boolean;
  @Field(() => [String]) warnings: string[];
  @Field(() => [DeliveryFinanceForecastOwnerDTO])
  owners: DeliveryFinanceForecastOwnerDTO[];
  @Field(() => [DeliveryFinanceForecastItemDTO])
  items: DeliveryFinanceForecastItemDTO[];
  @Field(() => Int) itemCount: number;
  @Field(() => ID, { nullable: true }) nextItemId: string | null;
  @Field(() => DeliveryFinanceForecastItemDTO, { nullable: true })
  selectedItem: DeliveryFinanceForecastItemDTO | null;
  @Field(() => [DeliveryFinanceForecastRealizationDTO])
  realizations: DeliveryFinanceForecastRealizationDTO[];
  @Field(() => ID, { nullable: true }) nextRealizationId: string | null;
  @Field(() => [DeliveryFinanceForecastExceptionDTO])
  exceptions: DeliveryFinanceForecastExceptionDTO[];
  @Field(() => Int) exceptionCount: number;
  @Field(() => String, { nullable: true }) nextExceptionKey: string | null;
  @Field(() => [DeliveryFinanceForecastDayDTO])
  timeline: DeliveryFinanceForecastDayDTO[];
}

@ObjectType('DeliveryFinanceForecastSource')
export class DeliveryFinanceForecastSourceDTO {
  @Field(() => ID) id: string;
  @Field() sourceType: string;
  @Field() title: string;
  @Field() category: string;
  @Field() currency: string;
  @Field(() => String, { nullable: true }) date: string | null;
  @Field(() => String, { nullable: true }) dueDate: string | null;
  @Field(() => ID, { nullable: true }) projectId: string | null;
  @Field(() => String, { nullable: true }) projectName: string | null;
  @Field(() => String, { nullable: true }) amountMicros: string | null;
  @Field(() => String, { nullable: true }) remainingMicros: string | null;
  @Field(() => String, { nullable: true }) planMonth: string | null;
  @Field(() => String, { nullable: true }) suggestedDate: string | null;
  @Field(() => ID, { nullable: true }) occurrenceItemId: string | null;
  @Field() sourceReviewToken: string;
  @Field() eligible: boolean;
  @Field(() => [String]) warnings: string[];
}

@ObjectType('DeliveryFinanceForecastSources')
export class DeliveryFinanceForecastSourcesDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field() canManage: boolean;
  @Field() currency: string;
  @Field() kind: string;
  @Field(() => [DeliveryFinanceForecastSourceDTO])
  sources: DeliveryFinanceForecastSourceDTO[];
  @Field(() => ID, { nullable: true }) nextId: string | null;
  @Field(() => DeliveryFinanceForecastSourceDTO, { nullable: true })
  selectedSource: DeliveryFinanceForecastSourceDTO | null;
}

@ObjectType('DeliveryFinanceForecastAnchorResult')
export class DeliveryFinanceForecastAnchorResultDTO {
  @Field(() => DeliveryFinanceForecastAnchorDTO)
  anchor: DeliveryFinanceForecastAnchorDTO;
  @Field() replayed: boolean;
}
@ObjectType('DeliveryFinanceForecastItemResult')
export class DeliveryFinanceForecastItemResultDTO {
  @Field(() => DeliveryFinanceForecastItemDTO)
  item: DeliveryFinanceForecastItemDTO;
  @Field() replayed: boolean;
}
@ObjectType('DeliveryFinanceForecastRealizationResult')
export class DeliveryFinanceForecastRealizationResultDTO {
  @Field(() => DeliveryFinanceForecastRealizationDTO)
  realization: DeliveryFinanceForecastRealizationDTO;
  @Field() replayed: boolean;
}

@ObjectType('DeliveryFinanceForecastEvent')
export class DeliveryFinanceForecastEventDTO {
  @Field(() => ID) id: string;
  @Field() sourceType: string;
  @Field(() => ID) sourceId: string;
  @Field() action: string;
  @Field(() => Int) revision: number;
  @Field() actorName: string;
  @Field(() => ID) actorId: string;
  @Field() createdAt: string;
  @Field() reason: string;
  @Field(() => String, { nullable: true }) beforeStatus: string | null;
  @Field(() => String, { nullable: true }) afterStatus: string | null;
  @Field(() => String, { nullable: true }) currency: string | null;
  @Field(() => String, { nullable: true }) amountMicros: string | null;
  @Field(() => String, { nullable: true }) date: string | null;
  @Field(() => String, { nullable: true }) title: string | null;
  @Field(() => String, { nullable: true }) ownerName: string | null;
  @Field(() => String, { nullable: true }) note: string | null;
  @Field(() => String, { nullable: true }) timezone: string | null;
  @Field(() => String, { nullable: true }) evidenceUrl: string | null;
  @Field(() => String, { nullable: true }) originSourceType: string | null;
  @Field(() => ID, { nullable: true }) originSourceId: string | null;
  @Field(() => String, { nullable: true }) planMonth: string | null;
  @Field(() => Int, { nullable: true }) sourceRevision: number | null;
  @Field(() => String, { nullable: true }) sourceAmountMicros: string | null;
  @Field(() => ID, { nullable: true }) cashId: string | null;
  @Field(() => ID, { nullable: true }) itemId: string | null;
  @Field(() => String, { nullable: true }) cashDate: string | null;
  @Field(() => String, { nullable: true }) reversedAt: string | null;
}
@ObjectType('DeliveryFinanceForecastHistory')
export class DeliveryFinanceForecastHistoryDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field(() => [DeliveryFinanceForecastEventDTO])
  events: DeliveryFinanceForecastEventDTO[];
  @Field(() => ID, { nullable: true }) nextBeforeId: string | null;
}

@InputType('DeliveryFinanceForecastInput')
export class DeliveryFinanceForecastInput {
  @Field() currency: string;
  @Field(() => Int) horizonDays: number;
  @Field(() => ID, { nullable: true }) afterItemId?: string | null;
  @Field(() => ID, { nullable: true }) selectedItemId?: string | null;
  @Field(() => String, { nullable: true }) afterExceptionKey?: string | null;
  @Field(() => ID, { nullable: true }) afterRealizationId?: string | null;
}
@InputType('DeliveryFinanceForecastSourcesInput')
export class DeliveryFinanceForecastSourcesInput {
  @Field() currency: string;
  @Field() kind: string;
  @Field(() => String, { nullable: true }) month?: string | null;
  @Field(() => ID, { nullable: true }) afterId?: string | null;
  @Field(() => ID, { nullable: true }) selectedId?: string | null;
}
@InputType('DeliveryFinanceForecastAnchorInput')
export class DeliveryFinanceForecastAnchorInput {
  @Field(() => ID) id: string;
  @Field(() => Int) revision: number;
  @Field() currency: string;
  @Field() amountMicros: string;
  @Field() closingDate: string;
  @Field() timezone: string;
  @Field() note: string;
  @Field(() => String, { nullable: true }) evidenceUrl?: string | null;
  @Field() acknowledgeCoverage: boolean;
  @Field() reason: string;
}
@InputType('DeliveryFinanceForecastItemInput')
export class DeliveryFinanceForecastItemInput {
  @Field(() => ID) commandId: string;
  @Field(() => ID) id: string;
  @Field(() => Int) revision: number;
  @Field() status: string;
  @Field() sourceType: string;
  @Field(() => ID, { nullable: true }) sourceId?: string | null;
  @Field(() => String, { nullable: true }) planMonth?: string | null;
  @Field() currency: string;
  @Field() title: string;
  @Field() amountMicros: string;
  @Field(() => String, { nullable: true }) expectedDate?: string | null;
  @Field(() => ID) ownerId: string;
  @Field() nextActionDate: string;
  @Field() note: string;
  @Field(() => String, { nullable: true }) expectedSourceReviewToken?:
    | string
    | null;
  @Field() acknowledgeSourceWarnings: boolean;
  @Field() reason: string;
}
@InputType('DeliveryFinanceForecastRealizeInput')
export class DeliveryFinanceForecastRealizeInput {
  @Field(() => ID) id: string;
  @Field(() => ID) itemId: string;
  @Field(() => ID) cashId: string;
  @Field() amountMicros: string;
  @Field() expectedCashReviewToken: string;
  @Field() expectedItemReviewToken: string;
  @Field() note: string;
}
@InputType('DeliveryFinanceForecastReverseInput')
export class DeliveryFinanceForecastReverseInput {
  @Field(() => ID) id: string;
  @Field(() => Int) revision: number;
  @Field() reason: string;
}
@InputType('DeliveryFinanceForecastHistoryInput')
export class DeliveryFinanceForecastHistoryInput {
  @Field() sourceType: string;
  @Field(() => ID) sourceId: string;
  @Field(() => ID, { nullable: true }) beforeId?: string | null;
}
