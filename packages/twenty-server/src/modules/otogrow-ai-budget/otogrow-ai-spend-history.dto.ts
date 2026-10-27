import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';

@InputType('OtogrowAiSpendHistoryInput')
export class OtogrowAiSpendHistoryInput {
  @Field(() => ID) spendId: string;
  @Field(() => String, { nullable: true }) cursor?: string;
  @Field(() => Int, { nullable: true }) limit?: number;
}

@ObjectType('OtogrowAiFinancialState')
export class OtogrowAiFinancialStateDTO {
  @Field(() => String, { nullable: true }) state: string | null;
  @Field(() => Int, { nullable: true }) revision: number | null;
  @Field(() => String, { nullable: true }) reservedUsd: string | null;
  @Field(() => String, { nullable: true }) actualUsd: string | null;
  @Field(() => String, { nullable: true }) reportedActualUsd: string | null;
}

@ObjectType('OtogrowAiSpendEvent')
export class OtogrowAiSpendEventDTO {
  @Field(() => ID) id: string;
  @Field() action: string;
  @Field(() => ID, { nullable: true }) actorId: string | null;
  @Field(() => String, { nullable: true }) actorName: string | null;
  @Field() actorAttribution: string;
  @Field() createdAt: string;
  @Field(() => OtogrowAiFinancialStateDTO) before: OtogrowAiFinancialStateDTO;
  @Field(() => OtogrowAiFinancialStateDTO) after: OtogrowAiFinancialStateDTO;
  @Field(() => String, { nullable: true }) evidenceReference: string | null;
  @Field(() => String, { nullable: true }) reason: string | null;
}

@ObjectType('OtogrowAiSpendHistory')
export class OtogrowAiSpendHistoryDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field(() => ID) spendId: string;
  @Field() sourceKind: string;
  @Field(() => ID) sourceRunId: string;
  @Field() modelId: string;
  @Field() kind: string;
  @Field(() => String, { nullable: true }) clientName: string | null;
  @Field(() => String, { nullable: true }) taskName: string | null;
  @Field() priceSource: string;
  @Field(() => Int) priceRevision: number;
  @Field() priceVerifiedAt: string;
  @Field(() => [OtogrowAiSpendEventDTO]) events: OtogrowAiSpendEventDTO[];
  @Field(() => String, { nullable: true }) nextCursor: string | null;
}
