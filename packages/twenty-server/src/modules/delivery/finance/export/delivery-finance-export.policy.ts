import { createHash } from 'node:crypto';
import { z } from 'zod';
import { deliveryCurrencySchema } from 'src/modules/delivery/business/delivery-business.types';
import { deliveryFinanceMonthSchema } from 'src/modules/delivery/finance/delivery-finance.policy';
import { type DeliveryFinanceExportRowDTO } from 'src/modules/delivery/finance/export/delivery-finance-export.dto';

export const FINANCE_EXPORT_PAGE_SIZE = 50;
export const FINANCE_EXPORT_LIST_SIZE = 25;
export const FINANCE_EXPORT_MAX_ROWS = 2000;
export const FINANCE_EXPORT_MAX_BYTES = 5000000;
export const FINANCE_EXPORT_FIELDS = [
  'SOURCE_ID',
  'SOURCE_REFERENCE',
  'SOURCE_REVISION',
  'BASIS',
  'DATE',
  'SERVICE_MONTH',
  'KIND',
  'CATEGORY',
  'TITLE',
  'CURRENCY',
  'AMOUNT',
  'AMOUNT_MICROS',
  'PROJECT_ID',
  'PROJECT_NAME',
  'ACCOUNT',
  'PAYMENT_ACCOUNT',
  'COUNTERPARTY',
  'EVIDENCE_URL',
  'CONSTANT',
] as const;
export const FINANCE_EXPORT_MAPPING_SCOPES = [
  'SOURCE',
  'PROJECT',
  'CATEGORY',
  'KIND',
  'CURRENCY',
  'DEFAULT',
] as const;
export const FINANCE_EXPORT_LIMITATIONS = [
  'GENERIC_ACCOUNTANT_HANDOFF',
  'SEPARATE_CASH_AND_RECOGNITION',
  'NO_TAX_FX_OR_BALANCED_JOURNALS',
  'DOWNLOAD_IS_NOT_IMPORT_CONFIRMATION',
  'UNLINKED_CORRECTIONS_REQUIRE_ACCOUNTANT_REVIEW',
  'FORMULA_SAFE_TEXT_PREFIX',
] as const;
const identifier = z.uuid().transform((value) => value.toLowerCase());
const nullableIdentifier = identifier
  .nullish()
  .transform((value) => value ?? null);
const nullableText = z
  .string()
  .trim()
  .max(2000)
  .nullish()
  .transform((value) => value || null);
const cursor = z
  .string()
  .min(1)
  .max(200)
  .nullish()
  .transform((value) => value ?? null);
const date = z.iso
  .date()
  .nullish()
  .transform((value) => value ?? null);
const reason = z.string().trim().min(1).max(2000);
const field = z.enum(FINANCE_EXPORT_FIELDS);
const safeHeader = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine(
    (value) => !/[\r\n\0]/.test(value) && !/^[=+\-@\t]/.test(value),
    'Use a plain literal CSV header without a spreadsheet formula.',
  );
export const financeExportColumnSchema = z
  .object({
    header: safeHeader,
    field,
    constant: z
      .string()
      .max(1000)
      .refine((value) => !value.includes('\0'))
      .nullish()
      .transform((value) => value ?? null),
  })
  .strict()
  .refine(
    (value) =>
      value.field === 'CONSTANT'
        ? value.constant !== null
        : value.constant === null,
    'Only a constant column has a constant value.',
  );
export const financeExportMappingSchema = z
  .object({
    target: z.enum(['ACCOUNT', 'PAYMENT_ACCOUNT', 'COUNTERPARTY']),
    scope: z.enum(FINANCE_EXPORT_MAPPING_SCOPES),
    key: z
      .string()
      .trim()
      .min(1)
      .max(240)
      .nullish()
      .transform((value) => value ?? null),
    value: z
      .string()
      .trim()
      .min(1)
      .max(240)
      .refine((value) => !/[\r\n\0]/.test(value)),
  })
  .strict()
  .refine(
    (value) =>
      value.scope === 'DEFAULT' ? value.key === null : value.key !== null,
    'Choose a mapping key or an explicit default.',
  )
  .refine(
    (value) =>
      value.scope !== 'SOURCE' || identifier.safeParse(value.key).success,
    'A source mapping needs its exact source identity.',
  )
  .refine(
    (value) =>
      value.scope !== 'PROJECT' ||
      value.key === 'COMPANY' ||
      identifier.safeParse(value.key).success,
    'Choose a project identity or Company/unassigned.',
  )
  .refine(
    (value) =>
      value.scope !== 'CURRENCY' ||
      deliveryCurrencySchema.safeParse(value.key).success,
    'Choose a supported currency mapping.',
  )
  .refine(
    (value) =>
      value.scope !== 'KIND' ||
      ['INCOME', 'EXPENSE', 'SALARY', 'REVENUE', 'COST'].includes(
        value.key ?? '',
      ),
    'Choose a supported financial kind.',
  );
export const financeExportConfigurationSchema = z
  .object({
    columns: z.array(financeExportColumnSchema).min(1).max(30),
    mappings: z.array(financeExportMappingSchema).max(200),
    delimiter: z.enum(['COMMA', 'SEMICOLON', 'TAB']),
    precision: z.number().int().min(0).max(6),
    dateFormat: z.enum(['ISO', 'DMY', 'MDY']),
    includeBom: z.boolean(),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.columns.map((column) => column.header.toLowerCase()))
        .size === value.columns.length,
    'Each CSV header must be unique.',
  )
  .refine(
    (value) =>
      new Set(
        value.mappings.map(
          (mapping) =>
            `${mapping.target}:${mapping.scope}:${mapping.key ?? ''}`,
        ),
      ).size === value.mappings.length,
    'Use each target/scope/key mapping only once.',
  );
