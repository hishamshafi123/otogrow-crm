import { CoreObjectNameSingular } from 'twenty-shared/types';

import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { type QuoteLineItem } from '@/quoting/types/QuoteLineItem';

export const useQuoteLineItems = ({ quoteId }: { quoteId: string }) => {
  const { records, loading, refetch } = useFindManyRecords<QuoteLineItem>({
    objectNameSingular: CoreObjectNameSingular.QuoteLineItem,
    filter: { quoteId: { eq: quoteId } },
    orderBy: [{ position: 'AscNullsLast' }],
  });

  return { lineItems: records ?? [], loading, refetch };
};
