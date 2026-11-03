import { commitmentLastDay } from '@/delivery/commitments/commitmentDates';
import { useCommitmentScope } from '@/delivery/commitments/useCommitmentScope';
import { useCallback, useRef, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link, useSearchParams } from 'react-router-dom';
import { commitmentPeriodParams } from '@/delivery/commitments/clientCommitmentParams';
import { useFinanceExportRequestGuard } from '@/delivery/finance/export/useFinanceExportRequestGuard';
import { useOtogrowAccess } from '@/otogrow-access/useOtogrowAccess';
import {
  useDeliveryDraftGuard,
  useDeliveryDraftStatus,
} from '@/delivery/drafts/DeliveryDraftGuard';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { CommitmentEditor } from '@/delivery/commitments/CommitmentEditor';
import {
  StyledCommitmentActions,
  StyledCommitmentCounts,
  StyledCommitmentList,
} from '@/delivery/commitments/commitmentStyles';
import { useCommitmentLabels } from '@/delivery/commitments/useCommitmentLabels';
import {
  type CommitmentCommand,
  type CommitmentEditorSelection,
  type CommitmentSnapshot,
} from '@/delivery/commitments/commitment.types';
import {
  GET_COMMITMENTS,
  SAVE_COMMITMENT_PERIOD,
  SAVE_COMMITMENT_LINE,
  ASSIGN_COMMITMENT_TASK,
  REMOVE_COMMITMENT_TASK,
  SET_COMMITMENT_PERIOD_STATE,
} from '@/delivery/commitments/delivery-commitments.graphql';
import {
  type DeliveryCommitmentsQuery,
  type DeliveryCommitmentsQueryVariables,
  type SaveDeliveryCommitmentPeriodMutation,
  type SaveDeliveryCommitmentPeriodMutationVariables,
  type SaveDeliveryCommitmentLineMutation,
  type SaveDeliveryCommitmentLineMutationVariables,
  type AssignDeliveryCommitmentTaskMutation,
  type AssignDeliveryCommitmentTaskMutationVariables,
  type RemoveDeliveryCommitmentTaskMutation,
  type RemoveDeliveryCommitmentTaskMutationVariables,
  type SetDeliveryCommitmentPeriodStateMutation,
  type SetDeliveryCommitmentPeriodStateMutationVariables,
} from '~/generated-metadata/graphql';

