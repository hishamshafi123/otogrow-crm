import { z } from 'zod';
import { baseWorkflowActionSchema } from './base-workflow-action-schema';
import { workflowSequenceUnenrollActionSettingsSchema } from './sequence-unenroll-action-settings-schema';

export const workflowSequenceUnenrollActionSchema =
  baseWorkflowActionSchema.extend({
    type: z.literal('SEQUENCE_UNENROLL'),
    settings: workflowSequenceUnenrollActionSettingsSchema,
  });
