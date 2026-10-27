import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';
import { DeliveryFinanceAiCostOriginDTO } from 'src/modules/delivery/finance/delivery-finance-ai-cost-origin.dto';
import { DeliveryFinancePeriodDTO } from 'src/modules/delivery/finance/delivery-finance-period.dto';

@InputType('DeliveryFinanceInput')
export class DeliveryFinanceInput {
  @Field() month: string;
  @Field(() => String, { nullable: true }) currency?: string | null;
  @Field(() => ID, { nullable: true }) afterPlanId?: string | null;
  @Field(() => ID, { nullable: true }) afterEntryId?: string | null;
  @Field(() => ID, { nullable: true }) selectedPlanId?: string | null;
  @Field(() => ID, { nullable: true }) selectedEntryId?: string | null;
}

@InputType('DeliveryFinancePlanInput')
export class DeliveryFinancePlanInput {
  @Field(() => ID) id: string;
  @Field(() => Int) revision: number;
  @Field() type: string;
  @Field() name: string;
  @Field() currency: string;
  @Field() monthlyAmountMicros: string;
  @Field(() => ID, { nullable: true }) memberId?: string | null;
  @Field() startMonth: string;
  @Field(() => String, { nullable: true }) endMonth?: string | null;
  @Field(() => Int) dueDay: number;
  @Field() active: boolean;
}

@InputType('DeliveryFinanceAllocationInput')
export class DeliveryFinanceAllocationInput {
  @Field(() => ID, { nullable: true }) projectId?: string | null;
  @Field() amountMicros: string;
}

@InputType('DeliveryFinanceEntryInput')
export class DeliveryFinanceEntryInput {
  @Field(() => ID) id: string;
  @Field(() => Int) revision: number;
  @Field() month: string;
  @Field() kind: string;
  @Field() category: string;
  @Field() title: string;
  @Field() currency: string;
  @Field() amountMicros: string;
  @Field() note: string;
  @Field(() => String, { nullable: true }) evidenceUrl?: string | null;
  @Field(() => [DeliveryFinanceAllocationInput])
  allocations: DeliveryFinanceAllocationInput[];
}

@InputType('DeliveryFinancePostInput')
export class DeliveryFinancePostInput {
  @Field(() => ID) id: string;
  @Field(() => Int) revision: number;
  @Field(() => Boolean, { nullable: true }) acknowledgeSourceWarnings?: boolean;
  @Field(() => String, { nullable: true }) expectedSourceReviewToken?:
    | string
    | null;
}

@InputType('DeliveryFinanceVoidInput')
export class DeliveryFinanceVoidInput {
  @Field(() => ID) id: string;
  @Field(() => Int) revision: number;
  @Field() reason: string;
}

@InputType('DeliveryFinancePrepareInput')
export class DeliveryFinancePrepareInput {
  @Field() month: string;
  @Field(() => String, { nullable: true }) currency?: string | null;
  @Field(() => ID, { nullable: true }) afterPlanId?: string | null;
}

@InputType('DeliveryFinanceHistoryInput')
export class DeliveryFinanceHistoryInput {
  @Field(() => ID) entryId: string;
  @Field(() => ID, { nullable: true }) beforeId?: string | null;
}

@ObjectType('DeliveryFinancePerson')
export class DeliveryFinancePersonDTO {
  @Field(() => ID) id: string;
  @Field() name: string;
}

@ObjectType('DeliveryFinanceProject')
export class DeliveryFinanceProjectDTO {
  @Field(() => ID) id: string;
  @Field() name: string;
}

@ObjectType('DeliveryFinancePlan')
export class DeliveryFinancePlanDTO {
  @Field(() => ID) id: string;
  @Field(() => Int) revision: number;
  @Field() type: string;
  @Field() name: string;
  @Field() currency: string;
  @Field() monthlyAmountMicros: string;
  @Field(() => ID, { nullable: true }) memberId: string | null;
  @Field(() => String, { nullable: true }) memberName: string | null;
  @Field(() => Boolean, { nullable: true }) memberActive: boolean | null;
  @Field() startMonth: string;
  @Field(() => String, { nullable: true }) endMonth: string | null;
  @Field(() => Int) dueDay: number;
  @Field() active: boolean;
  @Field() createdAt: string;
  @Field() updatedAt: string;
}

@ObjectType('DeliveryFinancePlanSource')
export class DeliveryFinancePlanSourceDTO {
  @Field(() => ID) planId: string;
  @Field(() => Int) revision: number;
  @Field() type: string;
  @Field() name: string;
  @Field(() => ID, { nullable: true }) memberId: string | null;
  @Field(() => String, { nullable: true }) memberName: string | null;
  @Field() monthlyAmountMicros: string;
  @Field() startMonth: string;
  @Field(() => String, { nullable: true }) endMonth: string | null;
  @Field(() => Int) dueDay: number;
}

@ObjectType('DeliveryFinanceAllocation')
export class DeliveryFinanceAllocationDTO {
  @Field(() => ID, { nullable: true }) projectId: string | null;
  @Field(() => String, { nullable: true }) projectName: string | null;
  @Field() amountMicros: string;
}

