import { Field, InputType } from '@nestjs/graphql';

import { IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@InputType()
export class CreateQuoteInput {
  @Field(() => UUIDScalarType, { nullable: true })
  @IsUUID()
  @IsOptional()
  companyId?: string;

  @Field(() => UUIDScalarType, { nullable: true })
  @IsUUID()
  @IsOptional()
  personId?: string;

  @Field(() => UUIDScalarType, { nullable: true })
  @IsUUID()
  @IsOptional()
  opportunityId?: string;

  @Field(() => Number, { nullable: true })
  @IsNumber()
  @IsOptional()
  taxPercent?: number;

  @Field(() => String, { nullable: true })
  @IsString()
  @IsOptional()
  validUntil?: string;

  @Field(() => String, { nullable: true })
  @IsString()
  @IsOptional()
  terms?: string;
}
