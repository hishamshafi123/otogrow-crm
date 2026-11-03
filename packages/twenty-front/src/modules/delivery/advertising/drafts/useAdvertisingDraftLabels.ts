import { useLingui } from '@lingui/react/macro';

export const useAdvertisingDraftLabels = () => {
  const { t } = useLingui();
  const statuses: Record<string, string> = {
    QUEUED: t`Waiting to start`,
    RUNNING: t`Preparing suggestions`,
    SUCCEEDED: t`Suggestions ready`,
    FAILED: t`Could not complete`,
    CANCELLED: t`Cancelled`,
  };
  const reasons: Record<string, string> = {
    SOURCE_CHANGED: t`The report or its current responsibilities changed.`,
    EVIDENCE_CHANGED: t`The report evidence changed.`,
    OUTPUT_CONTRACT_CHANGED: t`The suggestion format changed.`,
    KNOWLEDGE_CHANGED: t`Published brand knowledge changed.`,
    ASSISTANT_CHANGED_OR_UNAVAILABLE: t`The assistant changed or is no longer available.`,
  };
  return {
    status: (value: string) => statuses[value] ?? t`Status unavailable`,
    reason: (value: string) =>
      reasons[value] ?? t`Current suggestion eligibility needs review.`,
  };
};
