import { Field, InputType, ObjectType } from '@nestjs/graphql';

import { IsBoolean, IsIn, IsNotEmpty, IsString } from 'class-validator';

import { FORM_FIELD_TYPES } from 'src/engine/metadata-modules/form/constants/form-field-definition.constant';

@ObjectType('FormField')
export class FormFieldDTO {
  @IsString()
  @IsNotEmpty()
  @Field()
  key: string;

  @IsString()
  @IsNotEmpty()
  @Field()
  label: string;

  @IsString()
  @IsNotEmpty()
  @Field()
  type: string;

  @IsBoolean()
  @Field()
  required: boolean;
}

@InputType()
export class FormFieldInput {
  @IsString()
  @IsNotEmpty()
  @Field()
  key: string;

  @IsString()
  @IsNotEmpty()
  @Field()
  label: string;

  @IsIn(FORM_FIELD_TYPES)
  @Field()
  type: string;

  @IsBoolean()
  @Field()
  required: boolean;
}
