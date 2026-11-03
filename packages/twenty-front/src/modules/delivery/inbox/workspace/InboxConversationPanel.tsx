import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { fastDeepEqual } from 'twenty-shared/utils';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import { type useInboxAccess } from '@/delivery/inbox/workspace/useInboxAccess';
import {
  type InboxConversation,
  type InboxIntent,
  type InboxRequest,
} from '@/delivery/inbox/workspace/inbox-workspace.types';
import {
  GET_INBOX_CONVERSATION,
  GET_INBOX_MESSAGES,
} from '@/delivery/inbox/workspace/delivery-inbox.graphql';
import { InboxConsent } from '@/delivery/inbox/workspace/InboxConsent';
import { InboxComposer } from '@/delivery/inbox/workspace/InboxComposer';
import { InboxReplyView } from '@/delivery/inbox/workspace/InboxReplyView';
import { InboxReplyHistory } from '@/delivery/inbox/workspace/InboxReplyHistory';
import { InboxMessages } from '@/delivery/inbox/workspace/InboxMessages';
import { InboxAttempt } from '@/delivery/inbox/workspace/InboxAttempt';
import { inboxDestination } from '@/delivery/inbox/workspace/inbox-navigation';
import { useInboxLabels } from '@/delivery/inbox/workspace/useInboxLabels';
import { StyledInboxBoundary } from '@/delivery/inbox/workspace/inboxWorkspaceStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
  StyledDeliveryRow,
} from '@/delivery/deliveryStyles';
import {
  type DeliveryInboxConversationQuery,
  type DeliveryInboxMessagesQuery,
} from '~/generated-metadata/graphql';
type InboxConversationPanelProps = {
  state: ReturnType<typeof useInboxAccess>;
  conversationId: string;
  enabled: boolean;
  onDenied: () => void;
};
export const InboxConversationPanel = ({
  state,
  conversationId,
  enabled,
  onDenied,
}: InboxConversationPanelProps) => {
  const { t } = useLingui();
  const labels = useInboxLabels();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { requestAction, cancelPendingNavigation } = useDeliveryDraftGuard();
  const source = `${state.source}:${conversationId}`;
  const query = useQuery<DeliveryInboxConversationQuery>(
    GET_INBOX_CONVERSATION,
    {
      variables: { input: { id: conversationId }, identity: source },
      fetchPolicy: 'no-cache',
      pollInterval: 30000,
      notifyOnNetworkStatusChange: true,
      skip: !enabled,
    },
  );
  const reading = useAssistantRead({
    value: query.data?.deliveryInboxConversation,
    source,
    enabled,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches: (value) =>
      state.matches(value) && value.conversation.id === conversationId,
  });
  const [retained, setRetained] = useState<InboxConversation | null>(null);
  if (reading.data && !fastDeepEqual(retained, reading.data))
    setRetained(reading.data);
  const value = reading.data ?? retained;
  const messagesInput = {
    conversationId,
    after: params.get('inboxMessagesAfter'),
  };
  const messageSource = `${source}:${JSON.stringify(messagesInput)}`;
  const connected =
    reading.data?.binding?.enabled === true && reading.data.binding.canRead;
  const messageQuery = useQuery<DeliveryInboxMessagesQuery>(
    GET_INBOX_MESSAGES,
    {
      variables: { input: messagesInput, identity: messageSource },
      fetchPolicy: 'no-cache',
      pollInterval: 30000,
      notifyOnNetworkStatusChange: true,
      skip: !enabled || !connected,
    },
  );
  const messages = useAssistantRead({
    value: messageQuery.data?.deliveryInboxMessages,
    source: messageSource,
    enabled: enabled && Boolean(connected),
    loading: messageQuery.loading,
    error: messageQuery.error,
    networkStatus: messageQuery.networkStatus,
    matches: (result) =>
      state.matches(result) && result.conversationId === conversationId,
  });
  const denied =
    isOtogrowAccessDenied(query.error) ||
    isOtogrowAccessDenied(messageQuery.error);
  useLayoutEffect(() => {
    if (denied) onDenied();
  }, [denied, onDenied]);
  const [intent, setIntent] = useState<InboxIntent | null>(null),
    [privateEpoch, setPrivateEpoch] = useState(0);
  const consumeIntent = useCallback(
    (requestId: string) =>
      setIntent((value) => (value?.requestId === requestId ? null : value)),
    [],
  );
  // oxlint-disable-next-line twenty/no-state-useref -- Only verified permission loss may dispose private preparation; ordinary polls retain it.
  const rights = useRef({ verified: false, draft: false });
  const { invalidate } = state;
  useLayoutEffect(() => {
    if (reading.data) {
      const current = reading.data.binding?.canDraft === true;
      if (rights.current.verified && rights.current.draft && !current) {
        invalidate();
        cancelPendingNavigation();
        setIntent(null);
        setPrivateEpoch((epoch) => epoch + 1);
      }
      rights.current = { verified: true, draft: current };
    }
  }, [reading.data, invalidate, cancelPendingNavigation]);
  const available = enabled && !denied && reading.data !== null;
  const requestId = params.get('inboxRequest'),
    commandId = params.get('inboxCommandId'),
    mode = params.get('inboxMode'),
    replyId = params.get('inboxReply');
  const openIntent = (
    mode: InboxIntent['mode'],
    id: string,
    seed?: InboxIntent['seed'],
  ) =>
    requestAction(() => {
      const requestId = crypto.randomUUID();
      setIntent({ mode, id, requestId, seed });
      navigate(
        inboxDestination(params, {
          inboxMode: mode,
          inboxRequest: requestId,
          inboxCommandId: id,
          ...(mode === 'send' || mode === 'cancel' ? { inboxReply: id } : {}),
        }),
      );
    });
  const refresh = async () => {
    await Promise.allSettled([
      query.refetch(),
      ...(connected ? [messageQuery.refetch()] : []),
    ]);
  };
  const saved = (_value: InboxRequest) => {
    void refresh();
  };
  return (
    <section aria-label={t`Current conversation`}>
      <StyledDeliveryStack>
        {!available && (
          <p role={query.error ? 'alert' : 'status'}>
            <Trans>
              Current conversation access could not be checked. Private
              preparation is hidden and kept during a connection problem.
            </Trans>
          </p>
        )}
        <StyledDeliveryButton type="button" onClick={() => void refresh()}>
          <Trans>Refresh current conversation</Trans>
        </StyledDeliveryButton>
        <StyledInboxBoundary
          hidden={!available}
          disabled={!available}
          inert={!available || undefined}
        >
          {value && (
            <StyledDeliveryStack>
              <h2>{value.conversation.title}</h2>
              <p>
                {value.conversation.projectName} ·{' '}
                {labels.channel(value.conversation.channel)}
              </p>
              {value.binding ? (
                <>
                  <p>
                    {value.binding.accountHandle || t`Original Gmail account`} ·{' '}
                    {value.binding.enabled
                      ? t`Owner-consented thread`
                      : t`Owner consent withdrawn`}
                  </p>
                  <p>
                    {value.binding.syncedAt
                      ? t`Gmail last synchronized ${new Date(value.binding.syncedAt).toLocaleString()}`
                      : t`No successful Gmail synchronization time is recorded.`}
                  </p>
                  {value.binding.problem && (
                    <p role="status">{labels.problem(value.binding.problem)}</p>
                  )}
                </>
              ) : (
                <p>
                  <Trans>
                    No live provider thread is connected to this conversation.
                    Open conversation notes and access settings to manage
                    manually recorded messages.
                  </Trans>
                </p>
              )}
              <StyledDeliveryRow>
                {value.conversation.channel === 'EMAIL' &&
                  value.conversation.ownerId ===
                    state.permission.access?.memberId && (
                    <StyledDeliveryButton
                      type="button"
                      onClick={() =>
                        openIntent(
                          'consent',
                          value.binding?.id ?? crypto.randomUUID(),
                        )
                      }
                    >
                      {value.binding
                        ? t`Review thread sharing`
                        : t`Choose a Gmail thread`}
                    </StyledDeliveryButton>
                  )}
                {value.binding?.enabled &&
                  (value.binding.canConsent || state.administrator) && (
                    <StyledDeliveryButton
                      type="button"
                      onClick={() =>
                        openIntent('revoke', value.binding?.id ?? '')
                      }
                    >
                      <Trans>Review withdrawing thread access</Trans>
                    </StyledDeliveryButton>
                  )}
                {value.binding?.canDraft && (
                  <StyledDeliveryButton
                    type="button"
                    onClick={() => openIntent('prepare', crypto.randomUUID())}
                  >
                    <Trans>Prepare an unsent reply</Trans>
                  </StyledDeliveryButton>
                )}
                <Link
                  to={`/delivery?view=inbox&inboxView=legacy&businessRecord=${encodeURIComponent(conversationId)}`}
                >
                  <Trans>Manual notes and conversation access</Trans>
                </Link>
              </StyledDeliveryRow>
              {connected &&
                (messages.data ? (
                  <InboxMessages
                    value={messages.data}
                    onRefresh={() =>
                      void messageQuery.refetch().catch(() => undefined)
                    }
                  />
                ) : (
                  <p role={messageQuery.error ? 'alert' : 'status'}>
                    <Trans>
                      Imported messages could not be verified. Owned reply text
                      is kept while you retry.
                    </Trans>
                    <StyledDeliveryButton
                      type="button"
                      onClick={() =>
                        void messageQuery.refetch().catch(() => undefined)
                      }
                    >
                      <Trans>Check imported messages</Trans>
                    </StyledDeliveryButton>
                  </p>
                ))}
            </StyledDeliveryStack>
          )}
        </StyledInboxBoundary>
        {value && (
          <div key={`${source}:${privateEpoch}`}>
            {mode === 'consent' && commandId && requestId && (
              <InboxConsent
                key={requestId}
                state={state}
                value={value}
                id={commandId}
                requestId={requestId}
                intent={intent}
                consumeIntent={consumeIntent}
                enabled={available}
                onDenied={onDenied}
                onSaved={saved}
              />
            )}
            {mode === 'revoke' && commandId && requestId && (
              <InboxRevoke
                key={requestId}
                state={state}
                value={value}
                id={commandId}
                requestId={requestId}
                intent={intent}
                consumeIntent={consumeIntent}
                enabled={available}
                onDenied={onDenied}
                onSaved={saved}
              />
            )}
            {mode === 'prepare' && commandId && requestId && (
              <InboxComposer
                key={requestId}
                state={state}
                conversation={value}
                messages={messages.data}
                id={commandId}
                requestId={requestId}
                intent={intent}
                consumeIntent={consumeIntent}
                enabled={
                  available &&
                  messages.data !== null &&
                  reading.data?.binding?.canDraft === true
                }
                onDenied={onDenied}
                onSaved={saved}
              />
            )}
            {replyId && (
              <InboxReplyView
                key={replyId}
                state={state}
                conversationId={conversationId}
                id={replyId}
                enabled={available && Boolean(connected)}
                canDraft={reading.data?.binding?.canDraft === true}
                intent={intent}
                consumeIntent={consumeIntent}
                onIntent={openIntent}
                onDenied={onDenied}
              />
            )}
            {value.binding?.enabled && (
              <InboxReplyHistory
                state={state}
                conversationId={conversationId}
                enabled={available && Boolean(connected)}
                onDenied={onDenied}
              />
            )}
          </div>
        )}
      </StyledDeliveryStack>
    </section>
  );
};
const InboxRevoke = ({
  state,
  value,
  id,
  requestId,
  intent,
  consumeIntent,
  enabled,
  onDenied,
  onSaved,
}: {
  state: ReturnType<typeof useInboxAccess>;
  value: InboxConversation;
  id: string;
  requestId: string;
  intent: InboxIntent | null;
  consumeIntent: (id: string) => void;
  enabled: boolean;
  onDenied: () => void;
  onSaved: (value: InboxRequest) => void;
}) => {
  const { t } = useLingui();
  const [owned] = useState(
    () =>
      intent?.mode === 'revoke' &&
      intent.requestId === requestId &&
      intent.id === id,
  );
  const [revision] = useState(value.binding?.revision ?? 0);
  const [confirmed, setConfirmed] = useState(false);
  useLayoutEffect(() => consumeIntent(requestId), [consumeIntent, requestId]);
  const allowed =
    value.binding?.id === id &&
    value.binding.revision === revision &&
    value.binding.enabled &&
    (value.binding.canConsent || state.administrator);
  return (
    <section aria-label={t`Withdraw Gmail thread consent`}>
      <h3>
        <Trans>Withdraw this thread’s OS access</Trans>
      </h3>
      <InboxAttempt
        state={state}
        conversationId={value.conversation.id}
        requestId={requestId}
        id={id}
        kind="REVOKE"
        owned={owned}
        enabled={enabled}
        onDenied={onDenied}
        onSaved={onSaved}
      >
        {({ execute }) => (
          <StyledDeliveryStack>
            <p>
              <Trans>
                This removes delegated OS access to the exact thread. It does
                not disconnect the native mailbox or recall email already sent.
              </Trans>
            </p>
            <label>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.currentTarget.checked)}
              />
              <Trans>
                I want to withdraw this thread connection and its delegated
                permissions.
              </Trans>
            </label>
            <StyledDeliveryButton
              type="button"
              disabled={!allowed || !confirmed}
              onClick={() => {
                if (allowed && confirmed)
                  void execute({
                    kind: 'REVOKE',
                    input: { id, requestId, revision },
                  });
              }}
            >
              <Trans>Withdraw thread access</Trans>
            </StyledDeliveryButton>
          </StyledDeliveryStack>
        )}
      </InboxAttempt>
    </section>
  );
};
