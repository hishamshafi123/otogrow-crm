import {
  type DeliveryReviewQueueQuery,
  type DeliveryTaskReviewQuery,
  type DeliveryReviewAssignmentHistoryQuery,
} from '~/generated-metadata/graphql';
export type ReviewQueueSnapshot =
  DeliveryReviewQueueQuery['deliveryReviewQueue'];
export type ReviewQueueItem = ReviewQueueSnapshot['items'][number];
export type TaskReviewSnapshot = DeliveryTaskReviewQuery['deliveryTaskReview'];
export type ReviewAssignmentHistorySnapshot =
  DeliveryReviewAssignmentHistoryQuery['deliveryReviewAssignmentHistory'];
