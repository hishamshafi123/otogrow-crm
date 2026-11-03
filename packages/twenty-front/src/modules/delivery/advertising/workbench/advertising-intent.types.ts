import {
  type AdvertisingReview,
  type AdvertisingReviewDraft,
} from '@/delivery/advertising/workbench/advertising-draft';

export type AdvertisingWorkbenchIntent =
  | {
      mode: 'review';
      requestId: string;
      reviewId: string;
      draft: AdvertisingReviewDraft;
    }
  | {
      mode: 'assign';
      requestId: string;
      reviewId: string;
      review: AdvertisingReview;
    }
  | { mode: 'observe'; requestId: string; reviewId: string; actionId: string };
