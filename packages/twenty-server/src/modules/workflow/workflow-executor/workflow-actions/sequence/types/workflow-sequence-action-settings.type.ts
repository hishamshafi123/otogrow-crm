import { type WorkflowSequenceActionInput } from 'src/modules/workflow/workflow-executor/workflow-actions/sequence/types/workflow-sequence-action-input.type';
import { type BaseWorkflowActionSettings } from 'src/modules/workflow/workflow-executor/workflow-actions/types/workflow-action-settings.type';

export type WorkflowSequenceActionSettings = BaseWorkflowActionSettings & {
  input: WorkflowSequenceActionInput;
};
