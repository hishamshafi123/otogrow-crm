import { Link, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { type DeliveryInboxMessagesQuery } from '~/generated-metadata/graphql';
import { StyledInboxMessage } from '@/delivery/inbox/workspace/inboxWorkspaceStyles';
import { inboxDestination } from '@/delivery/inbox/workspace/inbox-navigation';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
type InboxMessagesProps = {
  value: DeliveryInboxMessagesQuery['deliveryInboxMessages'];
  onRefresh: () => void;
};

export const InboxMessages = ({ value, onRefresh }: InboxMessagesProps) => {
  const { t } = useLingui();
  const [params] = useSearchParams();
  return (
    <section aria-label={t`Selected Gmail thread messages`}>
      <StyledDeliveryStack>
        <h3>
          <Trans>Imported thread messages</Trans>
        </h3>
        <p>{t`Showing ${value.items.length} of ${value.totalCount} imported messages, newest first.`}</p>
        <p>
          <Trans>
            Messages are plain text from native synchronization. Attachments are
            not available in this view; inspect the original email for files and
            formatting.
          </Trans>
        </p>
        {value.items.map((message) => (
          <StyledInboxMessage key={message.id} data-inbox-message={message.id}>
            <strong>{message.subject || t`No subject`}</strong>
            <p>
              {message.direction === 'INCOMING' ? t`Incoming` : t`Outgoing`} ·{' '}
              {message.receivedAt
                ? new Date(message.receivedAt).toLocaleString()
                : t`Time not recorded`}
            </p>
            <p>
              {message.participants
                .filter((person) => person.role.toLowerCase() === 'from')
                .map((person) =>
                  person.displayName
                    ? `${person.displayName} <${person.handle}>`
                    : person.handle,
                )
                .join(', ') || t`Sender not available`}
            </p>
            {message.participantsTruncated && (
              <p role="status">
                <Trans>
                  Participant information is incomplete. This message cannot be
                  used as a reply target or AI source here.
                </Trans>
              </p>
            )}
            <div>{message.text}</div>
            {message.textTruncated && (
              <p role="status">
                <Trans>
                  Text preview is shortened. This incomplete message cannot feed
                  an AI draft.
                </Trans>
              </p>
            )}
          </StyledInboxMessage>
        ))}
        <StyledDeliveryRow>
          {params.has('inboxMessagesAfter') && (
            <Link to={inboxDestination(params, { inboxMessagesAfter: null })}>
              <Trans>Newest messages</Trans>
            </Link>
          )}
          {value.nextCursor && (
            <Link
              to={inboxDestination(params, {
                inboxMessagesAfter: value.nextCursor,
              })}
            >
              <Trans>Earlier messages</Trans>
            </Link>
          )}
          <StyledDeliveryButton type="button" onClick={onRefresh}>
            <Trans>Refresh imported messages</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryRow>
      </StyledDeliveryStack>
    </section>
  );
};
