import {
  advertisingDraftDetail,
  DRAFT_SUGGESTION_ID,
  DRAFT_SECOND_SUGGESTION_ID,
  draftGoal,
} from '@/delivery/advertising/drafts/__tests__/advertising-draft.fixtures';
import {
  advertisingSource,
  ADVERTISING_REVIEW_ID,
  ADVERTISING_REQUEST_ID,
} from '@/delivery/advertising/workbench/__tests__/advertising-workbench.fixtures';
import {
  advertisingDraftInput,
  newAdvertisingAction,
  newAdvertisingReviewDraft,
} from '@/delivery/advertising/workbench/advertising-draft';
import {
  appendAdvertisingNoChangeReason,
  appendAdvertisingSuggestions,
} from '@/delivery/advertising/drafts/advertising-draft-insertion';

const ownedDraft = () => {
  const source = advertisingSource();
  const draft = newAdvertisingReviewDraft(
    ADVERTISING_REVIEW_ID,
    ADVERTISING_REQUEST_ID,
    source,
  );
  draft.goal = {
    ...draft.goal,
    ...draftGoal(),
    metricLabel: 'Reported purchases',
    metricUnit: 'COUNT',
  };
  draft.note = 'Preserve this manager-written analysis.';
  return { source, draft };
};

it('appends only deliberately selected proposals, preserves manual text and retains genuine source provenance', () => {
  const { source, draft } = ownedDraft();
  const manual = {
    ...newAdvertisingAction(source),
    title: 'Keep this manual action',
    evidence: 'Manager-chosen evidence',
    dueDate: '2026-11-02',
  };
  draft.actions = [manual];
  const original = JSON.stringify(draft);
  const detail = advertisingDraftDetail();
  const appended = appendAdvertisingSuggestions(draft, source, detail, [
    DRAFT_SECOND_SUGGESTION_ID,
  ]);
  expect(appended?.note).toBe(draft.note);
  expect(appended?.actions[0]).toEqual(manual);
  expect(appended?.actions[1]).toMatchObject({
    title: 'Document the next comparable observation',
    dueDate: '',
    origin: { runId: detail.run.id, suggestionId: DRAFT_SECOND_SUGGESTION_ID },
    originEdited: false,
  });
  expect(appended?.actions[1].ownerId).toBe(source.currentRouting?.marketerId);
  expect(JSON.stringify(draft)).toBe(original);
  expect(
    appended?.actions.some(
      (action) => action.title === 'Test an alternative product opening',
    ),
  ).toBe(false);
});

it('prevents duplicate, unknown and oversized insertions instead of copying or replacing manual work', () => {
  const { source, draft } = ownedDraft();
  const detail = advertisingDraftDetail();
  const once = appendAdvertisingSuggestions(draft, source, detail, [
    DRAFT_SUGGESTION_ID,
  ]);
  expect(once).not.toBeNull();
  if (once)
    expect(
      appendAdvertisingSuggestions(once, source, detail, [DRAFT_SUGGESTION_ID]),
    ).toBeNull();
  expect(
    appendAdvertisingSuggestions(draft, source, detail, [
      DRAFT_SUGGESTION_ID,
      DRAFT_SUGGESTION_ID,
    ]),
  ).toBeNull();
  expect(
    appendAdvertisingSuggestions(draft, source, detail, ['unknown']),
  ).toBeNull();
  draft.actions = Array.from({ length: 20 }, () =>
    newAdvertisingAction(source),
  );
  expect(
    appendAdvertisingSuggestions(draft, source, detail, [DRAFT_SUGGESTION_ID]),
  ).toBeNull();
  expect(draft.actions).toHaveLength(20);
});

it.each(['outcome', 'source', 'authority', 'status'] as const)(
  'rejects a changed %s before local insertion',
  (change) => {
    const { source, draft } = ownedDraft();
    const detail = advertisingDraftDetail();
    if (change === 'outcome') draft.goal.kind = 'LEADS';
    if (change === 'source') source.fingerprint = '0'.repeat(64);
    if (change === 'authority') detail.canUseResult = false;
    if (change === 'status') detail.run.status = 'CANCELLED';
    expect(
      appendAdvertisingSuggestions(draft, source, detail, [
        DRAFT_SUGGESTION_ID,
      ]),
    ).toBeNull();
    expect(draft.actions).toHaveLength(0);
  },
);

it('compares the current edited target rather than the stale target stored in the form goal', () => {
  const { source, draft } = ownedDraft();
  const detail = advertisingDraftDetail();
  draft.targetCost = '2.50';
  detail.run.context.goal.targetCostMicros = '2500000';
  expect(
    appendAdvertisingSuggestions(draft, source, detail, [DRAFT_SUGGESTION_ID]),
  ).not.toBeNull();
  const input = advertisingDraftInput(draft);
  expect(input.goal.targetCostMicros).toBe('2500000');
});

it('adds an explicit no-change explanation without overwriting the manager summary or duplicating it', () => {
  const { source, draft } = ownedDraft();
  const detail = advertisingDraftDetail();
  const appended = appendAdvertisingNoChangeReason(draft, source, detail);
  expect(appended).toMatchObject({
    note: draft.note,
    noChanges: true,
    separateNoChangeReason: true,
    noChangeReason: detail.run.result?.noChangeReason,
    actions: [],
  });
  if (appended)
    expect(
      appendAdvertisingNoChangeReason(appended, source, detail),
    ).toBeNull();
  draft.actions = [newAdvertisingAction(source)];
  expect(appendAdvertisingNoChangeReason(draft, source, detail)).toBeNull();
});

it('preserves genuine origin in the saved input while excluding local UI edit markers', () => {
  const { source, draft } = ownedDraft();
  const detail = advertisingDraftDetail();
  const appended = appendAdvertisingSuggestions(draft, source, detail, [
    DRAFT_SUGGESTION_ID,
  ]);
  if (!appended) throw new Error('Fixture insertion failed');
  appended.actions[0].title = 'Human revised wording';
  appended.actions[0].originEdited = true;
  expect(advertisingDraftInput(appended).actions[0]).toMatchObject({
    title: 'Human revised wording',
    origin: { runId: detail.run.id, suggestionId: DRAFT_SUGGESTION_ID },
  });
  expect(advertisingDraftInput(appended).actions[0]).not.toHaveProperty(
    'originEdited',
  );
});
