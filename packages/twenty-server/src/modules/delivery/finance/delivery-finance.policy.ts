import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { deliveryCurrencySchema } from 'src/modules/delivery/business/delivery-business.types';

export const DELIVERY_FINANCE_PAGE_SIZE = 50;
export const DELIVERY_FINANCE_HISTORY_PAGE_SIZE = 20;
export const deliveryFinanceMonthSchema = z
  .string()
  .regex(/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/);
const FINANCE_AMOUNT_PATTERN = /^(0|[1-9]\d{0,18})$/;
export const deliveryFinanceAmountSchema = z
  .string()
  .regex(FINANCE_AMOUNT_PATTERN)
  .refine(
    (value) =>
      FINANCE_AMOUNT_PATTERN.test(value) &&
      BigInt(value) <= BigInt('9223372036854775807'),
  );
export const deliveryFinancePlanTypeSchema = z.enum(['SALARY', 'OVERHEAD']);
export type DeliveryFinancePlanType = z.infer<
  typeof deliveryFinancePlanTypeSchema
>;
export type DeliveryFinanceCurrency = z.infer<typeof deliveryCurrencySchema>;
export type DeliveryFinanceEntryKind = 'REVENUE' | 'COST';
export type DeliveryFinanceEntryStatus = 'DRAFT' | 'POSTED' | 'VOID';
export type DeliveryFinancePlanSource = {
  planId: string;
  revision: number;
  type: DeliveryFinancePlanType;
  name: string;
  memberId: string | null;
  memberName: string | null;
  monthlyAmountMicros: string;
  startMonth: string;
  endMonth: string | null;
  dueDay: number;
};
const identifier = z.uuid().transform((value) => value.toLowerCase());
const nullableIdentifier = identifier
  .nullish()
  .transform((value) => value ?? null);
export const deliveryFinanceQuerySchema = z
  .object({
    month: deliveryFinanceMonthSchema,
    currency: deliveryCurrencySchema
      .nullish()
      .transform((value) => value ?? null),
    afterPlanId: nullableIdentifier,
    afterEntryId: nullableIdentifier,
    selectedPlanId: nullableIdentifier,
    selectedEntryId: nullableIdentifier,
  })
  .strict();
export const deliveryFinancePlanSchema = z
  .object({
    id: identifier,
    revision: z.number().int().nonnegative(),
    type: deliveryFinancePlanTypeSchema,
    name: z.string().trim().min(1).max(240),
    currency: deliveryCurrencySchema,
    monthlyAmountMicros: deliveryFinanceAmountSchema,
    memberId: nullableIdentifier,
    startMonth: deliveryFinanceMonthSchema,
    endMonth: deliveryFinanceMonthSchema
      .nullish()
      .transform((value) => value ?? null),
    dueDay: z.number().int().min(1).max(31),
    active: z.boolean(),
  })
  .strict()
  .refine((value) => !value.endMonth || value.endMonth >= value.startMonth, {
    message: 'The end month cannot precede the start month.',
  });
export const deliveryFinanceAllocationSchema = z
  .object({
    projectId: nullableIdentifier,
    amountMicros: deliveryFinanceAmountSchema,
  })
  .strict();
export const deliveryFinanceEntrySchema = z
  .object({
    id: identifier,
    revision: z.number().int().nonnegative(),
    month: deliveryFinanceMonthSchema,
    kind: z.enum(['REVENUE', 'COST']),
    category: z.string().trim().min(1).max(100),
    title: z.string().trim().min(1).max(240),
    currency: deliveryCurrencySchema,
    amountMicros: deliveryFinanceAmountSchema,
    note: z.string().trim().max(12000),
    evidenceUrl: z
      .url({ protocol: /^https?$/ })
      .max(2000)
      .nullish()
      .transform((value) => value ?? null),
    allocations: z.array(deliveryFinanceAllocationSchema).max(100),
  })
  .strict();
export const deliveryFinancePostSchema = z
  .object({
    id: identifier,
    revision: z.number().int().positive(),
    acknowledgeSourceWarnings: z.boolean().optional().default(false),
    expectedSourceReviewToken: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullish(),
  })
  .strict();
export const deliveryFinanceVoidSchema = z
  .object({
    id: identifier,
    revision: z.number().int().positive(),
    reason: z.string().trim().min(1).max(2000),
  })
  .strict();
export const deliveryFinancePrepareSchema = z
  .object({
    month: deliveryFinanceMonthSchema,
    currency: deliveryCurrencySchema
      .nullish()
      .transform((value) => value ?? null),
    afterPlanId: nullableIdentifier,
  })
  .strict();
export const deliveryFinanceHistorySchema = z
  .object({ entryId: identifier, beforeId: nullableIdentifier })
  .strict();
export const parseDeliveryFinance = <TOutput>(
  schema: z.ZodType<TOutput>,
  input: unknown,
): TOutput => {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new BadRequestException(
      result.error.issues[0]?.message ?? 'Check the monthly finance fields.',
    );
  return result.data;
};
export const financeAllocationTotal = (
  allocations: { projectId: string | null; amountMicros: string }[],
) => {
  if (
    new Set(allocations.map((allocation) => allocation.projectId ?? 'COMPANY'))
      .size !== allocations.length
  )
    throw new BadRequestException(
      'Use each project or company allocation only once.',
    );
  return allocations.reduce(
    (total, allocation) => total + BigInt(allocation.amountMicros),
    BigInt(0),
  );
};

export const financeDueDate = (month: string, dueDay: number) => {
  const monthEnd = new Date(`${month}-01T12:00:00.000Z`);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1, 0);
  return `${month}-${String(Math.min(dueDay, monthEnd.getUTCDate())).padStart(2, '0')}`;
};
