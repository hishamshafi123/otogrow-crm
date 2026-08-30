import { Field, InputType } from '@nestjs/graphql';

import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

import { FormFieldInput } from 'src/engine/metadata-modules/form/dtos/form-field.dto';

@InputType()
export class CreateFormInput {
  @IsString()
  @IsNotEmpty()
  @Field()
  name: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormFieldInput)
  @Field(() => [FormFieldInput])
  fields: FormFieldInput[];

  @IsString()
  @IsOptional()
  @Field({ nullable: true })
  successMessage?: string;

  @IsBoolean()
  @IsOptional()
  @Field({ nullable: true })
  isActive?: boolean;
}
