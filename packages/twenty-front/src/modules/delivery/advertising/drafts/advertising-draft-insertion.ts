import { type AdvertisingSourceEvidence } from '@/delivery/advertising/workbench/AdvertisingEvidence';
import {
  advertisingDraftInput,
  newAdvertisingAction,
  type AdvertisingReviewDraft,
} from '@/delivery/advertising/workbench/advertising-draft';
import { type AdvertisingDraftDetail } from '@/delivery/advertising/drafts/advertising-draft-types';
import { sameAdvertisingDraftGoal } from '@/delivery/advertising/drafts/advertising-draft-goal';

export const appendAdvertisingSuggestions = (
  draft: AdvertisingReviewDraft,
  source: AdvertisingSourceEvidence,
  detail: AdvertisingDraftDetail,
  selectedIds: string[],
): AdvertisingReviewDraft | null => {
  const result = detail.run.result;
  if (
    !detail.canUseResult ||
    detail.run.status !== 'SUCCEEDED' ||
    !result ||
    detail.run.sourceKind !== draft.sourceKind ||
    detail.run.sourceId !== draft.sourceId ||
    detail.currentSourceFingerprint !== draft.sourceFingerprint ||
    source.fingerprint !== draft.sourceFingerprint ||
    !sameAdvertisingDraftGoal(
      detail.run.context.goal,
      advertisingDraftInput(draft).goal,
    )
  )
    return null;
  const ids = new Set(selectedIds);
  if (ids.size !== selectedIds.length || ids.size === 0 || ids.size > 8)
    return null;
  const suggestions = result.suggestions.filter((suggestion) =>
    ids.has(suggestion.id),
  );
  if (
    suggestions.length !== ids.size ||
    suggestions.some((suggestion) =>
      draft.actions.some(
        (action) =>
          action.origin?.runId === detail.run.id &&
          action.origin.suggestionId === suggestion.id,
      ),
    ) ||
    draft.actions.length + suggestions.length > 20
  )
    return null;
  return {
    ...draft,
    noChanges: false,
    actions: [
      ...draft.actions,
      ...suggestions.map((suggestion) => ({
        ...newAdvertisingAction(source),
        title: suggestion.title,
        rationale: suggestion.rationale,
        expectedResult: suggestion.expectedResult,
        evidence: suggestion.evidence,
        origin: { runId: detail.run.id, suggestionId: suggestion.id },
        originEdited: false,
      })),
    ],
  };
};

export const appendAdvertisingNoChangeReason = (
  draft: AdvertisingReviewDraft,
  source: AdvertisingSourceEvidence,
  detail: AdvertisingDraftDetail,
): AdvertisingReviewDraft | null => {
  const proposed = detail.run.result?.noChangeReason?.trim();
  if (
    !detail.canUseResult ||
    detail.run.status !== 'SUCCEEDED' ||
    !proposed ||
    draft.actions.length !== 0 ||
    detail.run.sourceKind !== draft.sourceKind ||
    detail.run.sourceId !== draft.sourceId ||
    detail.currentSourceFingerprint !== draft.sourceFingerprint ||
    source.fingerprint !== draft.sourceFingerprint ||
    !sameAdvertisingDraftGoal(
      detail.run.context.goal,
      advertisingDraftInput(draft).goal,
    )
  )
    return null;
  const existing = draft.separateNoChangeReason
    ? draft.noChangeReason.trim()
    : draft.noChanges
      ? draft.note.trim()
      : '';
  if (existing === proposed || existing.endsWith(`\n\n${proposed}`))
    return null;
  const noChangeReason = existing ? `${existing}\n\n${proposed}` : proposed;
  if (noChangeReason.length > 4000) return null;
  return {
    ...draft,
    noChanges: true,
    separateNoChangeReason: true,
    noChangeReason,
  };
};
