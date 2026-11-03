import {
  type DeliveryCreativeAdLinkQuery,
  type DeliveryCreativeAdLinkPreviewQuery,
  type DeliveryCreativeLearningReceiptQuery,
  type DeliveryCreativeAdLinkSaveInput,
  type DeliveryCreativeAdLinkDecisionInput,
  type DeliveryCreativeLessonSaveInput,
} from '~/generated-metadata/graphql';
export type CreativeLearningLink =
  DeliveryCreativeAdLinkQuery['deliveryCreativeAdLink'];
export type CreativeLearningBody =
  DeliveryCreativeAdLinkPreviewQuery['deliveryCreativeAdLinkPreview']['body'];
export type CreativeLearningReceipt =
  DeliveryCreativeLearningReceiptQuery['deliveryCreativeLearningReceipt'];
export type CreativeLearningCommand =
  | { kind: 'SAVE'; input: DeliveryCreativeAdLinkSaveInput }
  | { kind: 'DECIDE'; input: DeliveryCreativeAdLinkDecisionInput }
  | { kind: 'LESSON'; input: DeliveryCreativeLessonSaveInput };
export type CreativeLearningIntent = {
  id: string;
  requestId: string;
  mode: 'new' | 'edit' | 'decision' | 'lesson';
  action?: string;
};
