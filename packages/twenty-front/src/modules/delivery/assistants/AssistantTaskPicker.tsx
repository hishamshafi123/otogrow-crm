import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link, useSearchParams } from 'react-router-dom';
import { type DeliveryAssistantTaskChoicesQuery } from '~/generated-metadata/graphql';
import { GET_ASSISTANT_TASK_CHOICES } from '@/delivery/assistants/delivery-assistants.graphql';
import { assistantDestination } from '@/delivery/assistants/assistant-navigation';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { type useAssistantContext } from '@/delivery/assistants/useAssistantContext';
import { detectTimeZone } from '@/localization/utils/detection/detectTimeZone';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

export const AssistantTaskPicker = ({
  state,
}: {
  state: ReturnType<typeof useAssistantContext>;
}) => {
  const { t } = useLingui();
  const [params, setParams] = useSearchParams();
  const input = {
    view: state.permission.manager ? 'HOME' : 'MINE',
    timezone: detectTimeZone(),
    search: params.get('assistantTaskSearch'),
    after: params.get('assistantTasksAfter'),
    limit: 25,
  };
  const source = `${state.scope}:${JSON.stringify(input)}`;
  const query = useQuery<DeliveryAssistantTaskChoicesQuery>(
    GET_ASSISTANT_TASK_CHOICES,
    {
      variables: { input, identity: source },
      fetchPolicy: 'no-cache',
      notifyOnNetworkStatusChange: true,
      skip: state.data === null,
    },
  );
  const { data } = useAssistantRead({
    value: query.data?.deliveryTaskList,
    source,
    enabled: state.data !== null,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches: state.permission.matches,
  });
  return (
    <section aria-label={t`Choose a task`}>
      <StyledDeliveryStack>
        <form
          key={input.search ?? ''}
          onSubmit={(event) => {
            event.preventDefault();
            const values = new FormData(event.currentTarget);
            const next = new URLSearchParams(params);
            next.set('assistantTaskSearch', String(values.get('search') ?? ''));
            next.delete('assistantTasksAfter');
            setParams(next);
          }}
        >
          <label>
            <Trans>Search permitted tasks</Trans>
            <input
              name="search"
              defaultValue={params.get('assistantTaskSearch') ?? ''}
              maxLength={200}
            />
          </label>
          <StyledDeliveryButton type="submit">
            <Trans>Search tasks</Trans>
          </StyledDeliveryButton>
        </form>
        {data ? (
          <>
            <p>{t`Showing ${data.items.length} of ${data.totalCount} matching tasks.`}</p>
            <ul>
              {data.items.map((task) => (
                <li key={task.id}>
                  <Link
                    to={assistantDestination(params, {
                      task: task.id,
                      assistantPickTask: null,
                      assistantTasksAfter: null,
                      assistantRequest: null,
                      assistantEdit: null,
                    })}
                  >
                    {task.title} · {task.projectName}
                  </Link>
                </li>
              ))}
            </ul>
            {data.nextCursor && (
              <Link
                to={assistantDestination(params, {
                  assistantTasksAfter: data.nextCursor,
                })}
              >
                <Trans>More tasks</Trans>
              </Link>
            )}
          </>
        ) : (
          <p role="status">
            {query.error
              ? t`Tasks could not be verified.`
              : t`Loading permitted tasks…`}
          </p>
        )}
        {(query.error || params.has('assistantTasksAfter')) && (
          <Link
            to={assistantDestination(params, { assistantTasksAfter: null })}
          >
            <Trans>First task page</Trans>
          </Link>
        )}
        <StyledDeliveryButton
          type="button"
          onClick={() => void query.refetch().catch(() => undefined)}
        >
          <Trans>Refresh tasks</Trans>
        </StyledDeliveryButton>
      </StyledDeliveryStack>
    </section>
  );
};
