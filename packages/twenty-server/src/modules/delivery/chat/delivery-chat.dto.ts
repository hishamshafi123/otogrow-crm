import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';

@InputType('DeliveryChatInput')
export class DeliveryChatInput {
  @Field(() => ID, { nullable: true }) peerId?: string;
  @Field(() => String, { nullable: true }) before?: string;
  @Field(() => String, { nullable: true }) search?: string;
}
@InputType('DeliveryChatSendInput')
export class DeliveryChatSendInput {
  @Field(() => ID) recipientId: string;
  @Field(() => ID) requestId: string;
  @Field() text: string;
}
@InputType('DeliveryChatViewedInput')
export class DeliveryChatViewedInput {
  @Field(() => [ID]) messageIds: string[];
}
@ObjectType('DeliveryChatPerson')
export class DeliveryChatPersonDTO {
  @Field(() => ID) id: string;
  @Field() name: string;
  @Field() active: boolean;
  @Field(() => Int) unread: number;
  @Field(() => String, { nullable: true }) lastMessageAt: string | null;
}
@ObjectType('DeliveryChatMessage')
export class DeliveryChatMessageDTO {
  @Field(() => ID) id: string;
  @Field() position: string;
  @Field(() => ID) senderId: string;
  @Field(() => ID) recipientId: string;
  @Field() senderName: string;
  @Field() text: string;
  @Field() createdAt: string;
  @Field(() => String, { nullable: true }) viewedAt: string | null;
  @Field() reminderState: string;
}
@ObjectType('DeliveryChatSnapshot')
export class DeliveryChatSnapshotDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field(() => [DeliveryChatPersonDTO]) people: DeliveryChatPersonDTO[];
  @Field(() => Int) peopleTotal: number;
  @Field(() => DeliveryChatPersonDTO, { nullable: true })
  peer: DeliveryChatPersonDTO | null;
  @Field(() => [DeliveryChatMessageDTO]) messages: DeliveryChatMessageDTO[];
  @Field(() => String, { nullable: true }) olderCursor: string | null;
  @Field(() => String, { nullable: true }) before: string | null;
  @Field() telegramReady: boolean;
}
