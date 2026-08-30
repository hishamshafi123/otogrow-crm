import { Field, InputType } from '@nestjs/graphql';

import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { FormFieldInput } from 'src/engine/metadata-modules/form/dtos/form-field.dto';

@InputType()
export class UpdateFormInputUpdates {
  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  name?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormFieldInput)
  @Field(() => [FormFieldInput], { nullable: true })
  fields?: FormFieldInput[];

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  successMessage?: string;

  @IsOptional()
  @IsBoolean()
  @Field({ nullable: true })
  isActive?: boolean;
}

@InputType()
export class UpdateFormInput {
  @IsUUID()
  @IsNotEmpty()
  @Field(() => UUIDScalarType, {
    description: 'The id of the form to update',
  })
  id: string;

  @Type(() => UpdateFormInputUpdates)
  @ValidateNested()
  @Field(() => UpdateFormInputUpdates, {
    description: 'The form fields to update',
  })
  update: UpdateFormInputUpdates;
}
