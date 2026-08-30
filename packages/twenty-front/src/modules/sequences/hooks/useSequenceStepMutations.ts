import { t } from '@lingui/core/macro';
import { CoreObjectNameSingular } from 'twenty-shared/types';

import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useDeleteOneRecord } from '@/object-record/hooks/useDeleteOneRecord';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { type SequenceStep } from '@/sequences/types/SequenceStep';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';

export const useSequenceStepMutations = ({
  sequenceId,
  steps,
}: {
  sequenceId: string;
  steps: SequenceStep[];
}) => {
  const { createOneRecord } = useCreateOneRecord<SequenceStep>({
    objectNameSingular: CoreObjectNameSingular.SequenceStep,
  });
  const { deleteOneRecord } = useDeleteOneRecord({
    objectNameSingular: CoreObjectNameSingular.SequenceStep,
  });
  const { updateOneRecord } = useUpdateOneRecord();
  const { enqueueErrorSnackBar } = useSnackBar();

  const addStep = async () => {
    try {
      await createOneRecord({
        sequenceId,
        stepPosition: steps.length + 1,
        delayValue: 1,
        delayUnit: 'DAYS',
        subject: '',
        body: '',
      });
    } catch {
      enqueueErrorSnackBar({ message: t`Failed to add the step` });
    }
  };

  // Steps are displayed ordered by stepPosition, so deleting one leaves a gap
  // that would shift the send order; renumber the survivors to stay contiguous.
  const deleteStep = async (stepId: string) => {
    try {
      await deleteOneRecord(stepId);

      const remainingSteps = steps
        .filter((step) => step.id !== stepId)
        .sort((a, b) => a.stepPosition - b.stepPosition);

      await Promise.all(
        remainingSteps
          .filter((step, index) => step.stepPosition !== index + 1)
          .map((step, index) =>
            updateOneRecord<SequenceStep>({
              objectNameSingular: CoreObjectNameSingular.SequenceStep,
              idToUpdate: step.id,
              updateOneRecordInput: { stepPosition: index + 1 },
            }),
          ),
      );
    } catch {
      enqueueErrorSnackBar({ message: t`Failed to delete the step` });
    }
  };

  return { addStep, deleteStep };
};
