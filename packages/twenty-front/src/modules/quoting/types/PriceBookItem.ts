import { type QuoteCurrencyValue } from '@/quoting/types/Quote';

export type PriceBookItem = {
  __typename: 'PriceBookItem';
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  unitPrice: QuoteCurrencyValue;
  bulkMinQuantity: number | null;
  bulkUnitPrice: QuoteCurrencyValue | null;
  isActive: boolean;
};
