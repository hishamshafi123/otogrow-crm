import { BadRequestException, ConflictException } from '@nestjs/common';
import { z } from 'zod';
import { financeReviewToken } from 'src/modules/delivery/finance/delivery-finance-reconciliation.policy';
export const DELIVERY_REVIEW_SOURCE_LIMIT = 2000;
export const DELIVERY_REVIEW_PAGE_SIZE = 25;
const id = z.uuid().transform((value) => value.toLowerCase());
const version = z.number().int().positive();
const optionalId = id.nullish().transform((value) => value ?? null);
export const deliveryReviewQueueSchema = z
  .object({
    projectId: optionalId,
    reviewerId: optionalId,
    mine: z
      .boolean()
      .nullish()
      .transform((value) => value ?? false),
    after: z
      .string()
      .min(1)
      .max(2000)
      .nullish()
      .transform((value) => value ?? null),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .nullish()
      .transform((value) => value ?? DELIVERY_REVIEW_PAGE_SIZE),
  })
  .strict();
export const deliveryTaskReviewSchema = z.object({ taskId: id }).strict();
export const deliveryReviewSeenSchema = z
  .object({
    taskId: id,
    taskRevision: version,
    submissionVersion: version,
    assignmentRevision: z.number().int().nonnegative(),
    noticeId: id,
  })
  .strict();
export const deliveryReviewAssignmentSchema = z
  .object({
    commandId: id,
    taskId: id,
    taskRevision: version,
    submissionVersion: version,
    assignmentRevision: z.number().int().nonnegative(),
    mode: z.enum(['PRIMARY', 'BACKUP']),
    reviewerId: optionalId,
    reason: z.string().trim().min(1).max(2000),
  })
  .strict()
  .refine(
    (value) =>
      value.mode === 'BACKUP'
        ? value.reviewerId !== null
        : value.reviewerId === null,
    'Choose an explicit backup or restore the primary reviewer.',
  );
export const deliveryReviewHistorySchema = z
  .object({ taskId: id, submissionVersion: version, beforeId: optionalId })
  .strict();
export const parseDeliveryReview = <TOutput>(
  schema: z.ZodType<TOutput>,
  value: unknown,
): TOutput => {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new BadRequestException(
      result.error.issues.map((issue) => issue.message).join(' '),
    );
  return result.data;
};
export const deliveryReviewAge = (submittedAt: unknown, now: Date) => {
  if (
    typeof submittedAt !== 'string' ||
    !z.iso.datetime({ offset: true }).safeParse(submittedAt).success
  )
    return { submittedAt: null, ageSeconds: null, ageState: 'UNKNOWN' };
  const at = Date.parse(submittedAt);
  if (!Number.isFinite(at))
    return { submittedAt: null, ageSeconds: null, ageState: 'UNKNOWN' };
  if (at > now.getTime())
    return {
      submittedAt: new Date(at).toISOString(),
      ageSeconds: null,
      ageState: 'FUTURE',
    };
  const seconds = Math.floor((now.getTime() - at) / 1000);
  return {
    submittedAt: new Date(at).toISOString(),
    ageSeconds: seconds <= 2147483647 ? seconds : null,
    ageState: seconds <= 2147483647 ? 'VALID' : 'UNKNOWN',
  };
};
const cursor = z
  .object({
    version: z.literal(1),
    workspaceId: id,
    filter: z.string().length(64),
    sources: z.string().length(64),
    offset: z.number().int().nonnegative(),
  })
  .strict();
export const deliveryReviewCursor = (
  workspaceId: string,
  filter: unknown,
  sources: unknown,
  offset: number,
) =>
  Buffer.from(
    JSON.stringify({
      version: 1,
      workspaceId,
      filter: financeReviewToken(filter),
      sources: financeReviewToken(sources),
      offset,
    }),
  ).toString('base64url');
export const deliveryReviewOffset = (
  after: string | null,
  workspaceId: string,
  filter: unknown,
  sources: unknown,
) => {
  if (after === null) return 0;
  try {
    const value = cursor.parse(
      JSON.parse(Buffer.from(after, 'base64url').toString('utf8')),
    );
    if (
      value.workspaceId !== workspaceId ||
      value.filter !== financeReviewToken(filter) ||
      value.sources !== financeReviewToken(sources)
    )
      throw new ConflictException(
        'The pending review queue changed. Refresh its first page.',
      );
    return value.offset;
  } catch (error) {
    if (error instanceof ConflictException) throw error;
    throw new BadRequestException('This review queue cursor is invalid.');
  }
};
