import { styled } from '@linaria/react';
import { useLingui } from '@lingui/react/macro';

import { QuoteLineItemRow } from '@/quoting/components/QuoteLineItemRow';
import { useQuoteActions } from '@/quoting/hooks/useQuoteActions';
import { useQuoteLineItemMutations } from '@/quoting/hooks/useQuoteLineItemMutations';
import { useQuoteLineItems } from '@/quoting/hooks/useQuoteLineItems';
import { usePriceBookItems } from '@/quoting/hooks/usePriceBookItems';
import { type Quote } from '@/quoting/types/Quote';
import { IconPlus } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/input';
import { Section } from 'twenty-ui/layout';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { H2Title } from 'twenty-ui/typography';

const StyledLineItemList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
`;

type QuoteLineItemsEditorProps = {
  quote: Quote;
  onQuoteChanged: () => void;
};

export const QuoteLineItemsEditor = ({
  quote,
  onQuoteChanged,
}: QuoteLineItemsEditorProps) => {
  const { t } = useLingui();
  const { lineItems, loading, refetch } = useQuoteLineItems({
    quoteId: quote.id,
  });
  const { priceBookItems } = usePriceBookItems();
  const { addLineItem, updateLineItem, deleteLineItem } =
    useQuoteLineItemMutations({ quoteId: quote.id, lineItems });
  const { recalculateTotals } = useQuoteActions({ quoteId: quote.id });

  // Totals live on the quote record, so every line change must be followed by
  // a server-side recalculation before the quote is refetched.
  const applyAndRecalculate = async (changed: boolean) => {
    if (!changed) {
      return;
    }

    await recalculateTotals();
    await refetch();
    onQuoteChanged();
  };

  if (loading) {
    return null;
  }

  return (
    <Section>
      <H2Title title={t`Line items`} />
      <StyledLineItemList>
        {lineItems.map((lineItem) => (
          <QuoteLineItemRow
            key={lineItem.id}
            lineItem={lineItem}
            priceBookItems={priceBookItems}
            onUpdate={async (lineItemId, input) => {
              await applyAndRecalculate(
                await updateLineItem(lineItemId, input),
              );
            }}
            onDelete={async (lineItemId) => {
              await applyAndRecalculate(await deleteLineItem(lineItemId));
            }}
          />
        ))}
        <div>
          <Button
            Icon={IconPlus}
            title={t`Add line item`}
            variant="secondary"
            onClick={async () => {
              await applyAndRecalculate(await addLineItem());
            }}
          />
        </div>
      </StyledLineItemList>
    </Section>
  );
};
