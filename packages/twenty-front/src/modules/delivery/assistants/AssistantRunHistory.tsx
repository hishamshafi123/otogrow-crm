import { useEffect } from 'react';
import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link, useSearchParams } from 'react-router-dom';
import { type DeliveryAssistantRunsQuery } from '~/generated-metadata/graphql';
import { GET_ASSISTANT_RUNS } from '@/delivery/assistants/delivery-assistants.graphql';
import { assistantDestination } from '@/delivery/assistants/assistant-navigation';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { useAssistantVisibility } from '@/delivery/assistants/useAssistantVisibility';
import { type useAssistantContext } from '@/delivery/assistants/useAssistantContext';
import { useAssistantLabels } from '@/delivery/assistants/useAssistantLabels';
import { StyledAssistantItem } from '@/delivery/assistants/assistantStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryGrid,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

export const AssistantRunHistory = ({
  state,
  taskId,
}: {
  state: ReturnType<typeof useAssistantContext>;
  taskId: string | null;
}) => {
  const { t } = useLingui();
  const labels = useAssistantLabels();
  const visibility = useAssistantVisibility();
  const [params, setParams] = useSearchParams();
  const input = {
    taskId,
    projectId: params.get('assistantProject'),
    agentId: params.get('assistant'),
    status: params.get('assistantStatus'),
    after: params.get('assistantRunsAfter'),
    limit: 25,
  };
  const source = `${state.scope}:${JSON.stringify(input)}`;
  const query = useQuery<DeliveryAssistantRunsQuery>(GET_ASSISTANT_RUNS, {
    variables: { input, identity: source },
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    skip: state.data === null,
  });
  const { data, refreshing } = useAssistantRead({
    value: query.data?.deliveryAssistantRuns,
    source,
    enabled: state.data !== null,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches: state.permission.matches,
  });
  const active =
    data?.items.some((run) =>
      ['QUEUED', 'RUNNING', 'WAITING_REVIEW'].includes(run.status),
    ) === true;
  const { startPolling, stopPolling } = query;
  const hasVerifiedData = state.data !== null;
  useEffect(() => {
    if (visibility.visible && hasVerifiedData)
      startPolling(active ? 5000 : 30000);
    else stopPolling();
    return stopPolling;
  }, [visibility.visible, hasVerifiedData, active, startPolling, stopPolling]);
  return (
    <section aria-label={t`Saved assistant runs`} ref={visibility.attach}>
      <StyledDeliveryStack>
        <StyledDeliveryRow>
          <form
            key={`${input.projectId}:${input.status}`}
            onSubmit={(event) => {
              event.preventDefault();
              const values = new FormData(event.currentTarget);
              const next = new URLSearchParams(params);
              for (const [name, key] of [
                ['project', 'assistantProject'],
                ['status', 'assistantStatus'],
              ]) {
                const value = String(values.get(name) ?? '');
                if (value) next.set(key, value);
                else next.delete(key);
              }
              next.delete('assistantRunsAfter');
              setParams(next);
            }}
          >
            <details>
              <summary>
                <Trans>Filter run history</Trans>
              </summary>
              <StyledDeliveryGrid>
                {state.canConfigure && (
                  <label>
                    <Trans>Project / client</Trans>
                    <select name="project" defaultValue={input.projectId ?? ''}>
                      <option value="">{t`All permitted projects`}</option>
                      {input.projectId &&
                        !state.data?.projects.some(
                          (project) => project.id === input.projectId,
                        ) && (
                          <option
                            value={input.projectId}
                          >{t`Selected project unavailable`}</option>
                        )}
                      {state.data?.projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  <Trans>Run status</Trans>
                  <select
                    aria-label={t`Run status`}
                    name="status"
                    defaultValue={input.status ?? ''}
                  >
                    <option value="">{t`All statuses`}</option>
                    {[
                      'QUEUED',
                      'RUNNING',
                      'WAITING_REVIEW',
                      'SUCCEEDED',
                      'FAILED',
                      'CANCELLED',
                    ].map((status) => (
                      <option key={status} value={status}>
                        {labels.status(status)}
                      </option>
                    ))}
                  </select>
                </label>
              </StyledDeliveryGrid>
              <StyledDeliveryButton type="submit">
                <Trans>Apply run filters</Trans>
              </StyledDeliveryButton>
            </details>
          </form>
          <StyledDeliveryButton
            type="button"
            onClick={() => void query.refetch().catch(() => undefined)}
          >
            <Trans>Refresh run history</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryRow>
        {refreshing && data && (
          <p role="status">
            <Trans>Refreshing run history…</Trans>
          </p>
        )}
        {data ? (
          <>
            <p>{t`Showing ${data.items.length} of ${data.totalCount} matching runs.`}</p>
            <details>
              <summary>
                <Trans>Complete matching status counts</Trans>
              </summary>
              <ul>
                {data.byStatus.map((count) => (
                  <li key={count.status}>
                    {labels.status(count.status)}: {count.count}
                  </li>
                ))}
              </ul>
            </details>
            {data.items.map((run) => (
              <StyledAssistantItem key={run.id}>
                <h3>
                  <Link
                    to={assistantDestination(params, { assistantRun: run.id })}
                  >
                    {run.agentName} · {run.taskTitle}
                  </Link>
                </h3>
                <p>
                  {run.projectName} · {labels.status(run.status)}
                </p>
                <p>
                  {t`Requested ${labels.time(run.createdAt)}`} ·{' '}
                  {t`Assistant version ${run.agentVersion}`}
                </p>
              </StyledAssistantItem>
            ))}
            {data.nextCursor && (
              <Link
                to={assistantDestination(params, {
                  assistantRunsAfter: data.nextCursor,
                })}
              >
                <Trans>Older runs</Trans>
              </Link>
            )}
          </>
        ) : (
          <p role="status">
            {query.error
              ? t`Run history could not be verified.`
              : t`Loading run history…`}
          </p>
        )}
        {(query.error || params.has('assistantRunsAfter')) && (
          <Link to={assistantDestination(params, { assistantRunsAfter: null })}>
            <Trans>First run page</Trans>
          </Link>
        )}
      </StyledDeliveryStack>
    </section>
  );
};
