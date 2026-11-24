import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import {
  financeV2CurrencySchema,
  financeV2DaysSchema,
  financeV2FxRateSchema,
  financeV2IsoDateSchema,
  financeV2MonthSchema,
  financeV2NonNegativeMicrosSchema,
  financeV2PositiveMicrosSchema,
} from 'src/modules/delivery/finance-v2/finance-v2.policy';

const nonEmptyText = z.string().trim().min(1).max(240);
const optionalText = z
  .string()
  .trim()
  .max(4000)
  .nullish()
  .transform((value) => value ?? '');
const optionalEmail = z
  .string()
  .trim()
  .max(240)
  .nullish()
  .transform((value) => value ?? '')
  .refine(
    (value) => value === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    'Enter a valid email address.',
  );
const optionalUrl = z
  .string()
  .trim()
  .max(2000)
  .nullish()
  .transform((value) => value || null)
  .refine(
    (value) =>
      value === null ||
      value.startsWith('https://') ||
      value.startsWith('http://'),
    'Enter a valid http(s) link.',
  );
const optionalUuid = z
  .uuid()
  .nullish()
  .transform((value) => value ?? null);
// Preserves undefined when omitted on Edit mutations so stored optional fields are never silently wiped.
const patchableUuid = z.uuid().nullable().optional();
const patchableText = z.string().trim().max(4000).optional();
const patchableMonth = financeV2MonthSchema.nullable().optional();
const dayOfMonth = z.number().int().min(1).max(31);

export const financeV2SnapshotQuerySchema = z
  .object({
    fromDate: financeV2IsoDateSchema.optional(),
    toDate: financeV2IsoDateSchema.optional(),
    asOfDate: financeV2IsoDateSchema.optional(),
    payrollMonth: financeV2MonthSchema.optional(),
  })
  .strict();

const documentLineItemInputSchema = z
  .object({
    id: z.string().trim().min(1).max(80).optional(),
    label: nonEmptyText,
    description: optionalText,
    quantity: z
      .string()
      .trim()
      .regex(/^(?:\d+(?:\.\d{1,6})?|\.\d{1,6})$/, 'Quantity must be positive.'),
    unitPriceMicros: financeV2NonNegativeMicrosSchema,
    discountPercent: z
      .string()
      .trim()
      .regex(/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})?$/, 'Discount must be 0 to 100.')
      .optional(),
  })
  .strict();

const rateCardItemSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    name: nonEmptyText,
    description: optionalText,
    defaultRateMicros: financeV2NonNegativeMicrosSchema,
    currency: financeV2CurrencySchema,
  })
  .strict();

