import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { deliveryAgentConfigurationSchema } from 'src/modules/delivery/agents/delivery-agent.types';

export const DELIVERY_ASSISTANT_PAGE_SIZE = 25;
export const DELIVERY_ASSISTANT_DIRECTORY_LIMIT = 2000;
export const DELIVERY_ASSISTANT_STATUSES = [
  'QUEUED',
  'RUNNING',
  'WAITING_REVIEW',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
] as const;
const optionalId = z.uuid().nullish();
const page = {
  after: z.string().min(1).max(4000).nullish(),
  limit: z.number().int().min(1).max(50).nullish(),
};
export const deliveryAssistantContextSchema = z
  .object({ taskId: optionalId })
  .strict();
export const deliveryAssistantSelectionSchema = z
  .object({ agentId: z.uuid(), taskId: optionalId })
  .strict();
export const deliveryAssistantCatalogSchema = z
  .object({
    taskId: optionalId,
    projectId: optionalId,
    search: z.string().trim().max(200).nullish(),
    kind: z.enum(['BRIEF', 'COPY', 'SEO', 'ADVERTISING', 'ACTIVITY']).nullish(),
    enabled: z.boolean().nullish(),
    ...page,
  })
  .strict();
export const deliveryAssistantRunsSchema = z
  .object({
    taskId: optionalId,
    projectId: optionalId,
    agentId: optionalId,
    status: z.enum(DELIVERY_ASSISTANT_STATUSES).nullish(),
    ...page,
  })
  .strict();
export const deliveryAssistantRunSchema = z
  .object({ runId: z.uuid() })
  .strict();
export const deliveryAssistantRequestSchema = z
  .object({ requestId: z.uuid() })
  .strict();
export const deliveryAssistantSaveSchema = z
  .object({
    createId: optionalId,
    id: optionalId,
    version: z.number().int().positive().nullish(),
    configuration: deliveryAgentConfigurationSchema,
  })
  .strict()
  .refine((input) =>
    input.createId
      ? !input.id && input.version == null
      : Boolean(input.id && input.version && !input.createId),
  );
export const parseDeliveryAssistantInput = <TResult>(
  schema: z.ZodType<TResult>,
  input: unknown,
): TResult => {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new BadRequestException(
      'Check the assistant selection, filters and source versions.',
    );
  return parsed.data;
};
export const deliveryAssistantScopeHash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const cursorSchema = z
  .object({
    scope: z.string().regex(/^[a-f0-9]{64}$/),
    observedAt: z.iso.datetime(),
    createdAt: z.iso.datetime(),
    id: z.uuid(),
  })
  .strict();
export const deliveryAssistantCursor = (
  scope: string,
  observedAt: string,
  createdAt: string,
  id: string,
) =>
  Buffer.from(JSON.stringify({ scope, observedAt, createdAt, id })).toString(
    'base64url',
  );
export const readDeliveryAssistantCursor = (
  value: string | null | undefined,
  scope: string,
) => {
  if (!value) return null;
  try {
    const parsed = cursorSchema.parse(
      JSON.parse(Buffer.from(value, 'base64url').toString()),
    );
    if (
      parsed.scope === scope &&
      Date.parse(parsed.createdAt) <= Date.parse(parsed.observedAt)
    )
      return parsed;
  } catch {
    // A cursor cannot carry authority into a different current scope.
  }
  throw new BadRequestException(
    'This assistant page no longer matches the current filters or access. Open the first page.',
  );
};
export const sameDeliveryAssistantConfiguration = (
  left: unknown,
  right: unknown,
) => {
  const previous = deliveryAgentConfigurationSchema.safeParse(left);
  const next = deliveryAgentConfigurationSchema.safeParse(right);
  return (
    previous.success &&
    next.success &&
    isDeepStrictEqual(
      { ...previous.data, roleIds: previous.data.roleIds ?? null },
      { ...next.data, roleIds: next.data.roleIds ?? null },
    )
  );
};
