import { CoreObjectNameSingular } from 'twenty-shared/types';

import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { type PriceBookItem } from '@/quoting/types/PriceBookItem';

export const usePriceBookItems = () => {
  const { records, loading } = useFindManyRecords<PriceBookItem>({
    objectNameSingular: CoreObjectNameSingular.PriceBookItem,
    filter: { isActive: { eq: true } },
    orderBy: [{ name: 'AscNullsLast' }],
  });

  return { priceBookItems: records ?? [], loading };
};