export const financeV2CommandSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('saveCompanyProfile'),
      companyName: nonEmptyText,
      legalAddress: optionalText,
      email: optionalEmail,
      phone: optionalText,
      website: optionalText,
      logoDataUrl: z
        .string()
        .trim()
        .max(1_500_000)
        .nullish()
        .transform((value) => value || null)
        .refine(
          (value) =>
            value === null ||
            /^data:image\/(?:png|jpeg|jpg);base64,[A-Za-z0-9+/=]+$/.test(value),
          'Logo must be a PNG or JPG image.',
        ),
      bankDetails: optionalText,
      defaultQuoteTerms: optionalText,
      defaultInvoiceNotes: optionalText,
      rateCard: z.array(rateCardItemSchema).max(100).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('saveExchangeRates'),
      exchangeRates: z.record(financeV2CurrencySchema, financeV2FxRateSchema),
    })
    .strict(),
  z
    .object({
      action: z.literal('recordOpeningBalance'),
      kind: z.enum(['CASH', 'FIXED_ASSET', 'PERSON_LIABILITY']),
      title: nonEmptyText,
      entryDate: financeV2IsoDateSchema,
      currency: financeV2CurrencySchema,
      amountMicros: financeV2PositiveMicrosSchema,
      fxRateToAed: financeV2FxRateSchema.optional(),
      personAccountId: optionalUuid,
      notes: optionalText,
    })
    .strict(),
  z
    .object({
      action: z.literal('convertCurrency'),
      entryDate: financeV2IsoDateSchema,
      fromCurrency: financeV2CurrencySchema,
      fromAmountMicros: financeV2PositiveMicrosSchema,
      fromFxRateToAed: financeV2FxRateSchema.optional(),
      toCurrency: financeV2CurrencySchema,
      toAmountMicros: financeV2PositiveMicrosSchema,
      toFxRateToAed: financeV2FxRateSchema.optional(),
      notes: optionalText,
    })
    .strict(),
  z
    .object({
      action: z.literal('savePersonLiability'),
      id: optionalUuid,
      personName: nonEmptyText,
      personEmail: optionalEmail,
      currency: financeV2CurrencySchema
        .nullish()
        .transform((value) => value ?? null),
    })
    .strict(),
  z
    .object({
      action: z.literal('recordLoanIn'),
      personAccountId: z.uuid(),
      entryDate: financeV2IsoDateSchema,
      currency: financeV2CurrencySchema,
      amountMicros: financeV2PositiveMicrosSchema,
      fxRateToAed: financeV2FxRateSchema.optional(),
      title: optionalText,
      notes: optionalText,
    })
    .strict(),
  z
    .object({
      action: z.literal('recordLoanRepayment'),
      personAccountId: z.uuid(),
      entryDate: financeV2IsoDateSchema,
      currency: financeV2CurrencySchema,
      amountMicros: financeV2PositiveMicrosSchema,
      fxRateToAed: financeV2FxRateSchema.optional(),
      liabilityBookFxRateToAed: financeV2FxRateSchema.optional(),
      title: optionalText,
      notes: optionalText,
    })
    .strict(),
  z
    .object({
      action: z.literal('recordExpenseOrAsset'),
      entryKind: z.enum([
        'DIRECT_EXPENSE',
        'INDIRECT_EXPENSE',
        'ASSET_PURCHASE',
      ]),
      category: nonEmptyText,
      title: nonEmptyText,
      entryDate: financeV2IsoDateSchema,
      currency: financeV2CurrencySchema,
      amountMicros: financeV2PositiveMicrosSchema,
      fxRateToAed: financeV2FxRateSchema.optional(),
      fundingAccountId: z.uuid(),
      projectId: optionalUuid,
      receiptUrl: optionalUrl,
      notes: optionalText,
    })
    .strict(),
  z
    .object({
      action: z.literal('voidJournal'),
      journalId: z.uuid(),
      reason: nonEmptyText,
    })
    .strict(),
  z
    .object({
      action: z.literal('importAiSpend'),
      spendIds: z.array(z.uuid()).min(1).max(100),
      fundingAccountId: z.uuid(),
      fxRateToAed: financeV2FxRateSchema.optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('saveRecurringExpense'),
      id: optionalUuid,
      title: nonEmptyText,
      expenseType: z.enum(['DIRECT_EXPENSE', 'INDIRECT_EXPENSE']),
      category: nonEmptyText,
      currency: financeV2CurrencySchema,
      amountMicros: financeV2PositiveMicrosSchema,
      dayOfMonth,
      fundingAccountId: z.uuid(),
      startMonth: financeV2MonthSchema,
      endMonth: patchableMonth,
      notes: patchableText,
    })
    .strict(),
  z
    .object({
      action: z.literal('setRecurringExpenseStatus'),
      id: z.uuid(),
      status: z.enum(['ACTIVE', 'PAUSED', 'STOPPED']),
    })
    .strict(),
  z
    .object({
      action: z.literal('runDueAutomation'),
      asOfDate: financeV2IsoDateSchema.optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('savePayrollProfile'),
      id: optionalUuid,
      employeeMemberId: optionalUuid,
      employeeName: nonEmptyText,
      roleLabel: optionalText,
      currency: financeV2CurrencySchema,
      baseSalaryMicros: financeV2PositiveMicrosSchema,
      workingDaysPerMonth: z.number().int().min(1).max(31).default(26),
      paidLeavesPerMonth: z.number().int().min(0).max(31).default(2),
      payDayOfMonth: dayOfMonth,
      fundingAccountId: z.uuid(),
      startMonth: financeV2MonthSchema.optional(),
      active: z.boolean().default(true),
    })
    .strict(),
  z
    .object({
      action: z.literal('addPayrollEntry'),
      profileId: z.uuid(),
      month: financeV2MonthSchema,
      entryKind: z.enum(['LEAVE', 'SWAP_COMP_OFF', 'OVERTIME', 'BONUS']),
      days: financeV2DaysSchema.nullish().transform((value) => value ?? null),
      bonusAmountMicros: financeV2PositiveMicrosSchema
        .nullish()
        .transform((value) => value ?? null),
      eventDate: financeV2IsoDateSchema,
      swappedWorkDate: financeV2IsoDateSchema
        .nullish()
        .transform((value) => value ?? null),
      note: optionalText,
    })
    .strict(),
  z
    .object({
      action: z.literal('deletePayrollEntry'),
      id: z.uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal('postPayrollAdjustments'),
      profileId: z.uuid(),
      month: financeV2MonthSchema,
      fxRateToAed: financeV2FxRateSchema.optional(),
      forceResync: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('saveQuote'),
      id: optionalUuid,
      clientName: nonEmptyText,
      clientEmail: optionalEmail,
      clientAddress: optionalText,
      projectId: patchableUuid,
      currency: financeV2CurrencySchema,
      issueDate: financeV2IsoDateSchema,
      validUntil: financeV2IsoDateSchema
        .nullish()
        .transform((value) => value ?? null),
      lineItems: z.array(documentLineItemInputSchema).min(1).max(100),
      notes: patchableText,
      terms: patchableText,
    })
    .strict(),
  z
    .object({
      action: z.literal('sendQuoteEmail'),
      quoteId: z.uuid(),
      toEmail: optionalEmail,
      message: optionalText,
    })
    .strict(),
  z
    .object({
      action: z.literal('markQuoteSent'),
      quoteId: z.uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal('voidQuote'),
      quoteId: z.uuid(),
      reason: nonEmptyText,
    })
    .strict(),
  z
    .object({
      action: z.literal('convertQuoteToInvoice'),
      quoteId: z.uuid(),
      mode: z.enum(['ONE_OFF', 'RECURRING']),
      issueDate: financeV2IsoDateSchema.optional(),
      dueDate: financeV2IsoDateSchema.optional(),
      billingDayOfMonth: dayOfMonth.optional(),
      dueDayOfMonth: dayOfMonth.optional(),
      startMonth: financeV2MonthSchema.optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('saveInvoice'),
      id: optionalUuid,
      clientName: nonEmptyText,
      clientEmail: optionalEmail,
      clientAddress: optionalText,
      projectId: patchableUuid,
      currency: financeV2CurrencySchema,
      issueDate: financeV2IsoDateSchema,
      dueDate: financeV2IsoDateSchema,
      lineItems: z.array(documentLineItemInputSchema).min(1).max(100),
      notes: patchableText,
    })
    .strict(),
  z
    .object({
      action: z.literal('saveInvoiceSchedule'),
      id: optionalUuid,
      clientName: nonEmptyText,
      clientEmail: optionalEmail,
      clientAddress: optionalText,
      projectId: patchableUuid,
      currency: financeV2CurrencySchema,
      lineItems: z.array(documentLineItemInputSchema).min(1).max(100),
      billingDayOfMonth: dayOfMonth,
      dueDayOfMonth: dayOfMonth,
      startMonth: financeV2MonthSchema,
      endMonth: patchableMonth,
      notes: patchableText,
    })
    .strict(),
  z
    .object({
      action: z.literal('setInvoiceScheduleStatus'),
      id: z.uuid(),
      status: z.enum(['ACTIVE', 'PAUSED', 'STOPPED']),
    })
    .strict(),
  z
    .object({
      action: z.literal('sendInvoiceEmail'),
      invoiceId: z.uuid(),
      toEmail: optionalEmail,
      message: optionalText,
    })
    .strict(),
  z
    .object({
      action: z.literal('markInvoiceSent'),
      invoiceId: z.uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal('recordInvoicePayment'),
      invoiceId: z.uuid(),
      paymentDate: financeV2IsoDateSchema,
      amountMicros: financeV2PositiveMicrosSchema,
      fxRateToAed: financeV2FxRateSchema.optional(),
      notes: optionalText,
    })
    .strict(),
  z
    .object({
      action: z.literal('voidInvoice'),
      invoiceId: z.uuid(),
      reason: nonEmptyText,
    })
    .strict(),
  z
    .object({
      action: z.literal('exportCsv'),
      dataset: z.enum([
        'LEDGER',
        'PNL',
        'BALANCE_SHEET',
        'DOCUMENTS',
        'PAYROLL',
      ]),
      fromDate: financeV2IsoDateSchema.optional(),
      toDate: financeV2IsoDateSchema.optional(),
      asOfDate: financeV2IsoDateSchema.optional(),
      payrollMonth: financeV2MonthSchema.optional(),
    })
    .strict(),
]);

export type FinanceV2CommandInput = z.infer<typeof financeV2CommandSchema>;
export type FinanceV2SnapshotQueryInput = z.infer<
  typeof financeV2SnapshotQuerySchema
>;

export const parseFinanceV2Input = <TData>(
  schema: z.ZodType<TData>,
  input: unknown,
): TData => {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new BadRequestException(
      first?.message || 'Invalid finance request input.',
    );
  }
  return parsed.data;
};
