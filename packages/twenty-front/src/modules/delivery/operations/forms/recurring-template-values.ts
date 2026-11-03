import { getValidTimeZoneOrUndefined } from 'twenty-shared/utils';
import { type RecurringTemplate } from '@/delivery/delivery-operations.types';
export type RecurringTemplateValues = {
  projectId: string;
  title: string;
  service: string;
  brief: string;
  assigneeId: string;
  reviewerId: string;
  frequency: RecurringTemplate['frequency'];
  weekdays: number[];
  monthDay: string;
  time: string;
  startDate: string;
  endDate: string;
  dueHours: string;
  checklist: string;
  paused: boolean;
};
export type OperationSaveResult =
  | { kind: 'SAVED' }
  | { kind: 'REJECTED'; message: string }
  | { kind: 'UNKNOWN' };
export const recurringTemplateValues = (
  template: RecurringTemplate | null,
  timezone: string,
): RecurringTemplateValues => {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: getValidTimeZoneOrUndefined(timezone) ?? 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return {
    projectId: template?.projectId ?? '',
    title: template?.fields.title ?? '',
    service: template?.fields.service ?? '',
    brief: template?.fields.brief ?? '',
    assigneeId: template?.fields.assigneeId ?? '',
    reviewerId: template?.fields.reviewerId ?? '',
    frequency: template?.frequency ?? 'WEEKLY',
    weekdays: template?.weekdays ?? [1],
    monthDay: String(template?.monthDay ?? 1),
    time: template?.time ?? '09:00',
    startDate: template?.startDate ?? date,
    endDate: template?.endDate ?? '',
    dueHours: String(template?.dueHours ?? 24),
    checklist:
      template?.fields.checklist.map((item) => item.text).join('\n') ?? '',
    paused: template?.paused ?? true,
  };
};
export const recurringTemplateSnapshot = (template: RecurringTemplate | null) =>
  JSON.stringify(
    template
      ? {
          id: template.id,
          projectId: template.projectId,
          workflow: template.workflow ?? null,
          fields: template.fields,
          frequency: template.frequency,
          weekdays: template.weekdays,
          monthDay: template.monthDay,
          time: template.time,
          startDate: template.startDate,
          endDate: template.endDate,
          dueHours: template.dueHours,
          paused: template.paused,
        }
      : null,
  );
