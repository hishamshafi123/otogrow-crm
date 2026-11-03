import { DeliveryAssistantBudgetDTO } from 'src/modules/delivery/agents/reads/delivery-assistants.dto';
import { Field, ID, InputType, Int, ObjectType } from '@nestjs/graphql';

@InputType('DeliveryInboxPageInput')
export class DeliveryInboxPageInput {
  @Field(() => String, { nullable: true }) search?: string;
  @Field(() => String, { nullable: true }) after?: string | null;
}
@InputType('DeliveryInboxSelectionInput')
export class DeliveryInboxSelectionInput {
  @Field(() => ID) id: string;
}
@InputType('DeliveryInboxRequestInput')
export class DeliveryInboxRequestInput {
  @Field(() => ID) requestId: string;
}
@InputType('DeliveryInboxThreadsInput')
export class DeliveryInboxThreadsInput extends DeliveryInboxPageInput {
  @Field(() => ID) accountId: string;
  @Field(() => ID, { nullable: true }) selectedChannelId?: string | null;
  @Field(() => String, { nullable: true }) selectedThreadExternalId?:
    | string
    | null;
}
@InputType('DeliveryInboxMessagesInput')
export class DeliveryInboxMessagesInput {
  @Field(() => ID) conversationId: string;
  @Field(() => String, { nullable: true }) after?: string | null;
}
@InputType('DeliveryInboxGrantInput')
export class DeliveryInboxGrantInput {
  @Field() kind: string;
  @Field(() => ID) id: string;
  @Field() read: boolean;
  @Field() draft: boolean;
  @Field() send: boolean;
}
@InputType('ConsentDeliveryInboxThreadInput')
export class ConsentDeliveryInboxThreadInput {
  @Field(() => ID) id: string;
  @Field(() => ID) requestId: string;
  @Field(() => ID) conversationId: string;
  @Field(() => Int) conversationRevision: number;
  @Field(() => Int) revision: number;
  @Field(() => ID) accountId: string;
  @Field(() => ID) channelId: string;
  @Field() threadExternalId: string;
  @Field() sourceFingerprint: string;
  @Field(() => [DeliveryInboxGrantInput]) grants: DeliveryInboxGrantInput[];
  @Field() includeHistoryAndFutureReplies: boolean;
}
@InputType('RevokeDeliveryInboxThreadInput')
export class RevokeDeliveryInboxThreadInput {
  @Field(() => ID) id: string;
  @Field(() => ID) requestId: string;
  @Field(() => Int) revision: number;
}
@InputType('PrepareDeliveryInboxReplyInput')
export class PrepareDeliveryInboxReplyInput {
  @Field(() => ID) id: string;
  @Field(() => ID) requestId: string;
  @Field(() => ID) conversationId: string;
  @Field(() => Int) bindingRevision: number;
  @Field() sourceFingerprint: string;
  @Field(() => ID) replyToMessageId: string;
  @Field() text: string;
  @Field(() => ID, { nullable: true }) agentId?: string | null;
  @Field(() => [ID]) sourceIds: string[];
  @Field(() => String, { nullable: true }) previewFingerprint?: string | null;
  @Field(() => Int, { nullable: true }) agentVersion?: number | null;
  @Field(() => Int, { nullable: true }) pricingRevision?: number | null;
}
@InputType('SendDeliveryInboxReplyInput')
export class SendDeliveryInboxReplyInput {
  @Field(() => ID) id: string;
  @Field(() => ID) requestId: string;
  @Field() bodyFingerprint: string;
  @Field() sourceFingerprint: string;
}
@InputType('CancelDeliveryInboxReplyInput')
export class CancelDeliveryInboxReplyInput {
  @Field(() => ID) id: string;
  @Field(() => ID) requestId: string;
}
@ObjectType('DeliveryInboxActor')
export class DeliveryInboxActorDTO {
  @Field(() => ID) memberId: string;
  @Field() isAdmin: boolean;
  @Field() isManager: boolean;
  @Field(() => [ID]) roleIds: string[];
  @Field(() => [String]) capabilities: string[];
}
@ObjectType('DeliveryInboxIdentity')
export class DeliveryInboxIdentityDTO {
  @Field(() => ID) workspaceId: string;
  @Field(() => ID) memberId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field(() => DeliveryInboxActorDTO) actor: DeliveryInboxActorDTO;
  @Field() scope: string;
  @Field() observedAt: string;
}
@ObjectType('DeliveryInboxContext')
export class DeliveryInboxContextDTO extends DeliveryInboxIdentityDTO {
  @Field() canManageConversations: boolean;
}
@ObjectType('DeliveryInboxGrant')
export class DeliveryInboxGrantDTO {
  @Field() kind: string;
  @Field(() => ID) id: string;
  @Field() name: string;
  @Field() read: boolean;
  @Field() draft: boolean;
  @Field() send: boolean;
}
@ObjectType('DeliveryInboxBinding')
export class DeliveryInboxBindingDTO {
  @Field(() => ID) id: string;
  @Field(() => Int) revision: number;
  @Field() enabled: boolean;
  @Field(() => ID) accountId: string;
  @Field(() => ID) channelId: string;
  @Field() threadExternalId: string;
  @Field() accountHandle: string;
  @Field(() => ID) ownerMemberId: string;
  @Field() canConsent: boolean;
  @Field() canRead: boolean;
  @Field() canDraft: boolean;
  @Field() canSend: boolean;
  @Field(() => String, { nullable: true }) problem: string | null;
  @Field(() => String, { nullable: true }) syncedAt: string | null;
  @Field() syncStatus: string;
  @Field(() => [DeliveryInboxGrantDTO]) grants: DeliveryInboxGrantDTO[];
}
@ObjectType('DeliveryInboxConversationSummary')
export class DeliveryInboxConversationSummaryDTO {
  @Field(() => ID) id: string;
  @Field(() => Int) revision: number;
  @Field() title: string;
  @Field() channel: string;
  @Field(() => ID) projectId: string;
  @Field() projectName: string;
  @Field(() => ID) ownerId: string;
  @Field() private: boolean;
  @Field(() => Boolean) connected: boolean;
}
@ObjectType('DeliveryInboxConversations')
export class DeliveryInboxConversationsDTO extends DeliveryInboxIdentityDTO {
  @Field(() => [DeliveryInboxConversationSummaryDTO])
  items: DeliveryInboxConversationSummaryDTO[];
  @Field(() => Int) totalCount: number;
  @Field(() => String, { nullable: true }) nextCursor: string | null;
}
@ObjectType('DeliveryInboxConversation')
export class DeliveryInboxConversationDTO extends DeliveryInboxIdentityDTO {
  @Field(() => DeliveryInboxConversationSummaryDTO)
  conversation: DeliveryInboxConversationSummaryDTO;
  @Field(() => DeliveryInboxBindingDTO, { nullable: true })
  binding: DeliveryInboxBindingDTO | null;
  @Field(() => [DeliveryInboxGrantDTO])
  availableGrants: DeliveryInboxGrantDTO[];
}
@ObjectType('DeliveryInboxGmailAccount')
export class DeliveryInboxGmailAccountDTO {
  @Field(() => ID) id: string;
  @Field() handle: string;
  @Field() needsReconnect: boolean;
  @Field() canSend: boolean;
  @Field() syncEnabled: boolean;
  @Field(() => String, { nullable: true }) syncedAt: string | null;
}
@ObjectType('DeliveryInboxGmailAccounts')
export class DeliveryInboxGmailAccountsDTO extends DeliveryInboxIdentityDTO {
  @Field(() => [DeliveryInboxGmailAccountDTO])
  items: DeliveryInboxGmailAccountDTO[];
  @Field(() => Int) totalCount: number;
  @Field(() => String, { nullable: true }) nextCursor: string | null;
}
@ObjectType('DeliveryInboxGmailThread')
export class DeliveryInboxGmailThreadDTO {
  @Field(() => ID) accountId: string;
  @Field() accountHandle: string;
  @Field(() => ID) channelId: string;
  @Field() threadExternalId: string;
  @Field() subject: string;
  @Field(() => Int) messageCount: number;
  @Field() sourceFingerprint: string;
  @Field(() => String, { nullable: true }) latestAt: string | null;
}
@ObjectType('DeliveryInboxGmailThreads')
export class DeliveryInboxGmailThreadsDTO extends DeliveryInboxIdentityDTO {
  @Field(() => DeliveryInboxGmailThreadDTO, { nullable: true })
  selected: DeliveryInboxGmailThreadDTO | null;
  @Field(() => [DeliveryInboxGmailThreadDTO])
  items: DeliveryInboxGmailThreadDTO[];
  @Field(() => Int) totalCount: number;
  @Field(() => String, { nullable: true }) nextCursor: string | null;
}
@ObjectType('DeliveryInboxParticipant')
export class DeliveryInboxParticipantDTO {
  @Field() role: string;
  @Field() handle: string;
  @Field(() => String, { nullable: true }) displayName: string | null;
}
@ObjectType('DeliveryInboxMessage')
export class DeliveryInboxMessageDTO {
  @Field(() => ID) id: string;
  @Field(() => String, { nullable: true }) receivedAt: string | null;
  @Field() subject: string;
  @Field() text: string;
  @Field() textTruncated: boolean;
  @Field() participantsTruncated: boolean;
  @Field() direction: string;
  @Field(() => [DeliveryInboxParticipantDTO])
  participants: DeliveryInboxParticipantDTO[];
}
@ObjectType('DeliveryInboxMessages')
export class DeliveryInboxMessagesDTO extends DeliveryInboxIdentityDTO {
  @Field(() => ID) conversationId: string;
  @Field() sourceFingerprint: string;
  @Field(() => [DeliveryInboxMessageDTO]) items: DeliveryInboxMessageDTO[];
  @Field(() => Int) totalCount: number;
  @Field(() => String, { nullable: true }) nextCursor: string | null;
}
@ObjectType('DeliveryInboxReceipt')
export class DeliveryInboxReceiptDTO {
  @Field(() => ID) requestId: string;
  @Field() action: string;
  @Field(() => ID) actorId: string;
  @Field(() => ID) userWorkspaceId: string;
  @Field(() => ID) conversationId: string;
  @Field(() => ID) bindingId: string;
  @Field(() => ID, { nullable: true }) replyId: string | null;
  @Field() bodyFingerprint: string;
  @Field() createdAt: string;
}
@ObjectType('DeliveryInboxReplyBody')
export class DeliveryInboxReplyBodyDTO {
  @Field() to: string;
  @Field() subject: string;
  @Field() text: string;
  @Field(() => ID) replyToMessageId: string;
  @Field(() => [ID]) sourceIds: string[];
  @Field(() => ID, { nullable: true }) agentId: string | null;
}
@ObjectType('DeliveryInboxReply')
export class DeliveryInboxReplyDTO extends DeliveryInboxIdentityDTO {
  @Field(() => ID) id: string;
  @Field(() => ID) conversationId: string;
  @Field() status: string;
  @Field(() => DeliveryInboxReplyBodyDTO, { nullable: true })
  body: DeliveryInboxReplyBodyDTO | null;
  @Field(() => String, { nullable: true }) bodyFingerprint: string | null;
  @Field() sourceFingerprint: string;
  @Field() canSend: boolean;
  @Field() canCancel: boolean;
  @Field(() => String, { nullable: true }) problem: string | null;
  @Field() createdAt: string;
  @Field(() => String, { nullable: true }) attemptedAt: string | null;
  @Field(() => String, { nullable: true }) finishedAt: string | null;
}
@ObjectType('DeliveryInboxRequest')
export class DeliveryInboxRequestDTO extends DeliveryInboxIdentityDTO {
  @Field(() => DeliveryInboxReceiptDTO, { nullable: true })
  receipt: DeliveryInboxReceiptDTO | null;
  @Field(() => DeliveryInboxReplyDTO, { nullable: true })
  reply: DeliveryInboxReplyDTO | null;
}
@ObjectType('DeliveryInboxReplySummary')
export class DeliveryInboxReplySummaryDTO {
  @Field(() => ID) id: string;
  @Field(() => ID) requestId: string;
  @Field(() => ID) actorId: string;
  @Field(() => String, { nullable: true }) actorName: string | null;
  @Field() status: string;
  @Field() createdAt: string;
  @Field(() => String, { nullable: true }) problem: string | null;
}
@ObjectType('DeliveryInboxReplies')
export class DeliveryInboxRepliesDTO extends DeliveryInboxIdentityDTO {
  @Field(() => [DeliveryInboxReplySummaryDTO])
  items: DeliveryInboxReplySummaryDTO[];
  @Field(() => Int) totalCount: number;
  @Field(() => String, { nullable: true }) nextCursor: string | null;
}

@InputType('DeliveryInboxDraftPreviewInput')
export class DeliveryInboxDraftPreviewInput {
  @Field(() => ID) id: string;
  @Field(() => ID) conversationId: string;
  @Field(() => Int) bindingRevision: number;
  @Field() sourceFingerprint: string;
  @Field(() => ID) replyToMessageId: string;
  @Field(() => ID) agentId: string;
  @Field(() => [ID]) sourceIds: string[];
}
@ObjectType('DeliveryInboxDraftPreview')
export class DeliveryInboxDraftPreviewDTO extends DeliveryInboxIdentityDTO {
  @Field() previewFingerprint: string;
  @Field() bodyFingerprint: string;
  @Field(() => ID) agentId: string;
  @Field() agentName: string;
  @Field(() => Int) agentVersion: number;
  @Field() modelId: string;
  @Field(() => Int) sourceCount: number;
  @Field(() => [DeliveryInboxMessageDTO]) sources: DeliveryInboxMessageDTO[];
  @Field() to: string;
  @Field() subject: string;
  @Field(() => DeliveryAssistantBudgetDTO) budget: DeliveryAssistantBudgetDTO;
}
