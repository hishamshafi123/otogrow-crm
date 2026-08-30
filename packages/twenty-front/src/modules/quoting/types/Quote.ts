export const QUOTE_STATUSES = [
  'DRAFT',
  'SENT',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
] as const;

export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export type QuoteCurrencyValue = {
  amountMicros: number | null;
  currencyCode: string | null;
};

export type Quote = {
  __typename: 'Quote';
  id: string;
  quoteNumber: string | null;
  status: QuoteStatus;
  taxPercent: number;
  validUntil: string | null;
  subtotal: QuoteCurrencyValue | null;
  taxAmount: QuoteCurrencyValue | null;
  total: QuoteCurrencyValue | null;
  terms: string | null;
  companyId: string | null;
  personId: string | null;
  opportunityId: string | null;
};
