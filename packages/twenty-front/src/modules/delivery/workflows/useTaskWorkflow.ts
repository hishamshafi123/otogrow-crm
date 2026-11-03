import { useState } from 'react';
import { NetworkStatus } from '@apollo/client';
import { useMutation, useQuery } from '@apollo/client/react';
import { useLingui } from '@lingui/react/macro';
import { fastDeepEqual } from 'twenty-shared/utils';
import { useDeliveryDraft } from '@/delivery/drafts/useDeliveryDraft';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
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
}: {
  taskId: string;
  taskRevision: number;
  onChanged?: () => Promise<unknown>;
}) => {
  const { t } = useLingui();
  const access = useWorkflowAccess();
  const { requestAction } = useDeliveryDraftGuard();
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
  const candidate = query.data?.deliveryTaskWorkflow;
  const current =
    saved && (!candidate || saved.taskRevision > candidate.taskRevision)
      ? saved
      : candidate;
  const trusted =
    !query.error &&
    access.matches(current) &&
    current?.taskId === taskId &&
    current.taskRevision >= taskRevision;
  const fresh = trusted && !query.loading ? current : undefined;
  // Keep the editor snapshot in memory while read errors hide its contents.
  const [lastRead, setLastRead] = useState<{
    scope: string;
    source: string;
    data: TaskWorkflow;
  }>();
  if (
    fresh &&
    (lastRead?.source !== source || !fastDeepEqual(fresh, lastRead.data))
  )
    setLastRead({ scope: access.scope, source, data: fresh });
  const refreshing =
    query.loading &&
    [NetworkStatus.poll, NetworkStatus.refetch].includes(query.networkStatus);
  const [verifiedSource, setVerifiedSource] = useState<string | null>(null);
  const canRetain =
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
  const lastData = lastRead?.scope === access.scope ? lastRead.data : undefined;
  const draft = useDeliveryDraft({
    initialValues: answers(data ?? lastData),
    revision: data?.taskRevision ?? lastData?.taskRevision ?? 0,
    busy,
  });
  const [progress] = useMutation<SaveDeliveryWorkflowProgressMutation>(
    SAVE_WORKFLOW_PROGRESS,
  );
  const [apply] = useMutation<ApplyDeliveryWorkflowMutation>(APPLY_WORKFLOW);
  const write = async (operation: () => Promise<TaskWorkflow | undefined>) => {
    if (busy || !data) return false;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      let result: TaskWorkflow | undefined;
      try {
        result = await operation();
      } catch (failure) {
        setError(
          failure instanceof Error
            ? failure.message
            : t`The change could not be saved. Your draft is kept.`,
        );
        return false;
      }
      if (!access.matches(result) || result?.taskId !== taskId) {
        setError(t`The result could not be verified. Refresh before retrying.`);
        return false;
      }
      setSaved(result);
      draft.markSaved(answers(result));
      setNotice(t`Workflow saved.`);
      try {
        await onChanged?.();
        await query.refetch();
      } catch {
        setNotice(
          t`Saved, but the task could not refresh. Refresh before making another change.`,
        );
      }
      return true;
    } finally {
      setBusy(false);
    }
  };
  return {
    access,
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
      write(
        async () =>
          (await apply({ variables: { input } })).data?.applyDeliveryWorkflow,
      ),
    reset: () => {
      draft.markSaved(answers(data ?? lastData));
      setError('');
    },
    reload: () =>
      requestAction(async () => {
        setBusy(true);
        try {
          const result = (await query.refetch()).data?.deliveryTaskWorkflow;
          if (!access.matches(result) || result?.taskId !== taskId)
            throw new Error(t`This task is no longer available.`);
          setSaved(result);
          draft.markSaved(answers(result));
          setError('');
          setNotice('');
        } catch (failure) {
          setError(
            failure instanceof Error
              ? failure.message
              : t`Could not refresh. Your draft is kept.`,
          );
        } finally {
          setBusy(false);
        }
      }),
    retry: () =>
      void (access.error ? access.refetch() : query.refetch()).catch(
        () => undefined,
      ),
    historyCursor,
    changePage: (cursor: string | null) =>
      requestAction(() => {
        draft.markSaved(answers(data ?? lastData));
        setHistoryCursor(cursor);
        setError('');
      }),
  };
};
export type TaskWorkflowController = ReturnType<typeof useTaskWorkflow>;
