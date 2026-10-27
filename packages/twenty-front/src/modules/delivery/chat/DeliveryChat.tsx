import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useSearchParams } from 'react-router-dom';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import {
  useDeliveryDraftGuard,
  useDeliveryDraftStatus,
} from '@/delivery/drafts/DeliveryDraftGuard';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import {
  StyledChatBoundary,
  StyledChatBubble,
  StyledChatLayout,
  StyledChatLog,
  StyledChatPeople,
} from '@/delivery/chat/chatStyles';
import {
  GET_DELIVERY_CHAT,
  SEND_DELIVERY_CHAT,
  VIEW_DELIVERY_CHAT,
} from '@/delivery/chat/deliveryChatGraphql';
import { useVisibleChatMessages } from '@/delivery/chat/useVisibleChatMessages';
import {
  type DeliveryChatQuery,
  type DeliveryChatQueryVariables,
  type SendDeliveryChatMessageMutation,
  type SendDeliveryChatMessageMutationVariables,
  type ViewDeliveryChatMessagesMutation,
  type ViewDeliveryChatMessagesMutationVariables,
} from '~/generated-metadata/graphql';

type ChatSnapshot = DeliveryChatQuery['deliveryChat'];
export const DeliveryChat = () => {
  const access = useWorkflowAccess();
  return <ChatWorkspace key={access.scope} access={access} />;
};
type ChatWorkspaceProps = { access: ReturnType<typeof useWorkflowAccess> };
const ChatWorkspace = ({ access }: ChatWorkspaceProps) => {
  const { t } = useLingui();
  const [params, setParams] = useSearchParams();
  const peerId = params.get('chatWith') ?? undefined;
  const before = params.get('chatBefore') ?? undefined;
  const [search, setSearch] = useState('');
  const query = useQuery<DeliveryChatQuery, DeliveryChatQueryVariables>(
    GET_DELIVERY_CHAT,
    {
      variables: { input: { peerId, before, search } },
      skip: !access.ready,
      fetchPolicy: 'no-cache',
      pollInterval: 8000,
    },
  );
  const { refetch } = query;
  const candidate = query.data?.deliveryChat;
  const available =
    access.matches(candidate) &&
    !query.error &&
    (candidate?.peer?.id ?? undefined) === peerId &&
    (candidate?.before ?? undefined) === before;
  const [lastData, setLastData] = useState<ChatSnapshot>();
  if (available && candidate !== lastData) setLastData(candidate);
  const data = available ? candidate : lastData;
  const [send, sending] = useMutation<
    SendDeliveryChatMessageMutation,
    SendDeliveryChatMessageMutationVariables
  >(SEND_DELIVERY_CHAT);
  const [view] = useMutation<
    ViewDeliveryChatMessagesMutation,
    ViewDeliveryChatMessagesMutationVariables
  >(VIEW_DELIVERY_CHAT);
  const [draft, setDraft] = useState('');
  const [attempt, setAttempt] = useState<{
    requestId: string;
    recipientId: string;
    text: string;
  } | null>(null);
  const [error, setError] = useState('');
  const [readError, setReadError] = useState(false);
  const [viewedRetry, setViewedRetry] = useState(0);
  const [notice, setNotice] = useState('');
  const { requestAction } = useDeliveryDraftGuard();
  useDeliveryDraftStatus({
    dirty: Boolean(draft.trim()),
    saving: sending.loading,
  });
  const changeConversation = (id: string) =>
    requestAction(() => {
      setDraft('');
      setAttempt(null);
      setError('');
      setNotice('');
      setReadError(false);
      setParams((current) => {
        const next = new URLSearchParams(current);
        next.set('chatWith', id);
        next.delete('chatBefore');
        return next;
      });
    });
  const page = (cursor: string | null) =>
    requestAction(() => {
      setDraft('');
      setAttempt(null);
      setError('');
      setParams((current) => {
        const next = new URLSearchParams(current);
        if (cursor) next.set('chatBefore', cursor);
        else next.delete('chatBefore');
        return next;
      });
    });
  const markViewed = useCallback(
    async (ids: string[]) => {
      if (!available) return false;
      try {
        await view({ variables: { input: { messageIds: ids } } });
      } catch {
        setReadError(true);
        return false;
      }
      setReadError(false);
      try {
        await refetch();
      } catch {
        setNotice(
          t`Viewed status saved. The conversation could not refresh yet.`,
        );
      }
      return true;
    },
    [available, view, refetch, t],
  );
  const submit = async () => {
    if (!available || !data?.peer?.active || !draft.trim() || sending.loading)
      return;
    const input = attempt ?? {
      requestId: crypto.randomUUID(),
      recipientId: data.peer.id,
      text: draft.trim(),
    };
    setAttempt(input);
    setError('');
    setNotice('');
    try {
      await send({ variables: { input } });
    } catch {
      setError(
        t`Could not confirm delivery. Retry send safely with the same message; it will not create a duplicate.`,
      );
      return;
    }
    setDraft('');
    setAttempt(null);
    setNotice(t`Message sent.`);
    try {
      await refetch();
    } catch {
      setNotice(t`Message sent. The conversation could not refresh yet.`);
    }
  };
  return (
    <StyledDeliveryStack>
      <StyledDeliveryCard>
        <h2>
          <Trans>Team chat</Trans>
        </h2>
        <p>
          <Trans>
            Message a teammate directly. An unread message triggers one Telegram
            ping after five minutes, at any time of day.
          </Trans>
        </p>
        {data && !data.telegramReady && (
          <p>
            <Trans>
              Your Telegram reminders are not ready. Link your Telegram account
              in Delivery & reminders and ask an administrator to enable the
              bot.
            </Trans>
          </p>
        )}
      </StyledDeliveryCard>
      {!available && (
        <StyledDeliveryCard>
          <p role={query.error || access.error ? 'alert' : 'status'}>
            {query.error || access.error
              ? t`Could not load your chat. Your draft is kept while you retry.`
              : t`Loading your conversations…`}
          </p>
          {(query.error || access.error) && (
            <StyledDeliveryButton
              onClick={() => {
                void access.refetch();
                void query.refetch();
              }}
            >
              <Trans>Try again</Trans>
            </StyledDeliveryButton>
          )}
        </StyledDeliveryCard>
      )}
      <StyledChatBoundary
        hidden={!available}
        disabled={!available || sending.loading}
      >
        <StyledChatLayout>
          <StyledDeliveryCard>
            <StyledDeliveryStack>
              <label>
                <Trans>Find a teammate</Trans>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <StyledChatPeople aria-label={t`Team conversations`}>
                {data?.people.map((person) => (
                  <StyledDeliveryButton
                    key={person.id}
                    aria-pressed={person.id === peerId}
                    onClick={() => changeConversation(person.id)}
                  >
                    {person.name}
                    {!person.active && ` · ${t`Inactive`}`}
                    {person.unread > 0 && ` · ${t`${person.unread} unread`}`}
                  </StyledDeliveryButton>
                ))}
              </StyledChatPeople>
              {data?.people.length === 0 && (
                <p>
                  <Trans>
                    No teammates found. Invite teammates through workspace
                    settings to start chatting.
                  </Trans>
                </p>
              )}
              {data && data.peopleTotal > data.people.length && (
                <small>
                  <Trans>
                    Showing the first 50 teammates. Search by name to find
                    someone else.
                  </Trans>
                </small>
              )}
            </StyledDeliveryStack>
          </StyledDeliveryCard>
          <StyledDeliveryCard>
            <StyledDeliveryStack>
              {data?.peer ? (
                <>
                  <StyledDeliveryRow>
                    <h3>{data.peer.name}</h3>
                    <small>
                      <Trans>
                        Only the two participants can read this conversation.
                      </Trans>
                    </small>
                  </StyledDeliveryRow>
                  <StyledDeliveryRow>
                    {data.olderCursor && (
                      <StyledDeliveryButton
                        onClick={() => page(data.olderCursor ?? null)}
                      >
                        <Trans>Older messages</Trans>
                      </StyledDeliveryButton>
                    )}
                    {before && (
                      <StyledDeliveryButton onClick={() => page(null)}>
                        <Trans>Latest messages</Trans>
                      </StyledDeliveryButton>
                    )}
                  </StyledDeliveryRow>
                  <ChatMessages
                    key={`${data.peer.id}:${data.before ?? 'latest'}`}
                    data={data}
                    enabled={available}
                    onViewed={markViewed}
                    viewedRetry={viewedRetry}
                  />
                  {readError && (
                    <p role="alert">
                      <Trans>
                        Viewed status could not be saved. A Telegram ping may
                        still be sent.
                      </Trans>{' '}
                      <StyledDeliveryButton
                        onClick={() => setViewedRetry((current) => current + 1)}
                      >
                        <Trans>Retry viewed status</Trans>
                      </StyledDeliveryButton>
                    </p>
                  )}
                  {!data.peer.active ? (
                    <p>
                      <Trans>
                        This teammate is inactive. Previous messages remain
                        available, but you cannot send new messages.
                      </Trans>
                    </p>
                  ) : (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        void submit();
                      }}
                    >
                      <StyledDeliveryStack>
                        <label>
                          <Trans>Message</Trans>
                          <textarea
                            value={draft}
                            maxLength={4000}
                            rows={3}
                            disabled={Boolean(attempt)}
                            onChange={(event) => setDraft(event.target.value)}
                          />
                        </label>
                        <small>{draft.length}/4000</small>
                        {error && <p role="alert">{error}</p>}
                        <StyledDeliveryRow>
                          <StyledDeliveryButton
                            type="submit"
                            disabled={!draft.trim() || sending.loading}
                          >
                            {sending.loading
                              ? t`Sending…`
                              : attempt
                                ? t`Retry send`
                                : t`Send message`}
                          </StyledDeliveryButton>
                          {attempt && (
                            <StyledDeliveryButton
                              type="button"
                              onClick={() =>
                                requestAction(() => {
                                  setAttempt(null);
                                  setDraft('');
                                  setError('');
                                })
                              }
                            >
                              <Trans>Discard draft</Trans>
                            </StyledDeliveryButton>
                          )}
                        </StyledDeliveryRow>
                      </StyledDeliveryStack>
                    </form>
                  )}
                  {notice && <p role="status">{notice}</p>}
                </>
              ) : (
                <p>
                  <Trans>Choose a teammate to open a conversation.</Trans>
                </p>
              )}
            </StyledDeliveryStack>
          </StyledDeliveryCard>
        </StyledChatLayout>
      </StyledChatBoundary>
    </StyledDeliveryStack>
  );
};

