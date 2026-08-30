import { t } from '@lingui/core/macro';
import { useState } from 'react';

import { FormSingleRecordPicker } from '@/object-record/record-field/ui/form-types/components/FormSingleRecordPicker';
import {
  type WorkflowSequenceEnrollAction,
  type WorkflowSequenceUnenrollAction,
} from '@/workflow/types/Workflow';
import { WorkflowStepBody } from '@/workflow/workflow-steps/components/WorkflowStepBody';
import { WorkflowStepFooter } from '@/workflow/workflow-steps/components/WorkflowStepFooter';
import { WorkflowVariablePicker } from '@/workflow/workflow-variables/components/WorkflowVariablePicker';
import { HorizontalSeparator } from 'twenty-ui/layout';
import { useDebouncedCallback } from 'use-debounce';

type WorkflowSequenceAction =
  | WorkflowSequenceEnrollAction
  | WorkflowSequenceUnenrollAction;

type WorkflowEditActionSequenceProps = {
  action: WorkflowSequenceAction;
  actionOptions:
    | {
        readonly: true;
      }
    | {
        readonly?: false;
        onActionUpdate: (action: WorkflowSequenceAction) => void;
      };
};

type SequenceFormData = {
  sequenceId: string;
  personId: string;
};

export const WorkflowEditActionSequence = ({
  action,
  actionOptions,
}: WorkflowEditActionSequenceProps) => {
  const [formData, setFormData] = useState<SequenceFormData>({
    sequenceId: action.settings.input.sequenceId,
    personId: action.settings.input.personId,
  });
  const isFormDisabled = actionOptions.readonly;

  const saveAction = useDebouncedCallback(
    async (newFormData: SequenceFormData) => {
      if (actionOptions.readonly === true) {
        return;
      }

      actionOptions.onActionUpdate({
        ...action,
        settings: {
          ...action.settings,
          input: {
            sequenceId: newFormData.sequenceId,
            personId: newFormData.personId,
          },
        },
      });
    },
    1_000,
  );

  const handleFieldChange = (
    fieldName: keyof SequenceFormData,
    updatedValue: string,
  ) => {
    const newFormData: SequenceFormData = {
      ...formData,
      [fieldName]: updatedValue,
    };

    setFormData(newFormData);

    saveAction(newFormData);
  };

  return (
    <>
      <WorkflowStepBody>
        <FormSingleRecordPicker
          label={t`Sequence`}
          onChange={(sequenceId) =>
            handleFieldChange('sequenceId', sequenceId ?? '')
          }
          objectNameSingulars={['sequence']}
          defaultValue={formData.sequenceId}
          testId="workflow-edit-action-sequence-id"
          disabled={isFormDisabled}
        />

        <HorizontalSeparator noMargin />

        <FormSingleRecordPicker
          label={t`Person`}
          onChange={(personId) => handleFieldChange('personId', personId ?? '')}
          objectNameSingulars={['person']}
          defaultValue={formData.personId}
          testId="workflow-edit-action-sequence-person-id"
          disabled={isFormDisabled}
          VariablePicker={WorkflowVariablePicker}
        />
      </WorkflowStepBody>
      {!actionOptions.readonly && <WorkflowStepFooter stepId={action.id} />}
    </>
  );
};
