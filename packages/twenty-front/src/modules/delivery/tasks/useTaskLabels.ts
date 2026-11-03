import { useLingui } from '@lingui/react/macro';
export const useTaskLabels = () => {
  const { t } = useLingui();
  const states: Record<string, string> = {
    PLANNED: t`Planned`,
    IN_PROGRESS: t`In progress`,
    BLOCKED: t`Blocked`,
    IN_REVIEW: t`In review`,
    CHANGES_REQUESTED: t`Changes requested`,
    APPROVED: t`Approved`,
  };
  const groups: Record<string, string> = {
    revisions: t`Changes to make`,
    blocked: t`Blocked`,
    overdue: t`Overdue`,
    today: t`Work on next`,
    upcoming: t`Upcoming`,
    unscheduled: t`Needs a schedule`,
    review: t`Waiting for approval`,
    approved: t`Approved work`,
  };
  const next: Record<string, string> = {
    CHANGES_REQUESTED: t`Read feedback and revise`,
    BLOCKED: t`Update the blocker for your manager`,
    IN_REVIEW: t`Waiting for your reviewer`,
    APPROVED: t`View approved work`,
    IN_PROGRESS: t`Continue work and update progress`,
    PLANNED: t`Open the brief and checklist`,
  };
  return {
    state: (value: string) => states[value] ?? t`State unavailable`,
    group: (value: string) => groups[value] ?? t`Other work`,
    next: (value: string) => next[value] ?? t`Review the current task`,
    warning: (_code: string) =>
      t`Some task information needs a current source check. Open the task to review it.`,
  };
};
