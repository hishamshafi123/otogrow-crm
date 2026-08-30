import { styled } from '@linaria/react';
import { isDefined } from 'twenty-shared/utils';

import { QuoteActionsBar } from '@/quoting/components/QuoteActionsBar';
import { QuoteLineItemsEditor } from '@/quoting/components/QuoteLineItemsEditor';
import { QuoteTotalsSection } from '@/quoting/components/QuoteTotalsSection';
import { useTargetQuote } from '@/quoting/hooks/useTargetQuote';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[6]};
  width: 100%;
`;

export const QuoteBuilderWidget = () => {
  const { quote, refetch } = useTargetQuote();

  if (!isDefined(quote)) {
    return null;
  }

  return (
    <StyledContainer>
      <QuoteActionsBar quote={quote} onQuoteChanged={refetch} />
      <QuoteLineItemsEditor quote={quote} onQuoteChanged={refetch} />
      <QuoteTotalsSection quote={quote} onQuoteChanged={refetch} />
    </StyledContainer>
  );
};
