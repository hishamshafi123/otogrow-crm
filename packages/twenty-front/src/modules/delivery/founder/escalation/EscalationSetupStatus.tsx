import { Link } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { SettingsPath } from 'twenty-shared/types';
import { getSettingsPath } from 'twenty-shared/utils';
import {
  type EscalationRule,
  type EscalationSnapshot,
} from '@/delivery/founder/escalation/escalation.types';

type EscalationSetupStatusProps = {
  snapshot: EscalationSnapshot;
  rule?: EscalationRule | null;
};
export const EscalationSetupStatus = ({
  snapshot,
  rule,
}: EscalationSetupStatusProps) => {
  const { t } = useLingui();
  return (
    <section aria-label={t`Founder alert setup status`}>
      <h3>
        <Trans>Alert setup</Trans>
      </h3>
      <p>
        {snapshot.routingAdopted
          ? t`Configurable routing adopted`
          : t`Legacy routing active`}{' '}
        ·{' '}
        {snapshot.telegramEnabled
          ? t`Workspace Telegram channel enabled`
          : t`Workspace Telegram channel paused`}{' '}
        ·{' '}
        {snapshot.botConfigured
          ? t`Workspace bot configured`
          : t`Workspace bot not configured`}
      </p>
      {rule && (
        <p>
          {rule.recipientName || t`Administrator name unavailable`} ·{' '}
          {rule.recipientEligible
            ? t`Currently eligible`
            : t`Not currently eligible`}{' '}
          ·{' '}
          {snapshot.linkedRecipientIds.includes(rule.recipientId)
            ? t`Telegram linked`
            : t`Telegram not linked`}
        </p>
      )}
      <p>
        <Link to={getSettingsPath(SettingsPath.SettersTelegram)}>
          <Trans>Telegram settings</Trans>
        </Link>
        {' · '}
        <Link to="/delivery?view=operations">
          <Trans>Channel settings and personal linking</Trans>
        </Link>
      </p>
      <details>
        <summary>
          <Trans>Routing, worker and delivery details</Trans>
        </summary>
        <p>
          {snapshot.routingAdopted
            ? t`Configurable rule routing adopted. Pausing every rule does not reactivate legacy founder pings.`
            : t`Legacy founder routing is still active. Saving a paused rule does not adopt configurable routing.`}
        </p>
        <p>
          {snapshot.workerObservedAt
            ? t`Latest recorded worker evaluation: ${new Date(snapshot.workerObservedAt).toLocaleString(undefined, { timeZone: 'UTC' })} UTC`
            : t`Worker evaluation has not been observed.`}
        </p>
        <p>
          <Trans>
            Configuration and recorded evaluation do not prove a message was
            sent or read. Inspect each occurrence receipt below.
          </Trans>
        </p>
        <p>
          <Trans>
            Founder rules run 24/7 independently of Delivery task scheduling.
            Pause founder rules here.
          </Trans>
        </p>
        <p>
          <Trans>
            Each recipient links their own Telegram account. Saving or
            previewing a rule sends no message.
          </Trans>
        </p>
      </details>
    </section>
  );
};
