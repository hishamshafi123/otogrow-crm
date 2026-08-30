import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class EnrollInSequenceOutputDTO {
  @Field(() => Int)
  enrolledCount: number;

  @Field(() => [String])
  enrollmentIds: string[];
}
