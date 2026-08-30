import { Field, HideField, ObjectType } from '@nestjs/graphql';

import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { FormFieldDTO } from 'src/engine/metadata-modules/form/dtos/form-field.dto';

@ObjectType('Form')
export class FormDTO {
  @IsUUID()
  @IsNotEmpty()
  @Field(() => UUIDScalarType)
  id: string;

  @IsString()
  @IsNotEmpty()
  @Field()
  name: string;

  @IsUUID()
  @Field(() => UUIDScalarType)
  publicId: string;

  @IsArray()
  @Field(() => [FormFieldDTO])
  fields: FormFieldDTO[];

  @IsString()
  @IsOptional()
  @Field(() => String, { nullable: true })
  successMessage: string | null;

  @IsBoolean()
  @Field()
  isActive: boolean;

  @HideField()
  workspaceId: string;

  @IsDateString()
  @Field()
  createdAt: Date;

  @IsDateString()
  @Field()
  updatedAt: Date;
}
