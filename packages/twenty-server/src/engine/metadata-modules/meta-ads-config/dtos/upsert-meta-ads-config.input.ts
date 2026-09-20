import { Field, InputType } from '@nestjs/graphql';

import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

@InputType()
export class UpsertMetaAdsConfigInput {
  @IsString()
  @IsNotEmpty()
  @Field()
  appId: string;

  // Optional on update: omitting it keeps the stored secret.
  @IsString()
  @IsOptional()
  @Field({ nullable: true })
  appSecret?: string;

  @IsString()
  @IsNotEmpty()
  @Field()
  pageId: string;

  // Optional on update: omitting it keeps the stored token.
  @IsString()
  @IsOptional()
  @Field({ nullable: true })
  pageAccessToken?: string;

  // Optional: generated server-side when left empty on create.
  @IsString()
  @IsOptional()
  @Field({ nullable: true })
  verifyToken?: string;

  @IsString()
  @IsOptional()
  @Field({ nullable: true })
  formId?: string;

  @IsBoolean()
  @IsOptional()
  @Field({ nullable: true })
  isActive?: boolean;
}
