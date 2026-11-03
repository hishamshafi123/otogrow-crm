import { useLingui } from '@lingui/react/macro';
import { useFounderLabels } from '@/delivery/founder/useFounderLabels';

export const useEscalationLabels = () => {
  const { t } = useLingui();
  const founder = useFounderLabels();
  const statuses: Record<string, string> = {
    OPEN: t`Issue remains open`,
    UNAVAILABLE: t`Source cannot currently be verified`,
    RESOLVED: t`Source was observed clear`,
    WITHDRAWN: t`Rule no longer applies`,
    QUEUED: t`Queued for Telegram`,
    SENDING: t`Send attempt in progress`,
    SENT: t`Accepted by Telegram`,
    FAILED: t`Telegram send failed`,
    UNCERTAIN: t`Telegram delivery uncertain`,
    SUPPRESSED: t`Send no longer eligible`,
    UNCONFIGURED: t`Telegram setup unavailable`,
    NOT_APPLICABLE: t`Configuration event; no message`,
  };
  const kinds: Record<string, string> = {
    ALERT: t`Alert occurrence`,
    RULE_SAVED: t`Rule saved paused`,
    RULE_ENABLED: t`Rule enabled`,
    RULE_PAUSED: t`Rule paused`,
    ACKNOWLEDGED: t`Issue acknowledged`,
  };
  const warnings: Record<string, string> = {
    LEGACY_ROUTING_WILL_BE_REPLACED: t`Enabling requires explicit adoption of configurable founder routing. Legacy founder alert pings will stop.`,
    SOURCE_COVERAGE_PARTIAL: t`Some source coverage is incomplete. Only positively observed matching issues can notify; unavailable evidence is not treated as resolved.`,
    BOT_NOT_CONFIGURED: t`Configure an active workspace Telegram bot before enabling this rule.`,
    TELEGRAM_DISABLED: t`Telegram delivery is paused in Delivery & reminders.`,
    RECIPIENT_NOT_LINKED: t`The chosen recipient must link their own Telegram account in Delivery & reminders.`,
    RECIPIENT_INELIGIBLE: t`Choose a currently active administrator as recipient.`,
    GRANTING_ADMIN_INELIGIBLE: t`The administrator who granted this rule is no longer eligible. Review and save the rule again.`,
    LEGACY_ROUTING_ACTIVE: t`Legacy founder alerts still control routing. Enabling a rule requires explicit adoption of configurable rules.`,
    INCOMPLETE_SOURCE_COVERAGE: t`Some source evidence could not be verified. It cannot be treated as resolved.`,
    SOURCE_UNAVAILABLE: t`Source evidence is unavailable. Keep the rule paused and retry its preview.`,
  };
  const details: Record<string, string> = {
    RULE_OR_SOURCE_CHANGED: t`The rule or source changed before sending. Review the current rule and source.`,
    AUTHORITY_UNAVAILABLE: t`Current granting or recipient authority is unavailable. Review administrator eligibility.`,
    ROUTING_NOT_ADOPTED: t`Configurable founder routing has not been adopted.`,
    SOURCE_EVALUATION_UNAVAILABLE: t`Source evidence could not be evaluated. No clear or resolved source was inferred.`,
    SOURCE_CLEARED: t`The source was observed clear before the send claim.`,
    SOURCE_UNAVAILABLE: t`The source is unavailable. No resolution or automatic retry was inferred.`,
    TELEGRAM_SETUP_UNAVAILABLE: t`The workspace bot, Telegram channel or recipient link is unavailable. Review setup.`,
    FOUNDER_RULE_ROUTING_ADOPTED: t`Legacy founder routing was replaced by explicitly adopted rules.`,
  };
  return {
    ...founder,
    status: (code: string) => statuses[code] ?? t`Status needs review`,
    kind: (code: string) => kinds[code] ?? t`Recorded alert event`,
    setupWarning: (code: string) => warnings[code] ?? founder.warning(code),
    outcomeDetail: (value: string) => details[value] ?? value,
  };
};
