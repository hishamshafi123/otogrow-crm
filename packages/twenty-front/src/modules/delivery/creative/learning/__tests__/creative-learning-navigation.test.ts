import {
  closeLearningPreparation,
  creativeLearningAdDestination,
  creativeLearningDestination,
  learningGoalInput,
  learningSelectionValid,
  LEARNING_CLOSE,
} from '@/delivery/creative/learning/creative-learning-navigation';
import {
  creativeLearningBodyFixture,
  LEARNING_LINK_ID,
} from '@/delivery/creative/learning/__tests__/creative-learning.fixtures';
it.each([null, LEARNING_LINK_ID])(
  'closes a preparation without requesting an unsaved association: persisted %s',
  (persistedId) => {
    const body = creativeLearningBodyFixture();
    const next = new URL(
      closeLearningPreparation(
        new URLSearchParams({
          learningProject: body.projectId,
          learningSource: body.sourceId,
          learningAd: body.adId,
          learningLink: LEARNING_LINK_ID,
          learningMode: 'new',
          learningRequest: body.projectId,
        }),
        persistedId,
      ),
      'https://os.invalid',
    ).searchParams;
    expect(next.get('learningLink')).toBe(persistedId);
    expect(next.get('learningSource')).toBe(body.sourceId);
    expect(next.has('learningMode')).toBe(false);
    expect(next.has('learningRequest')).toBe(false);
  },
);
it('opens only the exact report/ad/project from a source launcher without inventing a saved association or command', () => {
  const body = creativeLearningBodyFixture();
  const next = new URL(
    creativeLearningAdDestination(body.projectId, body.sourceId, body.adId),
    'https://os.invalid',
  ).searchParams;
  expect(next.get('learningProject')).toBe(body.projectId);
  expect(next.get('learningSource')).toBe(body.sourceId);
  expect(next.get('learningAd')).toBe(body.adId);
  expect(next.has('learningLink')).toBe(false);
  expect(next.has('learningRequest')).toBe(false);
  expect(learningSelectionValid(next)).toBe(true);
});
it('clears old command/version state without dropping the selected project and report context', () => {
  const body = creativeLearningBodyFixture();
  const original = new URLSearchParams({
    view: 'creative',
    creativeView: 'learning',
    learningProject: body.projectId,
    learningSource: body.sourceId,
    learningAd: body.adId,
    learningLink: LEARNING_LINK_ID,
    learningMode: 'decision',
    learningRequest: body.projectId,
    learningAction: 'REVIEW',
    learningVersion: '2',
  });
  const next = new URL(
    creativeLearningDestination(original, LEARNING_CLOSE),
    'https://os.invalid',
  ).searchParams;
  expect(next.get('learningProject')).toBe(body.projectId);
  expect(next.get('learningSource')).toBe(body.sourceId);
  expect(next.get('learningAd')).toBe(body.adId);
  expect(next.has('learningRequest')).toBe(false);
  expect(next.has('learningVersion')).toBe(false);
  expect(next.has('learningMode')).toBe(false);
});
it('copies only declared goal input fields from a larger immutable server snapshot', () => {
  const goal = creativeLearningBodyFixture().goalSnapshot;
  expect(Object.keys(learningGoalInput(goal)).sort()).toEqual(
    [
      'evidence',
      'kind',
      'metricAdId',
      'metricKey',
      'provenance',
      'targetCostMicros',
      'value',
    ].sort(),
  );
  expect(learningGoalInput(goal).value).toBe('0');
  expect(learningGoalInput(goal)).not.toHaveProperty('sourceFingerprint');
});
it('rejects malformed identities, unsupported workflow modes and overflowed version numbers before querying', () => {
  expect(
    learningSelectionValid(new URLSearchParams({ learningLink: 'invalid' })),
  ).toBe(false);
  expect(
    learningSelectionValid(
      new URLSearchParams({ learningMode: 'autoconfirm' }),
    ),
  ).toBe(false);
  expect(
    learningSelectionValid(
      new URLSearchParams({ learningVersion: '999999999999999999999999' }),
    ),
  ).toBe(false);
  expect(
    learningSelectionValid(new URLSearchParams({ learningVersion: '0' })),
  ).toBe(false);
});
