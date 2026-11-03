import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  usdSchema,
  usdToMicro,
} from 'src/modules/otogrow-ai-budget/otogrow-ai-budget.policy';

const id = z.uuid();
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value instanceof Date
      ? value.toISOString()
      : typeof value === 'object' && value !== null
        ? Object.fromEntries(
            Object.entries(value)
              .sort(([left], [right]) => left.localeCompare(right))
              .map(([key, item]) => [key, canonical(item)]),
          )
        : value;
export const atlasHash = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
export const parseAtlasInput = <TResult>(
  schema: z.ZodType<TResult>,
  input: unknown,
): TResult => {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new BadRequestException(
      'Check the Atlas model, parameters, permissions and current source versions.',
    );
  return result.data;
};
export const atlasSettingsSchema = z
  .object({
    revision: z.number().int().min(0),
    apiKey: z.string().trim().min(10).max(1000).nullish(),
    enabled: z.boolean(),
    enabledProfileIds: z.array(z.string().min(1).max(200)).max(40),
    defaultImageFamilyId: z.string().max(100).nullable(),
    defaultClipProfileId: z.string().max(200).nullable(),
    reservationLimits: z
      .array(
        z
          .object({
            profileId: z.string().max(200),
            maximumCostUsd: usdSchema.refine(
              (value) => usdToMicro(value) > BigInt(0),
            ),
            source: z.string().trim().min(1).max(2000),
            verifiedAt: z.iso.datetime({ offset: true }),
          })
          .strict(),
      )
      .max(40),
  })
  .strict();
export const atlasRevisionSchema = z
  .object({ revision: z.number().int().min(0) })
  .strict();
export const atlasProductionSchema = z.object({ taskId: id }).strict();
export const atlasProductionAccessSchema = z
  .object({
    taskId: id,
    taskRevision: z.number().int().positive(),
    enabled: z.boolean(),
    roles: z.array(z.enum(['ADMIN', 'MANAGER', 'MEMBER'])).max(3),
    profileIds: z.array(z.string().max(200)).max(40),
    dailyRunLimit: z.number().int().min(1).max(50),
  })
  .strict();
export const atlasQuoteSchema = z
  .object({
    taskId: id,
    taskRevision: z.number().int().positive(),
    requestId: id,
    profileId: z.string().max(200),
    target: z.enum(['BRIEF', 'SHOT']),
    shotId: id.nullable(),
    prompt: z.string().trim().min(1).max(20000),
    referenceAssetIds: z.array(id).max(14),
    parameters: z
      .object({
        resolution: z.string().max(50).nullish(),
        size: z.string().max(50).nullish(),
        aspectRatio: z.string().max(50).nullish(),
        duration: z.number().int().nullish(),
        generateAudio: z.boolean().nullish(),
        quality: z.string().max(50).nullish(),
        seed: z.number().int().nullish(),
      })
      .strict(),
  })
  .strict()
  .refine((input) =>
    input.target === 'BRIEF' ? input.shotId === null : input.shotId !== null,
  );
export const atlasStartSchema = z
  .object({
    taskId: id,
    runId: id,
    requestId: id,
    quoteToken: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const atlasRunSchema = z.object({ taskId: id, runId: id }).strict();
export const atlasRunsSchema = z
  .object({ taskId: id, beforeId: id.nullish() })
  .strict();
