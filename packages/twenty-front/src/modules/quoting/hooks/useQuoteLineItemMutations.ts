import { t } from '@lingui/core/macro';
import { CoreObjectNameSingular } from 'twenty-shared/types';

import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useDeleteOneRecord } from '@/object-record/hooks/useDeleteOneRecord';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { type QuoteLineItem } from '@/quoting/types/QuoteLineItem';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';

export const useQuoteLineItemMutations = ({
  quoteId,
  lineItems,
}: {
  quoteId: string;
  lineItems: QuoteLineItem[];
}) => {
  const { createOneRecord } = useCreateOneRecord<QuoteLineItem>({
    objectNameSingular: CoreObjectNameSingular.QuoteLineItem,
  });
  const { deleteOneRecord } = useDeleteOneRecord({
    objectNameSingular: CoreObjectNameSingular.QuoteLineItem,
  });
  const { updateOneRecord } = useUpdateOneRecord();
  const { enqueueErrorSnackBar } = useSnackBar();

  const addLineItem = async (): Promise<boolean> => {
    try {
      await createOneRecord({
        quoteId,
        position: lineItems.length + 1,
        label: 'New line item',
        quantity: 1,
        unitPrice: { amountMicros: 0, currencyCode: 'USD' },
        discountPercent: 0,
      });

      return true;
    } catch {
      enqueueErrorSnackBar({ message: t`Failed to add the line item` });

      return false;
    }
  };

  const updateLineItem = async (
    lineItemId: string,
    input: Partial<Omit<QuoteLineItem, 'id'>>,
  ): Promise<boolean> => {
    try {
      await updateOneRecord<QuoteLineItem>({
        objectNameSingular: CoreObjectNameSingular.QuoteLineItem,
        idToUpdate: lineItemId,
        updateOneRecordInput: input,
      });

      return true;
    } catch {
      enqueueErrorSnackBar({ message: t`Failed to update the line item` });

      return false;
    }
  };

  const deleteLineItem = async (lineItemId: string): Promise<boolean> => {
    try {
      await deleteOneRecord(lineItemId);

      return true;
    } catch {
      enqueueErrorSnackBar({ message: t`Failed to delete the line item` });

      return false;
    }
  };

  return { addLineItem, updateLineItem, deleteLineItem };
};
