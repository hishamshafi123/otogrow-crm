import { gql } from '@apollo/client';

export const GENERATE_QUOTE_PDF = gql`
  mutation GenerateQuotePdf($quoteId: UUID!) {
    generateQuotePdf(quoteId: $quoteId)
  }
`;
