import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { type AtlasProduction } from '@/delivery/creative/atlas/atlas.types';
import { useAtlasProduction } from '@/delivery/creative/atlas/useAtlasProduction';
import { useAtlasLabels } from '@/delivery/creative/atlas/useAtlasLabels';
import { AtlasGenerationForm } from '@/delivery/creative/atlas/AtlasGenerationForm';
import { AtlasProductionAccessForm } from '@/delivery/creative/atlas/AtlasProductionAccessForm';
import { AtlasRunList } from '@/delivery/creative/atlas/AtlasRunList';
import { StyledAtlasBoundary } from '@/delivery/creative/atlas/atlasStyles';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { taskPageDestination } from '@/delivery/tasks/task-navigation';
import { deliveryTaskSelection } from '@/delivery/delivery-task-navigation';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
type AtlasProductionWorkspaceProps = {
  taskId: string;
  taskRevision: number;
  onChanged: () => Promise<unknown>;
};
type AtlasProductionToolsProps = AtlasProductionWorkspaceProps;
export const AtlasProductionTools = (props: AtlasProductionToolsProps) => {
  const permission = useWorkflowAccess();
  return (
    <AtlasProductionWorkspace
      key={`${permission.scope}:${props.taskId}`}
      taskId={props.taskId}
      taskRevision={props.taskRevision}
      onChanged={props.onChanged}
    />
  );
};
const AtlasProductionWorkspace = ({
  taskId,
  taskRevision,
  onChanged,
}: AtlasProductionWorkspaceProps) => {
  const { t } = useLingui();
  const labels = useAtlasLabels();
  const state = useAtlasProduction({ taskId, taskRevision, onChanged });
  const { requestAction } = useDeliveryDraftGuard();
  const [params] = useSearchParams();
  const owner = `${state.permission.scope}:${taskId}:${params}`;
  const [editor, setEditor] = useState<{
    owner: string;
    kind: 'request' | 'access';
    opened: AtlasProduction;
    version: number;
  } | null>(null);
  const denied = isOtogrowAccessDenied(state.query.error);
  if (
    editor &&
    (editor.owner !== owner ||
      denied ||
      (editor.kind === 'access' &&
        state.permission.ready &&
        !state.administrator))
  )
    setEditor(null);
  const open = (kind: 'request' | 'access') => {
    if (!state.data) return;
    const opened = state.data;
    requestAction(() =>
      setEditor({ owner, kind, opened, version: (editor?.version ?? 0) + 1 }),
    );
  };
  const reload = () => {
    if (editor && state.data)
      setEditor({ ...editor, opened: state.data, version: editor.version + 1 });
  };
  return (
    <StyledDeliveryStack>
      <StyledDeliveryRow>
        <h3>
          <Trans>Atlas image and video</Trans>
        </h3>
        <StyledDeliveryButton
          disabled={
            state.query.loading || !state.permission.ready || state.busy
          }
          onClick={() => void state.refresh()}
        >
          <Trans>Refresh Atlas production</Trans>
        </StyledDeliveryButton>
      </StyledDeliveryRow>
      <p>
        <Trans>
          Prepare one image or animate an approved shot image with a permitted
          model. Generation does not approve media, submit final work or mark
          client delivery.
        </Trans>
      </p>
      {!state.data && (
        <StyledDeliveryCard>
          <p role={state.query.error ? 'alert' : 'status'}>
            {state.query.loading && !state.query.error
              ? t`Checking current Atlas production access…`
              : t`Atlas production access could not be verified. Saved model, prompt and price inputs are hidden; your prepared request is kept.`}
          </p>
          <StyledDeliveryButton
            disabled={state.query.loading}
            onClick={() =>
              void (
                state.permission.ready
                  ? state.query.refetch()
                  : state.permission.refetch()
              ).catch(() => undefined)
            }
          >
            <Trans>Retry Atlas production access</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryCard>
      )}
      {state.data && (
        <>
          <small>
            {t`Approved brief version ${state.data.briefVersion}`} ·{' '}
            {t`Media access version ${state.data.settingsVersion}`}
            {state.refreshing ? ` · ${t`Refreshing`}` : ''}
          </small>
          {state.data.blockedReasons.map((reason) => (
            <p key={reason} role="status">
              {labels.reason(reason)}
            </p>
          ))}
          <StyledDeliveryRow>
            <StyledDeliveryButton
              disabled={state.busy}
              onClick={() => open('request')}
            >
              <Trans>Prepare image or video request</Trans>
            </StyledDeliveryButton>
            {state.administrator && state.data.canManageAccess && (
              <StyledDeliveryButton
                disabled={state.busy}
                onClick={() => open('access')}
              >
                <Trans>Configure this production’s media access</Trans>
              </StyledDeliveryButton>
            )}
            {state.administrator && (
              <Link
                to={taskPageDestination(params, {
                  ...deliveryTaskSelection(taskId),
                  view: 'agents',
                  agentView: 'media',
                })}
              >
                <Trans>Workspace media models and defaults</Trans>
              </Link>
            )}
          </StyledDeliveryRow>
        </>
      )}
      {state.permission.ready && state.error && (
        <p role="alert">{state.error}</p>
      )}
      {state.permission.ready && state.notice && (
        <p role="status">{state.notice}</p>
      )}
      {editor && (
        <StyledAtlasBoundary
          hidden={!state.data}
          disabled={!state.data || state.busy}
          inert={!state.data || undefined}
          aria-hidden={!state.data || undefined}
        >
          <StyledDeliveryCard>
            {editor.kind === 'request' ? (
              <AtlasGenerationForm
                key={editor.version}
                opened={editor.opened}
                current={state.data}
                busy={state.busy}
                onQuote={state.quote}
                onStart={state.start}
                onCheck={state.check}
                onClose={() => setEditor(null)}
                onReload={reload}
              />
            ) : (
              <AtlasProductionAccessForm
                key={editor.version}
                opened={editor.opened}
                current={state.data}
                busy={state.busy}
                onSave={state.configureAccess}
                onClose={() => setEditor(null)}
                onReload={reload}
              />
            )}
          </StyledDeliveryCard>
        </StyledAtlasBoundary>
      )}
      <AtlasRunList taskId={taskId} enabled={!denied} />
    </StyledDeliveryStack>
  );
};
