import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class BookMeetingOutputDTO {
  @Field(() => String, { nullable: true })
  warning?: string | null;

  @Field(() => String)
  eventId: string;

  @Field(() => String, { nullable: true })
  meetLink: string | null;

  @Field(() => String, { nullable: true })
  htmlLink: string | null;
}
