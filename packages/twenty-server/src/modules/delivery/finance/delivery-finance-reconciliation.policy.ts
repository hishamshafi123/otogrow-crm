import { createHash } from 'node:crypto';
import { z } from 'zod';
import isEqual from 'lodash.isequal';
import {
  type BusinessRecord,
  deliveryCurrencySchema,
} from 'src/modules/delivery/business/delivery-business.types';
import { deliveryFinanceAmountSchema } from 'src/modules/delivery/finance/delivery-finance.policy';

const identifier = z.uuid().transform((value) => value.toLowerCase());
const nullableIdentifier = identifier
  .nullish()
  .transform((value) => value ?? null);
const token = z.string().regex(/^[a-f0-9]{64}$/);
const positiveAmount = deliveryFinanceAmountSchema.refine(
  (value) => /^(0|[1-9]\d{0,18})$/.test(value) && BigInt(value) > BigInt(0),
);
export const financeCashAmountSchema = positiveAmount.refine(
  (value) =>
    /^(0|[1-9]\d{0,18})$/.test(value) &&
    BigInt(value) % BigInt(10000) === BigInt(0) &&
    BigInt(value) <= BigInt('1000000000000000'),
  'Payments and invoice settlements must use whole cents within the supported cash limit.',
);
export const financePaymentsQuerySchema = z
  .object({
    currency: deliveryCurrencySchema
      .nullish()
      .transform((value) => value ?? null),
    afterCashId: nullableIdentifier,
    afterReceivableId: nullableIdentifier,
    afterEntryId: nullableIdentifier,
    selectedCashId: nullableIdentifier,
    selectedReceivableId: nullableIdentifier,
    selectedEntryId: nullableIdentifier,
    afterSettlementId: nullableIdentifier,
    afterMatchId: nullableIdentifier,
  })
  .strict();
export const financePaymentSchema = z
  .object({
    id: identifier,
    title: z.string().trim().min(1).max(240),
    category: z.enum(['INCOME', 'EXPENSE', 'SALARY']),
    currency: deliveryCurrencySchema,
    amountMicros: financeCashAmountSchema,
    date: z.iso.date(),
    projectId: nullableIdentifier,
    note: z.string().trim().max(12000),
    evidenceUrl: z
      .url({ protocol: /^https?$/ })
      .max(2000)
      .nullish()
      .transform((value) => value ?? null),
  })
  .strict()
  .refine(
    (value) => Boolean(value.note || value.evidenceUrl),
    'Add a payment source note or evidence link.',
  );
export const financeSettlementSchema = z
  .object({
    id: identifier,
    cashId: identifier,
    receivableId: identifier,
    amountMicros: financeCashAmountSchema,
    expectedCashToken: token,
    expectedReceivableToken: token,
    acknowledgeUnassignedCash: z.boolean().optional().default(false),
  })
  .strict();
export const financeCashMatchSchema = z
  .object({
    id: identifier,
    cashId: identifier,
    entryId: identifier,
    projectId: nullableIdentifier,
    amountMicros: positiveAmount,
    expectedCashToken: token,
    expectedEntryToken: token,
    acknowledgeUnassignedCash: z.boolean().optional().default(false),
  })
  .strict();
export const financeReverseRelationSchema = z
  .object({
    id: identifier,
    kind: z.enum(['SETTLEMENT', 'MATCH']),
    revision: z.number().int().positive(),
    reason: z.string().trim().min(1).max(2000),
  })
  .strict();
export const financeReviewToken = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
export type FinanceCashSnapshot = {
  id: string;
  revision: number;
  title: string;
  category: string;
  currency: string;
  amountMicros: string;
  date: string;
  dueDate: string | null;
  projectId: string | null;
  projectName: string | null;
  status: string;
  evidenceUrl: string | null;
  note: string;
};
export const financeCashSourceMatches = (
  saved: FinanceCashSnapshot,
  current: FinanceCashSnapshot,
) =>
  isEqual(
    { ...saved, status: '', revision: 0, projectName: null },
    { ...current, status: '', revision: 0, projectName: null },
  );

export const financeCashSnapshot = (
  record: BusinessRecord,
  projects: { id: string; name: string }[],
): FinanceCashSnapshot | null => {
  if (
    record.kind !== 'FINANCE' ||
    !z.uuid().safeParse(record.id).success ||
    !Number.isSafeInteger(record.revision) ||
    record.revision < 1 ||
    !Number.isSafeInteger(record.amount) ||
    record.amount <= 0 ||
    record.amount > 100000000000 ||
    !deliveryCurrencySchema.safeParse(record.currency).success ||
    !z.iso.date().safeParse(record.date).success ||
    !['INCOME', 'EXPENSE', 'SALARY', 'RECEIVABLE'].includes(record.category) ||
    typeof record.title !== 'string' ||
    typeof record.externalReference !== 'string' ||
    typeof record.notes !== 'string' ||
    (record.projectId !== null &&
      !z.uuid().safeParse(record.projectId).success) ||
    (record.evidenceUrl !== null &&
      !z.url({ protocol: /^https?$/ }).safeParse(record.evidenceUrl).success) ||
    (record.category === 'RECEIVABLE'
      ? !['OPEN', 'PAID', 'VOID'].includes(record.status) ||
        !z.iso.date().safeParse(record.dueDate).success
      : !['POSTED', 'VOID'].includes(record.status))
  )
    return null;
  return {
    id: record.id,
    revision: record.revision,
    title: record.title,
    category: record.category,
    currency: record.currency,
    amountMicros: (BigInt(record.amount) * BigInt(10000)).toString(),
    date: record.date,
    dueDate: record.dueDate ?? null,
    projectId: record.projectId ?? null,
    projectName:
      projects.find((project) => project.id === record.projectId)?.name ?? null,
    status: record.status,
    evidenceUrl: record.evidenceUrl ?? null,
    note: record.notes ?? '',
  };
};
