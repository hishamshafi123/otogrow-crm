import { WorkflowActionType } from 'twenty-shared/workflow';

import {
  type WorkflowAction,
  type WorkflowSequenceEnrollAction,
} from 'src/modules/workflow/workflow-executor/workflow-actions/types/workflow-action.type';

export const isWorkflowSequenceEnrollAction = (
  action: WorkflowAction,
): action is WorkflowSequenceEnrollAction => {
  return action.type === WorkflowActionType.SEQUENCE_ENROLL;
};
