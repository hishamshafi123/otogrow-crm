import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link, useSearchParams } from 'react-router-dom';
import { fastDeepEqual } from 'twenty-shared/utils';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { type useKnowledgeContext } from '@/delivery/knowledge/useKnowledgeContext';
import { GET_KNOWLEDGE_PROJECTS } from '@/delivery/knowledge/knowledge-read.graphql';
import {
  knowledgeDestination,
  knowledgeCloseSelection,
} from '@/delivery/knowledge/knowledge-navigation';
import { StyledKnowledgeItem } from '@/delivery/knowledge/knowledgeStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { type DeliveryKnowledgeProjectsQuery } from '~/generated-metadata/graphql';

export const KnowledgeProjects = ({
  state,
}: {
  state: ReturnType<typeof useKnowledgeContext>;
}) => {
  const { t } = useLingui();
  const [params, setParams] = useSearchParams();
  const input = {
    search: params.get('knowledgeProjectSearch'),
    after: params.get('knowledgeProjectsAfter'),
    limit: 25,
  };
  const source = `${state.scope}:${JSON.stringify(input)}`;
  const query = useQuery<DeliveryKnowledgeProjectsQuery>(
    GET_KNOWLEDGE_PROJECTS,
    {
      variables: { input, identity: source },
      skip: state.data === null,
      fetchPolicy: 'no-cache',
      pollInterval: 30000,
      notifyOnNetworkStatusChange: true,
    },
  );
  const reading = useAssistantRead({
    value: query.data?.deliveryKnowledgeProjects,
    source,
    enabled: state.data !== null,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches: (value) =>
      state.permission.matches(value) &&
      fastDeepEqual(value.actor, state.data?.actor),
  });
  return (
    <section aria-label={t`Choose a client project`}>
      <StyledDeliveryStack>
        <h2>
          <Trans>Choose a client project</Trans>
        </h2>
        <p>
          <Trans>
            Knowledge is shared only with this project's authorized team and
            task assistants.
          </Trans>
        </p>
        <form
          key={input.search ?? ''}
          onSubmit={(event) => {
            event.preventDefault();
            const search = String(
              new FormData(event.currentTarget).get('search') ?? '',
            ).trim();
            setParams(
              knowledgeDestination(params, {
                knowledgeProjectSearch: search || null,
                knowledgeProjectsAfter: null,
              }).split('?')[1],
            );
          }}
        >
          <StyledDeliveryRow>
            <label>
              <Trans>Find a client project</Trans>
              <input
                name="search"
                maxLength={160}
                defaultValue={input.search ?? ''}
              />
            </label>
            <StyledDeliveryButton type="submit">
              <Trans>Search projects</Trans>
            </StyledDeliveryButton>
          </StyledDeliveryRow>
        </form>
        {reading.data ? (
          <>
            <p>{t`Showing ${reading.data.items.length} of ${reading.data.totalCount} matching projects.`}</p>
            {reading.data.items.map((project) => (
              <StyledKnowledgeItem key={project.id}>
                <Link
                  to={knowledgeDestination(params, {
                    ...knowledgeCloseSelection,
                    project: project.id,
                    knowledgeAfter: null,
                  })}
                >
                  {project.name}
                </Link>
              </StyledKnowledgeItem>
            ))}
            {reading.data.totalCount === 0 && (
              <p>
                <Trans>No permitted projects match this search.</Trans>
              </p>
            )}
            {reading.data.nextCursor && (
              <Link
                to={knowledgeDestination(params, {
                  knowledgeProjectsAfter: reading.data.nextCursor,
                })}
              >
                <Trans>More projects</Trans>
              </Link>
            )}
          </>
        ) : (
          <p role={query.error ? 'alert' : 'status'}>
            {query.error
              ? t`Projects could not be verified. Retry or return to the first page.`
              : t`Loading your projects…`}
          </p>
        )}
        <StyledDeliveryRow>
          {(input.after || query.error) && (
            <Link
              to={knowledgeDestination(params, {
                knowledgeProjectsAfter: null,
              })}
            >
              <Trans>First project page</Trans>
            </Link>
          )}
          <StyledDeliveryButton
            type="button"
            onClick={() => void query.refetch().catch(() => undefined)}
          >
            <Trans>Refresh projects</Trans>
          </StyledDeliveryButton>
          {state.permission.manager && (
            <Link to="/delivery?view=onboarding">
              <Trans>Set up client work</Trans>
            </Link>
          )}
        </StyledDeliveryRow>
      </StyledDeliveryStack>
    </section>
  );
};
