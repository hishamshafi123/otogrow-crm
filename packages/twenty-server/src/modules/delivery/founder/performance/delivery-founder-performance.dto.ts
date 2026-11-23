import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';

@InputType('DeliveryFounderPerformanceInput')
export class DeliveryFounderPerformanceInput {
  @Field() month: string;
  @Field() timezone: string;
  @Field(() => String, { nullable: true }) currency?: string | null;
  @Field(() => ID, { nullable: true }) afterProjectId?: string | null;
  @Field(() => ID, { nullable: true }) afterMemberId?: string | null;
}

@ObjectType('DeliveryFounderPerformanceOption')
export class DeliveryFounderPerformanceOptionDTO {
  @Field(() => ID) id: string;
  @Field() name: string;
}

@ObjectType('DeliveryFounderPerformanceMoney')
export class DeliveryFounderPerformanceMoneyDTO {
  @Field() currency: string;
  @Field() amountMicros: string;
}

@ObjectType('DeliveryFounderPerformanceOperations')
export class DeliveryFounderPerformanceOperationsDTO {
  @Field(() => Int) openTaskCount: number;
  @Field(() => Int) overdueTaskCount: number;
  @Field(() => Int) blockedTaskCount: number;
  @Field(() => Int) waitingReviewCount: number;
  @Field(() => Int) approvedTaskCount: number;
  @Field(() => Int) dueTaskCount: number;
  @Field(() => Int) onTimeApprovedTaskCount: number;
  @Field(() => Int) reviewedTaskCount: number;
  @Field(() => Int) firstPassApprovedTaskCount: number;
  @Field(() => Int) revisionCount: number;
  @Field(() => Int) internalRevisionCount: number;
}

@ObjectType('DeliveryFounderPerformanceCurrency')
export class DeliveryFounderPerformanceCurrencyDTO {
  @Field() currency: string;
  @Field() revenueMicros: string;
  @Field() costMicros: string;
  @Field() resultMicros: string;
  @Field() previousRevenueMicros: string;
  @Field() previousCostMicros: string;
  @Field() previousResultMicros: string;
  @Field() salaryCostMicros: string;
  @Field() overheadCostMicros: string;
  @Field() aiCostMicros: string;
  @Field() otherCostMicros: string;
  @Field() unassignedRevenueMicros: string;
  @Field() unassignedCostMicros: string;
  @Field() cashCollectedMicros: string;
  @Field() receivablesMicros: string;
  @Field() overdueReceivablesMicros: string;
  @Field(() => Int) draftEntryCount: number;
  @Field(() => Int) postedEntryCount: number;
  @Field() periodStatus: string;
  @Field() financeComplete: boolean;
  @Field() cashReportingConfirmed: boolean;
  @Field() cashComplete: boolean;
}

@ObjectType('DeliveryFounderPerformanceClientFinance')
export class DeliveryFounderPerformanceClientFinanceDTO {
  @Field() currency: string;
  @Field() revenueMicros: string;
  @Field() costMicros: string;
  @Field() resultMicros: string;
  @Field() previousRevenueMicros: string;
  @Field() previousCostMicros: string;
  @Field() previousResultMicros: string;
  @Field() salaryCostMicros: string;
  @Field() cashCollectedMicros: string;
  @Field() receivablesMicros: string;
}

@ObjectType('DeliveryFounderPerformanceClient')
export class DeliveryFounderPerformanceClientDTO {
  @Field(() => ID) projectId: string;
  @Field() projectName: string;
  @Field(() => ID, { nullable: true }) companyId: string | null;
  @Field(() => Int) teamCount: number;
  @Field(() => DeliveryFounderPerformanceOperationsDTO)
  operations: DeliveryFounderPerformanceOperationsDTO;
  @Field(() => [DeliveryFounderPerformanceClientFinanceDTO])
  finance: DeliveryFounderPerformanceClientFinanceDTO[];
}

@ObjectType('DeliveryFounderPerformanceEmployee')
export class DeliveryFounderPerformanceEmployeeDTO {
  @Field(() => ID) memberId: string;
  @Field() name: string;
  @Field() roleLabel: string;
  @Field(() => Int) clientCount: number;
  @Field(() => DeliveryFounderPerformanceOperationsDTO)
  operations: DeliveryFounderPerformanceOperationsDTO;
  @Field(() => [DeliveryFounderPerformanceMoneyDTO])
  salaryCosts: DeliveryFounderPerformanceMoneyDTO[];
}

@ObjectType('DeliveryFounderPerformanceSnapshot')
export class DeliveryFounderPerformanceSnapshotDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field() observedAt: string;
  @Field() month: string;
  @Field() previousMonth: string;
  @Field() timezone: string;
  @Field(() => String, { nullable: true }) currency: string | null;
  @Field() canReadFinance: boolean;
  @Field(() => [DeliveryFounderPerformanceOptionDTO])
  projects: DeliveryFounderPerformanceOptionDTO[];
  @Field(() => DeliveryFounderPerformanceOperationsDTO)
  operations: DeliveryFounderPerformanceOperationsDTO;
  @Field(() => [DeliveryFounderPerformanceCurrencyDTO])
  currencies: DeliveryFounderPerformanceCurrencyDTO[];
  @Field(() => [DeliveryFounderPerformanceClientDTO])
  clients: DeliveryFounderPerformanceClientDTO[];
  @Field(() => Int) clientTotal: number;
  @Field(() => ID, { nullable: true }) nextProjectId: string | null;
  @Field(() => [DeliveryFounderPerformanceEmployeeDTO])
  employees: DeliveryFounderPerformanceEmployeeDTO[];
  @Field(() => Int) employeeTotal: number;
  @Field(() => ID, { nullable: true }) nextMemberId: string | null;
  @Field(() => [String]) warnings: string[];
}
