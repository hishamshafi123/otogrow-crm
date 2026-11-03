import {
  advertisingObservationCanCompare,
  advertisingObservationInput,
  advertisingObservationIssues,
  advertisingObservationScope,
} from '@/delivery/advertising/workbench/advertising-observation';
import {
  observationDraft,
  observationReview,
} from '@/delivery/advertising/workbench/__tests__/advertising-observation.fixtures';

it('preserves an owned draft across verified task progress updates while changing scope for responsibility changes', () => {
  const original = observationReview();
  const changed = structuredClone(original);
  const actionId = original.actions[0].id;
  const initial = advertisingObservationScope(
    'identity',
    { isManager: true },
    original,
    actionId,
    'request',
  );
  if (!changed.actions[0].task) throw new Error('Expected task fixture');
  changed.actions[0].task.revision++;
  changed.actions[0].task.state = 'IN_PROGRESS';
  expect(
    advertisingObservationScope(
      'identity',
      { isManager: true },
      changed,
      actionId,
      'request',
    ),
  ).toBe(initial);
  changed.actions[0].task.ownerId = 'another-owner';
  expect(
    advertisingObservationScope(
      'identity',
      { isManager: true },
      changed,
      actionId,
      'request',
    ),
  ).not.toBe(initial);
});

it('preserves explicit zero and exact large decimals while leaving unknown values null', () => {
  const draft = observationDraft();
  expect(advertisingObservationInput(draft).value).toBeNull();
  expect(advertisingObservationInput({ ...draft, value: '0' }).value).toBe('0');
  expect(
    advertisingObservationInput({
      ...draft,
      value: '999999999999999999.123456789012',
    }).value,
  ).toBe('999999999999999999.123456789012');
  expect(
    advertisingObservationIssues(
      observationReview(),
      { ...draft, value: '1e3' },
      '2020-02-23',
    ),
  ).toContain('VALUE');
});
it('requires a real later completed period and explanatory evidence', () => {
  const draft = observationDraft(),
    review = observationReview();
  expect(advertisingObservationIssues(review, draft, '2020-02-23')).toEqual([]);
  for (const invalid of [
    { fromDate: '2020-02-20' },
    { throughDate: '2020-02-24' },
    { fromDate: '2020-02-30' },
    { throughDate: '2020-02-20' },
  ])
    expect(
      advertisingObservationIssues(
        review,
        { ...draft, ...invalid },
        '2020-02-23',
      ),
    ).toContain('PERIOD');
  expect(
    advertisingObservationIssues(
      review,
      { ...draft, evidence: ' ' },
      '2020-02-23',
    ),
  ).toContain('EVIDENCE');
});
it('never treats a human observation as directly comparable to platform attribution', () => {
  const review = observationReview(),
    draft = { ...observationDraft(), value: '0' };
  expect(advertisingObservationCanCompare(review, draft)).toBe(false);
  expect(
    advertisingObservationIssues(review, { ...draft, assessment: 'IMPROVED' }),
  ).toContain('COMPARISON');
  expect(
    advertisingObservationCanCompare(
      { ...review, goal: { ...review.goal, provenance: 'HUMAN' } },
      draft,
    ),
  ).toBe(true);
});
it('requires the same exact report metric, unit, provenance and ad for a conclusive assessment', () => {
  const review = observationReview();
  const draft = {
    ...observationDraft(),
    mode: 'REPORT' as const,
    sourceKind: 'META',
    sourceAccountId: review.source.accountId ?? null,
    sourceTimezone: review.source.timezone ?? null,
    value: '0',
    metricKey: review.goal.metricKey,
    metricUnit: review.goal.metricUnit,
    metricProvenance: review.goal.metricProvenance,
  };
  expect(advertisingObservationCanCompare(review, draft)).toBe(true);
  for (const changed of [
    { metricKey: 'account:actions:omni_purchase' },
    { metricAdId: 'another-ad' },
    { metricUnit: 'MONEY' },
    { metricProvenance: 'HUMAN_REPORTED' },
    { value: null },
    { sourceAccountId: null },
    { sourceAccountId: 'different-account' },
    { sourceTimezone: null },
    { sourceTimezone: 'UTC' },
  ])
    expect(
      advertisingObservationCanCompare(review, { ...draft, ...changed }),
    ).toBe(false);
});
it('removes report claims from human input and requires deliberate complete report selection', () => {
  const draft = {
    ...observationDraft(),
    sourceId: 'report',
    sourceKind: 'META',
    sourceFingerprint: 'fingerprint',
    metricKey: 'purchase',
    metricAdId: 'ad',
  };
  expect(advertisingObservationInput(draft)).toMatchObject({
    sourceKind: null,
    sourceId: null,
    sourceFingerprint: null,
    metricKey: null,
    metricAdId: null,
  });
  expect(
    advertisingObservationIssues(observationReview(), {
      ...observationDraft(),
      mode: 'REPORT',
    }),
  ).toContain('REPORT');
});
