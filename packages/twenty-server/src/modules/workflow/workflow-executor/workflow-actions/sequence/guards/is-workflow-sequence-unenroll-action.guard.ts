import { WorkflowActionType } from 'twenty-shared/workflow';

import {
  type WorkflowAction,
  type WorkflowSequenceUnenrollAction,
} from 'src/modules/workflow/workflow-executor/workflow-actions/types/workflow-action.type';

export const isWorkflowSequenceUnenrollAction = (
  action: WorkflowAction,
): action is WorkflowSequenceUnenrollAction => {
  return action.type === WorkflowActionType.SEQUENCE_UNENROLL;
};
