import { z } from 'zod';

export const leadFormFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  successMessage: z.string().optional(),
  isActive: z.boolean(),
  fields: z
    .array(
      z.object({
        key: z.string(),
        label: z.string().trim().min(1, 'Label is required'),
        type: z.string(),
        enabled: z.boolean(),
        required: z.boolean(),
      }),
    )
    .refine((fields) => fields.some((field) => field.enabled), {
      error: 'At least one field must be enabled',
    }),
});

export type LeadFormFormValues = z.infer<typeof leadFormFormSchema>;
