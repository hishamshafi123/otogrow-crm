import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class SequenceAnalyticsDTO {
  @Field(() => String)
  sequenceId: string;

  @Field(() => Int)
  totalEnrollments: number;

  @Field(() => Int)
  activeCount: number;

  @Field(() => Int)
  repliedCount: number;

  @Field(() => Int)
  unsubscribedCount: number;

  @Field(() => Int)
  bouncedCount: number;

  @Field(() => Int)
  completedCount: number;

  @Field(() => Int)
  removedCount: number;

  @Field(() => Int)
  errorCount: number;

  @Field(() => Int)
  sentCount: number;
}
