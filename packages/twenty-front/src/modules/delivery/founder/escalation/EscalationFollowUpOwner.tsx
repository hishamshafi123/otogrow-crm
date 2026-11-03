import { Trans, useLingui } from '@lingui/react/macro';
import { type EscalationRule } from '@/delivery/founder/escalation/escalation.types';

type EscalationFollowUpOwnerProps = { rule?: EscalationRule };
export const EscalationFollowUpOwner = ({
  rule,
}: EscalationFollowUpOwnerProps) => {
  const { t } = useLingui();
  return (
    <p>
      <strong>
        <Trans>Current alert follow-up owner</Trans>:
      </strong>{' '}
      {rule
        ? rule.recipientName || t`Administrator name unavailable`
        : t`Not available on this page; open the rule to check current responsibility.`}
      {rule
        ? ` · ${rule.recipientEligible ? t`Eligible administrator` : t`Eligibility needs review`}`
        : ''}{' '}
      <small>
        <Trans>Source ownership remains separate.</Trans>
      </small>
    </p>
  );
};
