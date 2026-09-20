import { Field, ObjectType } from '@nestjs/graphql';

import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@ObjectType('SetterProfile')
export class SetterProfileDTO {
  // Null when the workspace member has no saved profile yet (defaults shown)
  @IsUUID()
  @IsOptional()
  @Field(() => UUIDScalarType, { nullable: true })
  id: string | null;

  @IsUUID()
  @IsNotEmpty()
  @Field(() => UUIDScalarType)
  workspaceMemberId: string;

  @IsString()
  @IsNotEmpty()
  @Field()
  memberName: string;

  @IsString()
  @IsOptional()
  @Field(() => String, { nullable: true })
  memberEmail: string | null;

  @IsBoolean()
  @Field()
  isSetter: boolean;

  // Comma-separated ISO weekdays, e.g. '1,2,3,4,5'
  @IsString()
  @IsNotEmpty()
  @Field()
  activeDays: string;

  @IsInt()
  @Min(0)
  @Max(23)
  @Field()
  activeStartHour: number;

  @IsInt()
  @Min(0)
  @Max(23)
  @Field()
  activeEndHour: number;

  @IsInt()
  @IsOptional()
  @Field(() => Number, { nullable: true })
  dailyLeadCap: number | null;

  // The chat id itself stays server-side; the UI only needs the linked state
  @IsBoolean()
  @Field()
  hasTelegramChatId: boolean;

  @IsDateString()
  @Field()
  createdAt: Date;

  @IsDateString()
  @Field()
  updatedAt: Date;
}
