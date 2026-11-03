import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { z } from 'zod';
import { getValidTimeZoneOrUndefined } from 'twenty-shared/utils';
import { deliveryCommandSchema } from 'src/modules/delivery/delivery-validation';
import { DELIVERY_STATES } from 'src/modules/delivery/delivery.types';

export const DELIVERY_TASK_PAGE_SIZE = 30;
export const DELIVERY_TASK_DIRECTORY_LIMIT = 2000;
export const DELIVERY_TASK_WORK_GROUPS = [
  'revisions',
  'blocked',
  'overdue',
  'today',
  'upcoming',
  'unscheduled',
  'review',
  'approved',
] as const;
const optionalId = z.uuid().nullish();
export const deliveryTaskListSchema = z
  .object({
    view: z.enum(['HOME', 'MINE', 'PLANNER']),
    timezone: z
      .string()
      .min(1)
      .max(100)
      .refine((value) => getValidTimeZoneOrUndefined(value) !== undefined),
    projectId: optionalId,
    assigneeId: optionalId,
    service: z.string().max(100).nullish(),
    state: z.enum(DELIVERY_STATES).nullish(),
    search: z.string().max(200).nullish(),
    scheduledFrom: z.iso.date().nullish(),
    scheduledThrough: z.iso.date().nullish(),
    attention: z.enum(['TODAY', 'OVERDUE']).nullish(),
    after: z.string().min(1).max(4000).nullish(),
    limit: z.number().int().min(1).max(50).nullish(),
  })
  .strict()
  .refine(
    (query) =>
      !query.scheduledThrough ||
      Boolean(
        query.scheduledFrom && query.scheduledThrough >= query.scheduledFrom,
      ),
  );
export const deliveryTaskDetailSchema = z.object({ taskId: z.uuid() }).strict();
export const deliveryTaskCommand = (input: unknown) => {
  const normalized =
    typeof input === 'object' && input !== null && !Array.isArray(input)
      ? Object.fromEntries(
          Object.entries(input).filter(
            ([, value]) => value !== undefined && value !== null,
          ),
        )
      : input;
  const result = deliveryCommandSchema.safeParse(normalized);
  if (
    !result.success ||
    result.data.action === 'project' ||
    result.data.action === 'member'
  )
    throw new BadRequestException(
      'Check the task action, required fields and source version.',
    );
  return result.data;
};
export const parseDeliveryTaskInput = <TResult>(
  schema: z.ZodType<TResult>,
  input: unknown,
): TResult => {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new BadRequestException(
      'Check the task filters, calendar and source.',
    );
  return parsed.data;
};
export const deliveryTaskBusinessDate = (now: Date, timezone: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
export const deliveryTaskScopeHash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sortSchema = z.tuple([
  z.number().int().min(0).max(8),
  z.number().int().min(0).max(3),
  z.string().max(100),
  z.string().max(20),
  z.string().max(200),
  z.uuid(),
]);
const cursorSchema = z
  .object({
    scope: z.string().regex(/^[a-f0-9]{64}$/),
    observedAt: z.iso.datetime(),
    sort: sortSchema,
  })
  .strict();
export type DeliveryTaskSort = z.infer<typeof sortSchema>;
export const deliveryTaskCursor = (
  scope: string,
  observedAt: string,
  sort: DeliveryTaskSort,
) =>
  Buffer.from(JSON.stringify({ scope, observedAt, sort })).toString(
    'base64url',
  );
export const readDeliveryTaskCursor = (
  cursor: string | null | undefined,
  scope: string,
): z.infer<typeof cursorSchema> | null => {
  if (!cursor) return null;
  try {
    const result = cursorSchema.parse(
      JSON.parse(Buffer.from(cursor, 'base64url').toString()),
    );
    if (result.scope === scope) return result;
  } catch {
    // A cursor is usable only in its original current-access scope.
  }
  throw new BadRequestException(
    'This task page no longer matches the current filters or access. Open the first page.',
  );
};
