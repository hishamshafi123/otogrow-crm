import { z } from 'zod';
import { baseWorkflowActionSettingsSchema } from './base-workflow-action-settings-schema';

export const workflowSequenceEnrollActionSettingsSchema =
  baseWorkflowActionSettingsSchema.extend({
    input: z.object({
      sequenceId: z.string(),
      personId: z.string(),
    }),
  });
