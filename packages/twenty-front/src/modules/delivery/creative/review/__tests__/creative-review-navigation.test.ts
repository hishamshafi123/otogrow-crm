import {
  creativeReviewDestination,
  creativeReviewInput,
  parseCreativeReviewTime,
} from '@/delivery/creative/review/creative-review-navigation';
import {
  REVIEW_ASSET_ID,
  REVIEW_TASK_ID,
} from '@/delivery/creative/review/__tests__/creative-review.fixtures';
it('keeps queue and task context in direct review links', () => {
  const next = creativeReviewDestination(
    new URLSearchParams(
      `view=reviews&task=${REVIEW_TASK_ID}&project=client&search=launch`,
    ),
    { creativeSubmission: 1, creativeCompare: 2 },
  );
  expect(next).toContain('project=client');
  expect(next).toContain('search=launch');
  expect(next).toContain('creativeSubmission=1');
  expect(next).toContain('creativeCompare=2');
});
it('rejects invalid explicit selection instead of falling back to current media', () => {
  expect(
    creativeReviewInput(
      REVIEW_TASK_ID,
      'SUBMISSION',
      new URLSearchParams('creativeSubmission=unknown'),
    ),
  ).toBeNull();
  expect(
    creativeReviewInput(REVIEW_TASK_ID, 'ASSET', new URLSearchParams()),
  ).toBeNull();
  expect(
    creativeReviewInput(
      REVIEW_TASK_ID,
      'ASSET',
      new URLSearchParams(`creativeAsset=${REVIEW_ASSET_ID}`),
    ),
  ).toEqual(
    expect.objectContaining({
      assetId: REVIEW_ASSET_ID,
      targetKind: 'ASSET',
      submissionVersion: null,
    }),
  );
});
it('accepts exact zero and fractional timestamps while rejecting malformed or overflowing times', () => {
  expect(parseCreativeReviewTime('0:00')).toBe(0);
  expect(parseCreativeReviewTime('1:02.125')).toBe(62125);
  expect(parseCreativeReviewTime('1:60')).toBeNull();
  expect(parseCreativeReviewTime('-1')).toBeNull();
  expect(parseCreativeReviewTime('Infinity')).toBeNull();
  expect(parseCreativeReviewTime('999999999')).toBeNull();
});
