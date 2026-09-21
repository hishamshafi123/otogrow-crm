import { Field, InputType } from '@nestjs/graphql';
import { IsBoolean, IsNotEmpty, IsString, MaxLength } from 'class-validator';

@InputType()
export class CreateMetaLeadFormInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @Field()
  @IsString()
  @MaxLength(2000)
  sheetUrl: string;

  @Field()
  @IsString()
  @MaxLength(20000)
  serviceAccountJson: string;

  @Field()
  @IsBoolean()
  importExisting: boolean;
}
