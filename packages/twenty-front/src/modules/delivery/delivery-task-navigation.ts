export const DELIVERY_TASK_REVIEW_PARAMETERS = [
  'creativeSubmission',
  'creativeCompare',
  'creativeAsset',
  'creativeFeedback',
  'creativeFeedbackAfter',
  'creativeFeedbackBefore',
  'creativeSubmissionsBefore',
  'reviewAssignmentBefore',
  'reviewBatch',
  'reviewBatchIndex',
] as const;

export const deliveryTaskSelection = (
  taskId: string | null,
  panel = 'task',
): Record<string, string | null> => ({
  ...Object.fromEntries(
    DELIVERY_TASK_REVIEW_PARAMETERS.map((name) => [name, null]),
  ),
  task: taskId,
  panel: taskId && panel !== 'task' ? panel : null,
});

export const deliveryTaskDestination = (
  params: URLSearchParams,
  taskId: string,
  panel = 'task',
  selection: Record<string, string | number | null> = {},
) => {
  const next = new URLSearchParams(params);
  Object.entries({
    ...deliveryTaskSelection(taskId, panel),
    ...selection,
  }).forEach(([key, value]) => {
    if (value === null) next.delete(key);
    else next.set(key, String(value));
  });
  return `/delivery?${next}`;
};
