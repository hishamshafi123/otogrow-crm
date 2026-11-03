import { z } from 'zod';
import {
  type OtogrowAiPricing,
  type OtogrowAiUsage,
} from 'src/modules/otogrow-ai-budget/otogrow-ai-budget.types';

export const usdSchema = z.string().regex(/^(0|[1-9]\d{0,9})(\.\d{1,6})?$/);
const tokens = z.number().int().min(0).max(100_000_000);
const optionalRate = usdSchema
  .nullable()
  .optional()
  .transform((value) => value ?? null);
export const pricingSchema = z
  .object({
    inputUsdPerMillionTokens: usdSchema,
    outputUsdPerMillionTokens: usdSchema,
    reasoningUsdPerMillionTokens: usdSchema,
    cacheReadUsdPerMillionTokens: usdSchema,
    cacheWriteUsdPerMillionTokens: usdSchema,
    maxInputTokens: tokens.refine((value) => value > 0),
    maxOutputTokens: tokens.refine((value) => value > 0),
    maxReasoningTokens: tokens,
    outputIncludesReasoning: z.boolean(),
    longContextThresholdTokens: tokens
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    longInputUsdPerMillionTokens: optionalRate,
    longOutputUsdPerMillionTokens: optionalRate,
    longReasoningUsdPerMillionTokens: optionalRate,
    longCacheReadUsdPerMillionTokens: optionalRate,
    longCacheWriteUsdPerMillionTokens: optionalRate,
  })
  .strict()
  .superRefine((value, context) => {
    const tier = [
      value.longInputUsdPerMillionTokens,
      value.longOutputUsdPerMillionTokens,
      value.longReasoningUsdPerMillionTokens,
      value.longCacheReadUsdPerMillionTokens,
      value.longCacheWriteUsdPerMillionTokens,
    ];
    if (
      value.longContextThresholdTokens === null
        ? tier.some((rate) => rate !== null)
        : tier.some((rate) => rate === null)
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Provide every long-context rate and threshold together, or leave all empty.',
      });
  });
export const budgetSaveSchema = z
  .object({
    scope: z.enum(['WORKSPACE', 'CLIENT', 'TASK']),
    scopeId: z.string().uuid(),
    revision: z.number().int().min(0),
    capUsd: usdSchema,
    enabled: z.boolean(),
    openingSpentUsd: usdSchema
      .nullish()
      .transform((value) => value ?? undefined),
    confirmOpeningBalance: z.boolean(),
  })
  .strict();
export const priceSaveSchema = z
  .object({
    id: z
      .string()
      .uuid()
      .nullish()
      .transform((value) => value ?? undefined),
    revision: z.number().int().min(0),
    modelId: z.string().trim().min(1).max(200),
    kind: z.enum(['TEXT', 'INSPECTION', 'VIDEO_QA', 'IMAGE', 'CLIP']),
    source: z.string().trim().min(3).max(1000),
    verifiedAt: z.string().datetime(),
    enabled: z.boolean(),
    pricing: pricingSchema,
  })
  .strict();
export const assertVideoQaPricing = (value: {
  modelId: string;
  source: string;
  pricing: OtogrowAiPricing;
}) => {
  const pricing = value.pricing;
  let officialSource = false;
  try {
    const source = new URL(value.source);
    officialSource =
      source.protocol === 'https:' &&
      ((source.hostname === 'aistudio.google.com' &&
        source.pathname === '/docs/pricing') ||
        (source.hostname === 'ai.google.dev' &&
          source.pathname === '/gemini-api/docs/pricing'));
  } catch {
    officialSource = false;
  }
  if (
    value.modelId !== 'google/gemini-3.5-flash-lite' ||
    !officialSource ||
    pricing.maxInputTokens < 1048576 ||
    pricing.maxOutputTokens < 8192 ||
    pricing.maxReasoningTokens < 8192 ||
    !pricing.outputIncludesReasoning ||
    usdToMicro(pricing.inputUsdPerMillionTokens) === BigInt(0) ||
    usdToMicro(pricing.outputUsdPerMillionTokens) === BigInt(0) ||
    usdToMicro(pricing.outputUsdPerMillionTokens) !==
      usdToMicro(pricing.reasoningUsdPerMillionTokens) ||
    pricing.longContextThresholdTokens !== null
  )
    throw new Error(
      'Video QA requires the direct supported Gemini model, official equal-modality Standard tariff evidence, full1048576 input-token bound, at least8192 output/thinking tokens and included thinking at the same output rate. Other media billing paths are unsupported.',
    );
};
export const reconcileSchema = z
  .object({
    spendId: z.string().uuid(),
    revision: z.number().int().positive(),
    actualUsd: usdSchema,
    evidenceReference: z.string().trim().min(3).max(1000),
    reason: z.string().trim().min(3).max(1000),
  })
  .strict();
export const snapshotSchema = z
  .object({
    needsAttention: z
      .boolean()
      .nullish()
      .transform((value) => value ?? false),
    cursor: z
      .string()
      .max(1000)
      .nullish()
      .transform((value) => value ?? undefined),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .nullish()
      .transform((value) => value ?? 30),
  })
  .strict();
export const cursorSchema = z
  .object({
    needsAttention: z.boolean(),
    workspaceId: z.string().uuid(),
    at: z.string().datetime(),
    id: z.string().uuid(),
  })
  .strict();
