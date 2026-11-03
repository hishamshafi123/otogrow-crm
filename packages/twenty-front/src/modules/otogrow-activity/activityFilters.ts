import {
  ACTIVITY_FILTER_KEYS,
  type ActivityFilters,
} from '@/otogrow-activity/otogrow-activity.types';
import { type OtogrowActivityInput } from '~/generated-metadata/graphql';
import {
  ACTIVITY_ANALYSIS_PARAMETERS,
  ACTIVITY_CURRENT_TASK_PARAMETERS,
} from '@/otogrow-activity/analysis/activity-analysis-navigation';

export const readActivityFilters = (params: URLSearchParams): ActivityFilters =>
  Object.fromEntries(
    Object.entries(ACTIVITY_FILTER_KEYS).map(([key, parameter]) => [
      key,
      params.get(parameter) ?? '',
    ]),
  ) as ActivityFilters;

const dayStart = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? date
    : null;
};

export const activityDateRange = (filters: ActivityFilters) => {
  const from = filters.from ? dayStart(filters.from) : null;
  const through = filters.through ? dayStart(filters.through) : null;
  if (
    (filters.from && !from) ||
    (filters.through && !through) ||
    (from && through && from > through)
  )
    return null;
  if (through) through.setUTCDate(through.getUTCDate() + 1);
  return { from: from?.toISOString(), through: through?.toISOString() };
};

export const activityInput = (
  filters: ActivityFilters,
  cursor: string | null,
): OtogrowActivityInput => ({
  ...Object.fromEntries(
    Object.entries(filters).filter(
      ([key, value]) => key !== 'from' && key !== 'through' && value !== '',
    ),
  ),
  ...activityDateRange(filters),
  cursor: cursor || undefined,
  limit: 30,
});

export const activityFilterParams = (
  params: URLSearchParams,
  filters?: ActivityFilters,
) => {
  const next = new URLSearchParams(params);
  next.set('view', 'activity');
  next.delete('activityCursor');
  next.delete('task');
  next.delete('panel');
  next.delete('activityEvent');
  ACTIVITY_ANALYSIS_PARAMETERS.forEach((parameter) => next.delete(parameter));
  ACTIVITY_CURRENT_TASK_PARAMETERS.forEach((parameter) =>
    next.delete(parameter),
  );
  Object.entries(ACTIVITY_FILTER_KEYS).forEach(([key, parameter]) => {
    const value = filters?.[key as keyof ActivityFilters];
    if (value) next.set(parameter, value);
    else next.delete(parameter);
  });
  return next;
};
