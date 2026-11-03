import { isValidUuid } from 'twenty-shared/utils';
export const LEARNING_CLOSE = {
  learningLink: null,
  learningVersion: null,
  learningRequest: null,
  learningMode: null,
  learningAction: null,
  learningEvent: null,
  learningLesson: null,
  learningCorrects: null,
  learningLessonCorrects: null,
};
export const creativeLearningDestination = (
  params: URLSearchParams,
  changes: Record<string, string | null>,
) => {
  const next = new URLSearchParams(params);
  next.set('view', 'creative');
  next.set('creativeView', 'learning');
  for (const [key, value] of Object.entries(changes)) {
    if (typeof value === 'string' && value !== '') next.set(key, value);
    else next.delete(key);
  }
  return `/delivery?${next.toString()}`;
};
export const closeLearningPreparation = (
  params: URLSearchParams,
  persistedLinkId: string | null,
) =>
  creativeLearningDestination(params, {
    ...LEARNING_CLOSE,
    learningLink: persistedLinkId,
  });
export const learningSelectionValid = (params: URLSearchParams) =>
  [
    'learningProject',
    'learningLink',
    'learningRequest',
    'learningSource',
    'learningLesson',
    'learningCorrects',
    'learningEvent',
    'learningLessonCorrects',
    'learningAfter',
    'learningLessonsAfter',
  ].every((key) => !params.has(key) || isValidUuid(params.get(key) ?? '')) &&
  params.has('learningSource') === params.has('learningAd') &&
  (!params.has('learningAd') ||
    /^\d{1,100}$/.test(params.get('learningAd') ?? '')) &&
  (!params.has('learningVersion') ||
    (/^[1-9]\d*$/.test(params.get('learningVersion') ?? '') &&
      Number.isSafeInteger(Number(params.get('learningVersion'))) &&
      Number(params.get('learningVersion')) <= 2147483647)) &&
  (!params.has('learningMode') ||
    ['new', 'edit', 'decision', 'lesson'].includes(
      params.get('learningMode') ?? '',
    )) &&
  (!params.has('learningAction') ||
    ['SUBMIT', 'REVIEW', 'REQUEST_CHANGES', 'RETRACT', 'CORRECT'].includes(
      params.get('learningAction') ?? '',
    ));
export const learningGoalInput = (goal: CreativeGoal) => ({
  kind: goal.kind,
  metricKey: goal.metricKey ?? null,
  metricAdId: goal.metricAdId ?? null,
  provenance: goal.provenance,
  value: goal.value ?? null,
  evidence: goal.evidence,
  targetCostMicros: goal.targetCostMicros ?? null,
});
type CreativeGoal = {
  kind: string;
  metricKey?: string | null;
  metricAdId?: string | null;
  provenance: string;
  value?: string | null;
  evidence: string;
  targetCostMicros?: string | null;
};

export const creativeLearningAdDestination = (
  projectId: string,
  sourceId: string,
  adId: string,
) =>
  creativeLearningDestination(new URLSearchParams(), {
    learningProject: projectId,
    learningSource: sourceId,
    learningAd: adId,
  });
