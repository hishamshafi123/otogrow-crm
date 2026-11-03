import {
  advertisingDraftInput,
  advertisingDraftRequirements,
  existingAdvertisingReviewDraft,
  newAdvertisingAction,
  newAdvertisingReviewDraft,
  type AdvertisingReviewDraft,
} from '@/delivery/advertising/workbench/advertising-draft';
import {
  ADVERTISING_IDENTITY,
  ADVERTISING_OWNER_ID,
  ADVERTISING_REQUEST_ID,
  ADVERTISING_REVIEW_ID,
  ADVERTISING_TASK_ID,
  advertisingSource,
} from '@/delivery/advertising/workbench/__tests__/advertising-workbench.fixtures';
import { observationReview } from '@/delivery/advertising/workbench/__tests__/advertising-observation.fixtures';

const completeDraft = (): AdvertisingReviewDraft => {
  const source = advertisingSource();
  const draft = newAdvertisingReviewDraft(
    ADVERTISING_REVIEW_ID,
    ADVERTISING_REQUEST_ID,
    source,
  );
  return {
    ...draft,
    note: 'Review one deliberate creative test.',
    goal: { ...draft.goal, kind: 'PURCHASES' },
    actions: [
      {
        ...newAdvertisingAction(source),
        title: 'Test the reviewed offer',
        rationale: 'The current offer needs a clearer demonstration.',
        expectedResult: 'Compare later purchases after enough delivery.',
        evidence: 'Use the approved offer and brand guidelines.',
        dueDate: '2026-11-01',
      },
    ],
  };
};

it('starts without inventing a primary outcome, target, strategy or legacy-task decision', () => {
  const source = advertisingSource();
  source.reportedGoalKind = 'LEADS';
  source.reportedTargetCostMicros = '25000000';
  source.legacyTaskId = ADVERTISING_TASK_ID;
  source.legacyAdoptedReviewId = ADVERTISING_REVIEW_ID;
  const draft = newAdvertisingReviewDraft(
    ADVERTISING_REVIEW_ID,
    ADVERTISING_REQUEST_ID,
    source,
  );
  expect(draft.goal).toMatchObject({
    kind: '',
    value: null,
    metricKey: null,
    metricAdId: null,
    targetCostMicros: null,
  });
  expect(draft.targetCost).toBe('');
  expect(draft.actions).toEqual([]);
  expect(draft.note).toBe('');
  expect(draft.legacyHandling.mode).toBe('');
  expect(advertisingDraftRequirements(draft)).toEqual(
    expect.arrayContaining([
      'GOAL',
      'NOTE',
      'ACTIONS_OR_NO_CHANGE',
      'LEGACY_HANDLING',
    ]),
  );
});

it('starts a new action with current named recipients while retaining the frozen source identity', () => {
  const source = advertisingSource();
  source.originalRouting.marketerId = ADVERTISING_TASK_ID;
  source.originalRouting.marketerName = 'Previous marketer';
  const draft = newAdvertisingReviewDraft(
    ADVERTISING_REVIEW_ID,
    ADVERTISING_REQUEST_ID,
    source,
  );
  const action = newAdvertisingAction(source);
  expect(action).toMatchObject({
    ownerId: ADVERTISING_OWNER_ID,
    ownerName: 'Assigned marketer',
    reviewerId: ADVERTISING_IDENTITY.memberId,
    reviewerName: 'Amna',
    assistantId: null,
    adoptTaskId: null,
  });
  expect(draft).toMatchObject({
    id: ADVERTISING_REVIEW_ID,
    requestId: ADVERTISING_REQUEST_ID,
    sourceId: source.source.id,
    sourceKind: source.source.kind,
    sourceFingerprint: source.fingerprint,
    revision: 0,
  });
});

it('preserves exact zero, unknown and large decimal outcome evidence without floating point conversion', () => {
  const draft = completeDraft();
  expect(advertisingDraftInput(draft).goal.value).toBeNull();
  expect(
    advertisingDraftInput({ ...draft, goal: { ...draft.goal, value: '0' } })
      .goal.value,
  ).toBe('0');
  const value = '999999999999999999.123456789012';
  expect(
    advertisingDraftInput({ ...draft, goal: { ...draft.goal, value } }).goal
      .value,
  ).toBe(value);
  expect(
    advertisingDraftRequirements({
      ...draft,
      goal: { ...draft.goal, value: '1e3' },
    }),
  ).toContain('VALUE');
});

it('converts a deliberate target exactly and rejects unsupported precision or a revenue cost-per-outcome target', () => {
  const draft = completeDraft();
  expect(
    advertisingDraftInput({ ...draft, targetCost: '25.000001' }).goal
      .targetCostMicros,
  ).toBe('25000001');
  expect(
    advertisingDraftInput({ ...draft, targetCost: '0' }).goal.targetCostMicros,
  ).toBe('0');
  expect(
    advertisingDraftRequirements({ ...draft, targetCost: '0.0000001' }),
  ).toContain('TARGET_COST');
  expect(
    advertisingDraftRequirements({
      ...draft,
      targetCost: '25',
      goal: { ...draft.goal, kind: 'SALES', metricUnit: 'MONEY' },
    }),
  ).toContain('TARGET_COST');
});

