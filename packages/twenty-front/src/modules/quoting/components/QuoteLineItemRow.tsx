import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { isDefined } from 'twenty-shared/utils';

import { type PriceBookItem } from '@/quoting/types/PriceBookItem';
import { type QuoteLineItem } from '@/quoting/types/QuoteLineItem';
import { formatQuoteCurrency } from '@/quoting/utils/formatQuoteCurrency';
import { Select } from '@/ui/input/components/Select';
import { TextInput } from '@/ui/input/components/TextInput';
import { IconTrash } from 'twenty-ui/icon';
import { LightIconButton, type SelectOption } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledRow = styled.div`
  align-items: flex-end;
  background-color: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: 14px;
  box-shadow:
    0 1px 2px ${themeCssVariables.color.transparent.gray2},
    0 6px 18px -14px ${themeCssVariables.color.transparent.gray5},
    inset 0 1px 0 ${themeCssVariables.color.transparent.gray2};
  display: flex;
  gap: ${themeCssVariables.spacing[3]};
  padding: 14px 16px;
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease;

  &:hover {
    border-color: ${themeCssVariables.color.iris6};
    box-shadow:
      0 8px 20px -14px ${themeCssVariables.color.transparent.iris5},
      inset 0 1px 0 ${themeCssVariables.color.transparent.gray2};
  }
`;

const StyledItemPicker = styled.div`
  flex: 1;
  min-width: 0;
`;

const StyledNumberField = styled.div`
  width: 92px;
`;

const StyledLineTotal = styled.div`
  align-items: center;
  align-self: stretch;
  color: ${themeCssVariables.font.color.primary};
  display: flex;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  justify-content: flex-end;
  letter-spacing: -0.01em;
  min-width: 104px;
`;

type QuoteLineItemRowProps = {
  lineItem: QuoteLineItem;
  priceBookItems: PriceBookItem[];
  onUpdate: (
    lineItemId: string,
    input: Partial<Omit<QuoteLineItem, 'id'>>,
  ) => void;
  onDelete: (lineItemId: string) => void;
};

export const QuoteLineItemRow = ({
  lineItem,
  priceBookItems,
  onUpdate,
  onDelete,
}: QuoteLineItemRowProps) => {
  const [quantityDraft, setQuantityDraft] = useState(
    lineItem.quantity.toString(),
  );
  const [discountDraft, setDiscountDraft] = useState(
    lineItem.discountPercent.toString(),
  );

  const priceBookItemOptions: SelectOption<string>[] = priceBookItems.map(
    (priceBookItem) => ({
      label: `${priceBookItem.name} (${formatQuoteCurrency(priceBookItem.unitPrice)})`,
      value: priceBookItem.id,
    }),
  );

  const handlePriceBookItemChange = (priceBookItemId: string) => {
    const priceBookItem = priceBookItems.find(
      (item) => item.id === priceBookItemId,
    );

    if (!isDefined(priceBookItem)) {
      return;
    }

    onUpdate(lineItem.id, {
      priceBookItemId: priceBookItem.id,
      label: priceBookItem.name,
      description: priceBookItem.description,
      // Composite values fetched from GraphQL carry __typename, which the
      // mutation input validator rejects.
      unitPrice: {
        amountMicros: priceBookItem.unitPrice.amountMicros,
        currencyCode: priceBookItem.unitPrice.currencyCode,
      },
    });
  };

  const flushQuantity = () => {
    const parsedQuantity = Number(quantityDraft);

    if (
      !Number.isNaN(parsedQuantity) &&
      parsedQuantity > 0 &&
      parsedQuantity !== lineItem.quantity
    ) {
      onUpdate(lineItem.id, { quantity: parsedQuantity });
    }
  };

  const flushDiscount = () => {
    const parsedDiscount = Number(discountDraft);

    if (
      !Number.isNaN(parsedDiscount) &&
      parsedDiscount >= 0 &&
      parsedDiscount <= 100 &&
      parsedDiscount !== lineItem.discountPercent
    ) {
      onUpdate(lineItem.id, { discountPercent: parsedDiscount });
    }
  };

  return (
    <StyledRow>
      <StyledItemPicker>
        <Select
          dropdownId={`quote-line-item-price-book-item-${lineItem.id}`}
          label={t`Price book item`}
          value={lineItem.priceBookItemId ?? ''}
          emptyOption={{ label: t`Select an item`, value: '' }}
          options={priceBookItemOptions}
          onChange={handlePriceBookItemChange}
          fullWidth
        />
      </StyledItemPicker>
      <StyledNumberField>
        <TextInput
          label={t`Qty`}
          value={quantityDraft}
          onChange={setQuantityDraft}
          onBlur={flushQuantity}
          fullWidth
        />
      </StyledNumberField>
      <StyledNumberField>
        <TextInput
          label={t`Disc. %`}
          value={discountDraft}
          onChange={setDiscountDraft}
          onBlur={flushDiscount}
          fullWidth
        />
      </StyledNumberField>
      <StyledLineTotal>
        {formatQuoteCurrency(lineItem.lineTotal)}
      </StyledLineTotal>
      <LightIconButton
        Icon={IconTrash}
        accent="tertiary"
        onClick={() => onDelete(lineItem.id)}
      />
    </StyledRow>
  );
};
