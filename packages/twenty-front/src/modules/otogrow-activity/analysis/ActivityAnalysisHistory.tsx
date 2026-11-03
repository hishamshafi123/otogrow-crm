import { useLayoutEffect } from 'react';
import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { formatActivityTime } from '@/otogrow-activity/ActivityEvent';
import {
  matchesActivityIdentity,
  type useActivityContext,
} from '@/otogrow-activity/useActivityContext';
import { GET_ACTIVITY_ANALYSIS_RUNS } from '@/otogrow-activity/analysis/activity-analysis.graphql';
import { useActivityAnalysisLabels } from '@/otogrow-activity/analysis/useActivityAnalysisLabels';
import { type OtogrowActivityAnalysisRunsQuery } from '~/generated-metadata/graphql';

export const ActivityAnalysisHistory = ({
  state,
  after,
  enabled,
  onAuthorityLost,
  onPage,
  onOpenRun,
}: {
  state: ReturnType<typeof useActivityContext>;
  after: string | null;
  enabled: boolean;
  onAuthorityLost: () => void;
  onPage: (after: string | null) => void;
  onOpenRun: (id: string) => void;
}) => {
  const { t } = useLingui();
  const labels = useActivityAnalysisLabels();
  const source = `${state.source}:${after ?? ''}`;
  const query = useQuery<OtogrowActivityAnalysisRunsQuery>(
    GET_ACTIVITY_ANALYSIS_RUNS,
    {
      variables: { input: { after, limit: 25 }, identity: source },
      fetchPolicy: 'no-cache',
      notifyOnNetworkStatusChange: true,
      skip: !enabled,
    },
  );
  const reading = useAssistantRead({
    value: query.data?.otogrowActivityAnalysisRuns,
    source,
    enabled,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches: (value) => matchesActivityIdentity(state, value),
  });
  const denied = isOtogrowAccessDenied(query.error);
  useLayoutEffect(() => {
    if (denied) onAuthorityLost();
  }, [denied, onAuthorityLost]);
  return (
    <section aria-label={t`Saved work analyses`}>
      <StyledDeliveryStack>
        <h3>
          <Trans>Saved work analyses</Trans>
        </h3>
        <p>
          <Trans>
            Each answer has its own saved filters and evidence time. Opening it
            does not make historical findings current.
          </Trans>
        </p>
        {reading.data ? (
          <>
            <p>{t`Showing ${reading.data.items.length} of ${reading.data.totalCount} saved analyses.`}</p>
            {reading.data.items.map((run) => (
              <article key={run.id}>
                <strong>
                  {run.agent.name} · {labels.status(run.status)}
                </strong>
                <p>
                  {run.initiatorName} ·{' '}
                  <time dateTime={run.createdAt}>
                    {formatActivityTime(run.createdAt)}
                  </time>
                </p>
                <p>{t`${run.includedCount} included events · ${run.omittedCount} omitted`}</p>
                <StyledDeliveryButton
                  type="button"
                  onClick={() => onOpenRun(run.id)}
                >
                  <Trans>Open work analysis</Trans>
                </StyledDeliveryButton>
              </article>
            ))}
            {reading.data.totalCount === 0 && (
              <p>
                <Trans>
                  No saved work analyses yet. Recorded activity remains
                  available without an AI model.
                </Trans>
              </p>
            )}
            {reading.data.nextCursor && (
              <StyledDeliveryButton
                type="button"
                onClick={() => onPage(reading.data?.nextCursor ?? null)}
              >
                <Trans>More analyses</Trans>
              </StyledDeliveryButton>
            )}
          </>
        ) : (
          <p role={query.error ? 'alert' : 'status'}>
            {query.error
              ? t`Saved analyses could not be verified. Retry or return to the first page.`
              : t`Loading saved analyses…`}
          </p>
        )}
        <StyledDeliveryRow>
          {(after || query.error) && (
            <StyledDeliveryButton type="button" onClick={() => onPage(null)}>
              <Trans>First analysis page</Trans>
            </StyledDeliveryButton>
          )}
          <StyledDeliveryButton
            type="button"
            disabled={!enabled || query.loading}
            onClick={() => void query.refetch().catch(() => undefined)}
          >
            <Trans>Refresh saved analyses</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryRow>
      </StyledDeliveryStack>
    </section>
  );
};
