import { useLingui } from '@lingui/react/macro';

export const useReconciliationLabels = () => {
  const { t } = useLingui();
  const categories: Record<string, string> = {
    INCOME: t`Money received`,
    EXPENSE: t`Expense paid`,
    SALARY: t`Salary paid`,
  };
  return {
    categories,
    category: (value: string) => categories[value] ?? t`Unavailable direction`,
    warning: (value: string) => {
      const warnings: Record<string, string> = {
        UNASSIGNED_CASH: t`This record has no client assignment. Confirm the client explicitly when linking it.`,
        LEGACY_RECEIPT_MISMATCH: t`A preserved receipt has a different currency or client from its invoice. Correct the original records before adding links.`,
        LEGACY_PAID_WITHOUT_RECEIPT: t`This invoice was marked paid without a linked payment. Review its legacy history before linking more money.`,
        FUTURE_CASH_DATE: t`This payment has a future ledger date. It cannot be linked before that date.`,
        SOURCE_CHANGED: t`This source changed after its earlier links. Review the history and correct the source before adding links.`,
        SOURCE_PROJECT_UNAVAILABLE: t`This source’s client project is unavailable. Restore or correct the source before linking.`,
        SOURCE_VOID: t`This source was voided and cannot receive new links.`,
        OVER_SETTLED: t`Preserved invoice settlements exceed this source amount. Review the history before continuing.`,
        OVER_MATCHED: t`Preserved monthly matches exceed this source amount. Review the history before continuing.`,
      };
      return (
        warnings[value] ??
        t`This source needs review. Check its details and history.`
      );
    },
  };
};
