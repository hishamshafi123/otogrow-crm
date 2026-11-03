import { z } from 'zod';
import { type BusinessRecord } from 'src/modules/delivery/business/delivery-business.types';

export type InboxConversation = Extract<
  BusinessRecord,
  { kind: 'CONVERSATION' }
>;
export const INBOX_PAGE_SIZE = 25;
export const INBOX_MESSAGE_LIMIT = 12000;
const identifier = z.uuid();
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/);
export const inboxPageSchema = z
  .object({
    search: z
      .string()
      .trim()
      .max(160)
      .nullish()
      .transform((value) => value ?? ''),
    after: z.string().max(3000).nullish(),
  })
  .strict();
export const inboxSelectionSchema = z.object({ id: identifier }).strict();
export const inboxRequestSchema = z.object({ requestId: identifier }).strict();
export const inboxThreadsSchema = inboxPageSchema
  .extend({
    accountId: identifier,
    selectedChannelId: identifier.nullish(),
    selectedThreadExternalId: z.string().min(1).max(300).nullish(),
  })
  .strict()
  .refine(
    (value) =>
      Boolean(value.selectedChannelId) ===
      Boolean(value.selectedThreadExternalId),
  );
export const inboxMessagesSchema = z
  .object({ conversationId: identifier, after: z.string().max(3000).nullish() })
  .strict();
export const inboxGrantSchema = z
  .object({
    kind: z.enum(['MEMBER', 'ROLE']),
    id: identifier,
    read: z.boolean(),
    draft: z.boolean(),
    send: z.boolean(),
  })
  .strict()
  .refine((value) => (!value.draft && !value.send) || value.read)
  .refine((value) => !value.send || value.draft);
export type InboxGrant = z.infer<typeof inboxGrantSchema>;
export const inboxConsentSchema = z
  .object({
    id: identifier,
    requestId: identifier,
    conversationId: identifier,
    conversationRevision: z.number().int().positive(),
    revision: z.number().int().nonnegative(),
    accountId: identifier,
    channelId: identifier,
    threadExternalId: z.string().min(1).max(300),
    sourceFingerprint: fingerprint,
    grants: z.array(inboxGrantSchema).max(100),
    includeHistoryAndFutureReplies: z.literal(true),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.grants.map((grant) => `${grant.kind}:${grant.id}`)).size ===
      value.grants.length,
  );
export const inboxRevokeSchema = z
  .object({
    id: identifier,
    requestId: identifier,
    revision: z.number().int().positive(),
  })
  .strict();
export const inboxDraftPreviewSchema = z
  .object({
    id: identifier,
    conversationId: identifier,
    bindingRevision: z.number().int().positive(),
    sourceFingerprint: fingerprint,
    replyToMessageId: identifier,
    agentId: identifier,
    sourceIds: z.array(identifier).min(1).max(10),
  })
  .strict();
export const inboxPrepareSchema = z
  .object({
    id: identifier,
    requestId: identifier,
    conversationId: identifier,
    bindingRevision: z.number().int().positive(),
    sourceFingerprint: fingerprint,
    replyToMessageId: identifier,
    text: z.string().trim().max(12000),
    agentId: identifier.nullish(),
    sourceIds: z.array(identifier).max(10).default([]),
    previewFingerprint: fingerprint.nullish(),
    agentVersion: z.number().int().positive().nullish(),
    pricingRevision: z.number().int().positive().nullish(),
  })
  .strict()
  .refine((value) =>
    value.agentId
      ? !value.text &&
        value.sourceIds.length > 0 &&
        Boolean(
          value.previewFingerprint &&
          value.agentVersion &&
          value.pricingRevision,
        )
      : value.text.length > 0 &&
        value.sourceIds.length === 0 &&
        !value.previewFingerprint &&
        !value.agentVersion &&
        !value.pricingRevision,
  );
export type InboxDraftPreviewInput = z.infer<typeof inboxDraftPreviewSchema>;
export const inboxSendSchema = z
  .object({
    id: identifier,
    requestId: identifier,
    bodyFingerprint: fingerprint,
    sourceFingerprint: fingerprint,
  })
  .strict();
export const inboxCancelSchema = z
  .object({ id: identifier, requestId: identifier })
  .strict();
export type InboxConsentInput = z.infer<typeof inboxConsentSchema>;
export type InboxPrepareInput = z.infer<typeof inboxPrepareSchema>;
export type InboxReplyStatus =
  | 'GENERATING'
  | 'DRAFT'
  | 'QUEUED'
  | 'SENDING'
  | 'SENT'
  | 'FAILED'
  | 'UNCERTAIN'
  | 'CANCELLED';
export type InboxNativeMessage = {
  id: string;
  receivedAt: string | null;
  subject: string;
  text: string;
  textTruncated: boolean;
  participantsTruncated: boolean;
  headerMessageId: string | null;
  externalId: string;
  direction: string;
  participants: { role: string; handle: string; displayName: string | null }[];
};
export type InboxReplyBody = {
  to: string;
  subject: string;
  text: string;
  inReplyTo: string;
  threadExternalId: string;
  replyToMessageId: string;
  sourceIds: string[];
  agentId: string | null;
};
export type InboxConsentSnapshot = {
  conversationRevision: number;
  ownerMemberId: string;
  ownerUserWorkspaceId: string;
  accountId: string;
  channelId: string;
  threadExternalId: string;
  projectId: string;
  companyId: string | null;
  accountHandle: string;
  sourceFingerprint: string;
  grants: InboxGrant[];
  historyAndFutureReplies: true;
};
export type InboxReceipt = {
  requestId: string;
  action: 'CONSENTED' | 'REVOKED' | 'PREPARED' | 'SEND_REQUESTED' | 'CANCELLED';
  actorId: string;
  userWorkspaceId: string;
  conversationId: string;
  bindingId: string;
  replyId: string | null;
  bodyFingerprint: string;
  createdAt: string;
};
