import { Field, InputType } from '@nestjs/graphql';

import { ArrayNotEmpty, IsUUID } from 'class-validator';

@InputType()
export class EnrollInSequenceInput {
  @Field(() => String)
  @IsUUID('4')
  sequenceId: string;

  @Field(() => [String])
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  personIds: string[];
}
