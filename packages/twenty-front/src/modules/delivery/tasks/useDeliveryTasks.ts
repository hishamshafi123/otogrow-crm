import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { NetworkStatus } from '@apollo/client';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { useMutation, useQuery } from '@apollo/client/react';
import { useLingui } from '@lingui/react/macro';
import { fastDeepEqual, isValidUuid } from 'twenty-shared/utils';
import {
  type ChangeDeliveryTaskMutation,
  type DeliveryTaskListQuery,
  type DeliveryTaskListInput,
} from '~/generated-metadata/graphql';
import {
  type TaskDetailSnapshot,
  type TaskWorkspaceContext,
  type TaskListSnapshot,
} from '@/delivery/tasks/task.types';
import {
  GET_TASK_CONTEXT,
  GET_TASK_LIST,
  GET_TASK_DETAIL,
  CHANGE_TASK,
} from '@/delivery/tasks/delivery-tasks.graphql';
import { taskCommandSchema } from '@/delivery/tasks/task-command';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { hasOtogrowCapability } from '@/otogrow-access/otogrow-access.types';
import { isDeliveryTaskUnavailable } from '@/delivery/tasks/isDeliveryTaskUnavailable';
type TaskCommandAttempt = {
  scope: string;
  instance: string;
  key: string;
  create: boolean;
  receipt: ChangeDeliveryTaskMutation['changeDeliveryTask'] | null;
  unknown: boolean;
};
export const useDeliveryTasks = (
  input: DeliveryTaskListInput | null,
  selectedId: string | null,
  {
    listEnabled = true,
    reviewView = false,
  }: { listEnabled?: boolean; reviewView?: boolean } = {},
) => {
  const { t } = useLingui();
  const permission = useWorkflowAccess();
  const currentAuthorization = permission.ready
    ? JSON.stringify({
        capabilities: [...(permission.access?.capabilities ?? [])].sort(),
        roleIds: [...(permission.access?.roleIds ?? [])].sort(),
        grants: permission.access?.grants ?? [],
        nativeAdministrator: permission.access?.nativeAdministrator ?? false,
      })
    : null;
  const [authorizationEvidence, setAuthorizationEvidence] = useState({
    scope: permission.scope,
    signature: currentAuthorization ?? '',
  });
  if (
    currentAuthorization !== null &&
    (authorizationEvidence.scope !== permission.scope ||
      authorizationEvidence.signature !== currentAuthorization)
  )
    setAuthorizationEvidence({
      scope: permission.scope,
      signature: currentAuthorization,
    });
  const authorization =
    currentAuthorization ??
    (authorizationEvidence.scope === permission.scope
      ? authorizationEvidence.signature
      : '');
  const contextQuery = useQuery<{
    deliveryWorkspaceContext: TaskWorkspaceContext;
  }>(GET_TASK_CONTEXT, {
    variables: { identity: permission.scope, authorization },
    fetchPolicy: 'no-cache',
    pollInterval: 30000,
    skip: !permission.ready,
  });
  const candidate = contextQuery.data?.deliveryWorkspaceContext;
  const contextUnavailable =
    permission.denied || isDeliveryTaskUnavailable(contextQuery.error);
  const [contextEvidence, setContextEvidence] = useState<{
    scope: string;
    context: TaskWorkspaceContext;
  } | null>(null);
  const contextScope = `${permission.scope}:${authorization}`;
  const actorMatches =
    candidate &&
    fastDeepEqual(
      [...candidate.actor.capabilities].sort(),
      [...(permission.access?.capabilities ?? [])].sort(),
    ) &&
    fastDeepEqual(
      [...candidate.actor.roleIds].sort(),
      [...(permission.access?.roleIds ?? [])].sort(),
    );
  const contextTrusted =
    !contextUnavailable &&
    !contextQuery.error &&
    permission.matches(candidate) &&
    candidate !== undefined &&
    candidate.actor.memberId === candidate.memberId &&
    actorMatches;
  const freshContext =
    contextTrusted && !contextQuery.loading
      ? {
          ...candidate,
          actor: {
            ...candidate.actor,
            isManager: candidate.actor.isManager && permission.manager,
            isAdmin:
              candidate.actor.isAdmin &&
              permission.access?.capabilities.includes('workspace.admin') ===
                true,
          },
        }
      : null;
  if (
    freshContext &&
    (contextEvidence?.scope !== contextScope ||
      !fastDeepEqual(freshContext, contextEvidence.context))
  )
    setContextEvidence({ scope: contextScope, context: freshContext });
  const refreshingContext =
    contextQuery.loading &&
    [NetworkStatus.poll, NetworkStatus.refetch].includes(
      contextQuery.networkStatus,
    );
  const current =
    freshContext ??
    (contextTrusted &&
    refreshingContext &&
    contextEvidence?.scope === contextScope
      ? contextEvidence.context
      : null);
  const verified = Boolean(current);
  const viewAllowed =
    (input?.view !== 'PLANNER' || permission.manager) &&
    (!reviewView ||
      hasOtogrowCapability(
        permission.access?.capabilities ?? [],
        'delivery.review',
      ));
  const directory = current ?? contextEvidence?.context;
  const dataScope = `${contextScope}:${JSON.stringify(directory?.projects.map((project) => ({ id: project.id, revision: project.revision, memberIds: [...project.memberIds].sort() })) ?? [])}`;
  const detailSource = `${permission.scope}:${selectedId ?? ''}`;
  const [detailBoundary, setDetailBoundary] = useState({
    source: detailSource,
    denied: false,
    readRevision: 0,
  });
  if (detailBoundary.source !== detailSource)
    setDetailBoundary({
      source: detailSource,
      denied: false,
      readRevision: detailBoundary.readRevision,
    });
  const listReadScope = `${dataScope}:${detailBoundary.readRevision}`;
  const listQuery = useQuery<DeliveryTaskListQuery>(GET_TASK_LIST, {
    variables: { input, identity: listReadScope },
    fetchPolicy: 'no-cache',
    pollInterval: 30000,
    skip: !listEnabled || !verified || !input || !viewAllowed,
  });
  const listScope = `${listReadScope}:${JSON.stringify(input)}`;
  const listTrusted =
    listEnabled &&
    verified &&
    viewAllowed &&
    input &&
    !listQuery.error &&
    permission.matches(listQuery.data?.deliveryTaskList) &&
    listQuery.data?.deliveryTaskList.items.every((task) =>
      current?.projects.some((project) => project.id === task.projectId),
    ) &&
    listQuery.data?.deliveryTaskList.timezone === input.timezone;
  const freshList =
    listTrusted && !listQuery.loading
      ? (listQuery.data?.deliveryTaskList ?? null)
      : null;
  const [listEvidence, setListEvidence] = useState<{
    scope: string;
    snapshot: TaskListSnapshot;
  } | null>(null);
  if (
    freshList &&
    (listEvidence?.scope !== listScope ||
      !fastDeepEqual(freshList, listEvidence.snapshot))
  )
    setListEvidence({ scope: listScope, snapshot: freshList });
  const refreshingList =
    listQuery.loading &&
    [NetworkStatus.poll, NetworkStatus.refetch].includes(
      listQuery.networkStatus,
    );
  const list =
    freshList ??
    (listTrusted && refreshingList && listEvidence?.scope === listScope
      ? listEvidence.snapshot
      : null);
  const validSelection = Boolean(selectedId && isValidUuid(selectedId));
  const detailQuery = useQuery<{ deliveryTaskDetail: TaskDetailSnapshot }>(
    GET_TASK_DETAIL,
    {
      variables: { input: { taskId: selectedId }, identity: dataScope },
      fetchPolicy: 'no-cache',
      pollInterval: 30000,
      skip: !verified || !validSelection || !viewAllowed,
    },
  );
  const [attempt, setAttempt] = useState<TaskCommandAttempt | null>(null);
  const receipt = attempt?.scope === permission.scope ? attempt.receipt : null;
  const detailCandidate = detailQuery.data?.deliveryTaskDetail;
  const knownDetailLoss =
    contextUnavailable ||
    (listEnabled && isDeliveryTaskUnavailable(listQuery.error)) ||
    isDeliveryTaskUnavailable(detailQuery.error);
  const taskUnavailable =
    validSelection &&
    (knownDetailLoss ||
      (detailBoundary.source === detailSource && detailBoundary.denied));
  const detailTrusted = Boolean(
    verified &&
    viewAllowed &&
    validSelection &&
    !taskUnavailable &&
    !detailQuery.error &&
    permission.matches(detailCandidate) &&
    detailCandidate?.task.id === selectedId &&
    current?.projects.some(
      (project) => project.id === detailCandidate.task.projectId,
    ) &&
    (!receipt ||
      receipt.taskId !== selectedId ||
      detailCandidate.task.revision >= receipt.revision),
  );
  const [detailEvidence, setDetailEvidence] = useState<{
    scope: string;
    ownerScope: string;
    snapshot: TaskDetailSnapshot;
  } | null>(null);
  if (
    detailTrusted &&
    !detailQuery.loading &&
    detailCandidate &&
    (detailEvidence?.scope !== dataScope ||
      !fastDeepEqual(detailCandidate, detailEvidence.snapshot))
  )
    setDetailEvidence({
      scope: dataScope,
      ownerScope: permission.scope,
      snapshot: detailCandidate,
    });
  const refreshingDetail =
    detailQuery.loading &&
    [NetworkStatus.poll, NetworkStatus.refetch].includes(
      detailQuery.networkStatus,
    );
  const verifiedDetail =
    detailTrusted && !detailQuery.loading
      ? detailCandidate
      : detailTrusted &&
          refreshingDetail &&
          detailEvidence?.scope === dataScope &&
          detailEvidence.snapshot.task.id === selectedId
        ? detailEvidence.snapshot
        : null;
  const detailVerified = Boolean(verifiedDetail);
  const detail = verifiedDetail?.task ?? null;
  const [mutate] = useMutation<ChangeDeliveryTaskMutation>(CHANGE_TASK);
  const [busy, setBusy] = useState(false);
  const source = `${permission.scope}:${selectedId ?? ''}`;
  const [messages, setMessages] = useState({ source, message: '', error: '' });
  if (messages.source !== source)
    setMessages({ source, message: '', error: '' });
  const setMessage = (message: string) =>
    setMessages((currentMessage) =>
      currentMessage.source === source
        ? { ...currentMessage, message }
        : currentMessage,
    );
  const setError = (error: string) =>
    setMessages((currentMessage) =>
      currentMessage.source === source
        ? { ...currentMessage, error }
        : currentMessage,
    );
  // oxlint-disable-next-line twenty/no-state-useref -- A late response cannot publish evidence into a changed authority or task scope.
  const epoch = useRef(0);
  useLayoutEffect(() => {
    epoch.current += 1;
    return () => {
      epoch.current += 1;
    };
  }, [dataScope, verified, selectedId]);
  const invalidateDetail = useCallback(() => {
    epoch.current += 1;
    setDetailBoundary((currentBoundary) =>
      currentBoundary.source === detailSource && currentBoundary.denied
        ? currentBoundary
        : {
            source: detailSource,
            denied: true,
            readRevision: currentBoundary.readRevision + 1,
          },
    );
    setDetailEvidence(null);
  }, [detailSource]);
  useLayoutEffect(() => {
    if (knownDetailLoss) invalidateDetail();
  }, [knownDetailLoss, invalidateDetail]);
  useLayoutEffect(() => {
    if (contextUnavailable) setContextEvidence(null);
  }, [contextUnavailable]);
  const retryDetail = async () => {
    if (!verified || !validSelection || !viewAllowed || busy) return false;
    const started = epoch.current;
    try {
      const snapshot = (await detailQuery.refetch()).data?.deliveryTaskDetail;
      if (started !== epoch.current) return false;
      if (
        !snapshot ||
        !permission.matches(snapshot) ||
        snapshot.task.id !== selectedId ||
        !current?.projects.some(
          (project) => project.id === snapshot.task.projectId,
        ) ||
        (receipt?.taskId === selectedId &&
          snapshot.task.revision < receipt.revision)
      )
        return false;
      setDetailBoundary((currentBoundary) => ({
        source: detailSource,
        denied: false,
        readRevision: currentBoundary.readRevision,
      }));
      setDetailEvidence({
        scope: dataScope,
        ownerScope: permission.scope,
        snapshot,
      });
      return true;
    } catch (failure) {
      if (started === epoch.current && isDeliveryTaskUnavailable(failure))
        invalidateDetail();
      return false;
    }
  };
  const refresh = async () => {
    const reads = [
      contextQuery.refetch(),
      ...(input && listEnabled ? [listQuery.refetch()] : []),
      ...(validSelection ? [detailQuery.refetch()] : []),
      contextQuery.client.refetchQueries({
        include: 'active',
        onQueryUpdated: (observableQuery) =>
          [
            'DeliveryCapacitySummary',
            'DeliveryCapacityAssignments',
            'DeliveryReviewQueue',
          ].includes(observableQuery.queryName ?? '')
            ? observableQuery.refetch()
            : false,
      }),
    ];
    const results = await Promise.allSettled(reads);
    return results.every((result) => result.status === 'fulfilled');
  };
  const run = async (value: Record<string, unknown>, attemptKey = 'task') => {
    const command = taskCommandSchema.safeParse(value);
    if (!command.success) return false;
    const key = `${attemptKey}:${JSON.stringify(command.data)}`;
    if (
      command.data.action === 'create' &&
      attempt?.scope === permission.scope &&
      attempt.instance === attemptKey &&
      attempt.unknown
    ) {
      setError(
        t`The create request is unconfirmed. Check new work before starting another request; do not submit this draft again.`,
      );
      return false;
    }
    if (attempt?.scope === permission.scope && attempt.key === key) {
      if (attempt.receipt) return true;
      if (attempt.unknown) {
        setError(
          t`The create request is unconfirmed. Check new work before starting another request; do not submit this draft again.`,
        );
        return false;
      }
    }
    if (!verified || busy || !current) return false;
    if (
      command.data.action === 'create'
        ? !permission.manager
        : !detailVerified || command.data.taskId !== selectedId
    )
      return false;
    const started = epoch.current;
    const identity = {
      workspaceId: current.workspaceId,
      memberId: current.memberId,
      userWorkspaceId: current.userWorkspaceId,
    };
    const initiatingScope = permission.scope;
    const create = command.data.action === 'create';
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = (await mutate({ variables: { input: command.data } })).data
        ?.changeDeliveryTask;
      if (
        !result ||
        result.workspaceId !== identity.workspaceId ||
        result.memberId !== identity.memberId ||
        result.userWorkspaceId !== identity.userWorkspaceId ||
        (command.data.taskId && result.taskId !== command.data.taskId)
      )
        throw new Error(
          t`The task receipt could not be verified. Refresh before making another request.`,
        );
      setAttempt({
        scope: initiatingScope,
        instance: attemptKey,
        key,
        create,
        receipt: result,
        unknown: false,
      });
      if (started !== epoch.current) return true;
      setMessage(t`Task saved.`);
      const results = await Promise.allSettled([
        refresh(),
        contextQuery.client.refetchQueries({
          include: 'active',
          onQueryUpdated: (observableQuery) =>
            ['DeliveryTaskReview', 'DeliveryTaskWorkflow'].includes(
              observableQuery.queryName ?? '',
            )
              ? observableQuery.refetch()
              : false,
        }),
      ]);
      if (
        started === epoch.current &&
        results.some(
          (result) => result.status === 'rejected' || result.value === false,
        )
      )
        setMessage(
          t`Task saved. Some views could not refresh; refresh before making another change.`,
        );
      return true;
    } catch (failure) {
      if (
        !create &&
        started === epoch.current &&
        isDeliveryTaskUnavailable(failure)
      ) {
        invalidateDetail();
        setError('');
        return false;
      }
      const unknown = create && !CombinedGraphQLErrors.is(failure);
      if (unknown)
        setAttempt({
          scope: initiatingScope,
          instance: attemptKey,
          key,
          create,
          receipt: null,
          unknown: true,
        });
      if (started === epoch.current)
        setError(
          unknown
            ? t`The create request is unconfirmed. Check new work before starting another request; do not submit this draft again.`
            : failure instanceof Error
              ? failure.message
              : t`This task action was not confirmed. Refresh the task before trying again; your draft is kept.`,
        );
      return false;
    } finally {
      setBusy(false);
    }
  };
  const currentReceipt =
    receipt &&
    permission.matches(receipt) &&
    (selectedId === receipt.taskId || (!selectedId && attempt?.create))
      ? receipt
      : null;
  const unknownCreate =
    attempt?.scope === permission.scope && attempt.create && attempt.unknown
      ? attempt.instance
      : null;
  const message = messages.source === source ? messages.message : '';
  return {
    readScope: dataScope,
    permission,
    context: current,
    retainedContext: contextUnavailable
      ? null
      : (contextEvidence?.context ?? null),
    contextUnavailable,
    sourceUnavailable: knownDetailLoss,
    contextVerified: verified,
    contextQuery,
    list,
    listQuery,
    detail,
    detailVerified,
    retainedDetail:
      !taskUnavailable &&
      detailEvidence?.ownerScope === permission.scope &&
      detailEvidence?.snapshot.task.id === selectedId
        ? detailEvidence.snapshot.task
        : null,
    detailQuery,
    taskUnavailable,
    invalidateDetail,
    retryDetail,
    validSelection,
    busy,
    error: messages.source === source ? messages.error : '',
    message: message || (currentReceipt ? t`Task saved.` : ''),
    receipt: currentReceipt,
    unknownCreate,
    refresh,
    run,
  };
};
