import { type QuoteCurrencyValue } from '@/quoting/types/Quote';

export const formatQuoteCurrency = (
  value: QuoteCurrencyValue | null | undefined,
): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: value?.currencyCode ?? 'USD',
  }).format((value?.amountMicros ?? 0) / 1_000_000);
