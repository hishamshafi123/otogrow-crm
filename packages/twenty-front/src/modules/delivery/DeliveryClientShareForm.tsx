import { useLayoutEffect, useRef, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { type ClientEngagement } from '@/delivery/delivery-clients.types';
import { type DeliveryTask } from '@/delivery/delivery.types';
import { useAssistantAccess } from '@/delivery/assistants/useAssistantAccess';
import { isDeliveryTaskUnavailable } from '@/delivery/tasks/isDeliveryTaskUnavailable';
import { type TaskDetailSnapshot } from '@/delivery/tasks/task.types';
import {
  GET_TASK_DETAIL,
  GET_TASK_LIST,
} from '@/delivery/tasks/delivery-tasks.graphql';
import {
  type DeliveryTaskListQuery,
  type DeliveryTaskListQueryVariables,
} from '~/generated-metadata/graphql';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import {
  useDeliveryDraftGuard,
  useDeliveryDraftStatus,
} from '@/delivery/drafts/DeliveryDraftGuard';

type DeliveryClientShareFormProps = {
  engagement: ClientEngagement;
  busy: boolean;
  run: (input: Record<string, unknown>) => Promise<boolean>;
};
const canShare = (task: DeliveryTask, kind: 'BRIEF' | 'SUBMISSION') =>
  kind === 'BRIEF'
    ? Boolean(task.details.creative) &&
      task.details.creative?.approvedBriefVersion ===
        task.details.creative?.briefVersion
    : task.details.state === 'APPROVED';

export const DeliveryClientShareForm = (
  props: DeliveryClientShareFormProps,
) => {
  const access = useAssistantAccess();
  return (
    <ClientShareSelection
      key={`${access.source}:${props.engagement.id}:${props.engagement.projectId}`}
      engagement={props.engagement}
      busy={props.busy}
      run={props.run}
      access={access}
    />
  );
};
const ClientShareSelection = ({
  engagement,
  busy,
  run,
  access: { permission, source },
}: DeliveryClientShareFormProps & {
  access: ReturnType<typeof useAssistantAccess>;
}) => {
  const { t } = useLingui();
  const [selected, setSelected] = useState<{
    id: string;
    revision: number;
  } | null>(null);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [after, setAfter] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [readDenied, setReadDenied] = useState(false);
  const { requestAction, cancelPendingNavigation } = useDeliveryDraftGuard();
  // oxlint-disable-next-line twenty/no-state-useref -- A late verification cannot start a share after the source or authority was removed.
  const epoch = useRef(0);
  // oxlint-disable-next-line twenty/no-state-useref -- Same-turn share clicks must perform at most one checked command.
  const pending = useRef(false);
  const recoveryFocus = useRef<HTMLButtonElement>(null);
  // oxlint-disable-next-line twenty/no-state-useref -- Focus follows removed private controls only when the browser lost its active control.
  const previouslyAvailable = useRef(false);
  // oxlint-disable-next-line twenty/no-state-useref -- Recovery focus waits until the access-check button is enabled.
  const pendingFocus = useRef(false);
  const list = useQuery<
    DeliveryTaskListQuery,
    DeliveryTaskListQueryVariables & { identity: string }
  >(GET_TASK_LIST, {
    variables: {
      identity: source,
      input: {
        view: 'PLANNER',
        projectId: engagement.projectId,
        timezone: 'Asia/Qatar',
        search: appliedSearch,
        after,
        limit: 25,
      },
    },
    skip: !permission.ready || !permission.manager,
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    pollInterval: 30000,
  });
  const detail = useQuery<{ deliveryTaskDetail: TaskDetailSnapshot }>(
    GET_TASK_DETAIL,
    {
      variables: { input: { taskId: selected?.id }, identity: source },
      skip: !selected || !permission.ready || !permission.manager,
      fetchPolicy: 'no-cache',
      notifyOnNetworkStatusChange: true,
      pollInterval: 30000,
    },
  );
  const knownLoss =
    permission.denied ||
    (permission.ready && !permission.manager) ||
    isDeliveryTaskUnavailable(list.error) ||
    (Boolean(selected) && isDeliveryTaskUnavailable(detail.error));
  const clearPrivateSelection = () => {
    epoch.current += 1;
    pending.current = false;
    setReadDenied(true);
    setSelected(null);
    setSearch('');
    setAppliedSearch('');
    setAfter(null);
    setSaving(false);
    setError('');
    cancelPendingNavigation();
  };
  useLayoutEffect(() => {
    if (knownLoss && !readDenied) clearPrivateSelection();
  });
  useLayoutEffect(
    () => () => {
      epoch.current += 1;
    },
    [],
  );
  const listed = list.data?.deliveryTaskList;
  const exact = detail.data?.deliveryTaskDetail;
  const task =
    !detail.loading &&
    !detail.error &&
    permission.matches(exact) &&
    exact?.task.id === selected?.id &&
    exact?.task.projectId === engagement.projectId
      ? exact.task
      : null;
  const available =
    permission.manager &&
    !readDenied &&
    !knownLoss &&
    !list.loading &&
    !list.error &&
    permission.matches(listed) &&
    (!selected || detail.loading || Boolean(task));
  useLayoutEffect(() => {
    if (previouslyAvailable.current && !available) pendingFocus.current = true;
    previouslyAvailable.current = available;
    if (pendingFocus.current && !list.loading && !detail.loading && !saving) {
      pendingFocus.current = false;
      if (
        document.activeElement === document.body ||
        document.activeElement === document.documentElement
      )
        recoveryFocus.current?.focus();
    }
  }, [available, list.loading, detail.loading, saving]);
  const tasks = available
    ? (listed?.items.filter(
        (item) => item.projectId === engagement.projectId,
      ) ?? [])
    : [];
  const stale = Boolean(
    selected && task && task.revision !== selected.revision,
  );
  useDeliveryDraftStatus({
    dirty: selected !== null,
    saving: busy || saving,
  });
  const refresh = async () => {
    const started = epoch.current;
    setError('');
    try {
      await permission.refetch();
      const result = await list.refetch();
      if (
        started !== epoch.current ||
        !permission.matches(result.data?.deliveryTaskList)
      )
        return;
      if (selected) {
        const checked = (await detail.refetch()).data?.deliveryTaskDetail;
        if (started !== epoch.current) return;
        if (
          !permission.matches(checked) ||
          checked?.task.id !== selected.id ||
          checked.task.projectId !== engagement.projectId
        )
          throw new Error();
      }
      setReadDenied(false);
    } catch (failure) {
      if (started !== epoch.current) return;
      if (isDeliveryTaskUnavailable(failure)) clearPrivateSelection();
      else
        setError(
          t`Task access could not be checked. Your selection is kept until it can be verified.`,
        );
    }
  };
  const share = async (kind: 'BRIEF' | 'SUBMISSION') => {
    if (
      !available ||
      !selected ||
      !task ||
      stale ||
      busy ||
      pending.current ||
      !canShare(task, kind)
    )
      return;
    const started = epoch.current;
    pending.current = true;
    let dispatched = false;
    setSaving(true);
    setError('');
    try {
      const checked = (await detail.refetch()).data?.deliveryTaskDetail;
      if (started !== epoch.current) return;
      if (
        !permission.matches(checked) ||
        checked?.task.id !== selected.id ||
        checked.task.projectId !== engagement.projectId
      )
        throw new Error();
      if (
        checked.task.revision !== selected.revision ||
        !canShare(checked.task, kind)
      ) {
        setError(
          t`The selected task changed. Review the latest approved version before sharing.`,
        );
        return;
      }
      dispatched = true;
      if (
        await run({
          action: 'share',
          engagementId: engagement.id,
          taskId: selected.id,
          revision: selected.revision,
          kind,
        })
      ) {
        if (started === epoch.current) setSelected(null);
      }
    } catch (failure) {
      if (started !== epoch.current) return;
      if (isDeliveryTaskUnavailable(failure)) clearPrivateSelection();
      else
        setError(
          dispatched
            ? t`The share result could not be confirmed. Check the existing shared versions before trying again.`
            : t`The selected version could not be checked. Nothing was shared; check task access before trying again.`,
        );
    } finally {
      if (started === epoch.current) {
        pending.current = false;
        setSaving(false);
      }
    }
  };
  return (
    <StyledDeliveryStack>
      <h3>
        <Trans>Share an approved version</Trans>
      </h3>
      {error && <p role="alert">{error}</p>}
      {!available && (
        <p
          role={
            knownLoss || readDenied || list.error || detail.error
              ? 'alert'
              : 'status'
          }
        >
          {knownLoss || readDenied
            ? t`Task access changed. The private selection was cleared. Client agreements and existing portal access remain separate.`
            : t`Task choices are hidden until current access and the selected version can be checked.`}
        </p>
      )}
      <StyledDeliveryButton
        ref={recoveryFocus}
        type="button"
        disabled={saving || list.loading || detail.loading}
        onClick={() => void refresh()}
      >
        <Trans>Check task access</Trans>
      </StyledDeliveryButton>
      {after && (
        <StyledDeliveryButton
          type="button"
          disabled={busy || saving}
          onClick={() => setAfter(null)}
        >
          <Trans>First task page</Trans>
        </StyledDeliveryButton>
      )}
      {available && (
        <>
          {stale && (
            <div role="alert">
              <p>
                <Trans>
                  The selected task changed. Review the latest version before
                  sharing it with the client.
                </Trans>
              </p>
              <StyledDeliveryButton
                disabled={busy || saving || !task}
                onClick={() =>
                  requestAction(() => {
                    if (task)
                      setSelected({ id: task.id, revision: task.revision });
                  })
                }
              >
                <Trans>Reload selected version</Trans>
              </StyledDeliveryButton>
            </div>
          )}
          <label>
            <Trans>Find a task to share</Trans>
            <input
              value={search}
              maxLength={200}
              disabled={busy || saving}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <StyledDeliveryButton
            type="button"
            disabled={busy || saving}
            onClick={() => {
              setAppliedSearch(search.trim());
              setAfter(null);
            }}
          >
            <Trans>Search tasks</Trans>
          </StyledDeliveryButton>
          <label>
            <Trans>Task</Trans>
            <select
              disabled={busy || saving}
              value={selected?.id ?? ''}
              onChange={(event) => {
                const next = tasks.find(
                  (item) => item.id === event.target.value,
                );
                setSelected(
                  next ? { id: next.id, revision: next.revision } : null,
                );
                setError('');
              }}
            >
              <option value="">{t`Choose a task`}</option>
              {selected &&
                !task &&
                !tasks.some((item) => item.id === selected.id) && (
                  <option
                    value={selected.id}
                  >{t`Checking selected task…`}</option>
                )}
              {task && !tasks.some((item) => item.id === task.id) && (
                <option value={task.id}>{task.title}</option>
              )}
              {tasks.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          {!tasks.length && !task && (
            <p>
              <Trans>No accessible tasks match this page.</Trans>
            </p>
          )}
          {listed?.nextCursor && (
            <StyledDeliveryButton
              type="button"
              disabled={busy || saving}
              onClick={() => setAfter(listed.nextCursor ?? null)}
            >
              <Trans>Next task page</Trans>
            </StyledDeliveryButton>
          )}
          {selected && task && (
            <small>
              {t`Selected task version`}: {selected.revision}
            </small>
          )}
          {(['BRIEF', 'SUBMISSION'] as const).map((kind) => (
            <StyledDeliveryButton
              key={kind}
              disabled={
                !selected ||
                !task ||
                !canShare(task, kind) ||
                stale ||
                busy ||
                saving
              }
              onClick={() => void share(kind)}
            >
              {kind === 'BRIEF'
                ? t`Share approved brief`
                : t`Share approved submission`}
            </StyledDeliveryButton>
          ))}
        </>
      )}
      <small>
        <Trans>
          Only the selected approved version is visible to the client. Internal
          notes and generated candidates stay private.
        </Trans>
      </small>
    </StyledDeliveryStack>
  );
};
