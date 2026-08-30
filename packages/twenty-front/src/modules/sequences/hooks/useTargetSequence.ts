import { CoreObjectNameSingular } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { type Sequence } from '@/sequences/types/Sequence';
import { useTargetRecord } from '@/ui/layout/contexts/useTargetRecord';

export const useTargetSequence = () => {
  const targetRecord = useTargetRecord();

  const { record: sequence, loading } = useFindOneRecord<Sequence>({
    objectNameSingular: CoreObjectNameSingular.Sequence,
    objectRecordId: targetRecord.id,
  });

  if (loading || !isDefined(sequence)) {
    return { sequence: undefined };
  }

  return { sequence };
};
