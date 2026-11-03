import { isValidUuid } from 'twenty-shared/utils';
import { type DeliveryReviewQueueInput } from '~/generated-metadata/graphql';
import { deliveryTaskDestination } from '@/delivery/delivery-task-navigation';
export const reviewQueueInput = (
  params: URLSearchParams,
): DeliveryReviewQueueInput | null => {
  const projectId = params.get('reviewProject');
  const reviewerId = params.get('reviewReviewer');
  const after = params.get('reviewsAfter');
  const mine = params.get('reviewsMine');
  if (
    (projectId && !isValidUuid(projectId)) ||
    (reviewerId && !isValidUuid(reviewerId)) ||
    (after && after.length > 2000) ||
    (mine && mine !== '1')
  )
    return null;
  return { projectId, reviewerId, after, mine: mine === '1', limit: 25 };
};
export type SelectedReview = { taskId: string; submissionVersion: number };
export const parseReviewBatch = (
  params: URLSearchParams,
  parameter = 'reviewBatch',
): SelectedReview[] | null => {
  const value = params.get(parameter);
  if (!value) return [];
  const items = value.split(',');
  if (items.length > 25) return null;
  const selected: SelectedReview[] = [];
  for (const item of items) {
    if (item.split(':').length !== 2) return null;
    const [taskId, version] = item.split(':');
    if (
      !isValidUuid(taskId ?? '') ||
      !/^[1-9]\d*$/.test(version ?? '') ||
      !Number.isSafeInteger(Number(version)) ||
      Number(version) > 2147483647 ||
      selected.some((current) => current.taskId === taskId)
    )
      return null;
    selected.push({ taskId, submissionVersion: Number(version) });
  }
  return selected;
};
export const reviewBatchValue = (items: SelectedReview[]) =>
  items.map((item) => `${item.taskId}:${item.submissionVersion}`).join(',');
export const reviewItemDestination = (
  params: URLSearchParams,
  item: SelectedReview,
  changes: Record<string, string | number | null> = {},
) =>
  deliveryTaskDestination(params, item.taskId, 'task', {
    view: 'reviews',
    creativeSubmission: item.submissionVersion,
    ...changes,
  });
export const reviewQueueDestination = (
  params: URLSearchParams,
  changes: Record<string, string | null>,
) => {
  const next = new URLSearchParams(params);
  Object.entries(changes).forEach(([name, value]) => {
    if (value === null) next.delete(name);
    else next.set(name, value);
  });
  return `/delivery?${next}`;
};
