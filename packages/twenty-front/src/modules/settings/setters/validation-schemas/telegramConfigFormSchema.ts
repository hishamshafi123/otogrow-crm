import { z } from 'zod';

export const telegramConfigFormSchema = z.object({
  botToken: z.string().optional(),
  botUsername: z.string().optional(),
  isActive: z.boolean(),
});

export type TelegramConfigFormValues = z.infer<typeof telegramConfigFormSchema>;
