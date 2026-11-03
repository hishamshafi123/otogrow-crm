import { useLingui } from '@lingui/react/macro';
export const useCapacityReadLabels = () => {
  const { t } = useLingui();
  const warnings: Record<string, string> = {
    UNAVAILABLE_PRODUCTION_OWNER: t`Production assignments have no active owner. Their work remains unresolved.`,
    UNAVAILABLE_REVIEW_OWNER: t`Review assignments have no active owner. No primary reviewer is substituted.`,
    UNAVAILABLE_REVIEWER: t`A reserved reviewer is currently ineligible. The reservation is retained until a manager changes it.`,
    INVALID_PLAN_SOURCE: t`Some current planning information is invalid. Open the task and review its dates and estimates.`,
    INVALID_AVAILABILITY: t`Saved availability is invalid and is shown as unknown. Set the exact day’s availability to repair it.`,
  };
  return {
    warning: (code: string) =>
      warnings[code] ??
      t`Some current planning information needs a source check.`,
    minutes: (value: number | null | undefined) =>
      value == null ? t`Unknown` : t`${value} min`,
  };
};
