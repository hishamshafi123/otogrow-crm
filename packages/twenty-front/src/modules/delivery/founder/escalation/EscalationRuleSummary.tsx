import { Trans, useLingui } from '@lingui/react/macro';
import {
  type EscalationRule,
  type EscalationSnapshot,
} from '@/delivery/founder/escalation/escalation.types';
import { useEscalationLabels } from '@/delivery/founder/escalation/useEscalationLabels';

type EscalationRuleSummaryProps = {
  rule: EscalationRule;
  projects: EscalationSnapshot['projects'];
};
export const EscalationRuleSummary = ({
  rule,
  projects,
}: EscalationRuleSummaryProps) => {
  const { t } = useLingui();
  const labels = useEscalationLabels();
  return (
    <>
      <p>
        <strong>{rule.name}</strong> · {rule.enabled ? t`Enabled` : t`Paused`} ·{' '}
        {t`Version ${rule.revision}`}
      </p>
      <p>{labels.reason(rule.condition)}</p>
      {rule.condition === 'TASK_REVIEW_WAIT' && (
        <p>
          {rule.minimumReviewWaitHours
            ? t`Pending for at least ${rule.minimumReviewWaitHours} hours since submission`
            : t`Minimum review wait is unavailable`}
        </p>
      )}
      <p>
        {t`Alert follow-up owner and Telegram recipient`}:{' '}
        {rule.recipientName || t`Unavailable administrator`} ·{' '}
        {rule.priority === 'URGENT' ? t`Urgent` : t`Normal`}
      </p>
      <small>
        <Trans>
          This person reviews issues and arranges next steps. Source task
          ownership is separate.
        </Trans>
      </small>
      <p>
        {t`Client scope`}:{' '}
        {rule.projectScope === 'ALL'
          ? t`All client projects`
          : !rule.projectIds.length
            ? t`No client projects; company-only scope`
            : rule.projectIds
                .map(
                  (id) =>
                    projects.find((project) => project.id === id)?.name ??
                    t`Unavailable client project`,
                )
                .join(', ')}{' '}
        ·{' '}
        {rule.includeCompany
          ? t`Company / unassigned included`
          : t`Company / unassigned excluded`}
      </p>
      {rule.currency && (
        <p>
          {t`Currency`}: {rule.currency}
        </p>
      )}
      {rule.serviceMonth && (
        <p>
          {t`Service month`}: {rule.serviceMonth}
        </p>
      )}
      <p>
        {rule.repeatMode === 'ONCE'
          ? t`Once per observed issue`
          : t`Repeat after ${rule.repeatHours} hours following a successful send, up to ${rule.maxSends} sends per issue.`}
      </p>
      {!rule.recipientEligible && (
        <p role="status">
          <Trans>
            The recipient is no longer an eligible administrator. Review this
            rule before enabling.
          </Trans>
        </p>
      )}
      {!rule.grantingAdminEligible && (
        <p role="status">
          <Trans>
            The granting administrator is no longer eligible. Review and save
            the rule again.
          </Trans>
        </p>
      )}
      {rule.lastEvaluatedAt && (
        <small>
          {t`Last evaluated`}:{' '}
          {new Date(rule.lastEvaluatedAt).toLocaleString(undefined, {
            timeZone: 'UTC',
          })}{' '}
          UTC
        </small>
      )}
      {rule.evaluationError && (
        <p role="status">{labels.outcomeDetail(rule.evaluationError)}</p>
      )}
    </>
  );
};
