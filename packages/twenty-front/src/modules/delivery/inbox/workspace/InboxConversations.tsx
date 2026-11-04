import { useLayoutEffect } from 'react';
import { useQuery } from '@apollo/client/react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import { type useInboxAccess } from '@/delivery/inbox/workspace/useInboxAccess';
import { GET_INBOX_CONVERSATIONS } from '@/delivery/inbox/workspace/delivery-inbox.graphql';
import {
  inboxDestination,
  INBOX_CLOSE_CONVERSATION,
} from '@/delivery/inbox/workspace/inbox-navigation';
import { useInboxLabels } from '@/delivery/inbox/workspace/useInboxLabels';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { type DeliveryInboxConversationsQuery } from '~/generated-metadata/graphql';
type InboxConversationsProps = {
  state: ReturnType<typeof useInboxAccess>;
  onDenied: () => void;
};

export const InboxConversations = ({
  state,
  onDenied,
}: InboxConversationsProps) => {
  const { t } = useLingui();
  const labels = useInboxLabels();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { requestAction } = useDeliveryDraftGuard();
  const input = {
    search: params.get('inboxSearch'),
    after: params.get('inboxAfter'),
  };
  const source = `${state.source}:${JSON.stringify(input)}`;
  const query = useQuery<DeliveryInboxConversationsQuery>(
    GET_INBOX_CONVERSATIONS,
    {
      variables: { input, identity: source },
      fetchPolicy: 'no-cache',
      notifyOnNetworkStatusChange: true,
      skip: state.data === null,
    },
  );
  const reading = useAssistantRead({
    value: query.data?.deliveryInboxConversations,
    source,
    enabled: state.data !== null,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches: state.matches,
  });
  useLayoutEffect(() => {
    if (isOtogrowAccessDenied(query.error)) onDenied();
  }, [query.error, onDenied]);
  return (
    <section aria-label={t`Client conversations`}>
      <StyledDeliveryStack>
        <h2>
          <Trans>Conversations</Trans>
        </h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const search = String(
              new FormData(event.currentTarget).get('search') ?? '',
            ).trim();
            if (
              search === (params.get('inboxSearch') ?? '') &&
              !params.has('inboxAfter')
            )
              return;
            requestAction(() =>
              navigate(
                inboxDestination(params, {
                  inboxSearch: search,
                  inboxAfter: null,
                }),
              ),
            );
          }}
        >
          <label>
            <Trans>Find a conversation</Trans>
            <input
              key={input.search ?? ''}
              name="search"
              maxLength={160}
              defaultValue={input.search ?? ''}
            />
          </label>
          <StyledDeliveryButton type="submit">
            <Trans>Find conversations</Trans>
          </StyledDeliveryButton>
        </form>
        {reading.data ? (
          <>
            <p>{t`Showing ${reading.data.items.length} of ${reading.data.totalCount} conversations.`}</p>
            {reading.data.items.map((conversation) => (
              <StyledDeliveryCard key={conversation.id}>
                <Link
                  to={inboxDestination(params, {
                    ...INBOX_CLOSE_CONVERSATION,
                    inboxConversation: conversation.id,
                  })}
                >
                  {conversation.title}
                </Link>
                <p>
                  {conversation.projectName} ·{' '}
                  {labels.channel(conversation.channel)}
                </p>
                <p>
                  {conversation.connected
                    ? t`Shared Gmail thread`
                    : t`Manual conversation — no live channel connection`}
                  {conversation.private ? ` · ${t`Private to its owner`}` : ''}
                </p>
              </StyledDeliveryCard>
            ))}
            {reading.data.totalCount === 0 && (
              <div>
                <p>
                  {state.data?.canManageConversations
                    ? t`Create a conversation with a client project and an owner. Its Gmail owner can then connect one thread and choose who may use it.`
                    : t`No conversations have been shared with you. Ask an administrator to add you to the client conversation.`}
                </p>
                {state.data?.canManageConversations && (
                  <Link to="/delivery?view=inbox&inboxView=legacy">
                    <Trans>Set up a conversation</Trans>
                  </Link>
                )}
              </div>
            )}
            {reading.data.nextCursor && (
              <Link
                to={inboxDestination(params, {
                  inboxAfter: reading.data.nextCursor,
                })}
              >
                <Trans>More conversations</Trans>
              </Link>
            )}
          </>
        ) : (
          <p role={query.error ? 'alert' : 'status'}>
            {query.error
              ? t`Conversations could not be checked.`
              : t`Loading conversations…`}
          </p>
        )}
        {(input.after || query.error) && (
          <Link to={inboxDestination(params, { inboxAfter: null })}>
            <Trans>First conversation page</Trans>
          </Link>
        )}
        <StyledDeliveryButton
          type="button"
          onClick={() => void query.refetch().catch(() => undefined)}
        >
          <Trans>Refresh conversations</Trans>
        </StyledDeliveryButton>
        <Link to="/delivery?view=inbox&inboxView=legacy">
          <Trans>Manual conversations and access settings</Trans>
        </Link>
      </StyledDeliveryStack>
    </section>
  );
};
