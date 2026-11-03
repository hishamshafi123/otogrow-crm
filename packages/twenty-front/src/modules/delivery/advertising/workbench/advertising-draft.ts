import { z } from 'zod';
import { isValidUuid } from 'twenty-shared/utils';
import {
  financeAmountMicrosToDecimal,
  parseFinanceAmountMicros,
} from '@/delivery/finance/finance-money';
import { type AdvertisingSourceEvidence } from '@/delivery/advertising/workbench/AdvertisingEvidence';
import {
  type DeliveryAdvertisingActionInput,
  type DeliveryAdvertisingGoalInput,
  type SaveDeliveryAdvertisingReviewInput,
  type DeliveryAdvertisingReviewQuery,
} from '~/generated-metadata/graphql';

export type AdvertisingReview = NonNullable<
  DeliveryAdvertisingReviewQuery['deliveryAdvertisingReview']['review']
>;
export type AdvertisingActionDraft = DeliveryAdvertisingActionInput & {
  ownerName: string;
  reviewerName: string;
  assistantName: string | null;
  assistantVersion: number | null;
  originEdited?: boolean;
};
export type AdvertisingReviewDraft = Omit<
  SaveDeliveryAdvertisingReviewInput,
  'actions' | 'goal'
> & {
  actions: AdvertisingActionDraft[];
  goal: DeliveryAdvertisingGoalInput & {
    metricLabel: string | null;
    metricUnit: string;
  };
  targetCost: string;
  noChanges: boolean;
  separateNoChangeReason: boolean;
  evidenceFingerprint: string;
};
export const newAdvertisingReviewDraft = (
  id: string,
  requestId: string,
  source: AdvertisingSourceEvidence,
): AdvertisingReviewDraft => ({
  id,
  requestId,
  revision: 0,
  sourceKind: source.source.kind,
  sourceId: source.source.id,
  sourceFingerprint: source.fingerprint,
  evidenceFingerprint: source.evidenceFingerprint,
  goal: {
    kind: '',
    provenance: 'REPORT',
    metricKey: null,
    metricAdId: null,
    value: null,
    evidence: '',
    targetCostMicros: null,
    metricLabel: null,
    metricUnit: 'COUNT',
  },
  note: '',
  noChangeReason: '',
  noChanges: false,
  separateNoChangeReason: false,
  targetCost: '',
  actions: [],
  legacyHandling: {
    mode: source.legacyTaskId ? '' : 'NONE',
    taskId: null,
    taskRevision: null,
    taskState: null,
    reason: '',
  },
});
export const existingAdvertisingReviewDraft = (
  review: AdvertisingReview,
  requestId: string,
): AdvertisingReviewDraft => ({
  id: review.id,
  requestId,
  revision: review.revision,
  sourceKind: review.source.kind,
  sourceId: review.source.id,
  sourceFingerprint: review.source.fingerprint,
  evidenceFingerprint: review.source.evidenceFingerprint,
  goal: {
    kind: review.goal.kind,
    provenance: review.goal.provenance,
    metricKey: review.goal.metricKey ?? null,
    metricAdId: review.goal.metricAdId ?? null,
    value: review.goal.value ?? null,
    evidence: review.goal.evidence,
    targetCostMicros: review.goal.targetCostMicros ?? null,
    metricLabel: review.goal.metricLabel ?? null,
    metricUnit: review.goal.metricUnit,
  },
  note: review.note,
  noChangeReason: review.noChangeReason,
  noChanges: review.actions.length === 0,
  separateNoChangeReason:
    review.actions.length === 0 && review.noChangeReason !== review.note,
  targetCost: review.goal.targetCostMicros
    ? financeAmountMicrosToDecimal(review.goal.targetCostMicros)
    : '',
  legacyHandling: {
    mode: review.legacyHandling.mode,
    taskId: review.legacyHandling.taskId ?? null,
    taskRevision: review.legacyHandling.taskRevision ?? null,
    taskState: review.legacyHandling.taskState ?? null,
    reason: review.legacyHandling.reason,
  },
  actions: review.actions.map((action) => ({
    id: action.id,
    title: action.title,
    rationale: action.rationale,
    expectedResult: action.expectedResult,
    evidence: action.evidence,
    ownerId: action.ownerId,
    ownerName: action.ownerName,
    reviewerId: action.reviewerId,
    reviewerName: action.reviewerName,
    dueDate: action.dueDate,
    assistantId: action.assistantId ?? null,
    assistantName: action.assistantName ?? null,
    assistantVersion: action.assistantVersion ?? null,
    adoptTaskId: action.adoptTaskId ?? null,
    origin: action.origin
      ? { runId: action.origin.runId, suggestionId: action.origin.suggestionId }
      : null,
    originEdited: action.origin?.humanEdited ?? false,
  })),
});
export const newAdvertisingAction = (
  source: AdvertisingSourceEvidence,
): AdvertisingActionDraft => ({
  id: crypto.randomUUID(),
  title: '',
  rationale: '',
  expectedResult: '',
  evidence: '',
  ownerId: source.currentRouting?.marketerId ?? '',
  ownerName: source.currentRouting?.marketerName ?? '',
  reviewerId: source.currentRouting?.managerId ?? '',
  reviewerName: source.currentRouting?.managerName ?? '',
  dueDate: '',
  assistantId: null,
  assistantName: null,
  assistantVersion: null,
  adoptTaskId: null,
  origin: null,
  originEdited: false,
});
export const advertisingDraftInput = (
  draft: AdvertisingReviewDraft,
): SaveDeliveryAdvertisingReviewInput => ({
  requestId: draft.requestId,
  id: draft.id,
  revision: draft.revision,
  sourceKind: draft.sourceKind,
  sourceId: draft.sourceId,
  sourceFingerprint: draft.sourceFingerprint,
  goal: {
    kind: draft.goal.kind,
    provenance: draft.goal.provenance,
    metricKey: draft.goal.metricKey ?? null,
    metricAdId: draft.goal.metricAdId ?? null,
    value: draft.goal.value?.trim() || null,
    evidence: draft.goal.evidence.trim(),
    targetCostMicros: draft.targetCost.trim()
      ? parseFinanceAmountMicros(draft.targetCost)
      : null,
  },
  note: draft.note.trim(),
  noChangeReason:
    draft.noChanges && draft.actions.length === 0
      ? draft.separateNoChangeReason
        ? draft.noChangeReason.trim()
        : draft.note.trim()
      : '',
  legacyHandling: {
    mode: draft.legacyHandling.mode,
    taskId: draft.legacyHandling.taskId ?? null,
    taskRevision: draft.legacyHandling.taskRevision ?? null,
    taskState: draft.legacyHandling.taskState ?? null,
    reason: draft.legacyHandling.reason.trim(),
  },
  actions: draft.actions.map((action) => ({
    id: action.id,
    title: action.title.trim(),
    rationale: action.rationale.trim(),
    expectedResult: action.expectedResult.trim(),
    evidence: action.evidence.trim(),
    ownerId: action.ownerId,
    reviewerId: action.reviewerId,
    dueDate: action.dueDate,
    assistantId: action.assistantId ?? null,
    adoptTaskId: action.adoptTaskId ?? null,
    origin: action.origin
      ? { runId: action.origin.runId, suggestionId: action.origin.suggestionId }
      : null,
  })),
});
export const advertisingDraftRequirements = (draft: AdvertisingReviewDraft) => {
  const issues: string[] = [];
  if (
    ![
      'PURCHASES',
      'LEADS',
      'QUALIFIED_LEADS',
      'BOOKED_CALLS',
      'REGISTRATIONS',
      'SALES',
    ].includes(draft.goal.kind)
  )
    issues.push('GOAL');
  if (!draft.note.trim()) issues.push('NOTE');
  if (draft.actions.length === 0 && !draft.noChanges)
    issues.push('ACTIONS_OR_NO_CHANGE');
  if (
    draft.noChanges &&
    draft.separateNoChangeReason &&
    !draft.noChangeReason.trim()
  )
    issues.push('NO_CHANGE_REASON');
  if (draft.goal.provenance === 'HUMAN' && !draft.goal.evidence.trim())
    issues.push('HUMAN_EVIDENCE');
  if (
    draft.goal.value != null &&
    !/^(0|[1-9]\d{0,17})(\.\d{1,12})?$/.test(draft.goal.value)
  )
    issues.push('VALUE');
  if (
    draft.targetCost.trim() &&
    (draft.goal.metricUnit === 'MONEY' ||
      parseFinanceAmountMicros(draft.targetCost) === null)
  )
    issues.push('TARGET_COST');
  if (
    !['NONE', 'ADOPT', 'ADDITIONAL_WORK'].includes(draft.legacyHandling.mode) ||
    (draft.legacyHandling.mode === 'ADDITIONAL_WORK' &&
      !draft.legacyHandling.reason.trim())
  )
    issues.push('LEGACY_HANDLING');
  if (
    draft.actions.some(
      (action) =>
        !action.title.trim() ||
        action.title.trim().length > 200 ||
        !action.rationale.trim() ||
        !action.expectedResult.trim() ||
        !action.evidence.trim() ||
        !isValidUuid(action.ownerId) ||
        !isValidUuid(action.reviewerId) ||
        !z.iso.date().safeParse(action.dueDate).success,
    )
  )
    issues.push('ACTION_FIELDS');
  if (draft.actions.some((action) => action.ownerId === action.reviewerId))
    issues.push('INDEPENDENT_REVIEW');
  if (draft.actions.length > 20) issues.push('MAX_ACTIONS');
  return issues;
};
