type FinancePaymentDestination = {
  currency: string;
} & (
  | { cashId: string; receivableId?: never; entryId?: never }
  | { receivableId: string; cashId?: never; entryId?: never }
  | { entryId: string; cashId?: never; receivableId?: never }
);

export const financePaymentDestination = (
  source: FinancePaymentDestination,
): string => {
  const params = new URLSearchParams({
    view: 'finance',
    financeView: 'payments',
    financeCurrency: source.currency,
  });
  if (source.cashId) params.set('financeCash', source.cashId);
  if (source.receivableId) {
    params.set('financeReceivable', source.receivableId);
    params.set('financeList', 'receivables');
  }
  if (source.entryId) {
    params.set('financeMatchEntry', source.entryId);
    params.set('financeList', 'cash');
  }
  return `/delivery?${params}`;
};
