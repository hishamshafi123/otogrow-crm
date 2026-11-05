import { useLayoutEffect, useRef, useState } from 'react';
import { NetworkStatus } from '@apollo/client';
import { useQuery, useMutation } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { isDeliveryTaskUnavailable } from '@/delivery/tasks/isDeliveryTaskUnavailable';
import { type DeliveryTask } from '@/delivery/delivery.types';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import {
  GET_REVISIONS,
  SAVE_REVISION,
} from '@/delivery/revisions/delivery-revisions.graphql';
import { RevisionEditor } from '@/delivery/revisions/RevisionEditor';
import { useRevisionLabels } from '@/delivery/revisions/useRevisionLabels';
import {
  type DeliveryRevisionsQuery,
  type SaveDeliveryRevisionMutation,
  type DeliveryRevisionSaveInput,
} from '~/generated-metadata/graphql';
type RevisionRound =
  DeliveryRevisionsQuery['deliveryRevisions']['rounds'][number];
type DeliveryRevisionsProps = {
  task: DeliveryTask;
  onUnavailable?: () => void;
};
export const DeliveryRevisions = ({
  task,
  onUnavailable,
}: DeliveryRevisionsProps) => {
  const access = useWorkflowAccess();
  return (
    <RevisionHistory
      key={`${access.scope}:${task.id}`}
      task={task}
      onUnavailable={onUnavailable}
    />
  );
};
type RevisionHistoryProps = DeliveryRevisionsProps;
const RevisionHistory = ({ task, onUnavailable }: RevisionHistoryProps) => {
  const { t } = useLingui();
  const access = useWorkflowAccess();
  const { requestAction, cancelPendingNavigation } = useDeliveryDraftGuard();
  const { label, money } = useRevisionLabels();
  const [beforeRound, setBeforeRound] = useState<number | null>(null);
  const [editing, setEditing] = useState<RevisionRound | null>(null);
  const [notice, setNotice] = useState('');
  const [denied, setDenied] = useState(false);
  const recovery = useRef<HTMLButtonElement>(null);
  // oxlint-disable-next-line twenty/no-state-useref -- A late save must not close or restore an editor after access changes.
  const epoch = useRef(0);
  // oxlint-disable-next-line twenty/no-state-useref -- Recovery only takes focus lost from removed private controls.
  const wasVisible = useRef(false);
  // oxlint-disable-next-line twenty/no-state-useref -- Loading can end after private controls have already lost focus.
  const pendingFocus = useRef(false);
  const currentAuthorization = access.ready
    ? JSON.stringify({
        capabilities: [...(access.access?.capabilities ?? [])].sort(),
        roleIds: [...(access.access?.roleIds ?? [])].sort(),
        grants: access.access?.grants ?? [],
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
  const source = `${authorization}:${task.revision}:${beforeRound ?? ''}`;
  const [verifiedSource, setVerifiedSource] = useState<string | null>(null);
  const query = useQuery<DeliveryRevisionsQuery>(GET_REVISIONS, {
    variables: {
      input: { taskId: task.id, beforeRound },
      identity: access.scope,
      taskRevision: task.revision,
      authorization,
    },
    skip: !access.ready,
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    pollInterval: 30000,
  });
  const [save] = useMutation<SaveDeliveryRevisionMutation>(SAVE_REVISION);
  const knownAccessLoss =
    access.denied || isDeliveryTaskUnavailable(query.error);
  const unavailable = denied || knownAccessLoss;
  const candidate = query.data?.deliveryRevisions;
  const trusted =
    !unavailable &&
    !query.error &&
    access.matches(candidate) &&
    candidate?.taskId === task.id;
  const refreshing =
    query.loading &&
    [NetworkStatus.poll, NetworkStatus.refetch].includes(query.networkStatus);
  if (trusted && !query.loading && verifiedSource !== source)
    setVerifiedSource(source);
  else if (
    verifiedSource !== null &&
    (!trusted || (query.loading && !refreshing))
  )
    setVerifiedSource(null);
  const data =
    trusted && (!query.loading || (refreshing && verifiedSource === source))
      ? candidate
      : null;
  const invalidate = () => {
    epoch.current += 1;
    setDenied(true);
    setEditing(null);
    setBeforeRound(null);
    setNotice('');
    cancelPendingNavigation();
    onUnavailable?.();
  };
  useLayoutEffect(() => {
    if (knownAccessLoss && !denied) invalidate();
  });
  useLayoutEffect(() => {
    epoch.current += 1;
    return () => {
      epoch.current += 1;
    };
  }, [access.scope, access.ready, authorization]);
  useLayoutEffect(() => {
    if (data) pendingFocus.current = false;
    else if (wasVisible.current) pendingFocus.current = true;
    wasVisible.current = Boolean(data);
    if (pendingFocus.current && !query.loading && !access.loading) {
      pendingFocus.current = false;
      if (
        document.activeElement === document.body ||
        document.activeElement === document.documentElement
      )
        recovery.current?.focus();
    }
  }, [data, query.loading, access.loading]);
  const readCurrent = async (started: number) => {
    try {
      const result = (await query.refetch()).data?.deliveryRevisions;
      if (started !== epoch.current) return false;
      if (!access.matches(result) || result?.taskId !== task.id) return false;
      return true;
    } catch (failure) {
      if (started === epoch.current && isDeliveryTaskUnavailable(failure))
        invalidate();
      return false;
    }
  };
  const retry = async () => {
    if (access.error || !access.ready) {
      await access.refetch().catch(() => undefined);
      return;
    }
    const started = epoch.current;
    if (await readCurrent(started)) setDenied(false);
  };
  const saveRound = async (input: DeliveryRevisionSaveInput) => {
    if (!data || !access.ready) return false;
    const started = epoch.current;
    try {
      const result = await save({ variables: { input } });
      if (started !== epoch.current || !result.data?.saveDeliveryRevision)
        return false;
      setNotice(t`Revision details saved.`);
      if (!(await readCurrent(started)) && started === epoch.current)
        setNotice(
          t`Revision saved. Refresh the page to load its latest details.`,
        );
      return started === epoch.current;
    } catch {
      // A denied cost correction may leave the history readable; verify before disposing it.
      if (started === epoch.current) await readCurrent(started);
      return false;
    }
  };
  return (
    <StyledDeliveryCard>
      <StyledDeliveryStack>
        <h3>
          <Trans>Revision rounds</Trans>
        </h3>
        <small>
          <Trans>
            Tracked from review and reopening decisions. Earlier work remains in
            submission history; missing reasons and costs are not assumed.
          </Trans>
        </small>
        {!data && (
          <div role={query.loading || access.loading ? 'status' : 'alert'}>
            <p>
              {query.loading || access.loading
                ? t`Loading revision history…`
                : unavailable
                  ? t`Revision history is no longer available. Private preparation was cleared. Check current access before reopening.`
                  : t`Revision details could not be refreshed. Previous details are hidden and your draft is kept.`}
            </p>
            <StyledDeliveryButton
              ref={recovery}
              onClick={retry}
              disabled={query.loading || access.loading}
            >
              <Trans>Retry revision history</Trans>
            </StyledDeliveryButton>
          </div>
        )}
        {notice && <p role="status">{notice}</p>}
        {editing && !unavailable && (
          <div hidden={!data}>
            <RevisionEditor
              key={editing.id}
              taskId={task.id}
              initial={editing}
              latest={data?.rounds.find((round) => round.id === editing.id)}
              canManage={Boolean(data?.canManage)}
              canManageFinance={Boolean(data?.canManageFinance)}
              onSave={saveRound}
              onClose={() => setEditing(null)}
            />
          </div>
        )}
        {data && (
          <>
            {data.rounds.length === 0 && (
              <p>
                <Trans>No tracked revision rounds.</Trans>
              </p>
            )}
            {data.rounds.map((round) => (
              <section
                key={round.id}
                aria-label={t`Revision round ${round.round}`}
              >
                <StyledDeliveryStack>
                  <StyledDeliveryRow>
                    <strong>
                      {t`Round ${round.round}`} · {label(round.cause)}
                    </strong>
                    <small>{new Date(round.createdAt).toLocaleString()}</small>
                  </StyledDeliveryRow>
                  <small>
                    {label(round.source)} ·{' '}
                    {round.submissionVersion
                      ? t`Submission ${round.submissionVersion}`
                      : t`Before first submission`}
                  </small>
                  <p style={{ whiteSpace: 'pre-wrap' }}>
                    {round.reason || t`No reason recorded.`}
                  </p>
                  <p>
                    {round.effortMinutes === null ||
                    round.effortMinutes === undefined
                      ? t`Revision effort not recorded`
                      : t`Recorded effort: ${round.effortMinutes} min`}
                  </p>
                  {data.canReadFinance && (
                    <p>{t`Recorded cost: ${money(round.internalCost, round.currency)} · Proposed charge: ${money(round.proposedCharge, round.currency)}`}</p>
                  )}
                  {(data.canManage || data.canManageFinance) && (
                    <StyledDeliveryButton
                      onClick={() =>
                        requestAction(() => {
                          setNotice('');
                          setEditing(round);
                        })
                      }
                    >{t`Edit round ${round.round}`}</StyledDeliveryButton>
                  )}
                </StyledDeliveryStack>
              </section>
            ))}
            <StyledDeliveryRow>
              {beforeRound && (
                <StyledDeliveryButton
                  onClick={() =>
                    requestAction(() => {
                      setEditing(null);
                      setBeforeRound(null);
                    })
                  }
                >
                  <Trans>Newest rounds</Trans>
                </StyledDeliveryButton>
              )}
              {data.nextBeforeRound && (
                <StyledDeliveryButton
                  onClick={() =>
                    requestAction(() => {
                      setEditing(null);
                      setBeforeRound(data.nextBeforeRound ?? null);
                    })
                  }
                >
                  <Trans>Older rounds</Trans>
                </StyledDeliveryButton>
              )}
            </StyledDeliveryRow>
          </>
        )}
      </StyledDeliveryStack>
    </StyledDeliveryCard>
  );
};
