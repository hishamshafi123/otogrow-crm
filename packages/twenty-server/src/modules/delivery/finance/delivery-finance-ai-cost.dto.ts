import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';
import {
  DeliveryFinanceAllocationInput,
  DeliveryFinanceProjectDTO,
} from 'src/modules/delivery/finance/delivery-finance.dto';

@ObjectType('DeliveryFinanceAiCostEvidence')
export class DeliveryFinanceAiCostEvidenceDTO {
  @Field(() => ID) id: string;
  @Field() basis: string;
  @Field() amountMicros: string;
  @Field() recordedAt: string;
}

@ObjectType('DeliveryFinanceAiCostEntryReference')
export class DeliveryFinanceAiCostEntryReferenceDTO {
  @Field(() => ID) id: string;
  @Field(() => Int) revision: number;
  @Field() status: string;
  @Field() month: string;
  @Field() amountMicros: string;
  @Field() matchedMicros: string;
  @Field(() => Int) activeMatchCount: number;
}

@ObjectType('DeliveryFinanceAiCostClaim')
export class DeliveryFinanceAiCostClaimDTO {
  @Field(() => Int) revision: number;
  @Field(() => DeliveryFinanceAiCostEntryReferenceDTO, { nullable: true })
  currentEntry: DeliveryFinanceAiCostEntryReferenceDTO | null;
  @Field(() => DeliveryFinanceAiCostEntryReferenceDTO, { nullable: true })
  replacementEntry: DeliveryFinanceAiCostEntryReferenceDTO | null;
}

@ObjectType('DeliveryFinanceAiCostSource')
export class DeliveryFinanceAiCostSourceDTO {
  @Field(() => ID) id: string;
  @Field(() => Int) revision: number;
  @Field() state: string;
  @Field() sourceKind: string;
  @Field() modelId: string;
  @Field() currency: string;
  @Field(() => String, { nullable: true }) settledAmountMicros: string | null;
  @Field() createdAt: string;
  @Field(() => String, { nullable: true }) dispatchedAt: string | null;
  @Field(() => String, { nullable: true }) settledAt: string | null;
  @Field(() => ID, { nullable: true }) projectId: string | null;
  @Field(() => String, { nullable: true }) projectName: string | null;
  @Field() eligible: boolean;
  @Field(() => [String]) sourceWarnings: string[];
  @Field() sourceReviewToken: string;
  @Field(() => DeliveryFinanceAiCostClaimDTO)
  claim: DeliveryFinanceAiCostClaimDTO;
  @Field(() => [DeliveryFinanceAiCostEvidenceDTO])
  evidenceOptions: DeliveryFinanceAiCostEvidenceDTO[];
  @Field(() => ID, { nullable: true }) nextEvidenceId: string | null;
}

@ObjectType('DeliveryFinanceAiCostsSnapshot')
export class DeliveryFinanceAiCostsSnapshotDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field() canManage: boolean;
  @Field() canReadBudget: boolean;
  @Field() filter: string;
  @Field(() => [DeliveryFinanceAiCostSourceDTO])
  sources: DeliveryFinanceAiCostSourceDTO[];
  @Field(() => DeliveryFinanceAiCostSourceDTO, { nullable: true })
  selectedSource: DeliveryFinanceAiCostSourceDTO | null;
  @Field(() => ID, { nullable: true }) nextSpendId: string | null;
  @Field(() => [DeliveryFinanceProjectDTO])
  projects: DeliveryFinanceProjectDTO[];
}

@ObjectType('DeliveryFinanceAiCostResult')
export class DeliveryFinanceAiCostResultDTO {
  @Field(() => ID) entryId: string;
  @Field() status: string;
  @Field() replayed: boolean;
}

@InputType('DeliveryFinanceAiCostsInput')
export class DeliveryFinanceAiCostsInput {
  @Field(() => String, { nullable: true }) filter?: string | null;
  @Field(() => ID, { nullable: true }) afterSpendId?: string | null;
  @Field(() => ID, { nullable: true }) selectedSpendId?: string | null;
  @Field(() => ID, { nullable: true }) afterEvidenceId?: string | null;
}

@InputType('DeliveryFinanceAiCostPrepareInput')
export class DeliveryFinanceAiCostPrepareInput {
  @Field(() => ID) id: string;
  @Field(() => ID) spendId: string;
  @Field(() => ID) evidenceEventId: string;
  @Field() expectedSourceReviewToken: string;
  @Field(() => Int) expectedClaimRevision: number;
  @Field() month: string;
  @Field() title: string;
  @Field() note: string;
  @Field(() => [DeliveryFinanceAllocationInput])
  allocations: DeliveryFinanceAllocationInput[];
  @Field() acknowledgeSourceWarnings: boolean;
  @Field() acknowledgeNoDuplicateCost: boolean;
  @Field(() => ID, { nullable: true }) replacesEntryId?: string | null;
  @Field(() => Int, { nullable: true }) expectedReplacedEntryRevision?:
    | number
    | null;
  @Field(() => String, { nullable: true }) correctionReason?: string | null;
}

@InputType('DeliveryFinanceAiCostPostInput')
export class DeliveryFinanceAiCostPostInput {
  @Field(() => ID) id: string;
  @Field(() => Int) revision: number;
  @Field(() => Int) expectedClaimRevision: number;
  @Field() expectedSourceReviewToken: string;
  @Field() acknowledgeSourceWarnings: boolean;
  @Field() acknowledgeReplacement: boolean;
}