export type FinanceExportConfiguration = z.infer<
  typeof financeExportConfigurationSchema
>;
export const financeExportProfileSnapshotSchema =
  financeExportConfigurationSchema
    .safeExtend({
      id: identifier,
      revision: z.number().int().positive(),
      name: z.string().min(1).max(160),
      basis: z.enum(['CASH', 'RECOGNITION']),
      active: z.boolean(),
      changedAt: z.iso.datetime({ offset: true }),
      changedByName: z.string(),
    })
    .strict();
export const financeExportProfileSchema = financeExportConfigurationSchema
  .safeExtend({
    commandId: identifier,
    id: identifier,
    revision: z.number().int().nonnegative(),
    name: z.string().trim().min(1).max(160),
    basis: z.enum(['CASH', 'RECOGNITION']),
    active: z.boolean(),
    reason,
  })
  .strict();
export const financeExportSelectionSchema = z
  .object({
    profileId: identifier,
    currency: deliveryCurrencySchema,
    dateFrom: date,
    dateTo: date,
    serviceMonth: deliveryFinanceMonthSchema
      .nullish()
      .transform((value) => value ?? null),
    accountingDate: date,
  })
  .strict()
  .refine(
    (value) =>
      value.dateFrom !== null &&
      value.dateTo !== null &&
      value.serviceMonth === null &&
      value.accountingDate === null
        ? value.dateFrom <= value.dateTo
        : value.dateFrom === null &&
          value.dateTo === null &&
          value.serviceMonth !== null &&
          value.accountingDate !== null,
    'Choose a complete cash-date window or a service month and explicit accounting date.',
  );
export type FinanceExportSelection = z.infer<
  typeof financeExportSelectionSchema
>;
export const financeExportPreviewSchema = financeExportSelectionSchema
  .safeExtend({ afterRowKey: cursor, afterExclusionKey: cursor })
  .strict();
export const financeExportBatchSchema = financeExportSelectionSchema
  .safeExtend({
    id: identifier,
    expectedPreviewToken: z.string().regex(/^[a-f0-9]{64}$/),
    acknowledgeRepeatedSources: z.boolean(),
    reexportReason: nullableText,
  })
  .strict();
export const financeExportsQuerySchema = z
  .object({
    afterProfileId: nullableIdentifier,
    afterBatchId: nullableIdentifier,
    selectedProfileId: nullableIdentifier,
    selectedBatchId: nullableIdentifier,
    afterBatchRowKey: cursor,
  })
  .strict();
export const financeExportDownloadSchema = z
  .object({ batchId: identifier })
  .strict();
export const financeExportHistorySchema = z
  .object({
    sourceType: z.enum(['PROFILE', 'BATCH']),
    sourceId: identifier,
    beforeId: nullableIdentifier,
  })
  .strict();
export const financeExportImportSchema = z
  .object({
    commandId: identifier,
    batchId: identifier,
    revision: z.number().int().positive(),
    status: z.enum(['CONFIRMED', 'REVERSED']),
    reference: z
      .string()
      .trim()
      .max(500)
      .nullish()
      .transform((value) => value || null),
    evidenceUrl: z
      .url({ protocol: /^https?$/ })
      .max(2000)
      .nullish()
      .transform((value) => value ?? null),
    reason,
  })
  .strict()
  .refine(
    (value) => value.status !== 'CONFIRMED' || value.reference !== null,
    'Record the external manual import reference.',
  );
export type FinanceExportSnapshotRow = DeliveryFinanceExportRowDTO & {
  sourceToken: string;
  bucket: string;
};
export const financeExportChecksum = (csv: string) =>
  createHash('sha256').update(csv, 'utf8').digest('hex');
export const financeExportExactAmount = (
  micros: string,
  precision: number,
): string | null => {
  if (!/^(0|[1-9]\d*)$/.test(micros)) return null;
  const value = BigInt(micros);
  const divisor = BigInt(10) ** BigInt(6 - precision);
  if (value % divisor !== BigInt(0)) return null;
  const whole = value / BigInt(1000000);
  const fraction = (value % BigInt(1000000))
    .toString()
    .padStart(6, '0')
    .slice(0, precision);
  return `${whole}${precision > 0 ? `.${fraction}` : ''}`;
};
export const financeExportSafeText = (value: string) =>
  /^[\s\uFEFF]*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value)
    ? `'${value}`
    : value;
export const financeExportCsv = (
  configuration: FinanceExportConfiguration,
  cells: string[][],
) => {
  const delimiter =
    configuration.delimiter === 'TAB'
      ? '\t'
      : configuration.delimiter === 'SEMICOLON'
        ? ';'
        : ',';
  const quote = (value: string) =>
    /[\r\n"]/.test(value) || value.includes(delimiter)
      ? `"${value.replace(/"/g, '""')}"`
      : value;
  return `${configuration.includeBom ? '\uFEFF' : ''}${[configuration.columns.map((column) => column.header), ...cells].map((row) => row.map(quote).join(delimiter)).join('\r\n')}\r\n`;
};
