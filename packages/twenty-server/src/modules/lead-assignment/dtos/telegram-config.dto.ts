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

@ObjectType('TelegramConfig')
export class TelegramConfigDTO {
  @IsUUID()
  @IsNotEmpty()
  @Field(() => UUIDScalarType)
  id: string;

  // The raw bot token is never exposed; only its presence and a masked suffix
  // leave the server.
  @IsBoolean()
  @Field()
  hasBotToken: boolean;

  @IsString()
  @IsOptional()
  @Field(() => String, { nullable: true })
  botTokenLastFour: string | null;

  @IsString()
  @IsOptional()
  @Field(() => String, { nullable: true })
  botUsername: string | null;

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
