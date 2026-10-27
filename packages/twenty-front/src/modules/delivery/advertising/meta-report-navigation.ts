import { z } from 'zod';

const META_REPORT_PARAMETERS = {
  archive: 'metaArchive',
  accountId: 'metaAccount',
  fromDate: 'metaFrom',
  throughDate: 'metaThrough',
  status: 'metaDecision',
  after: 'metaAfter',
  selectedId: 'metaReport',
} as const;

const cursorSchema = z.string().max(1000);
const navigationSchema = z
  .object({
    archive: z.enum(['ACTIVE', 'ARCHIVED', 'ALL']).default('ACTIVE'),
    accountId: z
      .string()
      .regex(/^\d{5,30}$/)
      .optional(),
    fromDate: z.iso.date().optional(),
    throughDate: z.iso.date().optional(),
    status: z.enum(['REVIEW', 'APPROVED', 'CHANGES_REQUESTED']).optional(),
    after: cursorSchema.optional(),
    selectedId: z.uuid().optional(),
  })
  .refine(
    (value) =>
      !value.fromDate ||
      !value.throughDate ||
      value.fromDate <= value.throughDate,
  );

export type MetaReportNavigationValue = z.infer<typeof navigationSchema>;

export const readMetaReportNavigation = (params: URLSearchParams) =>
  navigationSchema.safeParse(
    Object.fromEntries(
      Object.entries(META_REPORT_PARAMETERS).map(([key, parameter]) => [
        key,
        params.get(parameter) || undefined,
      ]),
    ),
  );

export const writeMetaReportNavigation = (
  params: URLSearchParams,
  value: MetaReportNavigationValue,
) => {
  const next = new URLSearchParams(params);
  for (const [key, parameter] of Object.entries(META_REPORT_PARAMETERS)) {
    next.delete(parameter);
    const field = value[key as keyof MetaReportNavigationValue];
    if (field && !(key === 'archive' && field === 'ACTIVE'))
      next.set(parameter, field);
  }
  return next;
};

const cursorHistorySchema = z.object({
  scope: z.string(),
  query: z.string(),
  previous: z.array(cursorSchema).max(100),
});

export const readMetaReportCursorHistory = (
  state: unknown,
  scope: string,
  value: MetaReportNavigationValue,
) => {
  const parsed = z
    .object({ deliveryMetaPages: cursorHistorySchema })
    .safeParse(state);
  return parsed.success &&
    parsed.data.deliveryMetaPages.scope === scope &&
    parsed.data.deliveryMetaPages.query === JSON.stringify(value)
    ? parsed.data.deliveryMetaPages.previous
    : [];
};
