import { z } from 'zod';

export const deliveryTaskPlanSchema = z
  .object({
    workMinutes: z.number().int().min(0).max(10080).nullable(),
    revisionMinutes: z.number().int().min(0).max(10080).nullable(),
    waitMinutes: z.number().int().min(0).max(10080).nullable(),
    reviewMinutes: z.number().int().min(0).max(10080).nullable(),
    reviewDate: z.iso.date().nullable(),
    complexity: z.enum(['STANDARD', 'INVOLVED', 'COMPLEX']).nullable(),
  })
  .strict();
export type DeliveryTaskPlan = z.infer<typeof deliveryTaskPlanSchema>;
export const deliveryCapacityQuerySchema = z
  .object({ startDate: z.iso.date() })
  .strict();
export const deliveryAvailabilitySchema = z
  .object({
    memberId: z.uuid(),
    date: z.iso.date(),
    minutes: z.number().int().min(0).max(1440).nullable(),
    revision: z.number().int().min(0),
  })
  .strict();
