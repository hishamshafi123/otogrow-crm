import { z } from 'zod';
import { getValidTimeZoneOrUndefined } from 'twenty-shared/utils';

const text = z.string().trim().max(6000);
const sourceUrl = z.url({ protocol: /^https?$/ }).max(2000);
const decimal = z.string().regex(/^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$/);
export const seoMetricSchema = z
  .object({
    id: z.uuid(),
    key: z.enum([
      'CLICKS',
      'IMPRESSIONS',
      'ORGANIC_SESSIONS',
      'CONVERSIONS',
      'AVERAGE_POSITION',
      'CUSTOM',
    ]),
    label: z.string().trim().min(1).max(160),
    unit: z.enum(['COUNT', 'POSITION', 'PERCENT']),
    value: decimal.nullable(),
    unknownReason: z.string().trim().max(1000),
    source: z.enum(['SEARCH_CONSOLE', 'ANALYTICS', 'RANK_TRACKER', 'OTHER']),
    sourceUrl,
    property: z.string().trim().min(1).max(500),
    segment: z.string().trim().min(1).max(1000),
    definition: z.string().trim().min(1).max(1000),
    observedAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((metric, context) => {
    if (metric.value === null && !metric.unknownReason)
      context.addIssue({
        code: 'custom',
        message: 'Explain why this measurement is unavailable.',
      });
    if (
      metric.value !== null &&
      metric.unit === 'COUNT' &&
      metric.value.includes('.')
    )
      context.addIssue({
        code: 'custom',
        message: 'Counts must be whole numbers.',
      });
    if (
      metric.value !== null &&
      metric.unit === 'PERCENT' &&
      Number(metric.value) > 100
    )
      context.addIssue({
        code: 'custom',
        message: 'A percentage must be between zero and 100.',
      });
    if (metric.key === 'AVERAGE_POSITION' && metric.unit !== 'POSITION')
      context.addIssue({
        code: 'custom',
        message: 'Average position requires position units.',
      });
    if (
      !['AVERAGE_POSITION', 'CUSTOM'].includes(metric.key) &&
      metric.unit !== 'COUNT'
    )
      context.addIssue({
        code: 'custom',
        message: 'This metric requires count units.',
      });
    if (
      metric.unit === 'POSITION' &&
      metric.value !== null &&
      Number(metric.value) <= 0
    )
      context.addIssue({
        code: 'custom',
        message: 'Use unknown when a position is unavailable.',
      });
  });
export const seoBodySchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    ownerId: z.uuid(),
    period: z.enum(['WEEKLY', 'MONTHLY']),
    periodStart: z.iso.date(),
    periodEnd: z.iso.date(),
    timezone: z
      .string()
      .max(100)
      .refine((value) => Boolean(getValidTimeZoneOrUndefined(value))),
    summary: text,
    workNotes: text,
    tasks: z
      .array(
        z
          .object({ taskId: z.uuid(), revision: z.number().int().positive() })
          .strict(),
      )
      .max(30),
    evidence: z
      .array(
        z
          .object({
            label: z.string().trim().min(1).max(200),
            url: sourceUrl,
            note: z.string().trim().max(1000),
          })
          .strict(),
      )
      .max(20),
    metrics: z.array(seoMetricSchema).max(20),
    comparisonId: z.uuid().nullable(),
    comparisonVersion: z.number().int().positive().nullable(),
  })
  .strict()
  .superRefine((body, context) => {
    const start = Date.parse(`${body.periodStart}T00:00:00Z`);
    const end = Date.parse(`${body.periodEnd}T00:00:00Z`);
    const valid =
      body.period === 'WEEKLY'
        ? end - start === 6 * 86400000
        : body.periodStart.endsWith('-01') &&
          body.periodStart.slice(0, 7) === body.periodEnd.slice(0, 7) &&
          new Date(end + 86400000).getUTCDate() === 1;
    if (!valid)
      context.addIssue({
        code: 'custom',
        message: 'Choose seven calendar days or one complete calendar month.',
      });
    if (Boolean(body.comparisonId) !== Boolean(body.comparisonVersion))
      context.addIssue({
        code: 'custom',
        message: 'Choose the exact approved comparison version.',
      });
    if (
      new Set(body.tasks.map((task) => task.taskId)).size !== body.tasks.length
    )
      context.addIssue({ code: 'custom', message: 'Link each task once.' });
    if (
      new Set(body.metrics.map((metric) => metric.id)).size !==
      body.metrics.length
    )
      context.addIssue({
        code: 'custom',
        message: 'Each metric needs a unique identity.',
      });
    if (
      new Set(body.metrics.map((metric) => `${metric.key}:${metric.label}`))
        .size !== body.metrics.length
    )
      context.addIssue({
        code: 'custom',
        message: 'Use distinct metric labels.',
      });
  });
export const seoSaveSchema = z
  .object({
    id: z.uuid(),
    requestId: z.uuid(),
    revision: z.number().int().nonnegative(),
    projectId: z.uuid(),
    projectRevision: z.number().int().positive(),
    expectedCompanyId: z.uuid().nullable(),
    body: seoBodySchema,
  })
  .strict();
export const seoDecisionSchema = z
  .object({
    id: z.uuid(),
    requestId: z.uuid(),
    revision: z.number().int().positive(),
    action: z.enum(['SUBMIT', 'APPROVE', 'REQUEST_CHANGES']),
    note: z.string().trim().max(2000),
  })
  .strict();
export const seoProjectsSchema = z
  .object({
    afterId: z.uuid().nullish(),
    search: z.string().trim().max(160).nullish(),
  })
  .strict();
export const seoReportsSchema = z
  .object({
    projectId: z.uuid(),
    afterId: z.uuid().nullish(),
    status: z
      .enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'CHANGES_REQUESTED'])
      .nullish(),
  })
  .strict();
export const seoSelectionSchema = z
  .object({
    id: z.uuid(),
    version: z.number().int().positive().nullish(),
    afterEventId: z.uuid().nullish(),
  })
  .strict();
export const seoChoicesSchema = z
  .object({
    projectId: z.uuid(),
    afterTaskId: z.uuid().nullish(),
    afterMemberId: z.uuid().nullish(),
  })
  .strict();
export const seoReceiptSchema = z.object({ requestId: z.uuid() }).strict();
export type SeoBody = z.infer<typeof seoBodySchema>;
export type SeoMetric = z.infer<typeof seoMetricSchema>;
export type SeoTaskSnapshot = {
  taskId: string;
  title: string;
  revision: number;
  state: string;
  submissionVersion: number | null;
  verificationSummary: string | null;
  verificationRunId: string | null;
};
export type SeoComparisonSnapshot = Pick<
  SeoBody,
  'title' | 'period' | 'periodStart' | 'periodEnd' | 'timezone' | 'metrics'
>;
export type SeoSavedBody = SeoBody & {
  taskSnapshots: SeoTaskSnapshot[];
  comparisonSnapshot: SeoComparisonSnapshot | null;
};
export type SeoStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'CHANGES_REQUESTED';
