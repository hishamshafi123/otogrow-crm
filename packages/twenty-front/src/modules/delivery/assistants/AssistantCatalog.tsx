import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link, useSearchParams } from 'react-router-dom';
import { type DeliveryAssistantCatalogQuery } from '~/generated-metadata/graphql';
import { GET_ASSISTANT_CATALOG } from '@/delivery/assistants/delivery-assistants.graphql';
import { assistantDestination } from '@/delivery/assistants/assistant-navigation';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { type useAssistantContext } from '@/delivery/assistants/useAssistantContext';
import { useAssistantLabels } from '@/delivery/assistants/useAssistantLabels';
import { StyledAssistantItem } from '@/delivery/assistants/assistantStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryGrid,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

export const AssistantCatalog = ({
  state,
  taskId,
}: {
  state: ReturnType<typeof useAssistantContext>;
  taskId: string | null;
}) => {
  const { t } = useLingui();
  const labels = useAssistantLabels();
  const [params, setParams] = useSearchParams();
  const input = {
    taskId,
    search: params.get('assistantSearch'),
    kind: params.get('assistantKind'),
    enabled:
      params.get('assistantEnabled') === 'yes'
        ? true
        : params.get('assistantEnabled') === 'no'
          ? false
          : null,
    after: params.get('assistantAfter'),
    limit: 25,
  };
  const source = `${state.scope}:${JSON.stringify(input)}`;
  const query = useQuery<DeliveryAssistantCatalogQuery>(GET_ASSISTANT_CATALOG, {
    variables: { input, identity: source },
    fetchPolicy: 'no-cache',
    pollInterval: 30000,
    notifyOnNetworkStatusChange: true,
    skip: state.data === null,
  });
  const { data, refreshing } = useAssistantRead({
    value: query.data?.deliveryAssistantCatalog,
    source,
    enabled: state.data !== null,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches: state.permission.matches,
  });
  return (
    <section aria-label={t`Assistant catalog`}>
      <StyledDeliveryStack>
        <StyledDeliveryRow>
          <form
            key={`${input.search}:${input.kind}:${input.enabled}`}
            onSubmit={(event) => {
              event.preventDefault();
              const values = new FormData(event.currentTarget);
              const next = new URLSearchParams(params);
              for (const [name, key] of [
                ['search', 'assistantSearch'],
                ['kind', 'assistantKind'],
                ['enabled', 'assistantEnabled'],
              ]) {
                const value = String(values.get(name) ?? '');
                if (value) next.set(key, value);
                else next.delete(key);
              }
              next.delete('assistantAfter');
              setParams(next);
            }}
          >
            <details>
              <summary>
                <Trans>Filter assistants</Trans>
              </summary>
              <StyledDeliveryGrid>
                <label>
                  <Trans>Search assistants</Trans>
                  <input
                    name="search"
                    maxLength={200}
                    defaultValue={input.search ?? ''}
                  />
                </label>
                <label>
                  <Trans>Workflow</Trans>
                  <select
                    aria-label={t`Workflow`}
                    name="kind"
                    defaultValue={input.kind ?? ''}
                  >
                    <option value="">{t`All workflows`}</option>
                    {['BRIEF', 'COPY', 'SEO', 'ADVERTISING', 'ACTIVITY'].map(
                      (kind) => (
                        <option key={kind} value={kind}>
                          {labels.kind(kind)}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label>
                  <Trans>New run access</Trans>
                  <select
                    aria-label={t`New run access`}
                    name="enabled"
                    defaultValue={params.get('assistantEnabled') ?? ''}
                  >
                    <option value="">{t`Enabled and disabled`}</option>
                    <option value="yes">{t`Enabled`}</option>
                    <option value="no">{t`Disabled`}</option>
                  </select>
                </label>
              </StyledDeliveryGrid>
              <StyledDeliveryButton type="submit">
                <Trans>Apply assistant filters</Trans>
              </StyledDeliveryButton>
            </details>
          </form>
          <StyledDeliveryButton
            type="button"
            onClick={() => void query.refetch().catch(() => undefined)}
          >
            <Trans>Refresh assistants</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryRow>
        {refreshing && data && (
          <p role="status">
            <Trans>Refreshing assistants…</Trans>
          </p>
        )}
        {data ? (
          <>
            <p>{t`Showing ${data.items.length} of ${data.totalCount} matching assistants.`}</p>
            {data.items.map((assistant) => (
              <StyledAssistantItem key={assistant.id}>
                <h3>
                  <Link
                    to={assistantDestination(params, {
                      assistant: assistant.id,
                      assistantEdit: null,
                      assistantCreate: null,
                      assistantRequest: null,
                    })}
                  >
                    {assistant.name}
                  </Link>
                </h3>
                <p>{assistant.purpose}</p>
                <p>
                  {labels.kind(assistant.kind)} ·{' '}
                  {assistant.enabled
                    ? t`Enabled for new runs`
                    : t`Disabled for new runs`}{' '}
                  · {t`Version ${assistant.version}`}
                </p>
                {taskId !== null && !assistant.canRun && (
                  <p>
                    <Trans>
                      This assistant is not currently permitted for this task.
                      Saved run history remains separate.
                    </Trans>
                  </p>
                )}
              </StyledAssistantItem>
            ))}
            {data.nextCursor && (
              <Link
                to={assistantDestination(params, {
                  assistantAfter: data.nextCursor,
                })}
              >
                <Trans>More assistants</Trans>
              </Link>
            )}
          </>
        ) : (
          <p role="status">
            {query.error
              ? t`The assistant catalog could not be verified.`
              : t`Loading assistants…`}
          </p>
        )}
        {(query.error || params.has('assistantAfter')) && (
          <Link to={assistantDestination(params, { assistantAfter: null })}>
            <Trans>First assistant page</Trans>
          </Link>
        )}
      </StyledDeliveryStack>
    </section>
  );
};
