import {
  parseReviewBatch,
  reviewItemDestination,
  reviewQueueInput,
} from '@/delivery/reviews/review-navigation';
import {
  NEXT_REVIEW_TASK_ID,
  REVIEW_PROJECT_ID,
  REVIEW_TASK_ID,
} from '@/delivery/reviews/__tests__/reviews.fixtures';
it('pins only explicitly selected task/version pairs and rejects malformed, duplicate or unbounded sequences', () => {
  expect(
    parseReviewBatch(
      new URLSearchParams({
        reviewBatch: `${REVIEW_TASK_ID}:3,${NEXT_REVIEW_TASK_ID}:1`,
      }),
    ),
  ).toEqual([
    { taskId: REVIEW_TASK_ID, submissionVersion: 3 },
    { taskId: NEXT_REVIEW_TASK_ID, submissionVersion: 1 },
  ]);
  expect(
    parseReviewBatch(
      new URLSearchParams({ reviewBatch: `${REVIEW_TASK_ID}:3:extra` }),
    ),
  ).toBeNull();
  expect(
    parseReviewBatch(
      new URLSearchParams({ reviewBatch: `${REVIEW_TASK_ID}:0` }),
    ),
  ).toBeNull();
  expect(
    parseReviewBatch(
      new URLSearchParams({
        reviewBatch: `${REVIEW_TASK_ID}:3,${REVIEW_TASK_ID}:4`,
      }),
    ),
  ).toBeNull();
});
it('preserves queue scope but clears foreign task review context before an exact item link', () => {
  const link = reviewItemDestination(
    new URLSearchParams({
      view: 'reviews',
      reviewProject: REVIEW_PROJECT_ID,
      creativeAsset: 'old-asset',
      creativeCompare: '99',
      creativeFeedback: 'old-note',
      reviewAssignmentBefore: 'old-event',
      reviewBatch: `${REVIEW_TASK_ID}:3,${NEXT_REVIEW_TASK_ID}:1`,
      reviewBatchIndex: '1',
      reviewsSelected: `${REVIEW_TASK_ID}:3`,
    }),
    { taskId: REVIEW_TASK_ID, submissionVersion: 3 },
  );
  const params = new URLSearchParams(link.split('?')[1]);
  expect(params.get('reviewProject')).toBe(REVIEW_PROJECT_ID);
  expect(params.get('creativeSubmission')).toBe('3');
  expect(params.has('creativeCompare')).toBe(false);
  expect(params.has('creativeAsset')).toBe(false);
  expect(params.has('reviewAssignmentBefore')).toBe(false);
  expect(params.has('reviewBatch')).toBe(false);
  expect(params.has('reviewBatchIndex')).toBe(false);
  expect(params.get('reviewsSelected')).toBe(`${REVIEW_TASK_ID}:3`);
});
it('rejects invalid current filters and does not convert an unknown reviewer into an all-reviewer selection', () => {
  expect(
    reviewQueueInput(new URLSearchParams({ reviewReviewer: 'invalid' })),
  ).toBeNull();
  expect(
    reviewQueueInput(new URLSearchParams({ reviewsMine: 'yes' })),
  ).toBeNull();
});
