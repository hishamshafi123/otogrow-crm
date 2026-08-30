import { CoreObjectNameSingular } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { type Quote } from '@/quoting/types/Quote';
import { useTargetRecord } from '@/ui/layout/contexts/useTargetRecord';

export const useTargetQuote = () => {
  const targetRecord = useTargetRecord();

  const {
    record: quote,
    loading,
    refetch,
  } = useFindOneRecord<Quote>({
    objectNameSingular: CoreObjectNameSingular.Quote,
    objectRecordId: targetRecord.id,
  });

  if (loading || !isDefined(quote)) {
    return { quote: undefined, refetch };
  }

  return { quote, refetch };
};
