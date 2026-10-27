import { useLingui } from '@lingui/react/macro';

export const useFinancePeriodLabels = () => {
  const { t } = useLingui();
  const limitations: Record<string, string> = {
    ALL_CURRENCIES: t`This review covers every currency in the month, regardless of the results filter. Currencies remain separate.`,
    MANAGEMENT_RESULTS_ONLY: t`This protects recorded management results. It is not an accounting or tax close.`,
    COST_COMPLETENESS_NOT_VERIFIED: t`Completeness is not verified. Unprepared plans and unrecognized AI costs may still be missing; their service month is not assumed.`,
    CASH_AND_EVIDENCE_REMAIN_OPEN: t`Actual payments, invoice settlement, monthly matching and incoming AI evidence remain available.`,
    EMPTY_RECORDED_RESULTS: t`This month has no posted results. Locking does not confirm that all activity was recorded.`,
    LOCK_HISTORY_UNAVAILABLE: t`The earlier lock history could not be verified. Review the month’s history before another change.`,
    LOCKED_RECOGNITION_CHANGED: t`Recorded results differ from the last lock. Refresh and review the month’s history before another change.`,
  };
  return {
    status: (value: string) =>
      value === 'OPEN'
        ? t`Open`
        : value === 'LOCKED'
          ? t`Locked`
          : t`Needs review`,
    limitation: (value: string) =>
      limitations[value] ??
      t`This month has a limitation that needs review before its result status changes.`,
    blocker: (value: string) =>
      value === 'CROSS_MONTH_CORRECTION'
        ? t`This correction in another month would replace a result here.`
        : t`This draft must be posted or voided before the month can be locked.`,
  };
};