it('requires explicit evidenced human interpretation instead of a guessed provider outcome', () => {
  const draft = completeDraft();
  expect(
    advertisingDraftRequirements({
      ...draft,
      goal: { ...draft.goal, provenance: 'HUMAN', value: '0', evidence: '' },
    }),
  ).toContain('HUMAN_EVIDENCE');
  expect(
    advertisingDraftRequirements({
      ...draft,
      goal: {
        ...draft.goal,
        provenance: 'HUMAN',
        value: '0',
        evidence: 'The project manager checked the CRM-qualified outcomes.',
      },
    }),
  ).toEqual([]);
});

it('accepts assignable 200-character titles and blocks the next character, self-review and invalid dates', () => {
  const draft = completeDraft();
  const action = draft.actions[0];
  expect(
    advertisingDraftRequirements({
      ...draft,
      actions: [{ ...action, title: 'a'.repeat(200) }],
    }),
  ).toEqual([]);
  expect(
    advertisingDraftRequirements({
      ...draft,
      actions: [{ ...action, title: 'a'.repeat(201) }],
    }),
  ).toContain('ACTION_FIELDS');
  expect(
    advertisingDraftRequirements({
      ...draft,
      actions: [{ ...action, reviewerId: action.ownerId }],
    }),
  ).toContain('INDEPENDENT_REVIEW');
  expect(
    advertisingDraftRequirements({
      ...draft,
      actions: [{ ...action, dueDate: '2026-02-30' }],
    }),
  ).toContain('ACTION_FIELDS');
});

it('requires a deliberate no-change explanation before a zero-action review can be saved', () => {
  const draft = { ...completeDraft(), actions: [] };
  expect(advertisingDraftRequirements(draft)).toContain('ACTIONS_OR_NO_CHANGE');
  const noChanges = {
    ...draft,
    noChanges: true,
    note: 'Current approved work covers the next review period.',
  };
  expect(advertisingDraftRequirements(noChanges)).toEqual([]);
  expect(advertisingDraftInput(noChanges)).toMatchObject({
    actions: [],
    noChangeReason: noChanges.note,
  });
  expect(advertisingDraftRequirements({ ...noChanges, note: ' ' })).toContain(
    'NOTE',
  );
});

it('requires a separate-work reason even when the existing generic follow-up has already been adopted', () => {
  const draft = completeDraft();
  const handling = {
    mode: 'ADDITIONAL_WORK',
    taskId: ADVERTISING_TASK_ID,
    taskRevision: 7,
    taskState: 'APPROVED',
    reason: '',
  };
  expect(
    advertisingDraftRequirements({ ...draft, legacyHandling: handling }),
  ).toContain('LEGACY_HANDLING');
  const reason =
    'The earlier completed review did not include this new creative test.';
  const input = advertisingDraftInput({
    ...draft,
    legacyHandling: { ...handling, reason },
  });
  expect(input.legacyHandling).toEqual({ ...handling, reason });
  expect(input.actions[0].adoptTaskId).toBeNull();
});

it('submits only the owned command body and strips recipient labels and assistant display metadata', () => {
  const draft = completeDraft();
  draft.revision = 4;
  draft.actions[0].assistantName = 'Copy support';
  draft.actions[0].assistantVersion = 9;
  const original = structuredClone(draft);
  const input = advertisingDraftInput(draft);
  expect(input).toMatchObject({
    requestId: draft.requestId,
    id: draft.id,
    revision: 4,
    sourceKind: draft.sourceKind,
    sourceId: draft.sourceId,
    sourceFingerprint: draft.sourceFingerprint,
  });
  expect(input.actions[0]).not.toHaveProperty('ownerName');
  expect(input.actions[0]).not.toHaveProperty('reviewerName');
  expect(input.actions[0]).not.toHaveProperty('assistantName');
  expect(input.actions[0]).not.toHaveProperty('assistantVersion');
  expect(input.goal).not.toHaveProperty('metricLabel');
  expect(input.goal).not.toHaveProperty('metricUnit');
  expect(draft).toEqual(original);
});

it('reopens the saved source, revision, exact target and names without repinning a different current report', () => {
  const review = observationReview();
  review.goal.targetCostMicros = '25000001';
  review.actions[0].ownerId = ADVERTISING_OWNER_ID;
  const result = existingAdvertisingReviewDraft(review, ADVERTISING_REQUEST_ID);
  expect(result).toMatchObject({
    id: review.id,
    revision: review.revision,
    sourceId: review.source.id,
    sourceKind: review.source.kind,
    sourceFingerprint: review.source.fingerprint,
    targetCost: '25.000001',
  });
  expect(result.goal).toMatchObject({
    metricKey: review.goal.metricKey,
    value: '0',
  });
  expect(result.actions[0]).toMatchObject({
    ownerId: ADVERTISING_OWNER_ID,
    ownerName: review.actions[0].ownerName,
    reviewerName: review.actions[0].reviewerName,
  });
});

it('preserves a distinct saved no-change explanation rather than overwriting it with the review summary', () => {
  const review = observationReview();
  review.actions = [];
  review.state = 'DRAFT';
  review.note = 'Reviewed the latest evidence with the team.';
  review.noChangeReason =
    'Existing approved work already covers this reporting period.';
  const draft = existingAdvertisingReviewDraft(review, ADVERTISING_REQUEST_ID);
  expect(draft.separateNoChangeReason).toBe(true);
  expect(advertisingDraftInput(draft)).toMatchObject({
    note: review.note,
    noChangeReason: review.noChangeReason,
    actions: [],
  });
  expect(
    advertisingDraftRequirements({ ...draft, noChangeReason: ' ' }),
  ).toContain('NO_CHANGE_REASON');
});
