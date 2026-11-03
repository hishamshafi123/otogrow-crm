import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { deliveryKnowledgeCategorySchema } from 'src/modules/delivery/knowledge/delivery-knowledge-category';

export const DELIVERY_KNOWLEDGE_PAGE_SIZE = 25;
const page = {
  after: z.string().min(1).max(4000).nullish(),
  limit: z.number().int().min(1).max(50).nullish(),
  search: z.string().trim().max(160).nullish(),
};
export const deliveryKnowledgeContextSchema = z
  .object({ projectId: z.uuid().nullish() })
  .strict();
export const deliveryKnowledgeProjectsSchema = z.object(page).strict();
export const deliveryKnowledgeListSchema = z
  .object({
    ...page,
    projectId: z.uuid(),
    category: deliveryKnowledgeCategorySchema.nullish(),
  })
  .strict();
export const deliveryKnowledgeSelectionSchema = z
  .object({
    projectId: z.uuid(),
    sourceId: z.uuid(),
    version: z.number().int().positive().nullish(),
  })
  .strict();
export const parseDeliveryKnowledgeRead = <TResult>(
  schema: z.ZodType<TResult>,
  input: unknown,
): TResult => {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new BadRequestException(
      'Check the knowledge project, selection and filters.',
    );
  return parsed.data;
};
export const deliveryKnowledgeScope = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const cursorSchema = z
  .object({
    scope: z.string().regex(/^[a-f0-9]{64}$/),
    kind: z.enum(['PROJECT', 'SOURCE']),
    key: z.string().max(500),
    id: z.uuid(),
  })
  .strict();
export const deliveryKnowledgeCursor = (
  scope: string,
  kind: 'PROJECT' | 'SOURCE',
  key: string,
  id: string,
) =>
  Buffer.from(JSON.stringify({ scope, kind, key, id })).toString('base64url');
export const readDeliveryKnowledgeCursor = (
  value: string | null | undefined,
  scope: string,
  kind: 'PROJECT' | 'SOURCE',
) => {
  if (!value) return null;
  try {
    const parsed = cursorSchema.parse(
      JSON.parse(Buffer.from(value, 'base64url').toString()),
    );
    if (
      parsed.scope === scope &&
      parsed.kind === kind &&
      (kind === 'PROJECT' ||
        z.iso.datetime({ precision: 6 }).safeParse(parsed.key).success)
    )
      return parsed;
  } catch {
    // Cursors cannot preserve old visibility after records or authority change.
  }
  throw new BadRequestException(
    'This knowledge page changed or no longer matches your access and filters. Open the first page.',
  );
};
