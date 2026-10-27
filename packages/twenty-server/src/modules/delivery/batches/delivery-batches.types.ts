import { z } from 'zod';
export const MAX_BATCH_TASKS = 1000;
const revision = z.number().int().nonnegative();
const reason = z.string().trim().min(3).max(1000);
const timezone = z
  .string()
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, 'Choose a valid timezone.');
export const batchesQuerySchema = z
  .object({
    projectId: z.uuid(),
    batchId: z.uuid().nullish(),
    includeClosed: z.boolean().nullish(),
    cursor: z.string().max(1500).nullish(),
    taskCursor: z.string().max(1500).nullish(),
    historyCursor: z.string().max(1500).nullish(),
    search: z.string().trim().max(160).nullish(),
    limit: z.number().int().min(1).max(100).nullish(),
  })
  .strict();
export const batchSaveSchema = z
  .object({
    id: z.uuid(),
    projectId: z.uuid(),
    revision,
    periodId: z.uuid().nullable(),
    label: z.string().trim().min(1).max(160),
    startDate: z.iso.date().nullable(),
    endDate: z.iso.date().nullable(),
    timezone,
    reason,
  })
  .strict()
  .refine(
    (value) =>
      (!value.startDate && !value.endDate) ||
      (value.startDate && value.endDate && value.endDate >= value.startDate),
    'Set both dates, with the end on or after the start, or leave both empty.',
  );
export const batchStateSchema = z
  .object({
    projectId: z.uuid(),
    batchId: z.uuid(),
    revision,
    closed: z.boolean(),
    reason,
  })
  .strict();
export const batchItemSchema = z
  .object({
    projectId: z.uuid(),
    batchId: z.uuid(),
    revision,
    taskId: z.uuid(),
    taskRevision: revision.nullable(),
    active: z.boolean(),
    concept: z.string().trim().max(500),
    reason,
  })
  .strict();
export const batchCursorSchema = z
  .object({
    workspaceId: z.uuid(),
    projectId: z.uuid(),
    batchId: z.uuid().nullable(),
    kind: z.enum(['batches', 'tasks', 'history']),
    id: z.uuid(),
    at: z.iso.datetime().optional(),
    includeClosed: z.boolean(),
  })
  .strict();