@ObjectType('DeliveryFinanceEntry')
export class DeliveryFinanceEntryDTO {
  @Field(() => [String]) lockedMonths: string[];
  @Field(() => DeliveryFinanceAiCostOriginDTO, { nullable: true })
  sourceAiSpend: DeliveryFinanceAiCostOriginDTO | null;
  @Field(() => ID) id: string;
  @Field(() => Int) revision: number;
  @Field() month: string;
  @Field() kind: string;
  @Field() category: string;
  @Field() title: string;
  @Field() currency: string;
  @Field() amountMicros: string;
  @Field() note: string;
  @Field(() => String, { nullable: true }) evidenceUrl: string | null;
  @Field() status: string;
  @Field() sourceType: string;
  @Field(() => DeliveryFinancePlanSourceDTO, { nullable: true })
  sourcePlan: DeliveryFinancePlanSourceDTO | null;
  @Field(() => [String]) sourceWarnings: string[];
  @Field(() => String, { nullable: true }) sourceReviewToken: string | null;
  @Field(() => String, { nullable: true }) dueDate: string | null;
  @Field() remainingAllocationMicros: string;
  @Field(() => [DeliveryFinanceAllocationDTO])
  allocations: DeliveryFinanceAllocationDTO[];
  @Field(() => ID) createdBy: string;
  @Field() createdAt: string;
  @Field() updatedAt: string;
  @Field(() => String, { nullable: true }) postedAt: string | null;
  @Field(() => String, { nullable: true }) voidedAt: string | null;
  @Field(() => String, { nullable: true }) voidReason: string | null;
}

@ObjectType('DeliveryFinanceProjectResult')
export class DeliveryFinanceProjectResultDTO {
  @Field(() => ID, { nullable: true }) projectId: string | null;
  @Field(() => String, { nullable: true }) projectName: string | null;
  @Field() revenueMicros: string;
  @Field() costMicros: string;
  @Field() resultMicros: string;
}

@ObjectType('DeliveryFinanceSummary')
export class DeliveryFinanceSummaryDTO {
  @Field() currency: string;
  @Field() revenueMicros: string;
  @Field() costMicros: string;
  @Field() resultMicros: string;
  @Field() unassignedRevenueMicros: string;
  @Field() unassignedCostMicros: string;
  @Field(() => Int) draftCount: number;
  @Field(() => Int) postedCount: number;
  @Field(() => Int) voidCount: number;
  @Field(() => [DeliveryFinanceProjectResultDTO])
  projects: DeliveryFinanceProjectResultDTO[];
}

@ObjectType('DeliveryFinanceSnapshot')
export class DeliveryFinanceSnapshotDTO {
  @Field(() => DeliveryFinancePeriodDTO) period: DeliveryFinancePeriodDTO;
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field() month: string;
  @Field(() => String, { nullable: true }) currency: string | null;
  @Field() canManage: boolean;
  @Field(() => [DeliveryFinancePlanDTO]) plans: DeliveryFinancePlanDTO[];
  @Field(() => [DeliveryFinanceEntryDTO]) entries: DeliveryFinanceEntryDTO[];
  @Field(() => DeliveryFinancePlanDTO, { nullable: true })
  selectedPlan: DeliveryFinancePlanDTO | null;
  @Field(() => DeliveryFinanceEntryDTO, { nullable: true })
  selectedEntry: DeliveryFinanceEntryDTO | null;
  @Field(() => Int) planTotal: number;
  @Field(() => Int) entryTotal: number;
  @Field(() => ID, { nullable: true }) nextPlanId: string | null;
  @Field(() => ID, { nullable: true }) nextEntryId: string | null;
  @Field(() => [DeliveryFinanceSummaryDTO])
  summaries: DeliveryFinanceSummaryDTO[];
  @Field(() => [DeliveryFinanceProjectDTO])
  projects: DeliveryFinanceProjectDTO[];
  @Field(() => [DeliveryFinancePersonDTO]) members: DeliveryFinancePersonDTO[];
}

@ObjectType('DeliveryFinancePrepareSkipped')
export class DeliveryFinancePrepareSkippedDTO {
  @Field(() => ID) planId: string;
  @Field() reason: string;
}

@ObjectType('DeliveryFinancePreparation')
export class DeliveryFinancePreparationDTO {
  @Field(() => Int) createdCount: number;
  @Field(() => Int) existingCount: number;
  @Field(() => [DeliveryFinancePrepareSkippedDTO])
  skipped: DeliveryFinancePrepareSkippedDTO[];
  @Field(() => ID, { nullable: true }) nextPlanId: string | null;
}

@ObjectType('DeliveryFinanceEvent')
export class DeliveryFinanceEventDTO {
  @Field(() => ID) id: string;
  @Field(() => ID) actorId: string;
  @Field() actorName: string;
  @Field() action: string;
  @Field(() => Int) revision: number;
  @Field() reason: string;
  @Field() createdAt: string;
  @Field(() => String, { nullable: true }) beforeAmountMicros: string | null;
  @Field(() => String, { nullable: true }) afterAmountMicros: string | null;
  @Field(() => String, { nullable: true }) beforeStatus: string | null;
  @Field(() => String, { nullable: true }) afterStatus: string | null;
}

@ObjectType('DeliveryFinanceHistory')
export class DeliveryFinanceHistoryDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field(() => ID) entryId: string;
  @Field(() => [DeliveryFinanceEventDTO]) events: DeliveryFinanceEventDTO[];
  @Field(() => ID, { nullable: true }) nextBeforeId: string | null;
}
