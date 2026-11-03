import { isValidUuid } from 'twenty-shared/utils';
import { type DeliveryTaskListInput } from '~/generated-metadata/graphql';
import { detectTimeZone } from '@/localization/utils/detection/detectTimeZone';
export const TASK_STATES = [
  'PLANNED',
  'IN_PROGRESS',
  'BLOCKED',
  'IN_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
] as const;
export const getPlannerView = (params: URLSearchParams) => {
  const selected = params.get('plannerView');
  if (selected !== null) return selected === 'capacity' ? 'capacity' : 'tasks';
  return [
    'capacityFrom',
    'capacityAfter',
    'capacityMember',
    'capacityBucket',
    'capacityDate',
    'capacityMissingOwner',
    'capacityAssignmentsAfter',
  ].some((key) => params.has(key))
    ? 'capacity'
    : 'tasks';
};
export const taskListInput = (
  params: URLSearchParams,
): DeliveryTaskListInput | null => {
  const view =
    params.get('view') === 'planner'
      ? 'PLANNER'
      : params.get('view') === 'mine'
        ? 'MINE'
        : 'HOME';
  const timezone = params.get('taskTimezone') ?? detectTimeZone();
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: timezone });
  } catch {
    return null;
  }
  const projectId = params.get('project');
  const assigneeId = view === 'MINE' ? null : params.get('member');
  const state = params.get('status');
  const from = params.get('from');
  const through = params.get('through');
  const attention = params.get('attention');
  const after = params.get('tasksAfter');
  if (
    (projectId && !isValidUuid(projectId)) ||
    (assigneeId && !isValidUuid(assigneeId)) ||
    (state && !TASK_STATES.some((item) => item === state)) ||
    [from, through].some(
      (value) =>
        value !== null &&
        value !== '' &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
          !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) ||
          new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value),
    ) ||
    (through && !from) ||
    (from && through && through < from) ||
    (attention && !['today', 'overdue'].includes(attention)) ||
    (after && after.length > 2000) ||
    (params.get('search')?.length ?? 0) > 200
  )
    return null;
  return {
    view,
    timezone,
    projectId,
    assigneeId,
    state,
    service: params.get('service'),
    search: params.get('search'),
    scheduledFrom: from,
    scheduledThrough: through ?? from,
    attention: attention?.toUpperCase(),
    after,
    limit: 25,
  };
};
export const taskPageDestination = (
  params: URLSearchParams,
  changes: Record<string, string | null>,
) => {
  const next = new URLSearchParams(params);
  Object.entries(changes).forEach(([key, value]) => {
    if (value) next.set(key, value);
    else next.delete(key);
  });
  return `/delivery?${next}`;
};
