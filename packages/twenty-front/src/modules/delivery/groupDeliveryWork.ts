import { type DeliveryTask } from '@/delivery/delivery.types';

export const DELIVERY_WORK_GROUPS = [
  'revisions',
  'blocked',
  'overdue',
  'today',
  'upcoming',
  'unscheduled',
  'review',
  'approved',
] as const;
export type DeliveryWorkGroup = (typeof DELIVERY_WORK_GROUPS)[number];

export const groupDeliveryWork = (tasks: DeliveryTask[], now: Date) => {
  const today = now.toLocaleDateString('en-CA');
  const groups: Record<DeliveryWorkGroup, DeliveryTask[]> = {
    revisions: [],
    blocked: [],
    overdue: [],
    today: [],
    upcoming: [],
    unscheduled: [],
    review: [],
    approved: [],
  };
  for (const task of tasks) {
    const state = task.details.state;
    let group: DeliveryWorkGroup;
    if (state === 'APPROVED') group = 'approved';
    else if (state === 'IN_REVIEW') group = 'review';
    else if (state === 'CHANGES_REQUESTED') group = 'revisions';
    else if (state === 'BLOCKED') group = 'blocked';
    else if (task.dueAt && Date.parse(task.dueAt) < now.getTime())
      group = 'overdue';
    else if (
      state === 'IN_PROGRESS' ||
      (task.details.scheduledDate && task.details.scheduledDate <= today) ||
      (task.dueAt && new Date(task.dueAt).toLocaleDateString('en-CA') === today)
    )
      group = 'today';
    else if (task.details.scheduledDate || task.dueAt) group = 'upcoming';
    else group = 'unscheduled';
    groups[group].push(task);
  }
  const priority = { HIGH: 0, NORMAL: 1, LOW: 2 };
  for (const group of DELIVERY_WORK_GROUPS)
    groups[group].sort(
      (left, right) =>
        priority[left.details.priority] - priority[right.details.priority] ||
        (left.dueAt ? Date.parse(left.dueAt) : Infinity) -
          (right.dueAt ? Date.parse(right.dueAt) : Infinity) ||
        (left.details.scheduledDate ?? '9999').localeCompare(
          right.details.scheduledDate ?? '9999',
        ) ||
        left.title.localeCompare(right.title) ||
        left.id.localeCompare(right.id),
    );
  return groups;
};
