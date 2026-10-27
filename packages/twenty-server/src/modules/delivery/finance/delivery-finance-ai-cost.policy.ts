import { z } from 'zod';
import { isNonEmptyString } from '@sniptt/guards';
import {
  deliveryFinanceAllocationSchema,
  deliveryFinanceAmountSchema,
  deliveryFinanceMonthSchema,
} from 'src/modules/delivery/finance/delivery-finance.policy';
import { type DeliveryFinanceAiCostOriginDTO } from 'src/modules/delivery/finance/delivery-finance-ai-cost-origin.dto';

const identifier = z.uuid().transform((value) => value.toLowerCase());
const optionalIdentifier = identifier
  .nullish()
  .transform((value) => value ?? null);
const token = z.string().regex(/^[a-f0-9]{64}$/);
export const financeAiCostsQuerySchema = z
  .object({
    filter: z
      .enum(['ALL', 'UNRECOGNIZED', 'RECOGNIZED', 'NEEDS_REVIEW'])
      .nullish()
      .transform((value) => value ?? 'ALL'),
    afterSpendId: optionalIdentifier,
    selectedSpendId: optionalIdentifier,
    afterEvidenceId: optionalIdentifier,
  })
  .strict()
  .refine(
    (value) => !value.afterEvidenceId || Boolean(value.selectedSpendId),
    'Choose a charge before paging its evidence.',
  );
export const financeAiCostPrepareSchema = z
  .object({
    id: identifier,
    spendId: identifier,
    evidenceEventId: identifier,
    expectedSourceReviewToken: token,
    expectedClaimRevision: z.number().int().nonnegative(),
    month: deliveryFinanceMonthSchema,
    title: z.string().trim().min(1).max(240),
    note: z.string().trim().max(12000),
    allocations: z.array(deliveryFinanceAllocationSchema).max(100),
    acknowledgeSourceWarnings: z.boolean(),
    acknowledgeNoDuplicateCost: z.literal(true),
    replacesEntryId: optionalIdentifier,
    expectedReplacedEntryRevision: z
      .number()
      .int()
      .positive()
      .nullish()
      .transform((value) => value ?? null),
    correctionReason: z
      .string()
      .trim()
      .min(1)
      .max(2000)
      .nullish()
      .transform((value) => value ?? null),
  })
  .strict()
  .refine(
    (value) =>
      value.replacesEntryId
        ? Boolean(value.expectedReplacedEntryRevision && value.correctionReason)
        : value.expectedReplacedEntryRevision === null &&
          value.correctionReason === null,
    'A correction requires its original entry revision and a reason.',
  );
export const financeAiCostPostSchema = z
  .object({
    id: identifier,
    revision: z.number().int().positive(),
    expectedClaimRevision: z.number().int().positive(),
    expectedSourceReviewToken: token,
    acknowledgeSourceWarnings: z.boolean(),
    acknowledgeReplacement: z.boolean(),
  })
  .strict();
export const financeAiAmount = (value: unknown): string | null => {
  const result = deliveryFinanceAmountSchema.safeParse(value);
  return result.success ? result.data : null;
};
const FINANCE_AI_MODEL_IDENTITY = z.object({
  modelId: z.string().refine(isNonEmptyString),
  revision: z.number().int().positive(),
});
export const financeAiModelIdentity = (value: unknown) => {
  const result = FINANCE_AI_MODEL_IDENTITY.safeParse(value);
  return result.success ? result.data : null;
};
export type FinanceAiCostOrigin = DeliveryFinanceAiCostOriginDTO & {
  requestHash: string;
  preparedBy: string;
  replacedEntryRevision: number | null;
  sourceRunId: string;
  clientId: string | null;
  taskId: string | null;
};
