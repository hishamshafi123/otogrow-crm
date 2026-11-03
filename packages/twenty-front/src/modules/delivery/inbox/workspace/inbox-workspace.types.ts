import {
  type DeliveryInboxConversationQuery,
  type DeliveryInboxMessagesQuery,
  type DeliveryInboxReplyQuery,
  type DeliveryInboxRequestQuery,
  type ConsentDeliveryInboxThreadInput,
  type RevokeDeliveryInboxThreadInput,
  type PrepareDeliveryInboxReplyInput,
  type SendDeliveryInboxReplyInput,
  type CancelDeliveryInboxReplyInput,
} from '~/generated-metadata/graphql';
export type InboxConversation =
  DeliveryInboxConversationQuery['deliveryInboxConversation'];
export type InboxMessage =
  DeliveryInboxMessagesQuery['deliveryInboxMessages']['items'][number];
export type InboxReply = DeliveryInboxReplyQuery['deliveryInboxReply'];
export type InboxRequest = DeliveryInboxRequestQuery['deliveryInboxRequest'];
export type InboxCommand =
  | { kind: 'CONSENT'; input: ConsentDeliveryInboxThreadInput }
  | { kind: 'REVOKE'; input: RevokeDeliveryInboxThreadInput }
  | { kind: 'PREPARE'; input: PrepareDeliveryInboxReplyInput }
  | { kind: 'SEND'; input: SendDeliveryInboxReplyInput }
  | { kind: 'CANCEL'; input: CancelDeliveryInboxReplyInput };
export type InboxIntent = {
  mode: 'consent' | 'revoke' | 'prepare' | 'send' | 'cancel';
  id: string;
  requestId: string;
  seed?: { replyToMessageId: string; text: string };
};
