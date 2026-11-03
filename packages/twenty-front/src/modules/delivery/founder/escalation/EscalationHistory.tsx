import { Link } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  type EscalationDestination,
  type EscalationNotice,
} from '@/delivery/founder/escalation/escalation.types';
import { useEscalationLabels } from '@/delivery/founder/escalation/useEscalationLabels';
import { StyledEscalationEntry } from '@/delivery/founder/escalation/escalationStyles';
import { EscalationConfigurationDetails } from '@/delivery/founder/escalation/EscalationConfigurationDetails';
import { StyledDeliveryStack } from '@/delivery/deliveryStyles';

type EscalationHistoryProps = {
  notices: EscalationNotice[];
  destination: EscalationDestination;
  nextNoticeId?: string | null;
  hasCursor: boolean;
};
export const EscalationHistory = ({
  notices,
  destination,
  nextNoticeId,
  hasCursor,
}: EscalationHistoryProps) => {
  const { t } = useLingui();
  const labels = useEscalationLabels();
  return (
    <section aria-label={t`Founder alert occurrence history`}>
      <StyledDeliveryStack>
        <h3>
          <Trans>Recorded occurrence history</Trans>
        </h3>
        {!notices.length && (
          <p>
            <Trans>
              No recorded alert or configuration events in this selection.
            </Trans>
          </p>
        )}
        {notices.map((notice) => (
          <StyledEscalationEntry
            key={notice.id}
            aria-label={labels.kind(notice.kind)}
          >
            <strong>
              {labels.kind(notice.kind)} ·{' '}
              {t`Rule version ${notice.ruleRevision}`}
            </strong>
            <p>
              {notice.actorName || t`Recorded actor unavailable`} ·{' '}
              <time dateTime={notice.createdAt}>
                {new Date(notice.createdAt).toLocaleString(undefined, {
                  timeZone: 'UTC',
                })}{' '}
                UTC
              </time>
            </p>
            <p>
              {notice.priority === 'URGENT' ? t`Urgent` : t`Normal`} ·{' '}
              {t`Recorded recipient`}:{' '}
              {notice.recipientName || t`Unavailable administrator`}
            </p>
            <p>
              <strong>{labels.status(notice.transportStatus)}</strong>
              {notice.kind === 'ALERT'
                ? ` · ${t`Occurrence ${notice.sequence}`}`
                : ''}
            </p>
            {notice.reason && <p>{notice.reason}</p>}
            <EscalationConfigurationDetails
              configuration={notice.configuration}
            />
            {notice.transportStatus === 'SENT' && (
              <p>
                <Trans>
                  Telegram accepted this send. Recipient reading and source
                  resolution are not confirmed.
                </Trans>
              </p>
            )}
            {['UNCERTAIN', 'FAILED'].includes(notice.transportStatus) && (
              <p role="status">
                <Trans>
                  No automatic resend. Check Telegram and the recorded outcome
                  before any manual follow-up.
                </Trans>
              </p>
            )}
            {notice.error && <p>{labels.outcomeDetail(notice.error)}</p>}
            {notice.attemptedAt && (
              <small>
                {t`Attempted at`}:{' '}
                {new Date(notice.attemptedAt).toLocaleString(undefined, {
                  timeZone: 'UTC',
                })}{' '}
                UTC
              </small>
            )}
            {notice.finishedAt && (
              <small>
                {t`Outcome recorded at`}:{' '}
                {new Date(notice.finishedAt).toLocaleString(undefined, {
                  timeZone: 'UTC',
                })}{' '}
                UTC
              </small>
            )}
            {notice.episodeId && (
              <Link
                to={destination({
                  founderRule: notice.ruleId,
                  founderIssue: notice.episodeId,
                  founderIssuesAfter: null,
                  founderNoticesAfter: null,
                })}
              >
                <Trans>Open the recorded issue</Trans>
              </Link>
            )}
          </StyledEscalationEntry>
        ))}
        {nextNoticeId && (
          <Link to={destination({ founderNoticesAfter: nextNoticeId })}>
            <Trans>Older occurrence receipts</Trans>
          </Link>
        )}
        {hasCursor && (
          <Link to={destination({ founderNoticesAfter: null })}>
            <Trans>Latest occurrence receipts</Trans>
          </Link>
        )}
      </StyledDeliveryStack>
    </section>
  );
};
