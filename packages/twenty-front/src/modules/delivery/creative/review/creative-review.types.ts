import {
  type DeliveryCreativeReviewQuery,
  type DeliveryCreativeFeedbackHistoryQuery,
} from '~/generated-metadata/graphql';
export type CreativeReviewSnapshot =
  DeliveryCreativeReviewQuery['deliveryCreativeReview'];
export type CreativeReviewTarget = CreativeReviewSnapshot['selected'];
export type CreativeFeedback = CreativeReviewSnapshot['feedback'][number];
export type CreativeFeedbackHistory =
  DeliveryCreativeFeedbackHistoryQuery['deliveryCreativeFeedbackHistory'];
