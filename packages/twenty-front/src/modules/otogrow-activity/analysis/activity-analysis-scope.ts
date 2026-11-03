import {
  activityDateRange,
  activityInput,
} from '@/otogrow-activity/activityFilters';
import { type ActivityFilters } from '@/otogrow-activity/otogrow-activity.types';

export const activityReadFilters = (filters: ActivityFilters) => {
  const input = activityInput(filters, null);
  return {
    personId: input.personId ?? null,
    projectId: input.projectId ?? null,
    clientId: input.clientId ?? null,
    category: input.category ?? null,
    action: input.action ?? null,
    outcome: input.outcome ?? null,
    from: input.from ?? null,
    through: input.through ?? null,
  };
};

export const activityAnalysisScope = (filters: ActivityFilters) => {
  if (!filters.from || !filters.through || activityDateRange(filters) === null)
    return null;
  return activityReadFilters(filters);
};

export const lastSevenActivityDays = (now: Date) => {
  const through = new Date(now);
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - 6);
  return {
    from: from.toISOString().slice(0, 10),
    through: through.toISOString().slice(0, 10),
  };
};
