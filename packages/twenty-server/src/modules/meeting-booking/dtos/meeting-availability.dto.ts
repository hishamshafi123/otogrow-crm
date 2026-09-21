import { Field, InputType, Int, ObjectType } from '@nestjs/graphql';
import { IsInt, Matches, Max, Min } from 'class-validator';

@InputType()
export class MeetingAvailabilityInput {
  @Field()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date: string;

  @Field(() => Int)
  @IsInt()
  @Min(5)
  @Max(480)
  durationMinutes: number;

  @Field(() => Int, { defaultValue: 9 })
  @IsInt()
  @Min(0)
  @Max(23)
  startHour: number = 9;

  @Field(() => Int, { defaultValue: 18 })
  @IsInt()
  @Min(1)
  @Max(24)
  endHour: number = 18;
}

@ObjectType()
export class MeetingSlotDTO {
  @Field()
  startTime: string;

  @Field()
  endTime: string;
}

@ObjectType()
export class MeetingAvailabilityDTO {
  @Field()
  timeZone: string;

  @Field(() => [MeetingSlotDTO])
  slots: MeetingSlotDTO[];
}
