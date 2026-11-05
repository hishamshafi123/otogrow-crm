import { useLayoutEffect, useRef, useState } from 'react';
import { NetworkStatus } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import { useLingui } from '@lingui/react/macro';
import { fastDeepEqual } from 'twenty-shared/utils';
import { useDeliveryDraft } from '@/delivery/drafts/useDeliveryDraft';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { isDeliveryTaskUnavailable } from '@/delivery/tasks/isDeliveryTaskUnavailable';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import {
  GET_TASK_WORKFLOW,
  SAVE_WORKFLOW_PROGRESS,
  APPLY_WORKFLOW,
} from '@/delivery/workflows/delivery-workflows.graphql';
import { type TaskWorkflow } from '@/delivery/workflows/workflow.types';
import {
  type DeliveryTaskWorkflowQuery,
  type SaveDeliveryWorkflowProgressMutation,
  type ApplyDeliveryWorkflowMutation,
  type DeliveryWorkflowApplyInput,
} from '~/generated-metadata/graphql';

const answers = (data: TaskWorkflow | undefined) => ({
  checkedIds: data?.workflow?.checkedIds ?? [],
  evidence:
    data?.workflow?.definition.evidence.map((requirement) => ({
      requirementId: requirement.id,
      value:
        data.workflow?.evidence.find(
          (answer) => answer.requirementId === requirement.id,
        )?.value ?? '',
    })) ?? [],
});
export const useTaskWorkflow = ({
  taskId,
  taskRevision,
  onChanged,
  onUnavailable,
}: {
  taskId: string;
  taskRevision: number;
  onChanged?: () => Promise<unknown>;
  onUnavailable?: () => void;
}) => {
  const { t } = useLingui();
  const access = useWorkflowAccess();
  const { requestAction, cancelPendingNavigation } = useDeliveryDraftGuard();
  const identity = `${access.scope}:${taskId}`;
  const [boundary, setBoundary] = useState({ identity, denied: false });
  // oxlint-disable-next-line twenty/no-state-useref -- Replies from an earlier authority cannot restore private preparation.
  const epoch = useRef(0);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [saved, setSaved] = useState<TaskWorkflow>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const currentAuthorization = access.ready
    ? JSON.stringify({
        capabilities: [...(access.access?.capabilities ?? [])].sort(),
        roleIds: [...(access.access?.roleIds ?? [])].sort(),
        grants: access.access?.grants ?? [],
      })
    : null;
  const [authorizationEvidence, setAuthorizationEvidence] = useState({
    scope: access.scope,
    signature: currentAuthorization ?? '',
  });
  if (
    currentAuthorization !== null &&
    (authorizationEvidence.scope !== access.scope ||
      authorizationEvidence.signature !== currentAuthorization)
  )
    setAuthorizationEvidence({
      scope: access.scope,
      signature: currentAuthorization,
    });
  const authorization =
    currentAuthorization ??
    (authorizationEvidence.scope === access.scope
      ? authorizationEvidence.signature
      : '');
  const source = `${access.scope}:${authorization}:${taskId}:${taskRevision}:${historyCursor ?? ''}`;
  const query = useQuery<DeliveryTaskWorkflowQuery>(GET_TASK_WORKFLOW, {
    variables: {
      input: { taskId, historyCursor },
      identity: access.scope,
      taskRevision,
      authorization,
    },
    skip: !access.ready,
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    pollInterval: 30000,
  });
  const knownAccessLoss =
    access.denied || isDeliveryTaskUnavailable(query.error);
  const unavailable =
    knownAccessLoss || (boundary.identity === identity && boundary.denied);
  const candidate = query.data?.deliveryTaskWorkflow;
  const current =
    saved && (!candidate || saved.taskRevision > candidate.taskRevision)
      ? saved
      : candidate;
  const trusted =
    !unavailable &&
    !query.error &&
    access.matches(current) &&
    current?.taskId === taskId &&
    current.taskRevision >= taskRevision;
  const fresh = trusted && !query.loading ? current : undefined;
  // Keep the editor snapshot in memory while read errors hide its contents.
  const [lastRead, setLastRead] = useState<{
    identity: string;
    source: string;
    data: TaskWorkflow;
  }>();
  if (
    fresh &&
    (lastRead?.source !== source || !fastDeepEqual(fresh, lastRead.data))
  )
    setLastRead({ identity, source, data: fresh });
  const refreshing =
    query.loading &&
    [NetworkStatus.poll, NetworkStatus.refetch].includes(query.networkStatus);
  const [verifiedSource, setVerifiedSource] = useState<string | null>(null);
  const canRetain =
    !unavailable &&
    !query.error &&
    lastRead?.source === source &&
    access.matches(lastRead.data) &&
    (!current || trusted);
  if (fresh && verifiedSource !== source) setVerifiedSource(source);
  else if (
    verifiedSource !== null &&
    (!canRetain || (query.loading && !refreshing))
  )
    setVerifiedSource(null);
  const data =
    fresh ??
    (refreshing && verifiedSource === source && canRetain
      ? lastRead?.data
      : undefined);
  const lastData =
    !unavailable && lastRead?.identity === identity ? lastRead.data : undefined;
  const draft = useDeliveryDraft({
    initialValues: answers(data ?? lastData),
    revision: data?.taskRevision ?? lastData?.taskRevision ?? 0,
    busy,
  });
  const [progress] = useMutation<SaveDeliveryWorkflowProgressMutation>(
    SAVE_WORKFLOW_PROGRESS,
  );
  const [apply] = useMutation<ApplyDeliveryWorkflowMutation>(APPLY_WORKFLOW);
  const invalidate = () => {
    epoch.current += 1;
    setBoundary({ identity, denied: true });
    setSaved(undefined);
    setLastRead(undefined);
    setVerifiedSource(null);
    draft.markSaved(answers(undefined));
    setHistoryCursor(null);
    setError('');
    setNotice('');
    setBusy(false);
    cancelPendingNavigation();
    onUnavailable?.();
  };
  useLayoutEffect(() => {
    if (knownAccessLoss && !(boundary.identity === identity && boundary.denied))
      invalidate();
  });
  useLayoutEffect(() => {
    epoch.current += 1;
    setBusy(false);
    return () => {
      epoch.current += 1;
    };
  }, [identity, authorization, access.ready]);
  const readCurrent = async (started: number) => {
    try {
      const result = (await query.refetch()).data?.deliveryTaskWorkflow;
      if (started !== epoch.current) return undefined;
      if (
        !access.matches(result) ||
        result?.taskId !== taskId ||
        result.taskRevision < taskRevision
      )
        throw new Error(t`Current task requirements could not be verified.`);
      return result;
    } catch (failure) {
      if (started !== epoch.current) return undefined;
      if (isDeliveryTaskUnavailable(failure)) invalidate();
      else
        setError(
          t`Current task requirements could not be verified. Your draft is kept.`,
        );
      return undefined;
    }
  };
  const write = async (operation: () => Promise<TaskWorkflow | undefined>) => {
    if (busy || !data) return false;
    const started = epoch.current;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      let result: TaskWorkflow | undefined;
      try {
        result = await operation();
      } catch (failure) {
        if (started !== epoch.current) return false;
        // Reopening writes the native status; its denial alone does not revoke read access.
        if (isDeliveryTaskUnavailable(failure) && !(await readCurrent(started)))
          return false;
        if (started !== epoch.current) return false;
        setError(
          failure instanceof Error
            ? failure.message
            : t`The change could not be saved. Your draft is kept.`,
        );
        return false;
      }
      if (started !== epoch.current) return false;
      if (!access.matches(result) || result?.taskId !== taskId) {
        setError(t`The result could not be verified. Refresh before retrying.`);
        return false;
      }
      setSaved(result);
      draft.markSaved(answers(result));
      setNotice(t`Workflow saved.`);
      try {
        await onChanged?.();
        if (started !== epoch.current) return false;
        await readCurrent(started);
      } catch {
        if (started === epoch.current)
          setNotice(
            t`Saved, but the task could not refresh. Refresh before making another change.`,
          );
      }
      return started === epoch.current;
    } finally {
      if (started === epoch.current) setBusy(false);
    }
  };
  return {
    access,
    source: identity,
    unavailable,
    data,
    snapshot: data ?? lastData,
    draft,
    busy,
    error,
    notice,
    loading: access.loading || query.loading,
    readError: access.error || query.error,
    readyToSubmit:
      Boolean(data) &&
      data?.taskRevision === taskRevision &&
      !busy &&
      !draft.dirty &&
      !draft.stale &&
      data?.missingRequirements.length === 0,
    saveProgress: () =>
      data?.canEdit && !draft.stale && data.workflow
        ? write(
            async () =>
              (
                await progress({
                  variables: {
                    input: {
                      taskId,
                      taskRevision: draft.revision,
                      workflowRevision: data.workflow!.revision,
                      checkedIds: draft.values.checkedIds,
                      evidence: draft.values.evidence,
                    },
                  },
                })
              ).data?.saveDeliveryWorkflowProgress,
          )
        : Promise.resolve(false),
    apply: (input: DeliveryWorkflowApplyInput) =>
      data?.canManage && access.manager
        ? write(
            async () =>
              (await apply({ variables: { input } })).data
                ?.applyDeliveryWorkflow,
          )
        : Promise.resolve(false),
    reset: () => {
      draft.markSaved(answers(data ?? lastData));
      setError('');
    },
    reload: () =>
      requestAction(async () => {
        const started = epoch.current;
        setBusy(true);
        const result = await readCurrent(started);
        if (started !== epoch.current) return;
        if (result) {
          setSaved(result);
          draft.markSaved(answers(result));
          setError('');
          setNotice('');
        }
        setBusy(false);
      }),
    retry: async () => {
      if (access.error || !access.ready) {
        await access.refetch().catch(() => undefined);
        return;
      }
      const started = epoch.current;
      const result = await readCurrent(started);
      if (result && started === epoch.current) {
        setBoundary({ identity, denied: false });
        setError('');
      }
    },
    historyCursor,
    changePage: (cursor: string | null, onPageChanged?: () => void) =>
      requestAction(() => {
        draft.markSaved(answers(data ?? lastData));
        setHistoryCursor(cursor);
        onPageChanged?.();
        setError('');
      }),
  };
};
export type TaskWorkflowController = ReturnType<typeof useTaskWorkflow>;
