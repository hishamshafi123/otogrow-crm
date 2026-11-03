import { useLingui } from '@lingui/react/macro';

export const useActivityAnalysisLabels = () => {
  const { t } = useLingui();
  const statuses: Record<string, string> = {
    QUEUED: t`Queued`,
    RUNNING: t`Analyzing recorded work`,
    SUCCEEDED: t`Analysis ready`,
    FAILED: t`Analysis failed`,
    CANCELLED: t`Cancelled`,
  };
  const reasons: Record<string, string> = {
    EMPTY_EVIDENCE: t`No recorded evidence matches this scope. No AI request is needed.`,
    TOO_MUCH_EVIDENCE: t`Narrow the dates or filters before starting.`,
    EVIDENCE_LIMIT_EXCEEDED: t`Narrow the dates or filters before starting.`,
    EVIDENCE_CHANGED: t`Recorded evidence changed. Preview the current scope again.`,
    ASSISTANT_UNAVAILABLE: t`This assistant is currently unavailable.`,
    PRICING_UNAVAILABLE: t`A verified price is required before starting.`,
    BUDGET_UNAVAILABLE: t`The workspace spending limit needs review.`,
  };
  return {
    status: (value: string) => statuses[value] ?? t`Status unavailable`,
    reason: (value: string) => reasons[value] ?? value,
    money: (value: string | null | undefined) =>
      value == null ? t`Unknown` : `${value} USD`,
  };
};
