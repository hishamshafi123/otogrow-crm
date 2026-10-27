import { z } from 'zod';
import { getValidTimeZoneOrUndefined } from 'twenty-shared/utils';
import { deliveryCurrencySchema } from 'src/modules/delivery/business/delivery-business.types';
import {
  deliveryFinanceAmountSchema,
  deliveryFinanceMonthSchema,
} from 'src/modules/delivery/finance/delivery-finance.policy';

const identifier = z.uuid().transform((value) => value.toLowerCase());
const nullableIdentifier = identifier
  .nullish()
  .transform((value) => value ?? null);
const nullableDate = z.iso
  .date()
  .nullish()
  .transform((value) => value ?? null);
const reviewToken = z.string().regex(/^[a-f0-9]{64}$/);
const nullableToken = reviewToken.nullish().transform((value) => value ?? null);
const reason = z.string().trim().min(1).max(2000);
export const financeForecastSignedAmountSchema = z
  .string()
  .regex(/^(0|-?[1-9]\d{0,18})$/)
  .refine((value) => {
    if (!/^(0|-?[1-9]\d{0,18})$/.test(value)) return false;
    const amount = BigInt(value);
    return (
      amount >= BigInt('-9223372036854775808') &&
      amount <= BigInt('9223372036854775807')
    );
  });
export const financeForecastQuerySchema = z
  .object({
    currency: deliveryCurrencySchema,
    horizonDays: z.union([z.literal(30), z.literal(90)]),
    afterItemId: nullableIdentifier,
    selectedItemId: nullableIdentifier,
    afterExceptionKey: z
      .string()
      .max(300)
      .nullish()
      .transform((value) => value ?? null),
    afterRealizationId: nullableIdentifier,
  })
  .strict();
export const financeForecastSourcesSchema = z
  .object({
    currency: deliveryCurrencySchema,
    kind: z.enum(['RECEIVABLE', 'PLAN', 'CASH']),
    month: deliveryFinanceMonthSchema
      .nullish()
      .transform((value) => value ?? null),
    afterId: nullableIdentifier,
    selectedId: nullableIdentifier,
  })
  .strict()
  .refine(
    (value) => value.kind !== 'PLAN' || value.month !== null,
    'Choose the plan service month.',
  );
export const financeForecastAnchorSchema = z
  .object({
    id: identifier,
    revision: z.number().int().nonnegative(),
    currency: deliveryCurrencySchema,
    amountMicros: financeForecastSignedAmountSchema,
    closingDate: z.iso.date(),
    timezone: z
      .string()
      .trim()
      .max(100)
      .refine(
        (value) => getValidTimeZoneOrUndefined(value) !== undefined,
        'Choose a valid reporting timezone.',
      ),
    note: z.string().trim().min(1).max(12000),
    evidenceUrl: z
      .url({ protocol: /^https?$/ })
      .max(2000)
      .nullish()
      .transform((value) => value ?? null),
    acknowledgeCoverage: z.literal(true),
    reason,
  })
  .strict();
export const financeForecastItemSchema = z
  .object({
    commandId: identifier,
    id: identifier,
    revision: z.number().int().nonnegative(),
    status: z.enum(['ACTIVE', 'CANCELLED']),
    sourceType: z.enum(['RECEIVABLE', 'PLAN', 'MANUAL']),
    sourceId: nullableIdentifier,
    planMonth: deliveryFinanceMonthSchema
      .nullish()
      .transform((value) => value ?? null),
    currency: deliveryCurrencySchema,
    title: z.string().trim().min(1).max(240),
    amountMicros: deliveryFinanceAmountSchema,
    expectedDate: nullableDate,
    ownerId: identifier,
    nextActionDate: z.iso.date(),
    note: z.string().trim().min(1).max(12000),
    expectedSourceReviewToken: nullableToken,
    acknowledgeSourceWarnings: z.boolean().optional().default(false),
    reason,
  })
  .strict()
  .refine(
    (value) =>
      value.sourceType === 'MANUAL'
        ? value.sourceId === null && value.planMonth === null
        : value.sourceId !== null &&
          (value.sourceType === 'PLAN'
            ? value.planMonth !== null
            : value.planMonth === null),
    'Choose exactly one invoice or plan-month source, or a manual outflow.',
  )
  .refine(
    (value) => value.sourceType !== 'RECEIVABLE' || value.expectedDate !== null,
    'Choose an explicit collection date.',
  );
export const financeForecastRealizeSchema = z
  .object({
    id: identifier,
    itemId: identifier,
    cashId: identifier,
    amountMicros: deliveryFinanceAmountSchema.refine(
      (value) => /^(0|[1-9]\d{0,18})$/.test(value) && BigInt(value) > BigInt(0),
    ),
    expectedCashReviewToken: reviewToken,
    expectedItemReviewToken: reviewToken,
    note: z.string().trim().min(1).max(2000),
  })
  .strict();
export const financeForecastReverseSchema = z
  .object({ id: identifier, revision: z.number().int().positive(), reason })
  .strict();
export const financeForecastHistorySchema = z
  .object({
    sourceType: z.enum(['ANCHOR', 'ITEM', 'REALIZATION']),
    sourceId: identifier,
    beforeId: nullableIdentifier,
  })
  .strict();
export const financeForecastBusinessDate = (
  timezone: string,
  now = new Date(),
) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
};
