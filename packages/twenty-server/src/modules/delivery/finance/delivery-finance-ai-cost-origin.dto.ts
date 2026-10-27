import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('DeliveryFinanceAiCostOrigin')
export class DeliveryFinanceAiCostOriginDTO {
  @Field(() => ID) spendId: string;
  @Field(() => Int) spendRevision: number;
  @Field(() => ID) evidenceEventId: string;
  @Field() basis: string;
  @Field() amountMicros: string;
  @Field() currency: string;
  @Field() modelId: string;
  @Field() sourceKind: string;
  @Field() recordedAt: string;
  @Field(() => ID, { nullable: true }) projectId: string | null;
  @Field(() => String, { nullable: true }) projectName: string | null;
  @Field(() => ID, { nullable: true }) replacesEntryId: string | null;
  @Field(() => String, { nullable: true }) correctionReason: string | null;
}