type ChatMessagesProps = {
  data: ChatSnapshot;
  enabled: boolean;
  onViewed: (ids: string[]) => Promise<boolean>;
  viewedRetry: number;
};
const ChatMessages = ({
  data,
  enabled,
  onViewed,
  viewedRetry,
}: ChatMessagesProps) => {
  const { t } = useLingui();
  const log = useRef<HTMLDivElement>(null);
  const [followLatest, setFollowLatest] = useState(!data.before);
  const latestMessageId = data.messages.at(-1)?.id;
  useEffect(() => {
    if (log.current && followLatest)
      log.current.scrollTop = log.current.scrollHeight;
  }, [latestMessageId, followLatest]);
  const messageKey =
    `${viewedRetry}:` +
    data.messages
      .map((message) => `${message.id}:${message.viewedAt}`)
      .join('|');
  useVisibleChatMessages(log, messageKey, enabled, onViewed);
  const reminders: Record<string, string> = {
    WAITING: t`Not viewed`,
    QUEUED: t`Telegram ping queued`,
    SENDING: t`Sending Telegram ping`,
    SENT: t`Telegram ping sent`,
    FAILED: t`Telegram ping failed`,
    UNCERTAIN: t`Telegram delivery uncertain; no automatic resend`,
    UNCONFIGURED: t`Telegram not connected`,
    SUPPRESSED: t`Telegram ping no longer needed`,
    VIEWED: t`Viewed`,
  };
  return (
    <StyledChatLog
      ref={log}
      onScroll={(event) => {
        const element = event.currentTarget;
        setFollowLatest(
          element.scrollHeight - element.scrollTop - element.clientHeight < 48,
        );
      }}
      role="log"
      aria-label={t`Conversation messages`}
      aria-live="polite"
    >
      {data.messages.length === 0 && (
        <p>
          <Trans>No messages yet. Start the conversation below.</Trans>
        </p>
      )}
      {data.messages.map((message) => (
        <StyledChatBubble
          key={message.id}
          data-outgoing={message.senderId === data.memberId}
          data-unread-message={
            message.recipientId === data.memberId && !message.viewedAt
              ? message.id
              : undefined
          }
        >
          <strong>
            {message.senderId === data.memberId ? t`You` : message.senderName}
          </strong>
          <p>{message.text}</p>
          <small>{new Date(message.createdAt).toLocaleString()}</small>
          {message.senderId === data.memberId && (
            <small>
              {message.viewedAt
                ? t`Viewed ${new Date(message.viewedAt).toLocaleString()}`
                : (reminders[message.reminderState] ?? t`Not viewed`)}
            </small>
          )}
        </StyledChatBubble>
      ))}
    </StyledChatLog>
  );
};
