import { useCallback, useLayoutEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { SettingsPath } from 'twenty-shared/types';
import { getSettingsPath } from 'twenty-shared/utils';
import { DeliveryOperationalPage } from '@/delivery/operations-pages/DeliveryOperationalPage';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { useInboxAccess } from '@/delivery/inbox/workspace/useInboxAccess';
import { InboxConversations } from '@/delivery/inbox/workspace/InboxConversations';
import { InboxConversationPanel } from '@/delivery/inbox/workspace/InboxConversationPanel';
import { inboxSelectionValid } from '@/delivery/inbox/workspace/inbox-navigation';
import {
  StyledInboxBoundary,
  StyledInboxLayout,
} from '@/delivery/inbox/workspace/inboxWorkspaceStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
  StyledDeliveryRow,
} from '@/delivery/deliveryStyles';
export const DeliveryInboxPage = () => (
  <DeliveryOperationalPage view="inbox">
    <InboxWorkspace />
  </DeliveryOperationalPage>
);
const InboxWorkspace = () => {
  const { t } = useLingui();
  const state = useInboxAccess();
  const { source, invalidate } = state;
  const [params] = useSearchParams();
  const { cancelPendingNavigation } = useDeliveryDraftGuard();
  const [owner, setOwner] = useState<string | null>(null),
    [denied, setDenied] = useState(false),
    [epoch, setEpoch] = useState(0);
  const changed = owner !== null && source !== owner;
  useLayoutEffect(() => {
    if (state.denied || changed) {
      invalidate();
      cancelPendingNavigation();
      setOwner(null);
      setEpoch((value) => value + 1);
    } else if (owner === null && state.data && !denied) setOwner(source);
  }, [
    state.denied,
    changed,
    owner,
    state.data,
    denied,
    source,
    invalidate,
    cancelPendingNavigation,
  ]);
  const lose = useCallback(() => {
    invalidate();
    cancelPendingNavigation();
    setDenied(true);
    setOwner(null);
    setEpoch((value) => value + 1);
  }, [invalidate, cancelPendingNavigation]);
  const available =
    state.data !== null &&
    !state.denied &&
    !denied &&
    !changed &&
    owner === source;
  const valid = inboxSelectionValid(params);
  const conversationId = params.get('inboxConversation');
  return (
    <StyledDeliveryStack>
      <StyledDeliveryRow>
        <div>
          <h2>
            <Trans>Shared client conversations</Trans>
          </h2>
          <p>
            <Trans>
              The Gmail owner chooses each shared thread and who may read,
              prepare replies or send. Slack and WhatsApp currently use manually
              recorded conversations.
            </Trans>
          </p>
        </div>
        <Link to={getSettingsPath(SettingsPath.Accounts)}>
          <Trans>Your email account settings</Trans>
        </Link>
      </StyledDeliveryRow>
      {!available && (
        <div
          role={
            denied || state.denied || state.query.error ? 'alert' : 'status'
          }
        >
          <p>
            {denied || state.denied
              ? t`Current inbox access changed. Private preparation was cleared.`
              : t`Current access could not be verified. Unsaved preparation is hidden and retained during a connection problem.`}
          </p>
          <StyledDeliveryButton
            type="button"
            onClick={async () => {
              const current = state.capture();
              const result = await state.query.refetch().catch(() => null);
              if (
                current() &&
                result?.data &&
                state.matches(result.data.deliveryInboxContext)
              ) {
                setDenied(false);
                setOwner(source);
              }
            }}
          >
            <Trans>Check inbox access</Trans>
          </StyledDeliveryButton>
        </div>
      )}
      {!valid && (
        <p role="alert">
          <Trans>
            This inbox link is invalid. Open Inbox again and choose a
            conversation.
          </Trans>
        </p>
      )}
      <StyledInboxBoundary
        hidden={!available || !valid}
        disabled={!available || !valid}
        inert={!available || !valid || undefined}
      >
        {owner !== null && valid && (
          <StyledInboxLayout key={`${owner}:${epoch}`}>
            <InboxConversations state={state} onDenied={lose} />
            {conversationId ? (
              <InboxConversationPanel
                key={conversationId}
                state={state}
                conversationId={conversationId}
                enabled={available}
                onDenied={lose}
              />
            ) : (
              <p>
                <Trans>
                  Choose a conversation to inspect its channel, owner-consented
                  thread and reply history.
                </Trans>
              </p>
            )}
          </StyledInboxLayout>
        )}
      </StyledInboxBoundary>
    </StyledDeliveryStack>
  );
};
