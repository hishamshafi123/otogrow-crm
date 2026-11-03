import { useQuery } from '@apollo/client/react';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import {
  matchesActivityIdentity,
  type ActivityIdentity,
  type useActivityContext,
} from '@/otogrow-activity/useActivityContext';
import {
  GET_ACTIVITY_ANALYSIS_RUN_STATE,
  GET_ACTIVITY_ANALYSIS_RUN,
} from '@/otogrow-activity/analysis/activity-analysis.graphql';
import {
  type OtogrowActivityAnalysisRunStateQuery,
  type OtogrowActivityAnalysisRunQuery,
} from '~/generated-metadata/graphql';

export const useActivityAnalysisRun = (
  state: ReturnType<typeof useActivityContext>,
  id: string,
  enabled: boolean,
) => {
  const source = `${state.source}:${id}`;
  const matches = (value: ActivityIdentity & { run: { id: string } }) =>
    matchesActivityIdentity(state, value) && value.run.id === id;
  const query = useQuery<OtogrowActivityAnalysisRunStateQuery>(
    GET_ACTIVITY_ANALYSIS_RUN_STATE,
    {
      variables: { input: { id }, identity: source },
      fetchPolicy: 'no-cache',
      notifyOnNetworkStatusChange: true,
      pollInterval: 5000,
      skip: !enabled,
    },
  );
  const reading = useAssistantRead({
    value: query.data?.otogrowActivityAnalysisRunState,
    source,
    enabled,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches,
  });
  const terminal =
    reading.data !== null &&
    ['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(reading.data.run.status);
  const detailQuery = useQuery<OtogrowActivityAnalysisRunQuery>(
    GET_ACTIVITY_ANALYSIS_RUN,
    {
      variables: { input: { id }, identity: source },
      fetchPolicy: 'no-cache',
      notifyOnNetworkStatusChange: true,
      skip: !enabled || !terminal,
    },
  );
  const summary = reading.data?.run;
  const detail = useAssistantRead({
    value: detailQuery.data?.otogrowActivityAnalysisRun,
    source,
    enabled: enabled && terminal,
    loading: detailQuery.loading,
    error: detailQuery.error,
    networkStatus: detailQuery.networkStatus,
    matches: (value) =>
      matches(value) &&
      summary !== undefined &&
      value.run.revision === summary.revision &&
      value.run.bodyFingerprint === summary.bodyFingerprint &&
      value.run.contextFingerprint === summary.contextFingerprint,
  });
  return {
    ...reading,
    query,
    detail: detail.data,
    detailQuery,
    denied:
      isOtogrowAccessDenied(query.error) ||
      isOtogrowAccessDenied(detailQuery.error),
  };
};
