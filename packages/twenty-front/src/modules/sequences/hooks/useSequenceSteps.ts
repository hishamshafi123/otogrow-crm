import { CoreObjectNameSingular } from 'twenty-shared/types';

import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { type SequenceStep } from '@/sequences/types/SequenceStep';

export const useSequenceSteps = ({ sequenceId }: { sequenceId: string }) => {
  const { records, loading } = useFindManyRecords<SequenceStep>({
    objectNameSingular: CoreObjectNameSingular.SequenceStep,
    filter: { sequenceId: { eq: sequenceId } },
    orderBy: [{ stepPosition: 'AscNullsLast' }],
  });

  return { steps: records ?? [], loading };
};
