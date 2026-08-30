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

@ObjectType('TwilioConfig')
export class TwilioConfigDTO {
  @IsUUID()
  @IsNotEmpty()
  @Field(() => UUIDScalarType)
  id: string;

  @IsString()
  @IsNotEmpty()
  @Field()
  accountSid: string;

  // The raw auth token is never exposed; only its presence and a masked
  // suffix leave the server.
  @IsBoolean()
  @Field()
  hasAuthToken: boolean;

  @IsString()
  @IsOptional()
  @Field(() => String, { nullable: true })
  authTokenLastFour: string | null;

  @IsString()
  @IsOptional()
  @Field(() => String, { nullable: true })
  whatsappSenderNumber: string | null;

  @IsString()
  @IsOptional()
  @Field(() => String, { nullable: true })
  smsNumber: string | null;

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
