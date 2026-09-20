import { z } from 'zod';

export const metaAdsConfigFormSchema = z.object({
  appId: z.string().trim().min(1, 'App ID is required'),
  appSecret: z.string().optional(),
  pageId: z.string().trim().min(1, 'Page ID is required'),
  pageAccessToken: z.string().optional(),
  verifyToken: z.string().optional(),
  formId: z.string().optional(),
  isActive: z.boolean(),
});

export type MetaAdsConfigFormValues = z.infer<typeof metaAdsConfigFormSchema>;
