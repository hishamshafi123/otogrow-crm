import { useLingui } from '@lingui/react/macro';
export const useBatchLabels = () => {
  const { t } = useLingui();
  const labels: Record<string, string> = {
    ALL: t`All planned tasks`,
    UNIQUE_VIDEO: t`Unique videos`,
    VARIATION: t`Variations`,
    OTHER: t`Other deliverables`,
    UNCLASSIFIED: t`Unclassified`,
    UNAVAILABLE: t`No longer available`,
    PLANNED: t`Planned`,
    IN_PROGRESS: t`In progress`,
    BLOCKED: t`Blocked`,
    IN_REVIEW: t`Waiting for review`,
    CHANGES_REQUESTED: t`Changes requested`,
    APPROVED: t`Approved`,
    BATCH_CREATED: t`Batch created`,
    BATCH_UPDATED: t`Plan updated`,
    BATCH_CLOSED: t`Planning closed`,
    BATCH_REOPENED: t`Planning reopened`,
    BATCH_TASK_ADDED: t`Task added`,
    BATCH_TASK_REMOVED: t`Task removed`,
    BATCH_CONCEPT_UPDATED: t`Concept updated`,
    label: t`Name`,
    periodId: t`Commitment period`,
    startDate: t`First day`,
    endDate: t`Last day`,
    timezone: t`Timezone`,
    closed: t`Planning closed`,
    active: t`Included in batch`,
    concept: t`Concept`,
  };
  return (value: string) => labels[value] ?? value;
};
