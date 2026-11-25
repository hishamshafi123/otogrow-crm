import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';

@InputType('DeliveryChatInput')
export class DeliveryChatInput {
  @Field(() => ID, { nullable: true }) peerId?: string;
  @Field(() => String, { nullable: true }) projectId?: string;
  @Field(() => String, { nullable: true }) before?: string;
  @Field(() => String, { nullable: true }) search?: string;
  @Field(() => String, { nullable: true }) messageSearch?: string;
  @Field(() => String, { nullable: true }) filter?: string;
}

@InputType('DeliveryChatSendInput')
export class DeliveryChatSendInput {
  @Field(() => ID) recipientId: string;
  @Field(() => ID) requestId: string;
  @Field(() => String, { nullable: true }) text?: string;
  @Field(() => ID, { nullable: true }) projectId?: string | null;
  @Field(() => ID, { nullable: true }) replyToMessageId?: string | null;
  @Field(() => [ID], { nullable: true }) attachmentIds?: string[] | null;
}

@InputType('DeliveryChatViewedInput')
export class DeliveryChatViewedInput {
  @Field(() => [ID]) messageIds: string[];
}

@InputType('DeliveryChatEditInput')
export class DeliveryChatEditInput {
  @Field(() => ID) messageId: string;
  @Field() text: string;
}

@InputType('DeliveryChatMessageIdInput')
export class DeliveryChatMessageIdInput {
  @Field(() => ID) messageId: string;
}

@InputType('DeliveryChatReactionInput')
export class DeliveryChatReactionInput {
  @Field(() => ID) messageId: string;
  @Field() emoji: string;
}

@ObjectType('DeliveryChatPerson')
export class DeliveryChatPersonDTO {
  @Field(() => ID) id: string;
  @Field() name: string;
  @Field() active: boolean;
  @Field(() => Int) unread: number;
  @Field(() => String, { nullable: true }) lastMessageAt: string | null;
  @Field(() => String, { nullable: true }) lastMessagePreview: string | null;
  @Field(() => String, { nullable: true })
  lastMessageProjectName: string | null;
  @Field(() => Int) projectCount: number;
}

@ObjectType('DeliveryChatProjectPill')
export class DeliveryChatProjectPillDTO {
  @Field(() => ID) id: string;
  @Field() name: string;
  @Field(() => Int) unread: number;
  @Field(() => Int) messageCount: number;
  @Field(() => String, { nullable: true }) lastMessageAt: string | null;
  @Field() isMember: boolean;
}

@ObjectType('DeliveryChatProjectOption')
export class DeliveryChatProjectOptionDTO {
  @Field(() => ID) id: string;
  @Field() name: string;
}

@ObjectType('DeliveryChatAttachment')
export class DeliveryChatAttachmentDTO {
  @Field(() => ID) id: string;
  @Field() kind: string;
  @Field() name: string;
  @Field() mimeType: string;
  @Field(() => Int) size: number;
  @Field(() => Int, { nullable: true }) durationMs: number | null;
  @Field(() => [Int], { nullable: true }) waveform: number[] | null;
}

@ObjectType('DeliveryChatReaction')
export class DeliveryChatReactionDTO {
  @Field() emoji: string;
  @Field(() => ID) memberId: string;
  @Field() memberName: string;
  @Field() createdAt: string;
}

@ObjectType('DeliveryChatReplyPreview')
export class DeliveryChatReplyPreviewDTO {
  @Field(() => ID) id: string;
  @Field(() => ID) senderId: string;
  @Field() senderName: string;
  @Field() text: string;
  @Field() hasAttachments: boolean;
  @Field() hasVoice: boolean;
  @Field() deleted: boolean;
}

@ObjectType('DeliveryChatMessage')
export class DeliveryChatMessageDTO {
  @Field(() => ID) id: string;
  @Field() position: string;
  @Field(() => ID) senderId: string;
  @Field(() => ID) recipientId: string;
  @Field() senderName: string;
  @Field() text: string;
  @Field(() => ID, { nullable: true }) projectId: string | null;
  @Field(() => String, { nullable: true }) projectName: string | null;
  @Field(() => DeliveryChatReplyPreviewDTO, { nullable: true })
  replyTo: DeliveryChatReplyPreviewDTO | null;
  @Field(() => [DeliveryChatAttachmentDTO])
  attachments: DeliveryChatAttachmentDTO[];
  @Field(() => [DeliveryChatReactionDTO]) reactions: DeliveryChatReactionDTO[];
  @Field() createdAt: string;
  @Field(() => String, { nullable: true }) viewedAt: string | null;
  @Field(() => String, { nullable: true }) editedAt: string | null;
  @Field(() => String, { nullable: true }) deletedAt: string | null;
  @Field(() => String, { nullable: true }) pinnedAt: string | null;
  @Field(() => ID, { nullable: true }) pinnedById: string | null;
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
  @Field(() => String, { nullable: true }) projectId: string | null;
  @Field(() => [DeliveryChatProjectPillDTO])
  projects: DeliveryChatProjectPillDTO[];
  @Field(() => [DeliveryChatProjectOptionDTO])
  allWorkspaceProjects: DeliveryChatProjectOptionDTO[];
  @Field(() => Int) generalUnread: number;
  @Field(() => Int) generalMessageCount: number;
  @Field(() => Int) totalUnreadWithPeer: number;
  @Field(() => [DeliveryChatMessageDTO]) messages: DeliveryChatMessageDTO[];
  @Field(() => [DeliveryChatMessageDTO])
  pinnedMessages: DeliveryChatMessageDTO[];
  @Field(() => String, { nullable: true }) olderCursor: string | null;
  @Field(() => String, { nullable: true }) before: string | null;
  @Field() telegramReady: boolean;
  @Field() peerTelegramReady: boolean;
}
