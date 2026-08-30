import { gql } from '@apollo/client';

export const UPDATE_QUOTE_STATUS = gql`
  mutation UpdateQuoteStatus($quoteId: UUID!, $status: String!) {
    updateQuoteStatus(quoteId: $quoteId, status: $status)
  }
`;
