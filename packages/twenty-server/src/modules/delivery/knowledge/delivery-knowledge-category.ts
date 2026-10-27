import { z } from 'zod';

export const deliveryKnowledgeCategorySchema = z.enum([
  'MEETING',
  'BRAND_FACTS',
  'CLAIMS',
  'VISUAL_RULES',
  'REFERENCE',
  'PROMPT',
  'ASSET_REFERENCE',
]);
export type DeliveryKnowledgeCategory = z.infer<
  typeof deliveryKnowledgeCategorySchema
>;
