import { type QuoteCurrencyValue } from '@/quoting/types/Quote';

export type QuoteLineItem = {
  __typename: 'QuoteLineItem';
  id: string;
  label: string;
  description: string | null;
  quantity: number;
  unitPrice: QuoteCurrencyValue;
  discountPercent: number;
  lineTotal: QuoteCurrencyValue | null;
  quoteId: string;
  priceBookItemId: string | null;
  position: number;
};
