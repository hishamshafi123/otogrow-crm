import { useLingui } from '@lingui/react/macro';
export const useRevisionLabels = () => {
  const { t } = useLingui();
  const causes = {
    UNCLASSIFIED: t`Not classified`,
    INTERNAL_DEFECT: t`Internal defect`,
    CLIENT_PREFERENCE: t`Client preference`,
    SCOPE_CHANGE: t`Scope change`,
    OTHER: t`Other reason`,
  };
  const sources = {
    INTERNAL_REVIEW: t`Internal review`,
    CLIENT_REDO: t`Client delivery follow-up`,
    CREATIVE_REOPEN: t`Creative reopened`,
    WORKFLOW_REOPEN: t`Requirements changed`,
  };
  const label = (value: string) =>
    ({ ...causes, ...sources })[
      value as keyof typeof causes | keyof typeof sources
    ] ?? value;
  const money = (
    amount: number | null | undefined,
    currency: string | null | undefined,
  ) =>
    amount === null || amount === undefined
      ? t`Not recorded`
      : currency
        ? `${currency} ${(amount / 100).toFixed(2)}`
        : amount === 0
          ? t`0 (no charge)`
          : t`Currency missing`;
  return { causes, label, money };
};
