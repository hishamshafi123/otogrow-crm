import { z } from 'zod';
import { baseWorkflowActionSchema } from './base-workflow-action-schema';
import { workflowSequenceEnrollActionSettingsSchema } from './sequence-enroll-action-settings-schema';

export const workflowSequenceEnrollActionSchema =
  baseWorkflowActionSchema.extend({
    type: z.literal('SEQUENCE_ENROLL'),
    settings: workflowSequenceEnrollActionSettingsSchema,
  });
