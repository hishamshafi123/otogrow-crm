import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class UnenrollFromSequenceOutputDTO {
  @Field(() => Int)
  unenrolledCount: number;
}
