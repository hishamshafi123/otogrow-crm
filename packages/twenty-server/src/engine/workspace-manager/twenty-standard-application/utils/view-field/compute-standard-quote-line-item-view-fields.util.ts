import { type FlatViewField } from 'src/engine/metadata-modules/flat-view-field/types/flat-view-field.type';
import { type AllStandardObjectFieldName } from 'src/engine/workspace-manager/twenty-standard-application/types/all-standard-object-field-name.type';
import { type AllStandardObjectViewFieldName } from 'src/engine/workspace-manager/twenty-standard-application/types/all-standard-object-view-field-name.type';
import {
  createStandardViewFieldFlatMetadata,
  type CreateStandardViewFieldArgs,
} from 'src/engine/workspace-manager/twenty-standard-application/utils/view-field/create-standard-view-field-flat-metadata.util';

export const computeStandardQuoteLineItemViewFields = (
  args: Omit<CreateStandardViewFieldArgs<'quoteLineItem'>, 'context'>,
): Record<string, FlatViewField> => {
  const buildViewField = (
    fieldName: AllStandardObjectFieldName<'quoteLineItem'> &
      AllStandardObjectViewFieldName<'quoteLineItem', 'allQuoteLineItems'>,
    position: number,
  ) =>
    createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'quoteLineItem',
      context: {
        viewName: 'allQuoteLineItems',
        viewFieldName: fieldName,
        fieldName,
        position,
        isVisible: true,
        size: 150,
      },
    });

  return {
    allQuoteLineItemsLabel: buildViewField('label', 0),
    allQuoteLineItemsQuantity: buildViewField('quantity', 1),
    allQuoteLineItemsUnitPrice: buildViewField('unitPrice', 2),
    allQuoteLineItemsLineTotal: buildViewField('lineTotal', 3),
  };
};
