import { useRef, useState } from 'react';
import { useApolloClient, useMutation } from '@apollo/client/react';
import { useLingui } from '@lingui/react/macro';
import { useFinanceExportRequestGuard } from '@/delivery/finance/export/useFinanceExportRequestGuard';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import { type useInboxAccess } from '@/delivery/inbox/workspace/useInboxAccess';
import {
  type InboxCommand,
  type InboxRequest,
} from '@/delivery/inbox/workspace/inbox-workspace.types';
import {
  inboxCommandAction,
  inboxCommandHash,
  normalizeInboxCommand,
} from '@/delivery/inbox/workspace/inbox-command';
import {
  GET_INBOX_REQUEST,
  CONSENT_INBOX_THREAD,
  REVOKE_INBOX_THREAD,
  PREPARE_INBOX_REPLY,
  SEND_INBOX_REPLY,
  CANCEL_INBOX_REPLY,
} from '@/delivery/inbox/workspace/delivery-inbox.graphql';
import {
  type DeliveryInboxRequestQuery,
  type ConsentDeliveryInboxThreadMutation,
  type RevokeDeliveryInboxThreadMutation,
  type PrepareDeliveryInboxReplyMutation,
  type SendDeliveryInboxReplyMutation,
  type CancelDeliveryInboxReplyMutation,
} from '~/generated-metadata/graphql';
export type InboxCommandAccess = Pick<
  ReturnType<typeof useInboxAccess>,
  'source' | 'matches' | 'capture'
>;
export const useInboxCommands = ({
  state,
  conversationId,
  enabled,
  onDenied,
}: {
  state: InboxCommandAccess;
  conversationId: string;
  enabled: boolean;
  onDenied: () => void;
}) => {
  const { t } = useLingui();
  const client = useApolloClient();
  const refreshHistory = () => {
    void client
      .refetchQueries({
        include: ['DeliveryInboxConversations', 'DeliveryInboxReplies'],
      })
      .catch(() => undefined);
  };
  const [consent] =
      useMutation<ConsentDeliveryInboxThreadMutation>(CONSENT_INBOX_THREAD),
    [revoke] =
      useMutation<RevokeDeliveryInboxThreadMutation>(REVOKE_INBOX_THREAD),
    [prepare] =
      useMutation<PrepareDeliveryInboxReplyMutation>(PREPARE_INBOX_REPLY),
    [send] = useMutation<SendDeliveryInboxReplyMutation>(SEND_INBOX_REPLY),
    [cancel] =
      useMutation<CancelDeliveryInboxReplyMutation>(CANCEL_INBOX_REPLY);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  // oxlint-disable-next-line twenty/no-state-useref -- Same-turn duplicate commands must not replace the exact owned request or enqueue competing replies.
  const pending = useRef(false);
  const begin = useFinanceExportRequestGuard(
    `${state.source}:${conversationId}`,
    enabled,
  );
  const capture = () => {
    const request = begin(),
      source = state.capture();
    return () => request() && source();
  };
  const identityMatches = (value: InboxRequest) =>
    state.matches(value) &&
    (!value.receipt ||
      (value.receipt.actorId === value.memberId &&
        value.receipt.userWorkspaceId === value.userWorkspaceId &&
        value.receipt.conversationId === conversationId));
  const fail = (caught: unknown, current: () => boolean) => {
    if (!current()) return;
    if (isOtogrowAccessDenied(caught)) onDenied();
    else
      setError(
        caught instanceof Error
          ? caught.message
          : t`The saved request could not be verified.`,
      );
  };
  const execute = async (
    candidate: InboxCommand,
  ): Promise<
    | { kind: 'FOUND'; value: InboxRequest }
    | { kind: 'UNKNOWN' }
    | { kind: 'NOT_SENT'; message: string }
  > => {
    if (!enabled || pending.current) return { kind: 'UNKNOWN' };
    pending.current = true;
    setBusy(true);
    setError('');
    const current = capture();
    const command = normalizeInboxCommand(candidate);
    let dispatched = false;
    try {
      const hash = await inboxCommandHash(command);
      if (!current()) return { kind: 'UNKNOWN' };
      dispatched = true;
      const value =
        command.kind === 'CONSENT'
          ? (await consent({ variables: { input: command.input } })).data
              ?.consentDeliveryInboxThread
          : command.kind === 'REVOKE'
            ? (await revoke({ variables: { input: command.input } })).data
                ?.revokeDeliveryInboxThread
            : command.kind === 'PREPARE'
              ? (await prepare({ variables: { input: command.input } })).data
                  ?.prepareDeliveryInboxReply
              : command.kind === 'SEND'
                ? (await send({ variables: { input: command.input } })).data
                    ?.sendDeliveryInboxReply
                : (await cancel({ variables: { input: command.input } })).data
                    ?.cancelDeliveryInboxReply;
      if (
        !current() ||
        !value ||
        !identityMatches(value) ||
        !value.receipt ||
        value.receipt.requestId !== command.input.requestId ||
        value.receipt.action !== inboxCommandAction(command.kind) ||
        value.receipt.bodyFingerprint !== hash ||
        (command.kind === 'CONSENT' || command.kind === 'REVOKE'
          ? value.receipt.bindingId !== command.input.id
          : value.receipt.replyId !== command.input.id)
      )
        return { kind: 'UNKNOWN' };
      refreshHistory();
      return { kind: 'FOUND', value };
    } catch (caught) {
      fail(caught, current);
      if (current() && !dispatched)
        return {
          kind: 'NOT_SENT',
          message: t`This browser could not verify the request. Nothing was sent or consented. Keep your preparation and use a supported browser.`,
        };
      return { kind: 'UNKNOWN' };
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const check = async (
    requestId: string,
    command?: InboxCommand,
  ): Promise<
    | { kind: 'FOUND'; value: InboxRequest }
    | { kind: 'NOT_FOUND' | 'UNKNOWN' | 'CONFLICT' }
  > => {
    if (!enabled || pending.current) return { kind: 'UNKNOWN' };
    pending.current = true;
    setBusy(true);
    setError('');
    const current = capture();
    try {
      const hash = command ? await inboxCommandHash(command) : null;
      if (!current()) return { kind: 'UNKNOWN' };
      const value = (
        await client.query<DeliveryInboxRequestQuery>({
          query: GET_INBOX_REQUEST,
          variables: { input: { requestId } },
          fetchPolicy: 'no-cache',
        })
      ).data?.deliveryInboxRequest;
      if (!current() || !value || !identityMatches(value))
        return { kind: 'UNKNOWN' };
      if (value.receipt === null) return { kind: 'NOT_FOUND' };
      if (!value.receipt || value.receipt.requestId !== requestId)
        return { kind: 'UNKNOWN' };
      if (hash !== null && value.receipt.bodyFingerprint !== hash)
        return { kind: 'CONFLICT' };
      refreshHistory();
      return { kind: 'FOUND', value };
    } catch (caught) {
      fail(caught, current);
      return { kind: 'UNKNOWN' };
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return { execute, check, busy, error };
};
