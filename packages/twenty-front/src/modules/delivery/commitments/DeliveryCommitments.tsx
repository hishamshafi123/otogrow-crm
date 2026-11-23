import { commitmentLastDay } from '@/delivery/commitments/commitmentDates';
import { useCommitmentScope } from '@/delivery/commitments/useCommitmentScope';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { NetworkStatus } from '@apollo/client';
import { isDeliveryTaskUnavailable as isCommitmentSourceUnavailable } from '@/delivery/tasks/isDeliveryTaskUnavailable';
import { useOtogrowIdentity } from '@/otogrow-access/useOtogrowIdentity';
import { CommitmentOrphanCleanup } from '@/delivery/commitments/CommitmentOrphanCleanup';
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
  const { identity } = useOtogrowIdentity();
  const scope = useCommitmentScope();
  const ready =
    !permission.loading && !permission.error && Boolean(permission.access);
  const { requestAction, cancelPendingNavigation } = useDeliveryDraftGuard();
  const [params, setParams] = useSearchParams();
  const linkedPeriodId = params.get('commitmentPeriod') || null;
  // oxlint-disable-next-line twenty/no-state-useref -- Remembering an imperative focus operation keeps background refresh from stealing focus without rendering state.
  const focusedLinkedPeriod = useRef<string | null>(null);
  const allocationCursor = params.get('commitmentAllocationsAfter') || null;
  const historyCursor = params.get('commitmentHistoryBefore') || null;
  const orphanCursor = params.get('commitmentOrphansAfter') || null;
  const [contractDenied, setContractDenied] = useState(false);
  const [taskPreparationDenied, setTaskPreparationDenied] = useState(false);
  const [selectedSources, setSelectedSources] = useState<{
    taskId: string | null;
    parentTaskId: string | null;
  }>({ taskId: null, parentTaskId: null });
  const currentAuthorization = ready
    ? JSON.stringify({
        capabilities: [...(permission.access?.capabilities ?? [])].sort(),
        roleIds: [...(permission.access?.roleIds ?? [])].sort(),
        grants: permission.access?.grants ?? [],
      })
    : null;
  const [authorizationEvidence, setAuthorizationEvidence] = useState(
    currentAuthorization ?? '',
  );
  if (
    currentAuthorization !== null &&
    authorizationEvidence !== currentAuthorization
  )
    setAuthorizationEvidence(currentAuthorization);
  const authorization = currentAuthorization ?? authorizationEvidence;
  // oxlint-disable-next-line twenty/no-state-useref -- Replies and queued editor work cannot cross a confirmed authority boundary.
  const epoch = useRef(0);
  const recoveryFocus = useRef<HTMLButtonElement>(null);
  const refreshFocus = useRef<HTMLButtonElement>(null);
  // oxlint-disable-next-line twenty/no-state-useref -- Focus recovery waits for loading without stealing focus from another control.
  const pendingFocus = useRef(false);
  // oxlint-disable-next-line twenty/no-state-useref -- Track loss of the visible private editor across loading renders.
  const hadEditor = useRef(false);
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
    orphanAllocationCursor: orphanCursor,
    selectedTaskId: selectedSources.taskId,
    selectedParentTaskId: selectedSources.parentTaskId,
    taskSearch,
    limit: 30,
  };
  const query = useQuery<
    DeliveryCommitmentsQuery,
    DeliveryCommitmentsQueryVariables & {
      identity: string | null;
      authorization: string;
    }
  >(GET_COMMITMENTS, {
    variables: { input, identity: permission.scopeKey, authorization },
    skip: !ready,
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    pollInterval: 30000,
  });
  const parentQuery = useQuery<
    DeliveryCommitmentsQuery,
    DeliveryCommitmentsQueryVariables & {
      identity: string | null;
      authorization: string;
    }
  >(GET_COMMITMENTS, {
    variables: {
      input: { engagementId, periodId, taskSearch: parentSearch, limit: 100 },
      identity: permission.scopeKey,
      authorization,
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
  const parentCandidate = parentQuery.data?.deliveryCommitments;
  const knownContractLoss =
    isCommitmentSourceUnavailable(permission.error) ||
    isCommitmentSourceUnavailable(query.error) ||
    (editor?.selection.kind === 'assign' &&
      isCommitmentSourceUnavailable(parentQuery.error));
  const contractUnavailable = contractDenied || knownContractLoss;
  const readSource = `${scope}:${authorization}:${JSON.stringify(input)}`;
  const [verifiedSource, setVerifiedSource] = useState<string | null>(null);
  const trusted =
    !contractUnavailable &&
    !query.error &&
    matches(candidate) &&
    (!candidate?.selectedTask ||
      candidate.selectedTask.taskId === selectedSources.taskId) &&
    (!candidate?.selectedParent ||
      candidate.selectedParent.taskId === selectedSources.parentTaskId);
  const refreshing =
    query.loading &&
    [NetworkStatus.poll, NetworkStatus.refetch].includes(query.networkStatus);
  if (trusted && !query.loading && verifiedSource !== readSource)
    setVerifiedSource(readSource);
  else if (
    verifiedSource !== null &&
    (!trusted || (query.loading && !refreshing))
  )
    setVerifiedSource(null);
  const data =
    trusted && (!query.loading || (refreshing && verifiedSource === readSource))
      ? candidate
      : undefined;
  const knownTaskLoss = Boolean(
    (data && !data.taskDetailsAvailable) ||
    (editor?.selection.kind === 'assign' &&
      !parentQuery.loading &&
      !parentQuery.error &&
      matches(parentCandidate) &&
      !parentCandidate?.taskDetailsAvailable) ||
    (data &&
      !query.loading &&
      ((selectedSources.taskId && !data.selectedTask) ||
        (selectedSources.parentTaskId && !data.selectedParent))),
  );
  const canPrepareTasks = Boolean(
    data?.taskDetailsAvailable && !taskPreparationDenied && !knownTaskLoss,
  );
  const parentOptions =
    !parentQuery.error &&
    !parentQuery.loading &&
    matches(parentCandidate) &&
    parentCandidate?.taskDetailsAvailable
      ? parentCandidate.taskOptions
      : [];
  const hasManagementCapability =
    permission.access?.capabilities.some(
      (capability) =>
        capability === 'delivery.manage' || capability === 'workspace.admin',
    ) === true;
  const managementDenied = ready && !hasManagementCapability;
  const canManage = data?.canManage === true && hasManagementCapability;
  const startRequest = useFinanceExportRequestGuard(
    `${scope}:${authorization}:${engagementId}:${linkedPeriodId ?? ''}`,
    canManage,
  );
  const invalidateTaskPreparation = useCallback(() => {
    epoch.current += 1;
    setTaskPreparationDenied(true);
    setSelectedSources({ taskId: null, parentTaskId: null });
    setTaskSearch('');
    setParentSearch('');
    if (
      editor?.selection.kind === 'assign' ||
      editor?.selection.kind === 'remove'
    ) {
      setEditor(null);
      setSaving(false);
      setError('');
    }
    cancelPendingNavigation();
  }, [editor, cancelPendingNavigation]);
  useLayoutEffect(() => {
    if (knownContractLoss && !contractDenied) {
      epoch.current += 1;
      setContractDenied(true);
      setEditor(null);
      setSelectedSources({ taskId: null, parentTaskId: null });
      setTaskSearch('');
      setParentSearch('');
      setSaving(false);
      setError('');
      cancelPendingNavigation();
    } else if ((managementDenied || (data && !canManage)) && editor) {
      epoch.current += 1;
      setEditor(null);
      setSelectedSources({ taskId: null, parentTaskId: null });
      setTaskSearch('');
      setParentSearch('');
      setSaving(false);
      setError('');
      cancelPendingNavigation();
    } else if (knownTaskLoss && !taskPreparationDenied)
      invalidateTaskPreparation();
  }, [
    knownContractLoss,
    contractDenied,
    data,
    canManage,
    managementDenied,
    editor,
    knownTaskLoss,
    taskPreparationDenied,
    cancelPendingNavigation,
    invalidateTaskPreparation,
  ]);
  useLayoutEffect(() => {
    epoch.current += 1;
    setSaving(false);
    return () => {
      epoch.current += 1;
    };
  }, [scope, authorization, engagementId]);
  useLayoutEffect(() => {
    const visibleEditor = Boolean(
      editor && data && canManage && !contractUnavailable,
    );
    if (visibleEditor) pendingFocus.current = false;
    else if (hadEditor.current) pendingFocus.current = true;
    hadEditor.current = visibleEditor;
    if (pendingFocus.current && !query.loading && !permission.loading) {
      pendingFocus.current = false;
      if (
        document.activeElement === document.body ||
        document.activeElement === document.documentElement
      )
        (recoveryFocus.current ?? refreshFocus.current)?.focus();
    }
  }, [
    editor,
    data,
    canManage,
    contractUnavailable,
    query.loading,
    permission.loading,
  ]);
  const refresh = async () => {
    if (!ready) {
      await permission.refetch();
      return;
    }
    const started = epoch.current;
    const result = (await query.refetch()).data?.deliveryCommitments;
    if (started !== epoch.current || !matches(result))
      throw new Error(t`Current commitment access could not be verified.`);
    setContractDenied(false);
    return result;
  };
  const checkTaskAccess = async () => {
    try {
      const result = await refresh();
      if (result?.taskDetailsAvailable) setTaskPreparationDenied(false);
    } catch {}
  };
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
  const openEditor = (selection: CommitmentEditorSelection) => {
    const started = epoch.current;
    requestAction(() => {
      if (
        started !== epoch.current ||
        !data ||
        ((selection.kind === 'assign' || selection.kind === 'remove') &&
          !canPrepareTasks)
      )
        return;
      setSelectedSources({
        taskId: selection.kind === 'remove' ? selection.taskId : null,
        parentTaskId: null,
      });
      setEditor({ selection, key: crypto.randomUUID(), snapshot: data });
      setError('');
    });
  };
  const changePage = (
    cursor: string | null,
    page: 'work' | 'history' | 'orphans' = 'work',
  ) =>
    requestAction(() => {
      setEditor(null);
      setError('');
      const next = new URLSearchParams(params);
      next.set('clientEngagement', engagementId);
      if (data?.selectedPeriodId)
        next.set('commitmentPeriod', data.selectedPeriodId);
      const key =
        page === 'history'
          ? 'commitmentHistoryBefore'
          : page === 'orphans'
            ? 'commitmentOrphansAfter'
            : 'commitmentAllocationsAfter';
      if (cursor) next.set(key, cursor);
      else next.delete(key);
      setParams(next);
    });
  const save = async (command: CommitmentCommand) => {
    const currentAccess = permission.access;
    if (!canManage || saving || !currentAccess) return false;
    const current = startRequest();
    const started = epoch.current;
    const taskCommand = command.kind === 'assign' || command.kind === 'remove';
    if (taskCommand && !canPrepareTasks) return false;
    const stillCurrent = () =>
      current() && (!taskCommand || started === epoch.current);
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
      if (!stillCurrent()) {
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
      if (!stillCurrent()) {
        setSaving(false);
        return false;
      }
      if (isCommitmentSourceUnavailable(failure)) {
        try {
          const checked = (await query.refetch()).data?.deliveryCommitments;
          if (!stillCurrent()) {
            setSaving(false);
            return false;
          }
          if (
            taskCommand &&
            matches(checked) &&
            (!checked?.taskDetailsAvailable ||
              (selectedSources.taskId && !checked.selectedTask) ||
              (selectedSources.parentTaskId && !checked.selectedParent))
          )
            invalidateTaskPreparation();
        } catch {}
        if (!stillCurrent()) {
          setSaving(false);
          return false;
        }
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
    setSelectedSources({ taskId: null, parentTaskId: null });
    if (
      params.get('clientEngagement') !== engagementId ||
      linkedPeriodId !== destinationPeriodId ||
      allocationCursor ||
      historyCursor ||
      orphanCursor
    ) {
      setSaving(false);
      requestAction(() => {
        if (stillCurrent()) selectPeriod(destinationPeriodId);
      });
      return true;
    }
    try {
      await query.refetch({
        input: { engagementId, periodId: destinationPeriodId, limit: 30 },
        identity: permission.scopeKey,
        authorization,
      });
    } catch {
      if (!stillCurrent()) return true;
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
              ref={refreshFocus}
              disabled={saving || query.loading}
              onClick={() =>
                void refresh()
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
            <StyledDeliveryButton
              ref={recoveryFocus}
              onClick={() => void refresh().catch(() => undefined)}
            >
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
        {editor && !contractUnavailable && (
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
              saving={saving}
              busy={
                saving ||
                query.loading ||
                parentQuery.loading ||
                !data ||
                !canManage
              }
              taskOptions={data?.taskOptions ?? []}
              parentOptions={parentOptions}
              onSelectedSources={setSelectedSources}
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
                setSelectedSources({ taskId: null, parentTaskId: null });
                setError('');
              }}
              onReload={async () => {
                const started = epoch.current;
                setSaving(true);
                try {
                  const result = (await query.refetch()).data
                    ?.deliveryCommitments;
                  if (started !== epoch.current || !matches(result)) return;
                  setSelectedSources({ taskId: null, parentTaskId: null });
                  setEditor({ ...editor, key: crypto.randomUUID() });
                  setError('');
                } catch {
                  if (started !== epoch.current) return;
                  setError(
                    t`Could not reload the latest plan. Your draft is still here.`,
                  );
                } finally {
                  if (started === epoch.current) setSaving(false);
                }
              }}
            />
          </div>
        )}
        {(allocationCursor || historyCursor || orphanCursor) && !data && (
          <StyledCommitmentActions>
            {allocationCursor && (
              <StyledDeliveryButton onClick={() => changePage(null)}>
                <Trans>First work page</Trans>
              </StyledDeliveryButton>
            )}
            {historyCursor && (
              <StyledDeliveryButton onClick={() => changePage(null, 'history')}>
                <Trans>Latest history</Trans>
              </StyledDeliveryButton>
            )}
            {orphanCursor && (
              <StyledDeliveryButton onClick={() => changePage(null, 'orphans')}>
                <Trans>First unavailable-source page</Trans>
              </StyledDeliveryButton>
            )}
          </StyledCommitmentActions>
        )}
        {data && (
          <>
            <p>
              <Trans>
                Totals cover the full commitment. Linked work and task history
                show only work you can currently access.
              </Trans>
            </p>
            {!canPrepareTasks && (
              <div role="status">
                <p>
                  {!data.taskDetailsAvailable
                    ? t`Task details cannot be checked with current access. Contract quantities, period editing and eligible allocation cleanup remain available.`
                    : t`Private task preparation was cleared because selected work is no longer available. Check task access before linking work again.`}
                </p>
                <StyledDeliveryButton
                  ref={recoveryFocus}
                  disabled={query.loading}
                  onClick={() => void checkTaskAccess()}
                >
                  <Trans>Check task access</Trans>
                </StyledDeliveryButton>
              </div>
            )}
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
                          {t`Assigned work items: ${line.assignedQuantity}`}
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
                  <Trans>Linked work you can access</Trans>
                </summary>
                <StyledDeliveryStack>
                  {canManage && period.state === 'OPEN' && (
                    <StyledCommitmentActions>
                      <StyledDeliveryButton
                        disabled={
                          saving || !canPrepareTasks || !data.lines.length
                        }
                        onClick={() => openEditor({ kind: 'assign' })}
                      >
                        <Trans>Link a task</Trans>
                      </StyledDeliveryButton>
                    </StyledCommitmentActions>
                  )}
                  {!data.allocations.length && (
                    <p>
                      <Trans>No accessible linked work on this page.</Trans>
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
                            {!item.parentTaskId &&
                              data.lines.find((line) => line.id === item.lineId)
                                ?.unit === 'VARIATION' && (
                                <p>
                                  <Trans>
                                    Original video unavailable with current
                                    access.
                                  </Trans>
                                </p>
                              )}
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
                                disabled={saving || !canPrepareTasks}
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
                      <Trans>No accessible history on this page.</Trans>
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
                        onClick={() => changePage(null, 'history')}
                      >
                        <Trans>Latest history</Trans>
                      </StyledDeliveryButton>
                    )}
                    {data.nextHistoryCursor && (
                      <StyledDeliveryButton
                        disabled={query.loading}
                        onClick={() =>
                          changePage(data.nextHistoryCursor ?? null, 'history')
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
        <CommitmentOrphanCleanup
          data={data}
          identity={identity}
          owner={permission.access}
          engagementId={engagementId}
          canManage={canManage}
          denied={
            contractUnavailable ||
            managementDenied ||
            Boolean(data && !canManage)
          }
          cursor={orphanCursor}
          onPrepare={() => {
            setEditor(null);
            setError('');
          }}
          onPage={(cursor) => changePage(cursor, 'orphans')}
          onChanged={refresh}
          editorOpen={Boolean(editor)}
        />
      </StyledDeliveryStack>
    </StyledDeliveryCard>
  );
};
