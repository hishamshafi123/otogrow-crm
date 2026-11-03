import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link, useSearchParams } from 'react-router-dom';
import { fastDeepEqual } from 'twenty-shared/utils';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { type useKnowledgeContext } from '@/delivery/knowledge/useKnowledgeContext';
import { GET_KNOWLEDGE_LIST } from '@/delivery/knowledge/knowledge-read.graphql';
import {
  knowledgeDestination,
  knowledgeCloseSelection,
} from '@/delivery/knowledge/knowledge-navigation';
import { useKnowledgeCategories } from '@/delivery/knowledge/useKnowledgeCategories';
import { StyledKnowledgeItem } from '@/delivery/knowledge/knowledgeStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { type DeliveryKnowledgeListQuery } from '~/generated-metadata/graphql';

export const KnowledgeList = ({
  state,
  projectId,
}: {
  state: ReturnType<typeof useKnowledgeContext>;
  projectId: string;
}) => {
  const { t } = useLingui();
  const categories = useKnowledgeCategories();
  const [params, setParams] = useSearchParams();
  const input = {
    projectId,
    search: params.get('knowledgeSearch'),
    category: params.get('knowledgeCategory'),
    after: params.get('knowledgeAfter'),
    limit: 25,
  };
  const source = `${state.scope}:${JSON.stringify(input)}`;
  const query = useQuery<DeliveryKnowledgeListQuery>(GET_KNOWLEDGE_LIST, {
    variables: { input, identity: source },
    skip: state.data === null,
    fetchPolicy: 'no-cache',
    pollInterval: 30000,
    notifyOnNetworkStatusChange: true,
  });
  const reading = useAssistantRead({
    value: query.data?.deliveryKnowledgeList,
    source,
    enabled: state.data !== null,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches: (value) =>
      state.permission.matches(value) &&
      value.project.id === projectId &&
      value.project.revision === state.data?.selectedProject?.revision &&
      fastDeepEqual(value.actor, state.data?.actor),
  });
  return (
    <section aria-label={t`Brand knowledge sources`}>
      <StyledDeliveryStack>
        <form
          key={`${input.search}:${input.category}`}
          onSubmit={(event) => {
            event.preventDefault();
            const values = new FormData(event.currentTarget);
            setParams(
              knowledgeDestination(params, {
                knowledgeSearch:
                  String(values.get('search') ?? '').trim() || null,
                knowledgeCategory: String(values.get('category') ?? '') || null,
                knowledgeAfter: null,
              }).split('?')[1],
            );
          }}
        >
          <details open={Boolean(input.search || input.category)}>
            <summary>
              <Trans>Filter brand knowledge</Trans>
            </summary>
            <StyledDeliveryRow>
              <label>
                <Trans>Find title or reviewed text</Trans>
                <input
                  name="search"
                  maxLength={160}
                  defaultValue={input.search ?? ''}
                />
              </label>
              <label>
                <Trans>Filter category</Trans>
                <select name="category" defaultValue={input.category ?? ''}>
                  <option value="">{t`All knowledge`}</option>
                  {categories.map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </label>
              <StyledDeliveryButton type="submit">
                <Trans>Search knowledge</Trans>
              </StyledDeliveryButton>
            </StyledDeliveryRow>
          </details>
        </form>
        {reading.data ? (
          <>
            <p>{t`Showing ${reading.data.items.length} of ${reading.data.totalCount} matching sources.`}</p>
            {reading.data.items.map((item) => (
              <StyledKnowledgeItem key={item.id}>
                <h3>
                  <Link
                    data-knowledge-source={item.id}
                    to={knowledgeDestination(params, {
                      ...knowledgeCloseSelection,
                      source: item.id,
                    })}
                  >
                    {item.title}
                  </Link>
                </h3>
                <p>
                  {categories.find(
                    (category) => category.value === item.category,
                  )?.label ?? item.category}{' '}
                  · {item.meetingDate} ·{' '}
                  {item.publishedVersion
                    ? t`Published version ${item.publishedVersion}`
                    : t`Draft — not used by agents`}
                  {item.publishedVersion &&
                  item.version !== item.publishedVersion
                    ? ` · ${t`New draft awaiting review`}`
                    : ''}
                </p>
              </StyledKnowledgeItem>
            ))}
            {reading.data.totalCount === 0 && (
              <p>
                <Trans>
                  No knowledge matches this view. Clear the filters or add a
                  source.
                </Trans>
              </p>
            )}
            {reading.data.nextCursor && (
              <Link
                to={knowledgeDestination(params, {
                  knowledgeAfter: reading.data.nextCursor,
                })}
              >
                <Trans>Next sources</Trans>
              </Link>
            )}
          </>
        ) : (
          <p role={query.error ? 'alert' : 'status'}>
            {query.error
              ? t`Knowledge sources could not be verified. Retry or return to the first page.`
              : t`Loading brand knowledge…`}
          </p>
        )}
        <StyledDeliveryRow>
          {(input.after || query.error) && (
            <Link to={knowledgeDestination(params, { knowledgeAfter: null })}>
              <Trans>First knowledge page</Trans>
            </Link>
          )}
          {(input.search || input.category) && (
            <Link
              to={knowledgeDestination(params, {
                knowledgeSearch: null,
                knowledgeCategory: null,
                knowledgeAfter: null,
              })}
            >
              <Trans>Clear knowledge filters</Trans>
            </Link>
          )}
          <StyledDeliveryButton
            type="button"
            onClick={() => void query.refetch().catch(() => undefined)}
          >
            <Trans>Refresh knowledge list</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryRow>
      </StyledDeliveryStack>
    </section>
  );
};
