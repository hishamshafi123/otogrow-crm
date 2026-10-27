import { Temporal } from 'temporal-polyfill';
import { isDateWithoutTime, isDefined } from 'twenty-shared/utils';
import { type DeliveryTask } from '@/delivery/delivery.types';
import { EMPTY_TASK_PLAN } from '@/delivery/capacity/capacity.types';

export const capacityDates = (startDate: string): string[] => {
  if (!isDateWithoutTime(startDate)) return [];
  try {
    const start = Temporal.PlainDate.from(startDate);
    const dates = Array.from({ length: 7 }, (_, index) =>
      start.add({ days: index }).toString(),
    );
    return dates.every(isDateWithoutTime) ? dates : [];
  } catch {
    return [];
  }
};
export type CapacityLoad = {
  task: DeliveryTask;
  kind: 'PRODUCTION' | 'REVIEW';
  date: string | null;
  workMinutes: number;
  revisionMinutes: number;
  waitMinutes: number;
  unknownEffort: boolean;
  unknownWait: boolean;
};
export const capacityLoads = (
  tasks: DeliveryTask[],
  memberId: string,
): CapacityLoad[] =>
  tasks.flatMap((task) => {
    if (task.details.state === 'APPROVED') return [];
    const plan = task.details.plan ?? EMPTY_TASK_PLAN;
    const loads: CapacityLoad[] = [];
    if (task.assigneeId === memberId && task.details.state !== 'IN_REVIEW')
      loads.push({
        task,
        kind: 'PRODUCTION',
        date: task.details.scheduledDate,
        workMinutes: plan.workMinutes ?? 0,
        revisionMinutes: plan.revisionMinutes ?? 0,
        waitMinutes: plan.waitMinutes ?? 0,
        unknownEffort:
          !isDefined(plan.workMinutes) || !isDefined(plan.revisionMinutes),
        unknownWait: !isDefined(plan.waitMinutes),
      });
    if (task.details.reviewerId === memberId)
      loads.push({
        task,
        kind: 'REVIEW',
        date: plan.reviewDate,
        workMinutes: plan.reviewMinutes ?? 0,
        revisionMinutes: 0,
        waitMinutes: 0,
        unknownEffort: !isDefined(plan.reviewMinutes),
        unknownWait: false,
      });
    return loads;
  });
export const capacityDay = (
  loads: CapacityLoad[],
  date: string,
  availableMinutes: number | null,
) => {
  const dated = loads.filter((load) => load.date === date);
  const workMinutes = dated.reduce(
    (sum, load) => sum + load.workMinutes + load.revisionMinutes,
    0,
  );
  return {
    loads: dated,
    workMinutes,
    productionMinutes: dated
      .filter((load) => load.kind === 'PRODUCTION')
      .reduce((sum, load) => sum + load.workMinutes, 0),
    revisionMinutes: dated.reduce((sum, load) => sum + load.revisionMinutes, 0),
    reviewMinutes: dated
      .filter((load) => load.kind === 'REVIEW')
      .reduce((sum, load) => sum + load.workMinutes, 0),
    waitMinutes: dated.reduce((sum, load) => sum + load.waitMinutes, 0),
    unknownCount: dated.filter((load) => load.unknownEffort).length,
    unknownWait: dated.some((load) => load.unknownWait),
    overloadMinutes: isDefined(availableMinutes)
      ? Math.max(0, workMinutes - availableMinutes)
      : 0,
  };
};
