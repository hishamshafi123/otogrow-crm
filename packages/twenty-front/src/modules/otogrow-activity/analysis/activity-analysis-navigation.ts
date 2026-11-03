import { fastDeepEqual, isValidUuid } from 'twenty-shared/utils';
import { type DeliveryDraftNavigationRetention } from '@/delivery/drafts/DeliveryDraftGuard';

export const ACTIVITY_ANALYSIS_PARAMETERS = [
  'activityAnalysis',
  'activityAssistant',
  'activityAnalysisRequest',
  'activityAnalysisRun',
  'activityAnalysisCancel',
  'activityAnalysisAfter',
] as const;

export const activityAnalysisDestination = (
  params: URLSearchParams,
  changes: Record<string, string | null>,
) => {
  const next = new URLSearchParams(params);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) next.delete(key);
    else next.set(key, value);
  }
  return { pathname: '/delivery', search: `?${next}` };
};

export const activityAnalysisClose = Object.fromEntries(
  ACTIVITY_ANALYSIS_PARAMETERS.map((key) => [key, null]),
);
export const ACTIVITY_CURRENT_TASK_PARAMETERS = [
  'activityCurrentTask',
  'activityCurrentPerson',
  'activityCurrentProject',
  'activityCurrentClient',
] as const;
export const activityCurrentTaskClose = Object.fromEntries(
  ACTIVITY_CURRENT_TASK_PARAMETERS.map((key) => [key, null]),
);

export const readActivityAnalysisNavigation = (params: URLSearchParams) => {
  const view = params.get('activityAnalysis');
  const assistantId = params.get('activityAssistant');
  const requestId = params.get('activityAnalysisRequest');
  const runId = params.get('activityAnalysisRun');
  const cancelRequestId = params.get('activityAnalysisCancel');
  const after = params.get('activityAnalysisAfter');
  const eventId = params.get('activityEvent');
  const currentTaskId = params.get('activityCurrentTask');
  const currentTaskScope = {
    personId: params.get('activityCurrentPerson'),
    projectId: params.get('activityCurrentProject'),
    clientId: params.get('activityCurrentClient'),
  };
  const valid =
    (view === null || ['assistants', 'prepare', 'history'].includes(view)) &&
    [
      assistantId,
      requestId,
      runId,
      cancelRequestId,
      eventId,
      currentTaskId,
      ...Object.values(currentTaskScope),
    ].every((value) => value === null || isValidUuid(value)) &&
    (!requestId || Boolean(runId)) &&
    (!cancelRequestId || Boolean(runId)) &&
    !(eventId && currentTaskId) &&
    (currentTaskId !== null ||
      Object.values(currentTaskScope).every((value) => value === null)) &&
    (view !== 'prepare' || Boolean(assistantId && requestId && runId)) &&
    (after === null || (after.length > 0 && after.length <= 4000));
  return {
    valid,
    view,
    assistantId,
    requestId,
    runId,
    cancelRequestId,
    after,
    eventId,
    currentTaskId,
    currentTaskScope,
  };
};

const stableQuestionParameters = (search: string) =>
  [...new URLSearchParams(search)]
    .filter(
      ([key]) =>
        ![
          'activityEvent',
          'activityCursor',
          ...ACTIVITY_CURRENT_TASK_PARAMETERS,
        ].includes(key),
    )
    .sort(
      ([leftKey, leftValue], [rightKey, rightValue]) =>
        leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue),
    );

export const activityQuestionRetainsNavigation =
  (
    requestId: string,
    runId: string,
    requestParameter:
      | 'activityAnalysisRequest'
      | 'activityAnalysisCancel' = 'activityAnalysisRequest',
  ): DeliveryDraftNavigationRetention =>
  (current, next) => {
    const currentParams = new URLSearchParams(current.search);
    const nextParams = new URLSearchParams(next.search);
    return (
      current.pathname === '/delivery' &&
      next.pathname === current.pathname &&
      currentParams.get('view') === 'activity' &&
      currentParams.get(requestParameter) === requestId &&
      currentParams.get('activityAnalysisRun') === runId &&
      [requestId, runId].every(isValidUuid) &&
      readActivityAnalysisNavigation(nextParams).valid &&
      fastDeepEqual(
        stableQuestionParameters(current.search),
        stableQuestionParameters(next.search),
      )
    );
  };