type DeliveryCommitmentsProps = { engagementId: string; billing: string };
export const DeliveryCommitments = (props: DeliveryCommitmentsProps) => {
  const scope = useCommitmentScope();
  const [params] = useSearchParams();
  return (
    <CommitmentWorkspace
      key={`${scope}:${props.engagementId}:${params.toString()}`}
      engagementId={props.engagementId}
      billing={props.billing}
    />
  );
};
type CommitmentWorkspaceProps = DeliveryCommitmentsProps;
const CommitmentWorkspace = ({
  engagementId,
  billing,
}: CommitmentWorkspaceProps) => {
  const { t } = useLingui();
  const labels = useCommitmentLabels();
  const permission = useOtogrowAccess();
  const ready =
    !permission.loading && !permission.error && Boolean(permission.access);
  const { requestAction } = useDeliveryDraftGuard();
  const [params, setParams] = useSearchParams();
  const linkedPeriodId = params.get('commitmentPeriod') || null;
  // oxlint-disable-next-line twenty/no-state-useref -- Remembering an imperative focus operation keeps background refresh from stealing focus without rendering state.
  const focusedLinkedPeriod = useRef<string | null>(null);
  const allocationCursor = params.get('commitmentAllocationsAfter') || null;
  const historyCursor = params.get('commitmentHistoryBefore') || null;
  const [taskSearch, setTaskSearch] = useState('');
  const [parentSearch, setParentSearch] = useState('');
  const [editor, setEditor] = useState<{
    selection: CommitmentEditorSelection;
    key: string;
    snapshot: CommitmentSnapshot;
  } | null>(null);
  const periodId = linkedPeriodId ?? editor?.snapshot.selectedPeriodId ?? null;
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useDeliveryDraftStatus({ dirty: false, saving });
  const input = {
    engagementId,
    periodId,
    allocationCursor,
    historyCursor,
    taskSearch,
    limit: 30,
  };
  const query = useQuery<
    DeliveryCommitmentsQuery,
    DeliveryCommitmentsQueryVariables & { identity: string | null }
  >(GET_COMMITMENTS, {
    variables: { input, identity: permission.scopeKey },
    skip: !ready,
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    pollInterval: 30000,
  });
  const parentQuery = useQuery<
    DeliveryCommitmentsQuery,
    DeliveryCommitmentsQueryVariables & { identity: string | null }
  >(GET_COMMITMENTS, {
    variables: {
      input: { engagementId, periodId, taskSearch: parentSearch, limit: 100 },
      identity: permission.scopeKey,
    },
    skip: !ready || editor?.selection.kind !== 'assign',
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
  });
  const matches = (candidate: CommitmentSnapshot | undefined) =>
    Boolean(
      ready &&
      permission.access &&
      candidate?.workspaceId === permission.access.workspaceId &&
      candidate?.memberId === permission.access.memberId &&
      candidate?.userWorkspaceId === permission.access.userWorkspaceId &&
      candidate?.engagementId === engagementId &&
      (!periodId || candidate.selectedPeriodId === periodId),
    );
  const candidate = query.data?.deliveryCommitments;
  const data = !query.error && matches(candidate) ? candidate : undefined;
  const parentCandidate = parentQuery.data?.deliveryCommitments;
  const parentOptions =
    !parentQuery.error && matches(parentCandidate)
      ? (parentCandidate?.taskOptions ?? [])
      : [];
  const canManage =
    data?.canManage === true &&
    permission.access?.capabilities.some(
      (capability) =>
        capability === 'delivery.manage' || capability === 'workspace.admin',
    ) === true;
  const startRequest = useFinanceExportRequestGuard(
    `${permission.scopeKey}:${engagementId}:${linkedPeriodId ?? ''}`,
    canManage,
  );
  const selectPeriod = (nextPeriodId: string | null) => {
    const next = commitmentPeriodParams(params, nextPeriodId);
    next.set('clientEngagement', engagementId);
    setParams(next);
  };
  const [savePeriod] = useMutation<
    SaveDeliveryCommitmentPeriodMutation,
    SaveDeliveryCommitmentPeriodMutationVariables
  >(SAVE_COMMITMENT_PERIOD);
  const [saveLine] = useMutation<
    SaveDeliveryCommitmentLineMutation,
    SaveDeliveryCommitmentLineMutationVariables
  >(SAVE_COMMITMENT_LINE);
  const [assignTask] = useMutation<
    AssignDeliveryCommitmentTaskMutation,
    AssignDeliveryCommitmentTaskMutationVariables
  >(ASSIGN_COMMITMENT_TASK);
  const [removeTask] = useMutation<
    RemoveDeliveryCommitmentTaskMutation,
    RemoveDeliveryCommitmentTaskMutationVariables
  >(REMOVE_COMMITMENT_TASK);
  const [setPeriodState] = useMutation<
    SetDeliveryCommitmentPeriodStateMutation,
    SetDeliveryCommitmentPeriodStateMutationVariables
  >(SET_COMMITMENT_PERIOD_STATE);
  const openEditor = (selection: CommitmentEditorSelection) =>
    requestAction(() => {
      if (!data) return;
      setEditor({ selection, key: crypto.randomUUID(), snapshot: data });
      setError('');
    });
  const changePage = (cursor: string | null, history = false) =>
    requestAction(() => {
      setEditor(null);
      setError('');
      const next = new URLSearchParams(params);
      next.set('clientEngagement', engagementId);
      if (data?.selectedPeriodId)
        next.set('commitmentPeriod', data.selectedPeriodId);
      const key = history
        ? 'commitmentHistoryBefore'
        : 'commitmentAllocationsAfter';
      if (cursor) next.set(key, cursor);
      else next.delete(key);
      setParams(next);
    });
  const save = async (command: CommitmentCommand) => {
    const currentAccess = permission.access;
    if (!canManage || saving || !currentAccess) return false;
    const current = startRequest();
    setSaving(true);
    setError('');
    let result: CommitmentSnapshot | undefined;
    try {
      if (command.kind === 'period')
        result = (await savePeriod({ variables: { input: command.input } }))
          .data?.saveDeliveryCommitmentPeriod;
      else if (command.kind === 'line')
        result = (await saveLine({ variables: { input: command.input } })).data
          ?.saveDeliveryCommitmentLine;
      else if (command.kind === 'assign')
        result = (await assignTask({ variables: { input: command.input } }))
          .data?.assignDeliveryCommitmentTask;
      else if (command.kind === 'remove')
        result = (await removeTask({ variables: { input: command.input } }))
          .data?.removeDeliveryCommitmentTask;
      else
        result = (await setPeriodState({ variables: { input: command.input } }))
          .data?.setDeliveryCommitmentPeriodState;
      if (!current()) {
        setSaving(false);
        return false;
      }
      if (
        !result ||
        result.workspaceId !== currentAccess.workspaceId ||
        result.memberId !== currentAccess.memberId ||
        result.userWorkspaceId !== currentAccess.userWorkspaceId ||
        result.engagementId !== engagementId
      )
        throw new Error(
          t`The result could not be verified. Refresh before retrying.`,
        );
    } catch (failure) {
      if (!current()) {
        setSaving(false);
        return false;
      }
      setError(
        failure instanceof Error
          ? failure.message
          : t`Could not save this change. Your draft is still here.`,
      );
      setSaving(false);
      return false;
    }
    const destinationPeriodId = result.selectedPeriodId ?? null;
    setEditor(null);
    if (
      params.get('clientEngagement') !== engagementId ||
      linkedPeriodId !== destinationPeriodId ||
      allocationCursor ||
      historyCursor
    ) {
      setSaving(false);
      requestAction(() => {
        if (current()) selectPeriod(destinationPeriodId);
      });
      return true;
    }
    try {
      await query.refetch({
        input: { engagementId, periodId: destinationPeriodId, limit: 30 },
        identity: permission.scopeKey,
      });
    } catch {
      if (!current()) return true;
      setError(
        t`The change was saved, but the page could not refresh. Refresh before making another change.`,
      );
    } finally {
      setSaving(false);
    }
    return true;
  };
  const period = data?.periods.find(
    (item) => item.id === data.selectedPeriodId,
  );
  const verifiedLinkedPeriod =
    linkedPeriodId && period?.id === linkedPeriodId
      ? `${permission.scopeKey}:${engagementId}:${linkedPeriodId}`
      : null;
  const focusLinkedPeriod = useCallback(
    (element: HTMLSelectElement | null) => {
      if (
        !element ||
        !verifiedLinkedPeriod ||
        focusedLinkedPeriod.current === verifiedLinkedPeriod
      )
        return;
      focusedLinkedPeriod.current = verifiedLinkedPeriod;
      element.focus();
    },
    [verifiedLinkedPeriod],
  );
  return (
    <StyledDeliveryCard>
      <StyledDeliveryStack>
        <StyledDeliveryRow>
          <div>
            <h2>
              <Trans>Delivery commitments</Trans>
            </h2>
            <p>
              <Trans>
                Fulfilled work counts here. Internal approval alone does not
                count.
              </Trans>
            </p>
          </div>
          <StyledCommitmentActions>
            <StyledDeliveryButton
              disabled={saving || query.loading}
              onClick={() =>
                void query
                  .refetch()
                  .then(() => setError(''))
                  .catch(() => undefined)
              }
            >
              <Trans>Refresh commitments</Trans>
            </StyledDeliveryButton>
            {canManage && (
              <StyledDeliveryButton
                disabled={saving}
                onClick={() =>
                  openEditor({ kind: 'period', id: crypto.randomUUID() })
                }
              >
                <Trans>Plan a period</Trans>
              </StyledDeliveryButton>
            )}
          </StyledCommitmentActions>
        </StyledDeliveryRow>
        {permission.loading && (
          <p role="status">
            <Trans>Checking commitment access…</Trans>
          </p>
        )}
        {!permission.loading && !ready && (
          <>
            <p role="alert">
              <Trans>
                Commitments are hidden until your current access can be
                verified.
              </Trans>
            </p>
            <StyledDeliveryButton onClick={() => void permission.refetch()}>
              <Trans>Check access again</Trans>
            </StyledDeliveryButton>
          </>
        )}
        {error && !editor && <p role="alert">{error}</p>}
        {query.error && (
          <p role="alert">
            <Trans>
              Could not load commitments. Your access or the selected period may
              have changed. Refresh to check again.
            </Trans>
          </p>
        )}
        {ready &&
          linkedPeriodId &&
          (query.error || (!query.loading && !data)) && (
            <StyledDeliveryButton
              type="button"
              onClick={() => requestAction(() => selectPeriod(null))}
            >
              <Trans>Choose another commitment period</Trans>
            </StyledDeliveryButton>
          )}
        {query.loading && (
          <p role="status">
            <Trans>Loading commitments…</Trans>
          </p>
        )}
        {ready && !query.loading && !query.error && !data && (
          <p role="alert">
            <Trans>
              This commitment response does not match your current workspace.
              Refresh to check access.
            </Trans>
          </p>
        )}
        {editor && (
          <div hidden={!data || !canManage}>
            <CommitmentEditor
              key={editor.key}
              selection={editor.selection}
              data={data ?? editor.snapshot}
              billing={billing}
              error={error}
              moreTaskOptions={data?.moreTaskOptions ?? false}
              moreParentOptions={parentCandidate?.moreTaskOptions ?? false}
              parentSearchFailed={Boolean(parentQuery.error)}
              busy={
                saving ||
                query.loading ||
                parentQuery.loading ||
                !data ||
                !canManage
              }
              taskOptions={data?.taskOptions ?? []}
              parentOptions={parentOptions}
              onSearch={(value, parents) => {
                if (parents) {
                  if (value === parentSearch)
                    void parentQuery.refetch().catch(() => undefined);
                  else setParentSearch(value);
                } else if (value === taskSearch)
                  void query.refetch().catch(() => undefined);
                else setTaskSearch(value);
              }}
              onSave={save}
              onCancel={() => {
                setEditor(null);
                setError('');
              }}
              onReload={async () => {
                setSaving(true);
                try {
                  await query.refetch();
                  setEditor({ ...editor, key: crypto.randomUUID() });
                  setError('');
                } catch {
                  setError(
                    t`Could not reload the latest plan. Your draft is still here.`,
                  );
                } finally {
                  setSaving(false);
                }
              }}
            />
          </div>
        )}
        {data && (
          <>
            {canManage && data.legacyAllowance && (
              <details>
                <summary>
                  <Trans>Existing allowance notes</Trans>
                </summary>
                <p style={{ whiteSpace: 'pre-wrap' }}>{data.legacyAllowance}</p>
                <small>
                  <Trans>
                    These notes are unchanged. Quantities below are entered
                    explicitly.
                  </Trans>
                </small>
              </details>
            )}
            {!data.periods.length ? (
              <p>
                <Trans>
                  No commitment period has been planned for this engagement.
                </Trans>
              </p>
            ) : (
              <label>
                <Trans>Commitment period</Trans>
                <select
                  ref={focusLinkedPeriod}
                  value={data.selectedPeriodId ?? ''}
                  disabled={saving}
                  onChange={(event) => {
                    const next = event.target.value;
                    requestAction(() => {
                      selectPeriod(next);
                    });
                  }}
                >
                  {data.periods.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label} · {labels.state(item.state)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {period && (
              <>
                <StyledDeliveryRow>
                  <div>
                    <strong>{period.label}</strong>
                    <p>
                      {period.billing === 'RETAINER'
                        ? t`Retainer period`
                        : t`One-time package`}{' '}
                      · {period.startDate}{' '}
                      {period.endDateExclusive
                        ? t`through ${commitmentLastDay(period.endDateExclusive)}`
                        : t`with no end date`}{' '}
                      · {period.timezone} · {labels.state(period.state)}
                    </p>
                  </div>
                  {canManage && (
                    <StyledCommitmentActions>
                      {period.state === 'OPEN' && (
                        <>
                          <StyledDeliveryButton
                            disabled={saving}
                            onClick={() =>
                              openEditor({ kind: 'period', id: period.id })
                            }
                          >
                            <Trans>Edit period</Trans>
                          </StyledDeliveryButton>
                          <StyledDeliveryButton
                            disabled={saving}
                            onClick={() =>
                              openEditor({
                                kind: 'line',
                                id: crypto.randomUUID(),
                              })
                            }
                          >
                            <Trans>Add promised work</Trans>
                          </StyledDeliveryButton>
                        </>
                      )}
                      <StyledDeliveryButton
                        disabled={saving}
                        onClick={() =>
                          openEditor({
                            kind: 'state',
                            state: period.state === 'OPEN' ? 'CLOSED' : 'OPEN',
                          })
                        }
                      >
                        {period.state === 'OPEN'
                          ? t`Close period`
                          : t`Reopen period`}
                      </StyledDeliveryButton>
                    </StyledCommitmentActions>
                  )}
                </StyledDeliveryRow>
                {period.state === 'CLOSED' && (
                  <p>
                    <Trans>
                      This plan is closed. Fulfilment can still change when work
                      is reopened or a client objects.
                    </Trans>
                  </p>
                )}
                {!data.lines.length ? (
                  <p>
                    <Trans>
                      No promised quantities have been entered for this period.
                    </Trans>
                  </p>
                ) : (
                  <StyledCommitmentList aria-label={t`Promised work`}>
                    {data.lines.map((line) => (
                      <li key={line.id}>
                        <StyledDeliveryRow>
                          <div>
                            <strong>{line.label}</strong>
                            <p>{labels.unit(line.unit)}</p>
                          </div>
                          {canManage && period.state === 'OPEN' && (
                            <StyledDeliveryButton
                              disabled={saving}
                              onClick={() =>
                                openEditor({ kind: 'line', id: line.id })
                              }
                            >{t`Edit ${line.label}`}</StyledDeliveryButton>
                          )}
                        </StyledDeliveryRow>
                        <StyledCommitmentCounts>
                          <div>
                            <dt>
                              <Trans>Promised</Trans>
                            </dt>
                            <dd>{line.promisedQuantity}</dd>
                          </div>
                          <div>
                            <dt>
                              <Trans>Fulfilled</Trans>
                            </dt>
                            <dd>{line.fulfilledQuantity}</dd>
                          </div>
                          <div>
                            <dt>
                              <Trans>Remaining</Trans>
                            </dt>
                            <dd>{line.remainingQuantity}</dd>
                          </div>
                        </StyledCommitmentCounts>
                        <small>
                          {t`Linked tasks: ${line.assignedQuantity}`}
                          {line.overdeliveredQuantity > 0
                            ? ` · ${t`${line.overdeliveredQuantity} above the promise`}`
                            : ''}
                        </small>
                      </li>
                    ))}
                  </StyledCommitmentList>
                )}
              </>
            )}
            {period && (
              <details>
                <summary>
                  <Trans>Linked tasks</Trans>
                </summary>
                <StyledDeliveryStack>
                  {canManage && period.state === 'OPEN' && (
                    <StyledCommitmentActions>
                      <StyledDeliveryButton
                        disabled={saving || !data.lines.length}
                        onClick={() => openEditor({ kind: 'assign' })}
                      >
                        <Trans>Link a task</Trans>
                      </StyledDeliveryButton>
                    </StyledCommitmentActions>
                  )}
                  {!data.allocations.length && (
                    <p>
                      <Trans>No tasks are linked on this page.</Trans>
                    </p>
                  )}
                  <StyledCommitmentList>
                    {data.allocations.map((item) => (
                      <li key={item.taskId}>
                        <StyledDeliveryRow>
                          <div>
                            <Link
                              to={`/delivery?view=mine&task=${encodeURIComponent(item.taskId)}`}
                            >
                              {item.taskName}
                            </Link>
                            <p>
                              {
                                data.lines.find(
                                  (line) => line.id === item.lineId,
                                )?.label
                              }{' '}
                              ·{' '}
                              {item.credited
                                ? t`Counted as fulfilled`
                                : t`Not counted as fulfilled`}
                            </p>
                            <small>
                              {item.creditReason ?? labels.state(item.state)}
                            </small>
                            {item.parentTaskId && (
                              <p>
                                <Trans>Variation of</Trans>{' '}
                                <Link
                                  to={`/delivery?view=mine&task=${encodeURIComponent(item.parentTaskId)}`}
                                >{t`original video task`}</Link>
                              </p>
                            )}
                          </div>
                          {canManage &&
                            period.state === 'OPEN' &&
                            item.state !== 'REMOVED' && (
                              <StyledDeliveryButton
                                disabled={saving}
                                onClick={() =>
                                  openEditor({
                                    kind: 'remove',
                                    taskId: item.taskId,
                                  })
                                }
                              >{t`Remove ${item.taskName}`}</StyledDeliveryButton>
                            )}
                        </StyledDeliveryRow>
                      </li>
                    ))}
                  </StyledCommitmentList>
                  <StyledCommitmentActions>
                    {allocationCursor && (
                      <StyledDeliveryButton
                        disabled={query.loading}
                        onClick={() => changePage(null)}
                      >
                        <Trans>First task page</Trans>
                      </StyledDeliveryButton>
                    )}
                    {data.nextAllocationCursor && (
                      <StyledDeliveryButton
                        disabled={query.loading}
                        onClick={() =>
                          changePage(data.nextAllocationCursor ?? null)
                        }
                      >
                        <Trans>Next task page</Trans>
                      </StyledDeliveryButton>
                    )}
                  </StyledCommitmentActions>
                </StyledDeliveryStack>
              </details>
            )}
            {period && canManage && (
              <details>
                <summary>
                  <Trans>Commitment history</Trans>
                </summary>
                <StyledDeliveryStack>
                  {!data.history.length && (
                    <p>
                      <Trans>No recorded changes on this page.</Trans>
                    </p>
                  )}
                  <StyledCommitmentList>
                    {data.history.map((event) => (
                      <li key={event.id}>
                        <strong>{labels.action(event.action)}</strong>
                        <p>
                          {event.actorType === 'HUMAN'
                            ? event.actorName
                            : event.actorType === 'CLIENT'
                              ? t`Client portal`
                              : t`Automatic update`}{' '}
                          · {new Date(event.occurredAt).toLocaleString()} ·{' '}
                          {event.taskName}
                        </p>
                        {canManage && event.reason && <p>{event.reason}</p>}
                        <dl>
                          {event.changes.map((change, index) => (
                            <div key={index}>
                              <dt>{labels.field(change.field)}</dt>
                              <dd>
                                {labels.value(
                                  change.field,
                                  change.before,
                                  data,
                                  event,
                                )}{' '}
                                →{' '}
                                {labels.value(
                                  change.field,
                                  change.after,
                                  data,
                                  event,
                                )}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </li>
                    ))}
                  </StyledCommitmentList>
                  <StyledCommitmentActions>
                    {historyCursor && (
                      <StyledDeliveryButton
                        disabled={query.loading}
                        onClick={() => changePage(null, true)}
                      >
                        <Trans>Latest history</Trans>
                      </StyledDeliveryButton>
                    )}
                    {data.nextHistoryCursor && (
                      <StyledDeliveryButton
                        disabled={query.loading}
                        onClick={() =>
                          changePage(data.nextHistoryCursor ?? null, true)
                        }
                      >
                        <Trans>Older history</Trans>
                      </StyledDeliveryButton>
                    )}
                  </StyledCommitmentActions>
                </StyledDeliveryStack>
              </details>
            )}
          </>
        )}
      </StyledDeliveryStack>
    </StyledDeliveryCard>
  );
};
