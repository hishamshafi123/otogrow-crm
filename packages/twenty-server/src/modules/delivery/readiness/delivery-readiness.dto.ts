import { Field, ID, ObjectType } from '@nestjs/graphql';

export type DeliveryReadinessStatus =
  | 'AVAILABLE'
  | 'CONNECTED'
  | 'PAUSED'
  | 'NEEDS_SETUP'
  | 'NEEDS_ATTENTION'
  | 'MANUAL'
  | 'NOT_IMPLEMENTED';

@ObjectType('DeliveryReadinessItem')
export class DeliveryReadinessItemDTO {
  @Field() id: string;
  @Field() capability: string;
  @Field(() => String, { nullable: true }) accountName: string | null;
  @Field(() => String) status: DeliveryReadinessStatus;
  @Field() reason: string;
  @Field() destination: string;
  @Field(() => String, { nullable: true }) lastSuccessAt: string | null;
}

@ObjectType('DeliveryReadinessSnapshot')
export class DeliveryReadinessSnapshotDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field() observedAt: string;
  @Field(() => [DeliveryReadinessItemDTO]) items: DeliveryReadinessItemDTO[];
}
