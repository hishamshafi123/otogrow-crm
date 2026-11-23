import { z } from 'zod';
import { getValidTimeZoneOrUndefined } from 'twenty-shared/utils';
import { type DeliveryFounderPerformanceInput } from '~/generated-metadata/graphql';

const PARAMETERS = {
  month: 'founderMonth',
  timezone: 'founderTimezone',
  currency: 'founderCurrency',
  afterProjectId: 'founderClientsAfter',
  afterMemberId: 'founderMembersAfter',
} as const;
const monthSchema = z.string().regex(/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/);
export const currentPerformanceMonth = (timezone: string, now = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}`;
};
export const defaultPerformanceTimezone = () => {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return timezone && getValidTimeZoneOrUndefined(timezone) ? timezone : 'UTC';
};
const navigationSchema = z.object({
  month: monthSchema,
  timezone: z
    .string()
    .min(1)
    .max(100)
    .refine((value) => getValidTimeZoneOrUndefined(value) !== undefined),
  currency: z.string().optional(),
  afterProjectId: z.uuid().optional(),
  afterMemberId: z.uuid().optional(),
});
export type PerformanceNavigationValue = z.infer<typeof navigationSchema>;
export const readPerformanceNavigation = (
  params: URLSearchParams,
  currencies: string[],
  defaultTimezone = defaultPerformanceTimezone(),
  now = new Date(),
) => {
  const requestedTimezone = params.get(PARAMETERS.timezone);
  const monthTimezone =
    requestedTimezone && getValidTimeZoneOrUndefined(requestedTimezone)
      ? requestedTimezone
      : defaultTimezone;
  return navigationSchema
    .refine((value) => !value.currency || currencies.includes(value.currency))
    .safeParse({
      month:
        params.get(PARAMETERS.month) ??
        currentPerformanceMonth(monthTimezone, now),
      timezone: requestedTimezone ?? defaultTimezone,
      currency: params.get(PARAMETERS.currency) || undefined,
      afterProjectId: params.get(PARAMETERS.afterProjectId) || undefined,
      afterMemberId: params.get(PARAMETERS.afterMemberId) || undefined,
    });
};
export const writePerformanceNavigation = (
  params: URLSearchParams,
  value: PerformanceNavigationValue,
) => {
  const next = new URLSearchParams(params);
  next.set('view', 'health');
  next.set('founderPanel', 'performance');
  for (const parameter of Object.values(PARAMETERS)) next.delete(parameter);
  for (const [key, parameter] of Object.entries(PARAMETERS)) {
    const field = value[key as keyof PerformanceNavigationValue];
    if (field) next.set(parameter, field);
  }
  return next;
};
export const performanceQueryInput = (
  value: PerformanceNavigationValue,
): DeliveryFounderPerformanceInput => ({
  month: value.month,
  timezone: value.timezone,
  currency: value.currency ?? null,
  afterProjectId: value.afterProjectId ?? null,
  afterMemberId: value.afterMemberId ?? null,
});
