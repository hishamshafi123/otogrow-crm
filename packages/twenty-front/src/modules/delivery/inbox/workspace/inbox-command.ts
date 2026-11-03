import { hashCanonicalCommandInput } from '@/delivery/commands/canonical-command-hash';
import { type InboxCommand } from '@/delivery/inbox/workspace/inbox-workspace.types';
export const normalizeInboxCommand = (command: InboxCommand): InboxCommand => {
  if (command.kind === 'PREPARE')
    return {
      kind: 'PREPARE',
      input: {
        id: command.input.id,
        requestId: command.input.requestId,
        conversationId: command.input.conversationId,
        bindingRevision: command.input.bindingRevision,
        sourceFingerprint: command.input.sourceFingerprint,
        replyToMessageId: command.input.replyToMessageId,
        text: command.input.text.trim(),
        agentId: command.input.agentId ?? null,
        sourceIds: [...command.input.sourceIds],
        previewFingerprint: command.input.previewFingerprint ?? null,
        agentVersion: command.input.agentVersion ?? null,
        pricingRevision: command.input.pricingRevision ?? null,
      },
    };
  if (command.kind === 'CONSENT')
    return {
      kind: 'CONSENT',
      input: {
        id: command.input.id,
        requestId: command.input.requestId,
        conversationId: command.input.conversationId,
        conversationRevision: command.input.conversationRevision,
        revision: command.input.revision,
        accountId: command.input.accountId,
        channelId: command.input.channelId,
        threadExternalId: command.input.threadExternalId,
        sourceFingerprint: command.input.sourceFingerprint,
        grants: command.input.grants.map(({ kind, id, read, draft, send }) => ({
          kind,
          id,
          read,
          draft,
          send,
        })),
        includeHistoryAndFutureReplies:
          command.input.includeHistoryAndFutureReplies,
      },
    };
  if (command.kind === 'SEND')
    return {
      kind: 'SEND',
      input: {
        id: command.input.id,
        requestId: command.input.requestId,
        bodyFingerprint: command.input.bodyFingerprint,
        sourceFingerprint: command.input.sourceFingerprint,
      },
    };
  if (command.kind === 'REVOKE')
    return {
      kind: 'REVOKE',
      input: {
        id: command.input.id,
        requestId: command.input.requestId,
        revision: command.input.revision,
      },
    };
  return {
    kind: 'CANCEL',
    input: { id: command.input.id, requestId: command.input.requestId },
  };
};
export const inboxCommandHash = (command: InboxCommand) =>
  hashCanonicalCommandInput(normalizeInboxCommand(command).input);
export const inboxCommandAction = (kind: InboxCommand['kind']) =>
  ({
    CONSENT: 'CONSENTED',
    REVOKE: 'REVOKED',
    PREPARE: 'PREPARED',
    SEND: 'SEND_REQUESTED',
    CANCEL: 'CANCELLED',
  })[kind];
