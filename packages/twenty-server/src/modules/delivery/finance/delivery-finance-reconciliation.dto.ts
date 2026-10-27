import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';
import { DeliveryFinanceProjectDTO } from 'src/modules/delivery/finance/delivery-finance.dto';

@InputType('DeliveryFinancePaymentsInput')
export class DeliveryFinancePaymentsInput {
  @Field(() => String, { nullable: true }) currency?: string | null;
  @Field(() => ID, { nullable: true }) afterCashId?: string | null;
  @Field(() => ID, { nullable: true }) afterReceivableId?: string | null;
  @Field(() => ID, { nullable: true }) afterEntryId?: string | null;
  @Field(() => ID, { nullable: true }) selectedCashId?: string | null;
  @Field(() => ID, { nullable: true }) selectedReceivableId?: string | null;
  @Field(() => ID, { nullable: true }) selectedEntryId?: string | null;
  @Field(() => ID, { nullable: true }) afterSettlementId?: string | null;
  @Field(() => ID, { nullable: true }) afterMatchId?: string | null;
}
@InputType('DeliveryFinancePaymentInput')
export class DeliveryFinancePaymentInput {
  @Field(() => ID) id: string;
  @Field() title: string;
  @Field() category: string;
  @Field() currency: string;
  @Field() amountMicros: string;
  @Field() date: string;
  @Field(() => ID, { nullable: true }) projectId?: string | null;
  @Field() note: string;
  @Field(() => String, { nullable: true }) evidenceUrl?: string | null;
}
@InputType('DeliveryFinanceSettlementInput')
export class DeliveryFinanceSettlementInput {
  @Field(() => ID) id: string;
  @Field(() => ID) cashId: string;
  @Field(() => ID) receivableId: string;
  @Field() amountMicros: string;
  @Field() expectedCashToken: string;
  @Field() expectedReceivableToken: string;
  @Field(() => Boolean, { nullable: true }) acknowledgeUnassignedCash?: boolean;
}
@InputType('DeliveryFinanceCashMatchInput')
export class DeliveryFinanceCashMatchInput {
  @Field(() => ID) id: string;
  @Field(() => ID) cashId: string;
  @Field(() => ID) entryId: string;
  @Field(() => ID, { nullable: true }) projectId?: string | null;
  @Field() amountMicros: string;
  @Field() expectedCashToken: string;
  @Field() expectedEntryToken: string;
  @Field(() => Boolean, { nullable: true }) acknowledgeUnassignedCash?: boolean;
}
@InputType('DeliveryFinanceReverseRelationInput')
export class DeliveryFinanceReverseRelationInput {
  @Field(() => ID) id: string;
  @Field() kind: string;
  @Field(() => Int) revision: number;
  @Field() reason: string;
}
@ObjectType('DeliveryFinanceCashSource')
export class DeliveryFinanceCashSourceDTO {
  @Field(() => ID) id: string;
  @Field(() => Int) revision: number;
  @Field() title: string;
  @Field() category: string;
  @Field() currency: string;
  @Field() amountMicros: string;
  @Field() date: string;
  @Field(() => String, { nullable: true }) dueDate: string | null;
  @Field(() => ID, { nullable: true }) projectId: string | null;
  @Field(() => String, { nullable: true }) projectName: string | null;
  @Field() status: string;
  @Field(() => String, { nullable: true }) evidenceUrl: string | null;
  @Field() note: string;
  @Field() sourceReviewToken: string;
  @Field(() => [String]) sourceWarnings: string[];
  @Field() settledMicros: string;
  @Field() remainingSettlementMicros: string;
  @Field() matchedMicros: string;
  @Field() remainingMatchMicros: string;
  @Field() outstandingMicros: string;
}
@ObjectType('DeliveryFinanceMatchedAllocation')
export class DeliveryFinanceMatchedAllocationDTO {
  @Field(() => ID, { nullable: true }) projectId: string | null;
  @Field(() => String, { nullable: true }) projectName: string | null;
  @Field() amountMicros: string;
  @Field() matchedMicros: string;
  @Field() remainingMatchMicros: string;
}
@ObjectType('DeliveryFinanceMatchableEntry')
export class DeliveryFinanceMatchableEntryDTO {
  @Field(() => ID) id: string;
  @Field(() => Int) revision: number;
  @Field() month: string;
  @Field() title: string;
  @Field() kind: string;
  @Field() currency: string;
  @Field() status: string;
  @Field() sourceReviewToken: string;
  @Field(() => [DeliveryFinanceMatchedAllocationDTO])
  allocations: DeliveryFinanceMatchedAllocationDTO[];
}
@ObjectType('DeliveryFinanceCashRelation')
export class DeliveryFinanceCashRelationDTO {
  @Field(() => ID) id: string;
  @Field() kind: string;
  @Field(() => Int) revision: number;
  @Field(() => ID) cashId: string;
  @Field() cashTitle: string;
  @Field(() => ID, { nullable: true }) receivableId: string | null;
  @Field(() => ID, { nullable: true }) entryId: string | null;
  @Field() targetTitle: string;
  @Field(() => String, { nullable: true }) month: string | null;
  @Field(() => ID, { nullable: true }) projectId: string | null;
  @Field(() => String, { nullable: true }) projectName: string | null;
  @Field() currency: string;
  @Field() amountMicros: string;
  @Field() status: string;
  @Field() legacy: boolean;
  @Field() canReverse: boolean;
  @Field(() => ID) createdBy: string;
  @Field() createdByName: string;
  @Field() createdAt: string;
  @Field(() => ID, { nullable: true }) reversedBy: string | null;
  @Field(() => String, { nullable: true }) reversedByName: string | null;
  @Field(() => String, { nullable: true }) reversedAt: string | null;
  @Field(() => String, { nullable: true }) reversalReason: string | null;
}
@ObjectType('DeliveryFinancePaymentsSnapshot')
export class DeliveryFinancePaymentsSnapshotDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field(() => String, { nullable: true }) currency: string | null;
  @Field() canManage: boolean;
  @Field(() => [DeliveryFinanceCashSourceDTO])
  cash: DeliveryFinanceCashSourceDTO[];
  @Field(() => [DeliveryFinanceCashSourceDTO])
  receivables: DeliveryFinanceCashSourceDTO[];
  @Field(() => [DeliveryFinanceMatchableEntryDTO])
  entries: DeliveryFinanceMatchableEntryDTO[];
  @Field(() => DeliveryFinanceCashSourceDTO, { nullable: true })
  selectedCash: DeliveryFinanceCashSourceDTO | null;
  @Field(() => DeliveryFinanceCashSourceDTO, { nullable: true })
  selectedReceivable: DeliveryFinanceCashSourceDTO | null;
  @Field(() => DeliveryFinanceMatchableEntryDTO, { nullable: true })
  selectedEntry: DeliveryFinanceMatchableEntryDTO | null;
  @Field(() => Int) cashTotal: number;
  @Field(() => Int) rejectedCashCount: number;
  @Field(() => Int) receivableTotal: number;
  @Field(() => Int) entryTotal: number;
  @Field(() => ID, { nullable: true }) nextCashId: string | null;
  @Field(() => ID, { nullable: true }) nextReceivableId: string | null;
  @Field(() => ID, { nullable: true }) nextEntryId: string | null;
  @Field(() => [DeliveryFinanceCashRelationDTO])
  settlements: DeliveryFinanceCashRelationDTO[];
  @Field(() => [DeliveryFinanceCashRelationDTO])
  matches: DeliveryFinanceCashRelationDTO[];
  @Field(() => Int) settlementTotal: number;
  @Field(() => Int) matchTotal: number;
  @Field(() => ID, { nullable: true }) nextSettlementId: string | null;
  @Field(() => ID, { nullable: true }) nextMatchId: string | null;
  @Field(() => [DeliveryFinanceProjectDTO])
  projects: DeliveryFinanceProjectDTO[];
}
