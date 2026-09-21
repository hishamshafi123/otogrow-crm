import { Field, InputType } from '@nestjs/graphql';

import {
  IsISO8601,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@InputType()
export class BookMeetingInput {
  @Field(() => UUIDScalarType, { nullable: true })
  @IsUUID()
  @IsOptional()
  assigneeWorkspaceMemberId?: string;

  @Field(() => UUIDScalarType)
  @IsUUID()
  personId: string;

  @Field(() => String)
  @IsISO8601()
  startTime: string;

  @Field(() => Number, { nullable: true, defaultValue: 30 })
  @IsInt()
  @Min(5)
  @Max(480)
  @IsOptional()
  durationMinutes?: number;
}
