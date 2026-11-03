import { useLayoutEffect } from 'react';
import { useQuery } from '@apollo/client/react';
import { Link, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import { type useInboxAccess } from '@/delivery/inbox/workspace/useInboxAccess';
import { useInboxLabels } from '@/delivery/inbox/workspace/useInboxLabels';
import { GET_INBOX_REPLIES } from '@/delivery/inbox/workspace/delivery-inbox.graphql';
import { inboxDestination } from '@/delivery/inbox/workspace/inbox-navigation';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
  StyledDeliveryRow,
} from '@/delivery/deliveryStyles';
import { type DeliveryInboxRepliesQuery } from '~/generated-metadata/graphql';
type InboxReplyHistoryProps = {
  state: ReturnType<typeof useInboxAccess>;
  conversationId: string;
  enabled: boolean;
  onDenied: () => void;
};

export const InboxReplyHistory = ({
  state,
  conversationId,
  enabled,
  onDenied,
}: InboxReplyHistoryProps) => {
  const { t } = useLingui();
  const labels = useInboxLabels();
  const [params] = useSearchParams();
  const input = { conversationId, after: params.get('inboxRepliesAfter') };
  const source = `${state.source}:${JSON.stringify(input)}`;
  const query = useQuery<DeliveryInboxRepliesQuery>(GET_INBOX_REPLIES, {
    variables: { input, identity: source },
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    skip: !enabled,
  });
  const reading = useAssistantRead({
    value: query.data?.deliveryInboxReplies,
    source,
    enabled,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches: state.matches,
  });
  useLayoutEffect(() => {
    if (isOtogrowAccessDenied(query.error)) onDenied();
  }, [query.error, onDenied]);
  return (
    <details>
      <summary>
        <Trans>Recorded unsent replies and delivery outcomes</Trans>
      </summary>
      <StyledDeliveryStack>
        {reading.data ? (
          <>
            <p>{t`Showing ${reading.data.items.length} of ${reading.data.totalCount} recorded replies.`}</p>
            {reading.data.items.map((reply) => (
              <div key={reply.id}>
                <Link to={inboxDestination(params, { inboxReply: reply.id })}>
                  {labels.state(reply.status)}
                </Link>
                <p>
                  {reply.actorName ?? t`Recorded teammate`} ·{' '}
                  {new Date(reply.createdAt).toLocaleString()}
                </p>
                {reply.problem && <p>{labels.problem(reply.problem)}</p>}
              </div>
            ))}
            <StyledDeliveryRow>
              {input.after && (
                <Link
                  to={inboxDestination(params, { inboxRepliesAfter: null })}
                >
                  <Trans>First reply history page</Trans>
                </Link>
              )}
              {reading.data.nextCursor && (
                <Link
                  to={inboxDestination(params, {
                    inboxRepliesAfter: reading.data.nextCursor,
                  })}
                >
                  <Trans>More reply history</Trans>
                </Link>
              )}
            </StyledDeliveryRow>
          </>
        ) : (
          <p role={query.error ? 'alert' : 'status'}>
            {query.error
              ? t`Reply history could not be checked.`
              : t`Loading recorded replies…`}
          </p>
        )}
        <StyledDeliveryButton
          type="button"
          disabled={!enabled}
          onClick={() => void query.refetch().catch(() => undefined)}
        >
          <Trans>Refresh reply history</Trans>
        </StyledDeliveryButton>
      </StyledDeliveryStack>
    </details>
  );
};
