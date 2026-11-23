import { commitmentLastDay } from '@/delivery/commitments/commitmentDates';
import { type CommitmentSnapshot } from '@/delivery/commitments/commitment.types';
import { useLingui } from '@lingui/react/macro';

export const useCommitmentLabels = () => {
  const { t } = useLingui();
  const states: Record<string, string> = {
    OPEN: t`Open`,
    CLOSED: t`Closed`,
    ASSIGNED: t`Assigned`,
    FULFILLED: t`Fulfilled`,
    REOPENED: t`Reopened`,
    REMOVED: t`Removed`,
  };
  const fields: Record<string, string> = {
    label: t`Name`,
    billing: t`Package type`,
    startDate: t`Start date`,
    endDateExclusive: t`Last day`,
    timezone: t`Timezone`,
    state: t`Status`,
    unit: t`Work type`,
    promisedQuantity: t`Promised quantity`,
    periodId: t`Period`,
    lineId: t`Commitment item`,
    parentTaskId: t`Original video task`,
    credited: t`Fulfilment credit`,
    creditReason: t`Credit explanation`,
  };
  const actions: Record<string, string> = {
    COMMITMENT_PERIOD_CREATED: t`Period planned`,
    COMMITMENT_PERIOD_UPDATED: t`Period updated`,
    COMMITMENT_PERIOD_CLOSED: t`Period closed`,
    COMMITMENT_PERIOD_REOPENED: t`Period reopened`,
    COMMITMENT_LINE_CREATED: t`Promised work added`,
    COMMITMENT_LINE_UPDATED: t`Promised work updated`,
    COMMITMENT_TASK_ASSIGNED: t`Task linked`,
    COMMITMENT_TASK_REMOVED: t`Task removed`,
    COMMITMENT_ORPHAN_CLEANUP_CANCELLED: t`Allocation cleanup stopped`,
    COMMITMENT_ORPHAN_REMOVED: t`Unavailable-source allocation released`,
    COMMITMENT_TASK_CREDITED: t`Fulfilment counted`,
    COMMITMENT_TASK_REOPENED: t`Fulfilment reopened`,
  };
  const unit = (value: string) =>
    value === 'UNIQUE_VIDEO'
      ? t`Unique videos`
      : value === 'VARIATION'
        ? t`Video variations`
        : t`Other work items`;
  return {
    unit,
    value: (
      field: string,
      value: string | null | undefined,
      data: CommitmentSnapshot,
      event: CommitmentSnapshot['history'][number],
    ) => {
      if (value === null || value === undefined || value === '') return '—';
      if (field === 'endDateExclusive') return commitmentLastDay(value) ?? '—';
      if (field === 'state') return states[value] ?? t`Previous status`;
      if (field === 'unit') return unit(value);
      if (field === 'billing')
        return value === 'RETAINER' ? t`Retainer` : t`One-time package`;
      if (field === 'credited')
        return value === 'true' ? t`Counted` : t`Not counted`;
      if (field === 'periodId')
        return (
          data.periods.find((period) => period.id === value)?.label ??
          t`Previous or unavailable period`
        );
      if (field === 'lineId')
        return (
          data.lines.find((line) => line.id === value)?.label ??
          t`Previous or unavailable commitment item`
        );
      if (field === 'parentTaskId') {
        if (event.taskId === value && event.taskName) return event.taskName;
        return (
          data.allocations.find((allocation) => allocation.taskId === value)
            ?.taskName ??
          data.taskOptions.find((task) => task.taskId === value)?.name ??
          t`Previous or unavailable video task`
        );
      }
      return value;
    },
    action: (value: string) => actions[value] ?? t`Commitment updated`,
    state: (value: string) => states[value] ?? value,
    field: (value: string) =>
      fields[value] ?? value.replace(/([a-z])([A-Z])/g, '$1 $2'),
  };
};
