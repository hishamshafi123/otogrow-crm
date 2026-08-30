import { t } from '@lingui/core/macro';
import { CoreObjectNameSingular } from 'twenty-shared/types';

import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { useRecordSeededDraft } from '@/object-record/record-seeded-draft/hooks/useRecordSeededDraft';
import {
  type SequenceDelayUnit,
  type SequenceStep,
  type SequenceStepChannel,
} from '@/sequences/types/SequenceStep';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';

type SequenceStepDraft = {
  delayValue: number;
  delayUnit: SequenceDelayUnit;
  channel: SequenceStepChannel;
  subject: string;
  body: string;
  whatsappTemplateName: string;
  whatsappTemplateParams: string;
};

export const useSequenceStepDraft = ({ step }: { step: SequenceStep }) => {
  const { updateOneRecord } = useUpdateOneRecord();
  const { enqueueErrorSnackBar } = useSnackBar();

  const { draft, updateDraft, flush, draftResyncKey } = useRecordSeededDraft({
    upstreamDraft: {
      delayValue: step.delayValue,
      delayUnit: step.delayUnit,
      channel: step.channel ?? 'EMAIL',
      subject: step.subject ?? '',
      body: step.body ?? '',
      whatsappTemplateName: step.whatsappTemplateName ?? '',
      whatsappTemplateParams: step.whatsappTemplateParams ?? '',
    } satisfies SequenceStepDraft,
    onPersist: (nextDraft) => {
      updateOneRecord<SequenceStep>({
        objectNameSingular: CoreObjectNameSingular.SequenceStep,
        idToUpdate: step.id,
        updateOneRecordInput: nextDraft,
      }).catch(() =>
        enqueueErrorSnackBar({ message: t`Failed to save the step` }),
      );
    },
    // The channel swaps the whole editing surface, so switching it reseeds
    // from upstream instead of carrying the previous channel's draft over.
    resetKey: `${step.id}-${step.channel}`,
  });

  return {
    draft,
    updateDraft,
    flush,
    draftResyncKey: `${step.id}-${step.channel}-${draftResyncKey}`,
  };
};
