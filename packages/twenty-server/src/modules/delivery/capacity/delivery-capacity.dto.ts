import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';

@InputType('DeliveryCapacityInput')
export class DeliveryCapacityInput {
  @Field() startDate: string;
}
@InputType('DeliveryAvailabilityInput')
export class DeliveryAvailabilityInput {
  @Field(() => ID) memberId: string;
  @Field() date: string;
  @Field(() => Int, { nullable: true }) minutes: number | null;
  @Field(() => Int) revision: number;
}
@ObjectType('DeliveryAvailability')
export class DeliveryAvailabilityDTO {
  @Field(() => ID) memberId: string;
  @Field() date: string;
  @Field(() => Int, { nullable: true }) minutes: number | null;
  @Field(() => Int) revision: number;
}
@ObjectType('DeliveryCapacity')
export class DeliveryCapacityDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field() startDate: string;
  @Field(() => [DeliveryAvailabilityDTO])
  availability: DeliveryAvailabilityDTO[];
}
