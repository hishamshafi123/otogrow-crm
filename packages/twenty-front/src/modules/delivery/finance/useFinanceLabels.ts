import { useLingui } from '@lingui/react/macro';

export const PRIMARY_FINANCE_CURRENCIES: readonly string[] = [
  'INR',
  'USD',
  'QAR',
  'AED',
];
export const DELIVERY_CURRENCIES: readonly string[] = [
  'INR',
  'USD',
  'QAR',
  'AED',
  'EUR',
  'GBP',
  'SGD',
  'AUD',
  'CAD',
];

export const useFinanceLabels = () => {
  const { t } = useLingui();
  const planTypes: Record<string, string> = {
    SALARY: t`Salary`,
    OVERHEAD: t`Overhead`,
  };
  const entryKinds: Record<string, string> = {
    REVENUE: t`Revenue`,
    COST: t`Cost`,
  };
  const entryStatuses: Record<string, string> = {
    DRAFT: t`Draft`,
    POSTED: t`Posted`,
    VOID: t`Voided`,
  };
  const sourceTypes: Record<string, string> = {
    MANUAL: t`Manual entry`,
    PLAN: t`Monthly cost plan`,
    AI_SPEND: t`Recorded production AI charge`,
  };
  const categories: Record<string, string> = {
    SERVICE_REVENUE: t`Service revenue`,
    DIRECT_COST: t`Direct cost`,
    SALARY: t`Salary`,
    OVERHEAD: t`Overhead`,
  };
  const sourceWarnings: Record<string, string> = {
    SOURCE_PLAN_CHANGED: t`The plan changed after this draft was prepared. Review the saved source amount and the current plan before posting.`,
    SOURCE_PLAN_INACTIVE: t`The source plan is now inactive. Confirm whether this cost still belongs in this month.`,
    SOURCE_PLAN_MISSING: t`The source plan is no longer available. Review the saved source evidence before posting.`,
    SOURCE_MEMBER_INACTIVE: t`The employee linked to the source plan is no longer active. Review the amount and effective month before posting.`,
  };
  const currencies = [...DELIVERY_CURRENCIES];
  return {
    planTypes,
    entryKinds,
    entryStatuses,
    sourceTypes,
    categories,
    sourceWarnings,
    currencies,
    warning: (value: string) =>
      sourceWarnings[value] ??
      t`The source needs review before this entry can be posted.`,
  };
};
