import { type WorkflowActionType } from '@/workflow/types/Workflow';

export const SEQUENCE_UNENROLL_ACTION: {
  defaultLabel: string;
  type: Extract<WorkflowActionType, 'SEQUENCE_UNENROLL'>;
  icon: string;
} = {
  defaultLabel: 'Unenroll from sequence',
  type: 'SEQUENCE_UNENROLL',
  icon: 'IconListNumbers',
};
