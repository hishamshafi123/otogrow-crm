import { useLingui } from '@lingui/react/macro';
export const useInboxLabels = () => {
  const { t } = useLingui();
  const states: Record<string, string> = {
    GENERATING: t`Preparing an unsent AI draft`,
    DRAFT: t`Unsent draft — review before sending`,
    QUEUED: t`Reviewed send requested — waiting for dispatch`,
    SENDING: t`Sending — cannot be recalled`,
    SENT: t`Sent`,
    FAILED: t`Failed — inspect the recorded reason`,
    UNCERTAIN: t`Delivery uncertain — check Sent mail before any new reply`,
    CANCELLED: t`Cancelled before dispatch`,
  };
  const problems: Record<string, string> = {
    OWNER_CONSENT_REVOKED: t`The Gmail owner withdrew this thread connection.`,
    RECONNECT_GMAIL: t`The owner needs to reconnect Gmail in Accounts settings.`,
    NATIVE_SYNC_PAUSED: t`Native Gmail synchronization is paused. This view is not a live mailbox.`,
    SOURCE_OR_CONSENT_CHANGED_PREPARE_AGAIN: t`The thread or owner consent changed. Prepare and review a new reply using current evidence.`,
    DELIVERY_UNCERTAIN_CHECK_SENT_MAIL_DO_NOT_RESEND: t`The sending result is uncertain. Do not resend this reply. Check native Sent mail first.`,
    DRAFT_INTERRUPTED_NO_EMAIL_SENT: t`Draft preparation was interrupted before any email was sent.`,
    DRAFT_FAILED_OR_ACCESS_CHANGED: t`Draft preparation failed or source access changed. No generated draft was sent.`,
  };
  return {
    state: (value: string) => states[value] ?? t`Recorded reply`,
    problem: (value: string) =>
      problems[value] ??
      t`This operation needs attention. Inspect its current connection and recorded status.`,
    channel: (value: string) =>
      value === 'EMAIL'
        ? t`Email`
        : value === 'SLACK'
          ? t`Slack — manual records`
          : value === 'WHATSAPP'
            ? t`WhatsApp — manual records`
            : t`Manual conversation`,
  };
};
