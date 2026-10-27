import { z } from 'zod';
import { deliveryFinanceMonthSchema } from 'src/modules/delivery/finance/delivery-finance.policy';

const identifier = z.uuid().transform((value) => value.toLowerCase());
const nullableIdentifier = identifier
  .nullish()
  .transform((value) => value ?? null);
export const financePeriodQuerySchema = z
  .object({
    month: deliveryFinanceMonthSchema,
    afterBlockerId: nullableIdentifier,
  })
  .strict();
export const financePeriodChangeSchema = z
  .object({
    id: identifier,
    month: deliveryFinanceMonthSchema,
    revision: z.number().int().nonnegative(),
    expectedPreviewToken: z.string().regex(/^[a-f0-9]{64}$/),
    status: z.enum(['OPEN', 'LOCKED']),
    reason: z.string().trim().min(1).max(2000),
    acknowledgeLimitations: z.boolean(),
  })
  .strict();
export const financePeriodHistorySchema = z
  .object({ month: deliveryFinanceMonthSchema, beforeId: nullableIdentifier })
  .strict();
const amount = z.string().regex(/^(0|[1-9]\d*)$/);
const result = z.string().regex(/^-?(0|[1-9]\d*)$/);
const count = z.number().int().nonnegative();
export const financePeriodSummariesSchema = z.array(
  z.object({
    currency: z.string(),
    revenueMicros: amount,
    costMicros: amount,
    resultMicros: result,
    draftCount: count,
    postedCount: count,
    voidCount: count,
    projects: z.array(
      z.object({
        projectId: z.uuid().nullable(),
        projectName: z.string().nullable(),
        revenueMicros: amount,
        costMicros: amount,
        resultMicros: result,
        postedCount: count,
      }),
    ),
  }),
);
export const FINANCE_PERIOD_LIMITATIONS = [
  'ALL_CURRENCIES',
  'MANAGEMENT_RESULTS_ONLY',
  'COST_COMPLETENESS_NOT_VERIFIED',
  'CASH_AND_EVIDENCE_REMAIN_OPEN',
];
