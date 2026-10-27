import { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client/react';
import { useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { type DeliveryWorkspace } from '@/delivery/delivery.types';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { StyledWorkflowActions } from '@/delivery/workflows/workflowStyles';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { BatchEditor } from '@/delivery/batches/BatchEditor';
import { BatchProgress } from '@/delivery/batches/BatchProgress';
import { useBatchLabels } from '@/delivery/batches/useBatchLabels';
import {
  type BatchCommand,
  type BatchSnapshot,
  type BatchEditorSelection,
} from '@/delivery/batches/batch.types';
import {
  GET_BATCHES,
  SAVE_BATCH,
  SET_BATCH_STATE,
  SAVE_BATCH_ITEM,
} from '@/delivery/batches/delivery-batches.graphql';
import {
  type DeliveryBatchesQuery,
  type SaveDeliveryBatchMutation,
  type SetDeliveryBatchStateMutation,
  type SaveDeliveryBatchItemMutation,
} from '~/generated-metadata/graphql';

type DeliveryBatchesProps = {
  workspace: DeliveryWorkspace;
  onOpenTask: (id: string) => void;
};
export const DeliveryBatches = (props: DeliveryBatchesProps) => {
  const access = useWorkflowAccess();
  return (
    <BatchWorkspace
      key={access.scope}
      workspace={props.workspace}
      onOpenTask={props.onOpenTask}
    />
  );
};
type BatchWorkspaceProps = DeliveryBatchesProps;
const BatchWorkspace = ({ workspace, onOpenTask }: BatchWorkspaceProps) => {
  const { t } = useLingui();
  const access = useWorkflowAccess();
  const label = useBatchLabels();
  const { requestAction } = useDeliveryDraftGuard();
  const [params, setParams] = useSearchParams();
  const projectId =
    params.get('batchProject') ?? workspace.projects[0]?.id ?? '';
  const batchId = params.get('batch') ?? undefined;
  const [includeClosed, setIncludeClosed] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [taskCursor, setTaskCursor] = useState<string | null>(null);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState<BatchEditorSelection | null>(null);
  const [editorData, setEditorData] = useState<BatchSnapshot | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const query = useQuery<DeliveryBatchesQuery>(GET_BATCHES, {
    variables: {
      input: {
        projectId,
        batchId,
        includeClosed,
        cursor,
        taskCursor,
        historyCursor,
        search,
      },
      identity: access.scope,
      workRevision: workspace.tasks
        .filter((task) => task.projectId === projectId)
        .map((task) => `${task.id}:${task.revision}`)
        .join(','),
    },
    skip: !access.ready || !projectId,
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: false,
    pollInterval: 30000,
  });
  const [save] = useMutation<SaveDeliveryBatchMutation>(SAVE_BATCH);
  const [state] = useMutation<SetDeliveryBatchStateMutation>(SET_BATCH_STATE);
  const [item] = useMutation<SaveDeliveryBatchItemMutation>(SAVE_BATCH_ITEM);
  const candidate = query.data?.deliveryBatches;
  const data =
    access.ready &&
    !query.error &&
    !query.loading &&
    access.matches(candidate) &&
    candidate?.projectId === projectId &&
    (candidate.selected?.id ?? undefined) === batchId
      ? candidate
      : undefined;
  const replace = (action: () => void) =>
    requestAction(() => {
      setEditor(null);
      setEditorData(null);
      setError('');
      setNotice('');
      action();
    });
  const select = (project: string, batch?: string) => {
    setTaskCursor(null);
    setHistoryCursor(null);
    setSearch('');
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set('batchProject', project);
      if (batch) next.set('batch', batch);
      else next.delete('batch');
      return next;
    });
  };
  const open = (selection: BatchEditorSelection) =>
    replace(() => {
      if (data) {
        setEditorData(data);
        setEditor(selection);
      }
    });
  const write = async (command: BatchCommand) => {
    if (busy || !data || !access.manager) return false;
    setBusy(true);
    setError('');
    let saved: BatchSnapshot | undefined;
    try {
      if (command.kind === 'plan')
        saved = (await save({ variables: { input: command.input } })).data
          ?.saveDeliveryBatch;
      else if (command.kind === 'state')
        saved = (await state({ variables: { input: command.input } })).data
          ?.setDeliveryBatchState;
      else
        saved = (await item({ variables: { input: command.input } })).data
          ?.saveDeliveryBatchItem;
      if (!access.matches(saved) || saved?.projectId !== projectId)
        throw new Error(
          t`The saved result could not be verified. Refresh before retrying.`,
        );
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : t`Could not save. Your draft is kept.`,
      );
      setBusy(false);
      return false;
    }
    setEditor(null);
    setEditorData(null);
    setTaskCursor(null);
    setHistoryCursor(null);
    setCursor(null);
    setSearch('');
    if (saved?.selected) {
      if (saved.selected.closed) setIncludeClosed(true);
      select(projectId, saved.selected.id);
    }
    setNotice(t`Plan saved. Task approvals and fulfilment were not changed.`);
    try {
      await query.refetch({
        input: {
          projectId,
          batchId: saved?.selected?.id,
          includeClosed: Boolean(saved?.selected?.closed) || includeClosed,
        },
      });
    } catch {
      setNotice(
        t`Saved, but the list could not refresh. Refresh before making another change.`,
      );
    } finally {
      setBusy(false);
    }
    return true;
  };
  const refresh = () =>
    replace(() => {
      void query
        .refetch()
        .catch(() => setError(t`Could not refresh batches. Try again.`));
    });
  const current = data?.selected;
  const retained = data ?? editorData;
  return (
    <StyledDeliveryStack>
      <StyledWorkflowActions>
        <label>
          <Trans>Project</Trans>
          <select
            value={projectId}
            disabled={!access.ready || busy}
            onChange={(event) => {
              const value = event.target.value;
              replace(() => {
                setCursor(null);
                select(value);
              });
            }}
          >
            {!workspace.projects.length && (
              <option value="">{t`No assigned projects`}</option>
            )}
            {workspace.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={includeClosed}
            disabled={busy}
            onChange={(event) => {
              const checked = event.target.checked;
              replace(() => {
                setIncludeClosed(checked);
                setCursor(null);
                setTaskCursor(null);
                setHistoryCursor(null);
              });
            }}
          />
          <Trans>Include closed plans</Trans>
        </label>
        {data?.canManage && (
          <StyledDeliveryButton
            data-primary="true"
            disabled={busy}
            onClick={() =>
              open({
                kind: 'plan',
                key: crypto.randomUUID(),
                id: crypto.randomUUID(),
              })
            }
          >
            <Trans>New batch</Trans>
          </StyledDeliveryButton>
        )}
      </StyledWorkflowActions>
      {notice && <small role="status">{notice}</small>}
      {!projectId ? (
        <p>
          <Trans>
            Your manager needs to set up a project before a batch can be
            planned.
          </Trans>
        </p>
      ) : !data ? (
        <div role={query.error || access.error ? 'alert' : 'status'}>
          <p>
            {query.error?.message ??
              access.error?.message ??
              t`Loading permitted batches…`}
          </p>
          <StyledDeliveryButton onClick={refresh}>
            <Trans>Try again</Trans>
          </StyledDeliveryButton>
        </div>
      ) : (
        <>
          {error && !editor && <p role="alert">{error}</p>}
          <label>
            <Trans>Batch</Trans>
            <select
              value={batchId ?? ''}
              disabled={busy}
              onChange={(event) => {
                const id = event.target.value;
                replace(() => select(projectId, id || undefined));
              }}
            >
              <option value="">{t`Choose a production batch`}</option>
              {current &&
                !data.batches.some((batch) => batch.id === current.id) && (
                  <option value={current.id}>{current.label}</option>
                )}
              {data.batches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.label} ·{' '}
                  {batch.closed ? t`Planning closed` : t`Planning open`}
                </option>
              ))}
            </select>
          </label>
          {!data.batches.length && (
            <p>
              <Trans>
                No batches on this page. Create one or include closed plans.
              </Trans>
            </p>
          )}
          <StyledWorkflowActions>
            {cursor && (
              <StyledDeliveryButton
                onClick={() => replace(() => setCursor(null))}
              >
                <Trans>First batch page</Trans>
              </StyledDeliveryButton>
            )}
            {data.nextCursor && (
              <StyledDeliveryButton
                onClick={() =>
                  replace(() => setCursor(data.nextCursor ?? null))
                }
              >
                <Trans>More batches</Trans>
              </StyledDeliveryButton>
            )}
          </StyledWorkflowActions>
          {current && (
            <StyledDeliveryCard>
              <StyledDeliveryStack>
                <StyledWorkflowActions>
                  <h2>{current.label}</h2>
                  <span>
                    {current.closed ? t`Planning closed` : t`Planning open`}
                  </span>
                </StyledWorkflowActions>
                {current.startDate && (
                  <small>
                    {current.startDate} – {current.endDate} · {current.timezone}
                  </small>
                )}
                {current.periodId && (
                  <small>
                    {t`Commitment period`}:{' '}
                    {data.periods.find(
                      (period) => period.id === current.periodId,
                    )?.label ?? t`Previously selected period`}
                  </small>
                )}
                {data.canManage && (
                  <StyledWorkflowActions>
                    {!current.closed && (
                      <>
                        <StyledDeliveryButton
                          onClick={() =>
                            open({
                              kind: 'item',
                              key: crypto.randomUUID(),
                              batch: current,
                            })
                          }
                        >
                          <Trans>Add a task</Trans>
                        </StyledDeliveryButton>
                        <StyledDeliveryButton
                          onClick={() =>
                            open({
                              kind: 'plan',
                              key: crypto.randomUUID(),
                              id: current.id,
                              batch: current,
                            })
                          }
                        >
                          <Trans>Edit plan</Trans>
                        </StyledDeliveryButton>
                      </>
                    )}
                    <StyledDeliveryButton
                      onClick={() =>
                        open({
                          kind: 'state',
                          key: crypto.randomUUID(),
                          batch: current,
                        })
                      }
                    >
                      {current.closed ? t`Reopen planning` : t`Close planning`}
                    </StyledDeliveryButton>
                  </StyledWorkflowActions>
                )}
                <BatchProgress
                  data={data}
                  onOpenTask={(id) => replace(() => onOpenTask(id))}
                  onEdit={(task, remove) =>
                    open({
                      kind: 'item',
                      key: crypto.randomUUID(),
                      batch: current,
                      task,
                      remove,
                    })
                  }
                />
                <StyledWorkflowActions>
                  {taskCursor && (
                    <StyledDeliveryButton
                      onClick={() => replace(() => setTaskCursor(null))}
                    >
                      <Trans>First task page</Trans>
                    </StyledDeliveryButton>
                  )}
                  {data.nextTaskCursor && (
                    <StyledDeliveryButton
                      onClick={() =>
                        replace(() =>
                          setTaskCursor(data.nextTaskCursor ?? null),
                        )
                      }
                    >
                      <Trans>Next task page</Trans>
                    </StyledDeliveryButton>
                  )}
                </StyledWorkflowActions>
                <details>
                  <summary>
                    <Trans>Planning history</Trans>
                  </summary>
                  <StyledDeliveryStack>
                    {data.history.map((event) => (
                      <article key={event.id}>
                        <strong>
                          {label(event.action)} · {event.actorName}
                        </strong>
                        <small>
                          {' '}
                          · {new Date(event.occurredAt).toLocaleString()}
                        </small>
                        {event.taskName && <p>{event.taskName}</p>}
                        <p>{event.reason}</p>
                        <ul>
                          {event.changes
                            .filter(
                              (change) =>
                                (change.before ?? '') !== (change.after ?? ''),
                            )
                            .map((change, index) => (
                              <li key={`${change.field}:${index}`}>
                                {label(change.field)}:{' '}
                                {change.field === 'periodId'
                                  ? t`Commitment selection changed`
                                  : ['closed', 'active'].includes(change.field)
                                    ? `${change.before === null ? t`Not set` : change.before === 'true' ? t`Yes` : t`No`} → ${change.after === 'true' ? t`Yes` : t`No`}`
                                    : `${change.before || '—'} → ${change.after || '—'}`}
                              </li>
                            ))}
                        </ul>
                      </article>
                    ))}
                    <StyledWorkflowActions>
                      {historyCursor && (
                        <StyledDeliveryButton
                          onClick={() => replace(() => setHistoryCursor(null))}
                        >
                          <Trans>Latest changes</Trans>
                        </StyledDeliveryButton>
                      )}
                      {data.nextHistoryCursor && (
                        <StyledDeliveryButton
                          onClick={() =>
                            replace(() =>
                              setHistoryCursor(data.nextHistoryCursor ?? null),
                            )
                          }
                        >
                          <Trans>Earlier changes</Trans>
                        </StyledDeliveryButton>
                      )}
                    </StyledWorkflowActions>
                  </StyledDeliveryStack>
                </details>
              </StyledDeliveryStack>
            </StyledDeliveryCard>
          )}
        </>
      )}
      {editor && retained && (
        <div hidden={!data || !access.manager}>
          <StyledDeliveryCard>
            <BatchEditor
              key={editor.key}
              selection={editor}
              data={retained}
              busy={busy}
              error={error}
              onSave={write}
              onCancel={() => replace(() => {})}
              onSearch={setSearch}
              onReload={refresh}
            />
          </StyledDeliveryCard>
        </div>
      )}
    </StyledDeliveryStack>
  );
};
