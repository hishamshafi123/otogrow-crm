import { Trans, useLingui } from '@lingui/react/macro';
import { type EscalationConfiguration } from '@/delivery/founder/escalation/escalation.types';
import { useEscalationLabels } from '@/delivery/founder/escalation/useEscalationLabels';

type EscalationConfigurationDetailsProps = {
  configuration?: EscalationConfiguration | null;
};
export const EscalationConfigurationDetails = ({
  configuration,
}: EscalationConfigurationDetailsProps) => {
  const { t } = useLingui();
  const labels = useEscalationLabels();
  return (
    <details>
      <summary>
        <Trans>Configuration recorded for this event</Trans>
      </summary>
      {configuration ? (
        <>
          <p>
            {configuration.name} · {t`Version ${configuration.revision}`}
          </p>
          <p>{labels.reason(configuration.condition)}</p>
          {configuration.condition === 'TASK_REVIEW_WAIT' && (
            <p>
              {configuration.minimumReviewWaitHours
                ? t`Pending for at least ${configuration.minimumReviewWaitHours} hours since submission`
                : t`Minimum review wait is unavailable`}
            </p>
          )}
          <p>
            {configuration.priority === 'URGENT' ? t`Urgent` : t`Normal`} ·{' '}
            {configuration.projectScope === 'ALL'
              ? t`All client projects`
              : configuration.projectIds.length
                ? t`Selected client projects`
                : t`No client projects; company-only scope`}{' '}
            ·{' '}
            {configuration.includeCompany
              ? t`Company / unassigned included`
              : t`Company / unassigned excluded`}
          </p>
          {configuration.projectIds.length > 0 && (
            <p>
              {t`Recorded client project IDs`}:{' '}
              {configuration.projectIds.join(', ')}
            </p>
          )}
          {configuration.currency && (
            <p>
              {t`Currency`}: {configuration.currency}
            </p>
          )}
          {configuration.serviceMonth && (
            <p>
              {t`Service month`}: {configuration.serviceMonth}
            </p>
          )}
          <p>
            {configuration.repeatMode === 'ONCE'
              ? t`Once per observed issue`
              : t`Repeat after ${configuration.repeatHours} hours following a successful send, up to ${configuration.maxSends} sends per issue.`}
          </p>
        </>
      ) : (
        <p>
          <Trans>
            The original configuration for this event is unavailable. It is not
            reconstructed from the current rule.
          </Trans>
        </p>
      )}
    </details>
  );
};
