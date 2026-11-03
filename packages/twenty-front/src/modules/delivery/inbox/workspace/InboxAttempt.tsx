import { useCallback, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { useDeliveryDraftStatus } from '@/delivery/drafts/DeliveryDraftGuard';
import {
  useInboxCommands,
  type InboxCommandAccess,
} from '@/delivery/inbox/workspace/useInboxCommands';
import {
  inboxCommandAction,
  normalizeInboxCommand,
} from '@/delivery/inbox/workspace/inbox-command';
import {
  type InboxCommand,
  type InboxRequest,
} from '@/delivery/inbox/workspace/inbox-workspace.types';
import {
  inboxDestination,
  INBOX_CLOSE_COMMAND,
  retainsInboxReader,
} from '@/delivery/inbox/workspace/inbox-navigation';
import { StyledInboxBoundary } from '@/delivery/inbox/workspace/inboxWorkspaceStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
  StyledDeliveryRow,
} from '@/delivery/deliveryStyles';
type InboxAttemptProps = {
  state: InboxCommandAccess;
  conversationId: string;
  requestId: string;
  id: string;
  kind: InboxCommand['kind'];
  owned: boolean;
  enabled: boolean;
  onDenied: () => void;
  onSaved: (value: InboxRequest) => void;
  children: (props: {
    execute: (command: InboxCommand) => Promise<void>;
    busy: boolean;
    locked: boolean;
  }) => ReactNode;
};
export const InboxAttempt = ({
  state,
  conversationId,
  requestId,
  id,
  kind,
  owned,
  enabled,
  onDenied,
  onSaved,
  children,
}: InboxAttemptProps) => {
  const { t } = useLingui();
  const [params] = useSearchParams();
  const [frozen, setFrozen] = useState<InboxCommand | null>(null),
    [recorded, setRecorded] = useState<InboxRequest | null>(null),
    [retry, setRetry] = useState(false),
    [message, setMessage] = useState('');
  const commands = useInboxCommands({
    state,
    conversationId,
    enabled,
    onDenied,
  });
  const retention = useCallback(
    (
      current: { pathname: string; search: string },
      next: { pathname: string; search: string },
    ) =>
      retainsInboxReader(
        current,
        next,
        kind === 'CONSENT' || kind === 'PREPARE',
      ),
    [kind],
  );
  useDeliveryDraftStatus({
    dirty: recorded === null && (owned || frozen !== null),
    saving: commands.busy,
    retainsNavigation: retention,
  });
  const accept = (value: InboxRequest, bodyMatched: boolean) => {
    const receipt = value.receipt;
    if (
      !receipt ||
      receipt.requestId !== requestId ||
      receipt.action !== inboxCommandAction(kind) ||
      (kind === 'CONSENT' || kind === 'REVOKE'
        ? receipt.bindingId !== id
        : receipt.replyId !== id)
    ) {
      setMessage(
        t`The saved request belongs to a different operation. Keep this preparation open and check again.`,
      );
      return;
    }
    setRecorded(value);
    setFrozen(null);
    setRetry(false);
    setMessage(
      bodyMatched
        ? t`The saved request matches your submitted preparation. Check the recorded reply status; a send request alone does not confirm delivery.`
        : t`An earlier request was found. Open its recorded result to inspect what happened. Unsaved preparation was not restored.`,
    );
    onSaved(value);
  };
  const execute = async (candidate: InboxCommand) => {
    const command = normalizeInboxCommand(candidate);
    setFrozen(command);
    setRetry(false);
    setMessage('');
    const result = await commands.execute(command);
    if (result.kind === 'FOUND') accept(result.value, true);
    else if (result.kind === 'NOT_SENT') {
      setFrozen(null);
      setMessage(result.message);
    } else
      setMessage(
        t`This result is unconfirmed. Your exact submitted request is kept. Check its saved status before retrying; do not start another send.`,
      );
  };
  const check = async () => {
    setRetry(false);
    const result = await commands.check(requestId, frozen ?? undefined);
    if (result.kind === 'FOUND') accept(result.value, frozen !== null);
    else if (result.kind === 'NOT_FOUND') {
      setRetry(frozen !== null);
      setMessage(
        frozen
          ? t`No saved request was found. Only the unchanged submitted request may be retried.`
          : t`No saved request was found. The unsaved preparation is no longer available. Close this view to start again.`,
      );
    } else if (result.kind === 'CONFLICT')
      setMessage(
        t`A different preparation was recorded with this request. Your current notes were not confirmed. Inspect the recorded thread and start a fresh preparation only after resolving the earlier result.`,
      );
    else
      setMessage(
        t`The saved result could not be checked. Keep this view open and check again.`,
      );
  };
  return (
    <StyledDeliveryStack data-inbox-request={requestId} data-inbox-command={id}>
      {(message || commands.error) && (
        <p role={commands.error ? 'alert' : 'status'}>
          {message || commands.error}
        </p>
      )}
      {!owned && !recorded && (
        <p>
          <Trans>
            This earlier link can check a saved request. It cannot reconstruct
            or submit an unsaved consent, draft or send.
          </Trans>
        </p>
      )}
      {(!owned || frozen !== null) && !recorded && (
        <StyledDeliveryRow>
          <StyledDeliveryButton
            type="button"
            disabled={!enabled || commands.busy}
            onClick={() => void check()}
          >
            <Trans>Check saved inbox request</Trans>
          </StyledDeliveryButton>
          {retry && frozen && (
            <StyledDeliveryButton
              type="button"
              disabled={!enabled || commands.busy}
              onClick={() => void execute(frozen)}
            >
              <Trans>Retry exact inbox request</Trans>
            </StyledDeliveryButton>
          )}
        </StyledDeliveryRow>
      )}
      {recorded?.receipt && (
        <Link
          to={inboxDestination(params, {
            ...INBOX_CLOSE_COMMAND,
            inboxReply: recorded.receipt.replyId ?? null,
          })}
        >
          {recorded.receipt.replyId
            ? t`Open recorded reply`
            : t`Open connected conversation`}
        </Link>
      )}
      {owned && !recorded && (
        <StyledInboxBoundary
          hidden={!enabled}
          disabled={!enabled || commands.busy || frozen !== null}
          inert={!enabled || undefined}
        >
          {children({ execute, busy: commands.busy, locked: frozen !== null })}
        </StyledInboxBoundary>
      )}
    </StyledDeliveryStack>
  );
};
