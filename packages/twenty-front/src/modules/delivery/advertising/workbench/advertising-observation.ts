import { z } from 'zod';
import { type AdvertisingReview } from '@/delivery/advertising/workbench/advertising-draft';
import { type AdvertisingSourceEvidence } from '@/delivery/advertising/workbench/AdvertisingEvidence';
import { type ObserveDeliveryAdvertisingActionInput } from '~/generated-metadata/graphql';

export type AdvertisingObservationDraft =
  ObserveDeliveryAdvertisingActionInput & {
    mode: 'HUMAN' | 'REPORT';
    reportTitle: string | null;
    metricLabel: string | null;
    metricProvenance: string | null;
    metricUnit: string | null;
    sourceAccountId: string | null;
    sourceTimezone: string | null;
  };

export const advertisingObservationInput = (
  draft: AdvertisingObservationDraft,
): ObserveDeliveryAdvertisingActionInput => ({
  requestId: draft.requestId,
  id: draft.id,
  reviewId: draft.reviewId,
  actionId: draft.actionId,
  correctsId: draft.correctsId ?? null,
  assessment: draft.assessment,
  sourceKind: draft.mode === 'REPORT' ? (draft.sourceKind ?? null) : null,
  sourceId: draft.mode === 'REPORT' ? (draft.sourceId ?? null) : null,
  sourceFingerprint:
    draft.mode === 'REPORT' ? (draft.sourceFingerprint ?? null) : null,
  metricKey: draft.mode === 'REPORT' ? (draft.metricKey ?? null) : null,
  metricAdId: draft.mode === 'REPORT' ? (draft.metricAdId ?? null) : null,
  value: draft.value?.trim() || null,
  fromDate: draft.fromDate,
  throughDate: draft.throughDate,
  evidence: draft.evidence.trim(),
  note: draft.note.trim(),
});

export const advertisingObservationCanCompare = (
  review: AdvertisingReview,
  draft: AdvertisingObservationDraft,
) => {
  if (draft.value == null || draft.value === '' || review.goal.value == null)
    return false;
  if (draft.mode === 'HUMAN') return review.goal.provenance === 'HUMAN';
  if (
    (review.source.kind === 'META' || draft.sourceKind === 'META') &&
    (review.source.kind !== draft.sourceKind ||
      !review.source.accountId ||
      !draft.sourceAccountId ||
      review.source.accountId !== draft.sourceAccountId ||
      !review.source.timezone ||
      !draft.sourceTimezone ||
      review.source.timezone !== draft.sourceTimezone)
  )
    return false;
  return (
    review.goal.provenance === 'REPORT' &&
    draft.metricKey === review.goal.metricKey &&
    (draft.metricAdId ?? null) === (review.goal.metricAdId ?? null) &&
    draft.metricUnit === review.goal.metricUnit &&
    draft.metricProvenance === review.goal.metricProvenance
  );
};

export const advertisingObservationIssues = (
  review: AdvertisingReview,
  draft: AdvertisingObservationDraft,
  today = new Date().toISOString().slice(0, 10),
) => {
  const issues: string[] = [];
  if (
    !z.iso.date().safeParse(draft.fromDate).success ||
    !z.iso.date().safeParse(draft.throughDate).success ||
    draft.fromDate > draft.throughDate ||
    draft.fromDate <= review.source.throughDate ||
    draft.throughDate > today
  )
    issues.push('PERIOD');
  if (
    draft.value !== null &&
    draft.value !== '' &&
    !/^(0|[1-9]\d{0,17})(\.\d{1,12})?$/.test(draft.value ?? '')
  )
    issues.push('VALUE');
  if (
    !draft.evidence.trim() ||
    !draft.note.trim() ||
    draft.evidence.length > 4000 ||
    draft.note.length > 4000
  )
    issues.push('EVIDENCE');
  if (
    draft.mode === 'REPORT' &&
    (!draft.sourceKind ||
      !draft.sourceId ||
      !draft.sourceFingerprint ||
      !draft.metricKey)
  )
    issues.push('REPORT');
  if (
    draft.assessment !== 'INCONCLUSIVE' &&
    !advertisingObservationCanCompare(review, draft)
  )
    issues.push('COMPARISON');
  return issues;
};

export const advertisingObservationSourceMatches = (
  review: AdvertisingReview,
  source: AdvertisingSourceEvidence,
) =>
  source.source.projectId === review.source.projectId &&
  source.source.companyId === review.source.companyId &&
  source.source.channel === review.source.channel &&
  source.source.currency === review.source.currency &&
  source.source.fromDate > review.source.throughDate &&
  source.source.throughDate <= new Date().toISOString().slice(0, 10);

export const advertisingObservationScope = (
  source: string,
  actor: unknown,
  review: AdvertisingReview,
  actionId: string,
  requestId: string | null,
) => {
  const task = review.actions.find((action) => action.id === actionId)?.task;
  return JSON.stringify({
    source,
    actor,
    reviewId: review.id,
    revision: review.revision,
    actionId,
    task: task
      ? {
          id: task.id,
          ownerId: task.ownerId,
          reviewerId: task.reviewerId,
        }
      : null,
    requestId,
  });
};
