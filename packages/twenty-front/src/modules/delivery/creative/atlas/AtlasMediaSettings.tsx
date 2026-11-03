import { useLayoutEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { useAtlasSettings } from '@/delivery/creative/atlas/useAtlasSettings';
import { useAtlasLabels } from '@/delivery/creative/atlas/useAtlasLabels';
import { type AtlasSettings } from '@/delivery/creative/atlas/atlas.types';
import { AtlasConnectionForm } from '@/delivery/creative/atlas/AtlasConnectionForm';
import { AtlasSettingsForm } from '@/delivery/creative/atlas/AtlasSettingsForm';
import { StyledAtlasBoundary } from '@/delivery/creative/atlas/atlasStyles';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { taskPageDestination } from '@/delivery/tasks/task-navigation';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryGrid,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
type SettingsEditor = {
  kind: 'connection' | 'models';
  opened: AtlasSettings;
  version: number;
};
export const AtlasMediaSettings = () => {
  const { t } = useLingui();
  const labels = useAtlasLabels();
  const state = useAtlasSettings();
  const { requestAction } = useDeliveryDraftGuard();
  const [params] = useSearchParams();
  const [editor, setEditor] = useState<SettingsEditor | null>(null);
  // oxlint-disable-next-line twenty/no-state-useref -- Focus must target the current launcher after an outage remounts it.
  const connectionOpener = useRef<HTMLButtonElement | null>(null);
  // oxlint-disable-next-line twenty/no-state-useref -- This is the model editor's DOM focus target.
  const modelsOpener = useRef<HTMLButtonElement | null>(null);
  const [returnFocusTo, setReturnFocusTo] = useState<
    SettingsEditor['kind'] | null
  >(null);
  const [removeRevision, setRemoveRevision] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (editor || !returnFocusTo) return;
    if (state.permission.ready && !state.administrator) {
      setReturnFocusTo(null);
      return;
    }
    if (!state.data || state.busy) return;
    const opener =
      returnFocusTo === 'connection'
        ? connectionOpener.current
        : modelsOpener.current;
    if (!opener?.isConnected) return;
    opener.focus();
    setReturnFocusTo(null);
  }, [
    editor,
    returnFocusTo,
    state.permission.ready,
    state.administrator,
    state.data,
    state.busy,
  ]);
  if (state.permission.ready && !state.administrator && editor) setEditor(null);
  if (state.permission.ready && !state.administrator && removeRevision !== null)
    setRemoveRevision(null);
  const open = (kind: SettingsEditor['kind']) => {
    if (!state.data) return;
    const opened = state.data;
    requestAction(() => {
      setReturnFocusTo(null);
      setEditor({ kind, opened, version: (editor?.version ?? 0) + 1 });
    });
  };
  const close = () => {
    setReturnFocusTo(editor?.kind ?? null);
    setEditor(null);
  };
  if (state.permission.ready && !state.administrator)
    return (
      <StyledDeliveryCard>
        <p role="alert">
          <Trans>
            Media connection and workspace defaults are available to current
            administrators.
          </Trans>
        </p>
      </StyledDeliveryCard>
    );
  return (
    <StyledDeliveryStack>
      {!state.data && (
        <StyledDeliveryCard>
          <p
            role={
              state.query.error || state.permission.error ? 'alert' : 'status'
            }
          >
            {state.query.loading && !state.query.error
              ? t`Loading media configuration…`
              : t`Current media configuration could not be verified. Saved settings and retained inputs are hidden.`}
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
            <Trans>Retry media settings</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryCard>
      )}
      {state.administrator && state.notice && (
        <p role="status">{state.notice}</p>
      )}
      {state.administrator && state.error && <p role="alert">{state.error}</p>}
      {editor && (
        <StyledAtlasBoundary
          hidden={!state.data}
          disabled={!state.data || state.busy}
          inert={!state.data || undefined}
          aria-hidden={!state.data || undefined}
        >
          <StyledDeliveryCard>
            {editor.kind === 'connection' ? (
              <AtlasConnectionForm
                key={editor.version}
                opened={editor.opened}
                current={state.data}
                busy={state.busy}
                onSave={state.save}
                onClose={close}
                onReload={() => {
                  if (state.data)
                    setEditor({
                      ...editor,
                      opened: state.data,
                      version: editor.version + 1,
                    });
                }}
              />
            ) : (
              <AtlasSettingsForm
                key={editor.version}
                opened={editor.opened}
                current={state.data}
                busy={state.busy}
                onSave={state.save}
                onClose={close}
                onReload={() => {
                  if (state.data)
                    setEditor({
                      ...editor,
                      opened: state.data,
                      version: editor.version + 1,
                    });
                }}
              />
            )}
          </StyledDeliveryCard>
        </StyledAtlasBoundary>
      )}
      {state.data && (
        <>
          <StyledDeliveryGrid>
            <StyledDeliveryCard>
              <StyledDeliveryStack>
                <h2>
                  <Trans>Atlas Cloud connection</Trans>
                </h2>
                <strong>
                  {state.data.keyConfigured
                    ? labels.verification(state.data.verificationStatus)
                    : t`API key needed`}
                </strong>
                {state.data.verifiedAt && (
                  <small>
                    {t`Last connection check`}:{' '}
                    {new Date(state.data.verifiedAt).toLocaleString(undefined, {
                      timeZone: 'UTC',
                    })}{' '}
                    UTC
                  </small>
                )}
                <p>
                  <Trans>
                    A saved key, a successful connection check and a paid
                    generation test are separate. No generation starts from this
                    setup screen.
                  </Trans>
                </p>
                <StyledDeliveryRow>
                  <StyledDeliveryButton
                    ref={connectionOpener}
                    disabled={state.busy}
                    onClick={() => open('connection')}
                  >
                    {state.data.keyConfigured
                      ? t`Replace API key`
                      : t`Add API key`}
                  </StyledDeliveryButton>
                  <StyledDeliveryButton
                    disabled={
                      state.busy || !state.data.keyConfigured || editor !== null
                    }
                    onClick={() => void state.verify()}
                  >
                    <Trans>Check connection</Trans>
                  </StyledDeliveryButton>
                </StyledDeliveryRow>
              </StyledDeliveryStack>
            </StyledDeliveryCard>
            <StyledDeliveryCard>
              <StyledDeliveryStack>
                <h2>
                  <Trans>New request defaults</Trans>
                </h2>
                <strong>
                  {state.data.enabled
                    ? t`New Atlas requests allowed`
                    : t`New Atlas requests paused`}
                </strong>
                <p>
                  {t`Image family`}:{' '}
                  {state.data.defaultImageFamilyId
                    ? (state.data.families.find(
                        (family) =>
                          family.id === state.data!.defaultImageFamilyId,
                      )?.label ?? t`Saved default unavailable`)
                    : t`Unset — editor chooses explicitly`}
                </p>
                <p>
                  {t`Image-to-video model`}:{' '}
                  {state.data.defaultClipProfileId
                    ? (state.data.profiles.find(
                        (profile) =>
                          profile.id === state.data!.defaultClipProfileId,
                      )?.label ?? t`Saved default unavailable`)
                    : t`Unset — editor chooses explicitly`}
                </p>
                <small>
                  {t`${state.data.enabledProfileIds.length} permitted model operations`}{' '}
                  ·{' '}
                  {state.refreshing
                    ? t`Refreshing configuration`
                    : t`Configuration version ${state.data.revision}`}
                </small>
                <StyledDeliveryButton
                  ref={modelsOpener}
                  disabled={state.busy}
                  onClick={() => open('models')}
                >
                  <Trans>Edit model access and defaults</Trans>
                </StyledDeliveryButton>
                <Link
                  to={taskPageDestination(params, {
                    view: 'agents',
                    agentView: 'spending',
                  })}
                >
                  <Trans>Review production AI spending limits</Trans>
                </Link>
              </StyledDeliveryStack>
            </StyledDeliveryCard>
          </StyledDeliveryGrid>
          <details>
            <summary>
              <Trans>Connection removal and existing provider jobs</Trans>
            </summary>
            <p>
              <Trans>
                Ordinary key replacement preserves accepted jobs’ recorded
                credential version. Removing the connection explicitly revokes
                saved key access and pauses new requests. Already submitted
                provider jobs may continue charging, and their status or cost
                may need administrator reconciliation.
              </Trans>
            </p>
            <label>
              <input
                type="checkbox"
                checked={removeRevision !== null}
                disabled={!state.data.keyConfigured || state.busy}
                onChange={(event) =>
                  setRemoveRevision(
                    event.target.checked ? state.data!.revision : null,
                  )
                }
              />
              <Trans>
                I understand removal revokes saved key access; it does not
                promise a provider refund.
              </Trans>
            </label>
            {removeRevision !== null &&
              removeRevision !== state.data.revision && (
                <p role="status">
                  <Trans>
                    The connection changed. Clear and reconfirm removal against
                    the current configuration.
                  </Trans>
                </p>
              )}
            <StyledDeliveryButton
              disabled={
                !state.data.keyConfigured ||
                state.busy ||
                removeRevision !== state.data.revision
              }
              onClick={() =>
                requestAction(async () => {
                  setReturnFocusTo(null);
                  setEditor(null);
                  if (await state.remove()) setRemoveRevision(null);
                })
              }
            >
              <Trans>Remove Atlas connection</Trans>
            </StyledDeliveryButton>
          </details>
        </>
      )}
    </StyledDeliveryStack>
  );
};