const MILLION = BigInt(1_000_000);
export const usdToMicro = (value: string): bigint => {
  usdSchema.parse(value);
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * MILLION + BigInt(fraction.padEnd(6, '0'));
};
export const microToUsd = (value: bigint | string): string => {
  const amount = BigInt(value);
  const absolute = amount < BigInt(0) ? -amount : amount;
  return `${amount < BigInt(0) ? '-' : ''}${absolute / MILLION}.${(absolute % MILLION).toString().padStart(6, '0')}`;
};
const charge = (count: number, rate: string): bigint =>
  BigInt(count) * usdToMicro(rate);
const roundCharge = (numerator: bigint) =>
  (numerator + MILLION - BigInt(1)) / MILLION;
const highestRate = (values: (string | null)[]) =>
  values
    .filter((value): value is string => value !== null)
    .reduce(
      (highest, value) =>
        usdToMicro(value) > usdToMicro(highest) ? value : highest,
      '0',
    );
export const maximumCharge = (
  pricing: OtogrowAiPricing,
  outputTokens: number,
): bigint => {
  if (
    !Number.isSafeInteger(outputTokens) ||
    outputTokens < 1 ||
    outputTokens > pricing.maxOutputTokens
  )
    throw new Error(
      'The request output limit exceeds the admin-verified model bound.',
    );
  return roundCharge(
    charge(
      pricing.maxInputTokens,
      highestRate([
        pricing.inputUsdPerMillionTokens,
        pricing.cacheReadUsdPerMillionTokens,
        pricing.cacheWriteUsdPerMillionTokens,
        pricing.longInputUsdPerMillionTokens,
        pricing.longCacheReadUsdPerMillionTokens,
        pricing.longCacheWriteUsdPerMillionTokens,
      ]),
    ) +
      charge(
        outputTokens,
        highestRate([
          pricing.outputUsdPerMillionTokens,
          pricing.longOutputUsdPerMillionTokens,
        ]),
      ) +
      charge(
        pricing.maxReasoningTokens,
        highestRate([
          pricing.reasoningUsdPerMillionTokens,
          pricing.longReasoningUsdPerMillionTokens,
        ]),
      ),
  );
};
export const actualCharge = (
  pricing: OtogrowAiPricing,
  usage: OtogrowAiUsage,
): bigint => {
  Object.values(usage).forEach((value) => tokens.parse(value));
  if (
    usage.cacheReadTokens + usage.cacheWriteTokens > usage.inputTokens ||
    (pricing.outputIncludesReasoning &&
      usage.reasoningTokens > usage.outputTokens)
  )
    throw new Error('Provider usage totals are inconsistent.');
  const long =
    pricing.longContextThresholdTokens !== null &&
    usage.inputTokens > pricing.longContextThresholdTokens;
  const input = long
    ? pricing.longInputUsdPerMillionTokens!
    : pricing.inputUsdPerMillionTokens;
  const output = long
    ? pricing.longOutputUsdPerMillionTokens!
    : pricing.outputUsdPerMillionTokens;
  const reasoning = long
    ? pricing.longReasoningUsdPerMillionTokens!
    : pricing.reasoningUsdPerMillionTokens;
  const cacheRead = long
    ? pricing.longCacheReadUsdPerMillionTokens!
    : pricing.cacheReadUsdPerMillionTokens;
  const cacheWrite = long
    ? pricing.longCacheWriteUsdPerMillionTokens!
    : pricing.cacheWriteUsdPerMillionTokens;
  return roundCharge(
    charge(
      usage.inputTokens - usage.cacheReadTokens - usage.cacheWriteTokens,
      input,
    ) +
      charge(usage.cacheReadTokens, cacheRead) +
      charge(usage.cacheWriteTokens, cacheWrite) +
      charge(
        usage.outputTokens -
          (pricing.outputIncludesReasoning ? usage.reasoningTokens : 0),
        output,
      ) +
      charge(usage.reasoningTokens, reasoning),
  );
};
export const normalizeUsage = (
  pricing: OtogrowAiPricing,
  raw: Partial<OtogrowAiUsage> | null,
): OtogrowAiUsage | null => {
  if (!raw) return null;
  const equalRates = (rates: (string | null)[]) =>
    rates.every((rate) =>
      rate === null
        ? rates[0] === null
        : rates[0] !== null && usdToMicro(rate) === usdToMicro(rates[0]),
    );
  const equalInputRates =
    equalRates([
      pricing.inputUsdPerMillionTokens,
      pricing.cacheReadUsdPerMillionTokens,
      pricing.cacheWriteUsdPerMillionTokens,
    ]) &&
    equalRates([
      pricing.longInputUsdPerMillionTokens,
      pricing.longCacheReadUsdPerMillionTokens,
      pricing.longCacheWriteUsdPerMillionTokens,
    ]);
  const reasoningIncludedAtSameRate =
    pricing.outputIncludesReasoning &&
    equalRates([
      pricing.outputUsdPerMillionTokens,
      pricing.reasoningUsdPerMillionTokens,
    ]) &&
    equalRates([
      pricing.longOutputUsdPerMillionTokens,
      pricing.longReasoningUsdPerMillionTokens,
    ]);
  const usage = {
    ...raw,
    cacheReadTokens: raw.cacheReadTokens ?? (equalInputRates ? 0 : undefined),
    cacheWriteTokens: raw.cacheWriteTokens ?? (equalInputRates ? 0 : undefined),
    reasoningTokens:
      raw.reasoningTokens ??
      (pricing.maxReasoningTokens === 0 || reasoningIncludedAtSameRate
        ? 0
        : undefined),
  };
  const result = z
    .object({
      inputTokens: tokens,
      outputTokens: tokens,
      reasoningTokens: tokens,
      cacheReadTokens: tokens,
      cacheWriteTokens: tokens,
    })
    .strict()
    .safeParse(usage);
  return result.success ? result.data : null;
};
