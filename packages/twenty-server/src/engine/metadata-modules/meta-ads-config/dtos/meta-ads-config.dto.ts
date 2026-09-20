import { Field, HideField, ObjectType } from '@nestjs/graphql';

import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@ObjectType('MetaAdsConfig')
export class MetaAdsConfigDTO {
  @IsUUID()
  @IsNotEmpty()
  @Field(() => UUIDScalarType)
  id: string;

  @IsString()
  @IsNotEmpty()
  @Field()
  appId: string;

  // The raw app secret is never exposed; only its presence and a masked
  // suffix leave the server.
  @IsBoolean()
  @Field()
  hasAppSecret: boolean;

  @IsString()
  @IsOptional()
  @Field(() => String, { nullable: true })
  appSecretLastFour: string | null;

  @IsString()
  @IsNotEmpty()
  @Field()
  pageId: string;

  @IsBoolean()
  @Field()
  hasPageAccessToken: boolean;

  @IsString()
  @IsOptional()
  @Field(() => String, { nullable: true })
  pageAccessTokenLastFour: string | null;

  @IsString()
  @IsNotEmpty()
  @Field()
  verifyToken: string;

  @IsString()
  @IsOptional()
  @Field(() => String, { nullable: true })
  formId: string | null;

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
