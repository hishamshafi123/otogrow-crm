import { useState } from 'react';
import { fastDeepEqual } from 'twenty-shared/utils';
import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link, useSearchParams } from 'react-router-dom';
import { type DeliveryAssistantQuery } from '~/generated-metadata/graphql';
import { GET_ASSISTANT } from '@/delivery/assistants/delivery-assistants.graphql';
import { assistantDestination } from '@/delivery/assistants/assistant-navigation';
import {
  type AssistantSummary,
  type AssistantContext,
} from '@/delivery/assistants/assistant.types';
import { type useAssistantContext } from '@/delivery/assistants/useAssistantContext';
import { type useAssistantCommands } from '@/delivery/assistants/useAssistantCommands';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { AssistantPreparation } from '@/delivery/assistants/AssistantPreparation';
import { StyledAssistantBoundary } from '@/delivery/assistants/assistantStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

export const AssistantSelection = ({
  state,
  commands,
  agentId,
  taskId,
  requestId,
  newRequest,
  consumeRequestIntent,
  editActionRef,
  prepare,
  openRun,
}: {
  state: ReturnType<typeof useAssistantContext>;
  commands: ReturnType<typeof useAssistantCommands>;
  agentId: string;
  taskId: string | null;
  requestId: string | null;
  newRequest: string | null;
  consumeRequestIntent: () => void;
  editActionRef: (element: HTMLAnchorElement | null) => void;
  prepare: () => void;
  openRun: (id: string) => void;
}) => {
  const { t } = useLingui();
  const [params] = useSearchParams();
  const source = `${state.scope}:${agentId}:${taskId}`;
  const query = useQuery<DeliveryAssistantQuery>(GET_ASSISTANT, {
    variables: { input: { agentId, taskId }, identity: source },
    fetchPolicy: 'no-cache',
    pollInterval: 30000,
    notifyOnNetworkStatusChange: true,
    skip: state.data === null,
  });
  const reading = useAssistantRead({
    value: query.data?.deliveryAssistant,
    source,
    enabled: state.data !== null,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches: (value) =>
      state.permission.matches(value) && value.assistant.id === agentId,
  });
  const [retained, setRetained] = useState<{
    assistant: AssistantSummary;
    task: AssistantContext['selectedTask'];
  } | null>(null);
  if (
    reading.data &&
    state.data &&
    !fastDeepEqual(retained, {
      assistant: reading.data.assistant,
      task: state.data.selectedTask,
    })
  )
    setRetained({
      assistant: reading.data.assistant,
      task: state.data.selectedTask,
    });
  const available = reading.data !== null && state.data !== null;
  const current = reading.data?.assistant;
  return (
    <StyledDeliveryCard aria-label={t`Selected assistant`}>
      <StyledDeliveryStack>
        <Link
          to={assistantDestination(params, {
            assistant: null,
            assistantRequest: null,
            assistantEdit: null,
          })}
        >
          <Trans>Close selected assistant</Trans>
        </Link>
        <StyledDeliveryButton
          type="button"
          onClick={() => void query.refetch().catch(() => undefined)}
        >
          <Trans>Refresh selected assistant</Trans>
        </StyledDeliveryButton>
        {!available ? (
          <p role="status">
            {query.error
              ? t`This exact assistant could not be verified.`
              : t`Checking the selected assistant…`}
          </p>
        ) : (
          <>
            <h3>{current?.name}</h3>
            <p>{current?.purpose}</p>
            {state.canConfigure && params.get('assistantEdit') !== '1' && (
              <Link
                ref={editActionRef}
                to={assistantDestination(params, {
                  assistantEdit: '1',
                  assistantRequest: null,
                })}
              >
                <Trans>Edit assistant</Trans>
              </Link>
            )}
            {taskId === null ? (
              <>
                <p>
                  <Trans>
                    Choose a permitted task to prepare a run. The assistant
                    stays selected.
                  </Trans>
                </p>
                <Link
                  to={assistantDestination(params, {
                    assistantPickTask: '1',
                    assistantEdit: null,
                  })}
                >
                  <Trans>Choose task for this assistant</Trans>
                </Link>
              </>
            ) : current?.canRun ? (
              requestId === null && (
                <StyledDeliveryButton type="button" onClick={prepare}>
                  <Trans>Prepare one run</Trans>
                </StyledDeliveryButton>
              )
            ) : (
              <p role="status">
                <Trans>
                  This assistant is currently unavailable for new runs on this
                  task. Existing run history remains available.
                </Trans>
              </p>
            )}
          </>
        )}
        <StyledAssistantBoundary
          hidden={!available}
          inert={!available ? true : undefined}
          disabled={!available}
        >
          {requestId && retained?.task && (
            <AssistantPreparation
              key={requestId}
              state={state}
              commands={commands}
              assistant={current ?? { ...retained.assistant, canRun: false }}
              requestId={requestId}
              task={retained.task}
              newIntent={newRequest === requestId}
              consumeRequestIntent={consumeRequestIntent}
              openRun={openRun}
            />
          )}
        </StyledAssistantBoundary>
      </StyledDeliveryStack>
    </StyledDeliveryCard>
  );
};
