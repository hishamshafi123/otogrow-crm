import { z } from 'zod';

export const twilioConfigFormSchema = z.object({
  accountSid: z.string().trim().min(1, 'Account SID is required'),
  authToken: z.string().optional(),
  whatsappSenderNumber: z.string().optional(),
  smsNumber: z.string().optional(),
  isActive: z.boolean(),
});

export type TwilioConfigFormValues = z.infer<typeof twilioConfigFormSchema>;
