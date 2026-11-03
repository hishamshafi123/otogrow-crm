import { isValidUuid } from 'twenty-shared/utils';
import { type DeliveryCreativeReviewInput } from '~/generated-metadata/graphql';
import { type CreativeReviewTarget } from '@/delivery/creative/review/creative-review.types';

export const creativeTargetChanges = (target: CreativeReviewTarget) => ({
  panel: target.targetKind === 'SUBMISSION' ? 'task' : 'creative',
  creativeSubmission:
    target.targetKind === 'SUBMISSION'
      ? (target.submissionVersion ?? null)
      : null,
  creativeAsset:
    target.targetKind === 'ASSET' ? (target.assetId ?? null) : null,
  creativeCompare: null,
  creativeFeedback: null,
  creativeFeedbackAfter: null,
  creativeFeedbackBefore: null,
  creativeSubmissionsBefore: null,
  reviewAssignmentBefore: null,
});

export const creativeReviewDestination = (
  params: URLSearchParams,
  changes: Record<string, string | number | null>,
) => {
  const next = new URLSearchParams(params);
  Object.entries(changes).forEach(([key, value]) => {
    if (value === null) next.delete(key);
    else next.set(key, String(value));
  });
  return `/delivery?${next}`;
};
const version = (value: string | null) =>
  value &&
  /^[1-9]\d*$/.test(value) &&
  Number.isSafeInteger(Number(value)) &&
  Number(value) <= 2147483647
    ? Number(value)
    : null;
export const creativeReviewInput = (
  taskId: string,
  targetKind: 'ASSET' | 'SUBMISSION',
  params: URLSearchParams,
): DeliveryCreativeReviewInput | null => {
  const submissionVersion = version(params.get('creativeSubmission'));
  const comparison = params.get('creativeCompare');
  const assetId = params.get('creativeAsset');
  const selectedFeedbackId = params.get('creativeFeedback');
  const afterFeedbackId = params.get('creativeFeedbackAfter');
  const beforeSubmissionVersion = version(
    params.get('creativeSubmissionsBefore'),
  );
  if (
    (params.has('creativeSubmission') && !submissionVersion) ||
    (assetId && !isValidUuid(assetId)) ||
    (selectedFeedbackId && !isValidUuid(selectedFeedbackId)) ||
    (afterFeedbackId && !isValidUuid(afterFeedbackId)) ||
    (params.has('creativeSubmissionsBefore') && !beforeSubmissionVersion) ||
    (comparison &&
      !(targetKind === 'ASSET'
        ? isValidUuid(comparison)
        : version(comparison) !== null))
  )
    return null;
  if (targetKind === 'ASSET' && !assetId) return null;
  return {
    taskId,
    targetKind,
    submissionVersion: targetKind === 'SUBMISSION' ? submissionVersion : null,
    assetId: targetKind === 'ASSET' ? assetId : null,
    compareSubmissionVersion:
      targetKind === 'SUBMISSION' ? version(comparison) : null,
    compareAssetId: targetKind === 'ASSET' ? comparison : null,
    selectedFeedbackId,
    afterFeedbackId,
    beforeSubmissionVersion,
  };
};
export const parseCreativeReviewTime = (value: string): number | null => {
  if (!/^\d+(?::[0-5]\d){0,2}(?:\.\d{1,3})?$/.test(value.trim())) return null;
  const seconds = value
    .trim()
    .split(':')
    .reduce((total, part) => total * 60 + Number(part), 0);
  const milliseconds = Math.round(seconds * 1000);
  return Number.isSafeInteger(milliseconds) &&
    milliseconds >= 0 &&
    milliseconds <= 2147483647
    ? milliseconds
    : null;
};
export const formatCreativeReviewTime = (milliseconds: number) => {
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}${milliseconds % 1000 ? `.${String(milliseconds % 1000).padStart(3, '0')}` : ''}`;
};
