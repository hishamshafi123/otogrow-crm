import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { isValidUuid } from 'twenty-shared/utils';
import { PageBody } from '@/ui/layout/page/components/PageBody';
import { PageContainer } from '@/ui/layout/page/components/PageContainer';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { useAssistantContext } from '@/delivery/assistants/useAssistantContext';
import { useAssistantCommands } from '@/delivery/assistants/useAssistantCommands';
import { assistantDestination } from '@/delivery/assistants/assistant-navigation';
import { AssistantCatalog } from '@/delivery/assistants/AssistantCatalog';
import { AssistantRunHistory } from '@/delivery/assistants/AssistantRunHistory';
import { AssistantRunDetails } from '@/delivery/assistants/AssistantRunDetails';
import { AssistantSelection } from '@/delivery/assistants/AssistantSelection';
import { AssistantConfigurationEditor } from '@/delivery/assistants/AssistantConfigurationEditor';
import { AssistantTaskPicker } from '@/delivery/assistants/AssistantTaskPicker';
import {
  StyledAssistantBoundary,
  StyledAssistantNavigation,
} from '@/delivery/assistants/assistantStyles';
import { type DeliveryAgent } from '@/delivery/delivery-agent.types';
import { DeliveryAiWorkspaceNavigation } from '@/delivery/creative/atlas/DeliveryAiWorkspaceNavigation';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import {
  StyledDeliveryButton,
  StyledDeliveryCanvas,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

const NO_CHANGE = async () => undefined;
export const DeliveryAssistantsPage = () => (
  <PageContainer>
    <PageBody>
      <StyledDeliveryCanvas>
        <DeliveryAssistantsWorkspace />
      </StyledDeliveryCanvas>
    </PageBody>
  </PageContainer>
);

export const DeliveryAssistantsWorkspace = ({
  taskId: fixedTaskId,
  onChanged = NO_CHANGE,
}: {
  taskId?: string;
  onChanged?: () => Promise<unknown>;
}) => {
  const permission = useWorkflowAccess();
  const [params] = useSearchParams();
  const taskId = fixedTaskId ?? params.get('task');
  return (
    <AssistantWorkspace
      key={`${permission.scope}:${taskId ?? 'library'}`}
      taskId={taskId}
      onChanged={onChanged}
      embedded={fixedTaskId !== undefined}
    />
  );
};
const AssistantWorkspace = ({
  taskId,
  onChanged,
  embedded,
}: {
  taskId: string | null;
  onChanged: () => Promise<unknown>;
  embedded: boolean;
}) => {
  const { t } = useLingui();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { requestAction, cancelPendingNavigation } = useDeliveryDraftGuard();
  const agentId = params.get('assistant');
  const runId = params.get('assistantRun');
  const createId = params.get('assistantCreate');
  const requestId = params.get('assistantRequest');
  const editing = params.get('assistantEdit') === '1';
  const valid =
    [
      taskId,
      agentId,
      runId,
      createId,
      requestId,
      params.get('assistantProject'),
    ].every((id) => id === null || isValidUuid(id)) &&
    ['assistantAfter', 'assistantRunsAfter', 'assistantTasksAfter'].every(
      (name) => (params.get(name)?.length ?? 0) <= 2000,
    ) &&
    (params.get('assistantSearch')?.length ?? 0) <= 200 &&
    (params.get('assistantTaskSearch')?.length ?? 0) <= 200 &&
    (params.get('assistantKind') === null ||
      ['BRIEF', 'COPY', 'SEO', 'ADVERTISING', 'ACTIVITY'].includes(
        params.get('assistantKind') ?? '',
      )) &&
    (params.get('assistantEnabled') === null ||
      ['yes', 'no'].includes(params.get('assistantEnabled') ?? '')) &&
    (params.get('assistantStatus') === null ||
      [
        'QUEUED',
        'RUNNING',
        'WAITING_REVIEW',
        'SUCCEEDED',
        'FAILED',
        'CANCELLED',
      ].includes(params.get('assistantStatus') ?? ''));
  const state = useAssistantContext(taskId, valid);
  const commands = useAssistantCommands(state, onChanged);
  const [intent, setIntent] = useState<{
    id: string;
    seed?: DeliveryAgent;
  } | null>(null);
  const releaseCreateIntent = useCallback(
    (id: string) =>
      setIntent((current) => (current?.id === id ? null : current)),
    [],
  );
  // oxlint-disable-next-line twenty/no-state-useref -- The Edit action is recreated when its editor closes, so focus needs its current DOM node.
  const editAction = useRef<HTMLAnchorElement | null>(null);
  const attachEditAction = useCallback((element: HTMLAnchorElement | null) => {
    editAction.current = element;
  }, []);
  const restoreEditAction = useCallback(() => {
    const target = editAction.current;
    if (
      target === null ||
      !target.isConnected ||
      target.closest('[hidden], [inert]')
    )
      return false;
    target.focus();
    return document.activeElement === target;
  }, []);
  const [newRequest, setNewRequest] = useState<string | null>(null);
  const consumeRequestIntent = useCallback(() => setNewRequest(null), []);
  const privateAuthorityLost = useCallback(() => {
    setIntent(null);
    setNewRequest(null);
  }, []);
  const [initialized, setInitialized] = useState(false);
  if (state.data !== null && !initialized) setInitialized(true);
  const [denied, setDenied] = useState(false);
  if (state.denied && !denied) setDenied(true);
  if (state.data !== null && denied) setDenied(false);
  const knownAdminLoss = state.permission.ready && !state.administrator;
  if ((knownAdminLoss || state.denied) && intent !== null) setIntent(null);
  if (state.denied && newRequest !== null) setNewRequest(null);
  const [retainedAdmin, setRetainedAdmin] = useState(state.administrator);
  if (state.permission.ready && retainedAdmin !== state.administrator)
    setRetainedAdmin(state.administrator);
  // oxlint-disable-next-line twenty/no-state-useref -- Confirmed loss must cancel queued navigation before unmounted editor registrations disappear.
  const previousAuthority = useRef<{
    denied: boolean;
    administrator: boolean | null;
  }>({ denied: false, administrator: null });
  useLayoutEffect(() => {
    const previous = previousAuthority.current;
    if (
      (denied && !previous.denied) ||
      (state.permission.ready &&
        previous.administrator === true &&
        !state.administrator)
    ) {
      cancelPendingNavigation();
      setIntent(null);
      setNewRequest(null);
    }
    previousAuthority.current = {
      denied,
      administrator: state.permission.ready
        ? state.administrator
        : previous.administrator,
    };
  }, [
    denied,
    state.permission.ready,
    state.administrator,
    cancelPendingNavigation,
  ]);
  const view =
    params.get('assistantView') === 'history' ? 'history' : 'catalog';
  const openCreate = (seed?: DeliveryAgent) =>
    requestAction(() => {
      const id = crypto.randomUUID();
      setIntent({ id, seed });
      navigate(
        assistantDestination(params, {
          assistantCreate: id,
          assistant: null,
          assistantRequest: null,
          assistantEdit: null,
        }),
      );
    });
  // oxlint-disable-next-line twenty/no-navigate-prefer-link -- A verified command/recovery receipt supplies this destination, and the draft guard controls its continuation.
  const openRun = (id: string) =>
    navigate(
      assistantDestination(params, {
        assistantRun: id,
        assistantRequest: null,
        assistantView: 'history',
      }),
    );
  const retry = () => {
    void state.permission.refetch().catch(() => undefined);
    if (state.permission.ready)
      void state.query.refetch().catch(() => undefined);
  };
  return (
    <StyledDeliveryStack>
      {!embedded && (
        <>
          <StyledDeliveryRow>
            <div>
              <h1>
                <Trans>AI assistants</Trans>
              </h1>
              <p>
                <Trans>
                  Choose a permitted assistant or review a saved run. People
                  confirm all proposed edits.
                </Trans>
              </p>
            </div>
            <Link to="/delivery?view=home">
              <Trans>Back to Today</Trans>
            </Link>
          </StyledDeliveryRow>
          <DeliveryAiWorkspaceNavigation administrator={state.administrator} />
        </>
      )}
      {!valid && (
        <>
          <p role="alert">
            <Trans>
              This assistant link has invalid selections. Clear them before
              continuing.
            </Trans>
          </p>
          <Link
            to={assistantDestination(params, {
              assistant: null,
              assistantRun: null,
              assistantCreate: null,
              assistantRequest: null,
              assistantAfter: null,
              assistantRunsAfter: null,
              assistantProject: null,
              assistantTasksAfter: null,
              assistantEdit: null,
              assistantKind: null,
              assistantEnabled: null,
              assistantStatus: null,
              assistantSearch: null,
              assistantTaskSearch: null,
              task: null,
            })}
          >
            <Trans>Clear assistant selections</Trans>
          </Link>
        </>
      )}
      {state.data === null && (
        <>
          <p role="status">
            {state.query.error || state.permission.error
              ? t`Assistant access could not be verified. Private work is hidden; unsaved inputs are kept during a temporary connection problem.`
              : t`Checking current assistant access…`}
          </p>
          <StyledDeliveryButton type="button" onClick={retry}>
            <Trans>Retry assistant access</Trans>
          </StyledDeliveryButton>
        </>
      )}
      {state.query.error && taskId !== null && !embedded && (
        <Link
          to={assistantDestination(params, {
            task: null,
            assistantRequest: null,
            assistantPickTask: '1',
          })}
        >
          <Trans>Clear unavailable task selection</Trans>
        </Link>
      )}
      {commands.error && <p role="alert">{commands.error}</p>}
      {commands.notice && <p role="status">{commands.notice}</p>}
      <StyledAssistantBoundary
        hidden={state.data === null}
        inert={state.data === null ? true : undefined}
        disabled={state.data === null}
      >
        {initialized && !denied && (
          <StyledDeliveryStack>
            <StyledDeliveryRow>
              <StyledAssistantNavigation aria-label={t`Assistant views`}>
                <Link
                  aria-current={view === 'catalog' ? 'page' : undefined}
                  to={assistantDestination(params, {
                    assistantView: 'catalog',
                  })}
                >
                  <Trans>Assistant catalog</Trans>
                </Link>
                <Link
                  aria-current={view === 'history' ? 'page' : undefined}
                  to={assistantDestination(params, {
                    assistantView: 'history',
                  })}
                >
                  <Trans>Run history</Trans>
                </Link>
              </StyledAssistantNavigation>
              {state.canConfigure && (
                <StyledDeliveryButton
                  type="button"
                  disabled={createId !== null}
                  onClick={() => openCreate()}
                >
                  <Trans>Create assistant</Trans>
                </StyledDeliveryButton>
              )}
            </StyledDeliveryRow>
            {!embedded && taskId !== null && state.data?.selectedTask && (
              <p>
                {t`Selected task: ${state.data.selectedTask.title}`}{' '}
                <Link
                  to={assistantDestination(params, {
                    task: null,
                    assistantRequest: null,
                    assistantPickTask: '1',
                  })}
                >
                  <Trans>Choose another task</Trans>
                </Link>
              </p>
            )}
            {params.get('assistantPickTask') === '1' && !embedded && (
              <AssistantTaskPicker state={state} />
            )}
            {((agentId !== null && editing && retainedAdmin) ||
              createId !== null) &&
              !knownAdminLoss && (
                <AssistantConfigurationEditor
                  key={`configuration:${agentId}:${createId}`}
                  state={state}
                  commands={commands}
                  agentId={agentId}
                  createId={createId}
                  intent={intent}
                  releaseCreateIntent={releaseCreateIntent}
                  restoreLogicalFocus={restoreEditAction}
                  onPrivateAuthorityLost={privateAuthorityLost}
                  close={() =>
                    navigate(
                      assistantDestination(params, {
                        assistant: createId !== null ? null : agentId,
                        assistantCreate: null,
                        assistantEdit: null,
                      }),
                    )
                  }
                  duplicate={openCreate}
                />
              )}
            {agentId !== null && (
              <AssistantSelection
                key={`selection:${agentId}:${taskId}`}
                state={state}
                commands={commands}
                agentId={agentId}
                editActionRef={attachEditAction}
                taskId={taskId}
                requestId={requestId}
                newRequest={newRequest}
                consumeRequestIntent={consumeRequestIntent}
                prepare={() =>
                  requestAction(() => {
                    const id = crypto.randomUUID();
                    setNewRequest(id);
                    navigate(
                      assistantDestination(params, {
                        assistantRequest: id,
                        assistantEdit: null,
                      }),
                    );
                  })
                }
                openRun={openRun}
              />
            )}
            {runId !== null && (
              <AssistantRunDetails
                key={`run:${runId}`}
                state={state}
                commands={commands}
                runId={runId}
              />
            )}
            {view === 'catalog' ? (
              <AssistantCatalog state={state} taskId={taskId} />
            ) : (
              <AssistantRunHistory state={state} taskId={taskId} />
            )}
          </StyledDeliveryStack>
        )}
      </StyledAssistantBoundary>
    </StyledDeliveryStack>
  );
};
