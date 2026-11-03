import {
  activityAnalysisClose,
  activityAnalysisDestination,
  activityQuestionRetainsNavigation,
  readActivityAnalysisNavigation,
} from '@/otogrow-activity/analysis/activity-analysis-navigation';
import {
  activityAnalysisScope,
  lastSevenActivityDays,
} from '@/otogrow-activity/analysis/activity-analysis-scope';
import { readActivityFilters } from '@/otogrow-activity/activityFilters';
import {
  ACTIVITY_AGENT_ID,
  ACTIVITY_EVENT_ID,
  ACTIVITY_REQUEST_ID,
  ACTIVITY_RUN_ID,
} from '@/otogrow-activity/analysis/__tests__/activity-analysis.fixtures';

const current = () => ({
  pathname: '/delivery',
  search: `?view=activity&activityFrom=2026-10-26&activityThrough=2026-11-01&activityAnalysis=prepare&activityAssistant=${ACTIVITY_AGENT_ID}&activityAnalysisRequest=${ACTIVITY_REQUEST_ID}&activityAnalysisRun=${ACTIVITY_RUN_ID}`,
});
it('retains a private question only across exact citation and log-page navigation', () => {
  const retains = activityQuestionRetainsNavigation(
    ACTIVITY_REQUEST_ID,
    ACTIVITY_RUN_ID,
  );
  expect(
    retains(current(), {
      ...current(),
      search: `${current().search}&activityEvent=${ACTIVITY_EVENT_ID}`,
    }),
  ).toBe(true);
  expect(
    retains(current(), {
      ...current(),
      search: `${current().search}&activityCursor=older-page`,
    }),
  ).toBe(true);
});
it.each([
  ['activityFrom', '2026-10-25'],
  ['view', 'planner'],
  ['activityAssistant', ACTIVITY_EVENT_ID],
  ['activityAnalysisRequest', ACTIVITY_EVENT_ID],
  ['activityAnalysis', 'history'],
  ['unrelated', 'new'],
])(
  'guards a change to %s rather than carrying a question into another scope',
  (key, value) => {
    const params = new URLSearchParams(current().search);
    params.set(key, value);
    expect(
      activityQuestionRetainsNavigation(ACTIVITY_REQUEST_ID, ACTIVITY_RUN_ID)(
        current(),
        { pathname: '/delivery', search: `?${params}` },
      ),
    ).toBe(false);
  },
);
it('rejects malformed or incomplete request and citation links', () => {
  expect(
    readActivityAnalysisNavigation(
      new URLSearchParams('activityAnalysis=prepare'),
    ).valid,
  ).toBe(false);
  expect(
    readActivityAnalysisNavigation(new URLSearchParams('activityEvent=invalid'))
      .valid,
  ).toBe(false);
  expect(
    readActivityAnalysisNavigation(
      new URLSearchParams(`activityAnalysisRequest=${ACTIVITY_REQUEST_ID}`),
    ).valid,
  ).toBe(false);
});
it('closes analysis without removing applied filters or an exact event', () => {
  const result = activityAnalysisDestination(
    new URLSearchParams(
      `${current().search}&activityEvent=${ACTIVITY_EVENT_ID}`,
    ),
    activityAnalysisClose,
  );
  const params = new URLSearchParams(result.search);
  expect(params.get('activityFrom')).toBe('2026-10-26');
  expect(params.get('activityEvent')).toBe(ACTIVITY_EVENT_ID);
  expect(params.has('activityAnalysisRequest')).toBe(false);
});
it('uses explicit inclusive day filters as a UTC range without the visible log cursor', () => {
  const input = activityAnalysisScope(
    readActivityFilters(
      new URLSearchParams(`${current().search}&activityCursor=older-page`),
    ),
  );
  expect(input).toEqual({
    personId: null,
    projectId: null,
    clientId: null,
    category: null,
    action: null,
    outcome: null,
    from: '2026-10-26T00:00:00.000Z',
    through: '2026-11-02T00:00:00.000Z',
  });
  expect(
    activityAnalysisScope(
      readActivityFilters(
        new URLSearchParams(
          'activityFrom=2026-02-30&activityThrough=2026-03-01',
        ),
      ),
    ),
  ).toBeNull();
  expect(
    activityAnalysisScope(readActivityFilters(new URLSearchParams())),
  ).toBeNull();
});
it('proposes seven inclusive UTC dates across month boundaries', () => {
  expect(lastSevenActivityDays(new Date('2026-11-01T01:00:00.000Z'))).toEqual({
    from: '2026-10-26',
    through: '2026-11-01',
  });
});

it('retains the question through a current-task reader while keeping all analysis filters fixed', () => {
  const next = {
    ...current(),
    search: `${current().search}&activityCurrentTask=${ACTIVITY_EVENT_ID}&activityCurrentPerson=${ACTIVITY_AGENT_ID}`,
  };
  expect(
    activityQuestionRetainsNavigation(ACTIVITY_REQUEST_ID, ACTIVITY_RUN_ID)(
      current(),
      next,
    ),
  ).toBe(true);
  expect(
    readActivityAnalysisNavigation(new URLSearchParams(next.search))
      .currentTaskScope.personId,
  ).toBe(ACTIVITY_AGENT_ID);
});

it('rejects mixed or malformed exact reader scopes rather than widening navigation retention', () => {
  expect(
    readActivityAnalysisNavigation(
      new URLSearchParams(
        `activityCurrentTask=${ACTIVITY_EVENT_ID}&activityEvent=${ACTIVITY_RUN_ID}`,
      ),
    ).valid,
  ).toBe(false);
  expect(
    readActivityAnalysisNavigation(
      new URLSearchParams(
        `activityCurrentTask=${ACTIVITY_EVENT_ID}&activityCurrentPerson=invalid`,
      ),
    ).valid,
  ).toBe(false);
  expect(
    readActivityAnalysisNavigation(
      new URLSearchParams(`activityCurrentPerson=${ACTIVITY_AGENT_ID}`),
    ).valid,
  ).toBe(false);
});
