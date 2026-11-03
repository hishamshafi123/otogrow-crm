import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { DELIVERY_STATES } from 'src/modules/delivery/delivery.types';

const page = {
  search: z.string().trim().max(160).nullish(),
  after: z.string().min(1).max(2000).nullish(),
  limit: z.number().int().min(1).max(50).nullish(),
};
export const creativeProjectsSchema = z.object(page).strict();
export const creativeTasksSchema = z
  .object({
    ...page,
    projectId: z.uuid().nullish(),
    state: z.enum(DELIVERY_STATES).nullish(),
    mine: z.boolean().nullish(),
    production: z.enum(['ALL', 'STARTED', 'NOT_STARTED']).nullish(),
  })
  .strict();
export const creativeSelectionSchema = z.object({ taskId: z.uuid() }).strict();
export const creativeReferencesSchema = z
  .object({ ...page, taskId: z.uuid() })
  .strict();
export const parseCreativeRead = <TResult>(
  schema: z.ZodType<TResult>,
  raw: unknown,
): TResult => {
  const parsed = schema.safeParse(raw);
  if (!parsed.success)
    throw new BadRequestException(
      'Check the creative task, project and filters.',
    );
  return parsed.data;
};
export const creativeReadHash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const cursorSchema = z
  .object({
    version: z.literal(1),
    scope: z.string().regex(/^[a-f0-9]{64}$/),
    kind: z.enum(['PROJECT', 'TASK', 'REFERENCE']),
    key: z.string().max(300),
    id: z.uuid(),
  })
  .strict();
type CreativeCursor = z.infer<typeof cursorSchema>;
export const creativeReadCursor = (
  scope: string,
  kind: CreativeCursor['kind'],
  key: string,
  id: string,
) =>
  Buffer.from(JSON.stringify({ version: 1, scope, kind, key, id })).toString(
    'base64url',
  );
export const readCreativeCursor = (
  value: string | null | undefined,
  scope: string,
  kind: CreativeCursor['kind'],
) => {
  if (!value) return null;
  try {
    const parsed = cursorSchema.parse(
      JSON.parse(Buffer.from(value, 'base64url').toString()),
    );
    if (
      parsed.scope === scope &&
      parsed.kind === kind &&
      (kind !== 'TASK' ||
        z.iso.datetime({ precision: 6 }).safeParse(parsed.key).success) &&
      (kind !== 'REFERENCE' || z.uuid().safeParse(parsed.key).success)
    )
      return parsed;
  } catch {
    // A cursor must never retain access from a previous identity or project scope.
  }
  throw new BadRequestException(
    'This creative page changed or no longer matches your access and filters. Open the first page.',
  );
};
