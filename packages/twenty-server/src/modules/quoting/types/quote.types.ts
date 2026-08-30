export const QUOTE_STATUSES = [
  'DRAFT',
  'SENT',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
] as const;

export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export type QuotePdfLineItem = {
  label: string;
  description: string | null;
  quantity: number;
  unitPriceAmountMicros: number;
  discountPercent: number;
  lineTotalAmountMicros: number;
};

export type ResolvedQuote = {
  quoteNumber: string;
  status: string;
  issuedAtLabel: string;
  validUntilLabel: string | null;
  customerName: string | null;
  taxPercent: number;
  subtotalAmountMicros: number;
  taxAmountMicros: number;
  totalAmountMicros: number;
  currencyCode: string;
  terms: string | null;
  lineItems: QuotePdfLineItem[];
};
