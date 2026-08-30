import { type WorkflowActionType } from '@/workflow/types/Workflow';

export const SEQUENCE_ENROLL_ACTION: {
  defaultLabel: string;
  type: Extract<WorkflowActionType, 'SEQUENCE_ENROLL'>;
  icon: string;
} = {
  defaultLabel: 'Enroll in sequence',
  type: 'SEQUENCE_ENROLL',
  icon: 'IconListNumbers',
};
