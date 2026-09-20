import { Field, InputType } from '@nestjs/graphql';

import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

@InputType()
export class UpsertSetterProfileInput {
  @IsUUID()
  @IsNotEmpty()
  @Field()
  workspaceMemberId: string;

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

  // Null means no daily cap
  @IsInt()
  @IsOptional()
  @Field(() => Number, { nullable: true })
  dailyLeadCap?: number | null;
}
