import { gql } from '@apollo/client';

export const RECALCULATE_QUOTE_TOTALS = gql`
  mutation RecalculateQuoteTotals($quoteId: UUID!) {
    recalculateQuoteTotals(quoteId: $quoteId)
  }
`;
