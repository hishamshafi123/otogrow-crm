import { Field, InputType } from '@nestjs/graphql';

import { ArrayNotEmpty, IsUUID } from 'class-validator';

@InputType()
export class UnenrollFromSequenceInput {
  @Field(() => [String])
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  enrollmentIds: string[];
}
