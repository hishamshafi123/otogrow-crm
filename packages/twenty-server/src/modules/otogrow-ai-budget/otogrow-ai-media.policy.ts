import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import {
  usdSchema,
  usdToMicro,
} from 'src/modules/otogrow-ai-budget/otogrow-ai-budget.policy';
import { type OtogrowAiMediaReservation } from 'src/modules/otogrow-ai-budget/otogrow-ai-budget.types';

const MEDIA_QUOTE_MAXIMUM_AGE_MS = 5 * 60 * 1000;

export const assertOtogrowAiMediaQuoteFresh = (
  quotedAt: string,
  now = new Date(),
) => {
  const age = now.getTime() - Date.parse(quotedAt);
  if (!Number.isFinite(age) || age < 0 || age > MEDIA_QUOTE_MAXIMUM_AGE_MS)
    throw new BadRequestException(
      'This media estimate expired. Check the same request again before generating.',
    );
};
const MEDIA_RESERVATION = z
  .object({
    workspaceId: z.uuid(),
    actorId: z.uuid(),
    projectId: z.uuid(),
    taskId: z.uuid(),
    sourceRunId: z.uuid(),
    modelId: z
      .string()
      .regex(/^atlascloud\/[a-zA-Z0-9._/-]+$/)
      .max(200),
    kind: z.enum(['IMAGE', 'CLIP']),
    limit: z
      .object({
        id: z.uuid(),
        revision: z.number().int().positive(),
        maximumCostUsd: usdSchema.refine((value) => usdToMicro(value) > 0),
        source: z.string().trim().min(3).max(1000),
        verifiedAt: z.iso.datetime(),
      })
      .strict(),
    quotedCostUsd: usdSchema,
    quoteEstimated: z.boolean(),
    quotedAt: z.iso.datetime(),
    requestHash: z.string().regex(/^[a-f0-9]{64}$/),
    catalogSchemaRevision: z.string().trim().min(1).max(100),
  })
  .strict();

export const validateOtogrowAiMediaReservation = (
  input: OtogrowAiMediaReservation,
  now = new Date(),
  allowExpiredQuote = false,
) => {
  const parsed = MEDIA_RESERVATION.safeParse(input);
  if (!parsed.success)
    throw new BadRequestException(
      'A verified media limit and exact current request quote are required.',
    );
  const value = parsed.data;
  if (value.quoteEstimated)
    throw new BadRequestException(
      'This model returns estimated token-based media pricing. A supported finite billing bound is required before generation.',
    );
  if (!allowExpiredQuote) assertOtogrowAiMediaQuoteFresh(value.quotedAt, now);
  else if (Date.parse(value.quotedAt) > now.getTime())
    throw new BadRequestException(
      'Media estimate time cannot be in the future.',
    );
  if (Date.parse(value.limit.verifiedAt) > now.getTime())
    throw new BadRequestException(
      'Media limit verification cannot be in the future.',
    );
  if (usdToMicro(value.quotedCostUsd) > usdToMicro(value.limit.maximumCostUsd))
    throw new BadRequestException(
      'The provider estimate exceeds this model’s administrator-verified reservation limit.',
    );
  return value;
};
