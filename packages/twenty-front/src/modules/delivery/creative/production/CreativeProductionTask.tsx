import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { fastDeepEqual } from 'twenty-shared/utils';
import { CreativeDueDate } from '@/delivery/creative/production/CreativeDueDate';
import { DeliveryCreative } from '@/delivery/DeliveryCreative';
import { DeliveryTaskAssignmentRead } from '@/delivery/tasks/DeliveryTaskAssignmentRead';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { useAssistantPanelFocus } from '@/delivery/assistants/useAssistantPanelFocus';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { type useCreativeProductionContext } from '@/delivery/creative/production/useCreativeProductionContext';
import {
  GET_CREATIVE_DETAIL,
  GET_CREATIVE_STATE,
} from '@/delivery/creative/production/creative-production.graphql';
import {
  creativeProductionDestination,
  creativeProductionStage,
  creativeApprovalDestination,
} from '@/delivery/creative/production/creative-production-navigation';
import { creativeProductionDocument } from '@/delivery/creative/production/creative-production-document';
import { isCreativeSourceUnavailable } from '@/delivery/creative/production/creative-production-errors';
import { CreativeApprovedReferences } from '@/delivery/creative/production/CreativeApprovedReferences';
import {
  StyledCreativeBoundary,
  StyledCreativeFacts,
  StyledCreativeTaskHeading,
  StyledCreativeToolbar,
} from '@/delivery/creative/production/creative-production-styles';
import { useTaskLabels } from '@/delivery/tasks/useTaskLabels';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import {
  type DeliveryCreativeDetailQuery,
  type DeliveryCreativeStateQuery,
} from '~/generated-metadata/graphql';

type CreativeDetail = DeliveryCreativeDetailQuery['deliveryCreativeDetail'];
export const CreativeProductionTask = ({
  state,
  taskId,
}: {
  state: ReturnType<typeof useCreativeProductionContext>;
  taskId: string;
}) => {
  const { t } = useLingui();
  const labels = useTaskLabels();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { requestAction, cancelPendingNavigation } = useDeliveryDraftGuard();
  const focusPanel = useAssistantPanelFocus();
  const source = `${state.source}:${state.data?.scope ?? ''}:${taskId}`;
  const [denied, setDenied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [retained, setRetained] = useState<CreativeDetail | null>(null);
  const [privateEpoch, setPrivateEpoch] = useState(0);
  // oxlint-disable-next-line twenty/no-state-useref -- A previous task's asynchronous refresh must not restore a revoked editor.
  const epoch = useRef(0);
  useLayoutEffect(() => {
    epoch.current += 1;
    return () => {
      epoch.current += 1;
    };
  }, [taskId, state.source]);
  const matches = (
    value: Pick<
      DeliveryCreativeStateQuery['deliveryCreativeState'],
      | 'workspaceId'
      | 'memberId'
      | 'userWorkspaceId'
      | 'actor'
      | 'scope'
      | 'task'
    >,
  ) =>
    state.matches(value) &&
    value.scope === state.data?.scope &&
    value.task.id === taskId;
  const query = useQuery<DeliveryCreativeStateQuery>(GET_CREATIVE_STATE, {
    variables: { input: { taskId }, identity: source },
    fetchPolicy: 'no-cache',
    pollInterval: 30000,
    notifyOnNetworkStatusChange: true,
    skip: state.data === null,
  });
  const reading = useAssistantRead({
    value: query.data?.deliveryCreativeState,
    source,
    enabled: state.data !== null,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches,
  });
  const detailQuery = useQuery<DeliveryCreativeDetailQuery>(
    GET_CREATIVE_DETAIL,
    {
      variables: { input: { taskId }, identity: source },
      fetchPolicy: 'no-cache',
      notifyOnNetworkStatusChange: true,
      skip: reading.data === null,
    },
  );
  const detailRead = useAssistantRead({
    value: detailQuery.data?.deliveryCreativeDetail,
    source,
    enabled: reading.data !== null,
    loading: detailQuery.loading,
    error: detailQuery.error,
    networkStatus: detailQuery.networkStatus,
    matches: (value) =>
      matches(value) &&
      value.task.revision === reading.data?.task.revision &&
      value.task.projectRevision === reading.data.task.projectRevision &&
      value.task.canEdit === reading.data.task.canEdit &&
      value.task.assigneeId === reading.data.task.assigneeId,
  });
  const lostEdit =
    retained?.task.canEdit === true &&
    reading.data !== null &&
    (!reading.data.task.canEdit ||
      retained.task.assigneeId !== reading.data.task.assigneeId);
  const knownLoss =
    state.denied ||
    isCreativeSourceUnavailable(query.error) ||
    isCreativeSourceUnavailable(detailQuery.error) ||
    lostEdit;
  const detail = !denied && !knownLoss ? detailRead.data : null;
  if (detail && !fastDeepEqual(detail, retained)) setRetained(detail);
  useLayoutEffect(() => {
    if (knownLoss) {
      epoch.current += 1;
      cancelPendingNavigation();
      setRetained(null);
      setDenied(true);
      setPrivateEpoch((value) => value + 1);
    }
  }, [knownLoss, cancelPendingNavigation]);
  const authorityLost = useCallback(() => {
    epoch.current += 1;
    cancelPendingNavigation();
    setRetained(null);
    setDenied(true);
    setPrivateEpoch((value) => value + 1);
  }, [cancelPendingNavigation]);
  const refresh = async () => {
    const currentEpoch = epoch.current;
    setRefreshing(true);
    setRefreshFailed(false);
    try {
      const metadata = (await query.refetch()).data?.deliveryCreativeState;
      if (!metadata || !matches(metadata))
        throw new Error('Unverified creative state');
      const current = (await detailQuery.refetch()).data
        ?.deliveryCreativeDetail;
      if (
        !current ||
        !matches(current) ||
        current.task.revision !== metadata.task.revision ||
        current.task.projectRevision !== metadata.task.projectRevision
      )
        throw new Error('Unverified creative detail');
      if (epoch.current !== currentEpoch) return;
      setDenied(false);
      setRetained(current);
    } catch (failure) {
      if (epoch.current === currentEpoch) {
        if (isCreativeSourceUnavailable(failure)) authorityLost();
        setRefreshFailed(true);
      }
      throw failure;
    } finally {
      if (epoch.current === currentEpoch) setRefreshing(false);
    }
  };
  const available =
    detail !== null && state.data !== null && !denied && !knownLoss;
  const current = detail ?? retained;
  const back = () =>
    requestAction(() =>
      navigate(creativeProductionDestination(params, { task: null })),
    );
  const refreshAction = (
    <StyledDeliveryButton
      type="button"
      disabled={refreshing}
      onClick={() => void refresh().catch(() => undefined)}
    >
      {refreshing ? t`Refreshing…` : t`Refresh production`}
    </StyledDeliveryButton>
  );
  return (
    <StyledDeliveryStack>
      <StyledCreativeToolbar>
        <StyledDeliveryButton type="button" onClick={back}>
          <Trans>Back to production queue</Trans>
        </StyledDeliveryButton>
      </StyledCreativeToolbar>
      {!available && (
        <StyledDeliveryCard>
          <p
            role={
              knownLoss ||
              denied ||
              query.error ||
              detailQuery.error ||
              refreshFailed
                ? 'alert'
                : 'status'
            }
          >
            {knownLoss || denied
              ? t`This task or editing access is no longer available. Private preparation was cleared. Check current access before reopening.`
              : reading.data &&
                  retained &&
                  reading.data.task.revision !== retained.task.revision
                ? t`This task has changed. Refresh production to compare your unsaved work with the current version.`
                : query.error || detailQuery.error || refreshFailed
                  ? t`Current production could not be checked. Information is hidden and unsaved work is kept while you retry.`
                  : t`Loading the exact production task…`}
          </p>
          <StyledCreativeToolbar>{refreshAction}</StyledCreativeToolbar>
        </StyledDeliveryCard>
      )}
      <StyledCreativeBoundary
        hidden={!available}
        disabled={!available}
        inert={!available || undefined}
      >
        {current && (
          <div key={`${taskId}:${privateEpoch}`} ref={focusPanel} tabIndex={-1}>
            <StyledCreativeTaskHeading>
              <h2>{current.task.title}</h2>
              <StyledCreativeFacts>
                <div>
                  <dt>
                    <Trans>Assigned to</Trans>
                  </dt>
                  <dd>{current.task.assigneeName ?? t`Unassigned`}</dd>
                </div>
                <div>
                  <dt>
                    <Trans>Status</Trans>
                  </dt>
                  <dd>{labels.state(current.task.state)}</dd>
                </div>
                {current.task.dueAt && (
                  <div>
                    <dt>
                      <Trans>Due</Trans>
                    </dt>
                    <dd>
                      <CreativeDueDate value={current.task.dueAt} />
                    </dd>
                  </div>
                )}
              </StyledCreativeFacts>
              <details>
                <summary>
                  <Trans>Task details</Trans>
                </summary>
                <StyledDeliveryStack>
                  <StyledCreativeFacts>
                    <div>
                      <dt>
                        <Trans>Project</Trans>
                      </dt>
                      <dd>{current.task.projectName}</dd>
                    </div>
                    <div>
                      <dt>
                        <Trans>Service</Trans>
                      </dt>
                      <dd>{current.task.service}</dd>
                    </div>
                    {!current.task.dueAt && (
                      <div>
                        <dt>
                          <Trans>Due</Trans>
                        </dt>
                        <dd>
                          <Trans>No due date</Trans>
                        </dd>
                      </div>
                    )}
                  </StyledCreativeFacts>
                  <StyledCreativeToolbar>{refreshAction}</StyledCreativeToolbar>
                </StyledDeliveryStack>
              </details>
            </StyledCreativeTaskHeading>
            {current.task.assignmentKey && (
              <DeliveryTaskAssignmentRead
                key={`${current.task.id}:${current.task.assignmentKey}`}
                taskId={current.task.id}
                assignmentKey={current.task.assignmentKey}
                scope={source}
                identity={current}
                enabled={
                  available &&
                  current.task.assigneeId === current.actor.memberId
                }
              />
            )}
            <DeliveryCreative
              task={{
                id: current.task.id,
                title: current.task.title,
                projectId: current.task.projectId,
                revision: current.task.revision,
                assigneeId: current.task.assigneeId ?? null,
                details: {
                  state: current.task.state,
                  creative: creativeProductionDocument(current.document),
                },
              }}
              actor={current.actor}
              canEdit={current.task.canEdit}
              stage={creativeProductionStage(
                params.get('creativeStage'),
                params,
              )}
              onStageChange={(stage) =>
                navigate(
                  creativeProductionDestination(params, {
                    creativeStage: stage,
                  }),
                )
              }
              onAuthorityLost={authorityLost}
              onChanged={refresh}
              onOpenTask={() =>
                requestAction(() =>
                  navigate(creativeApprovalDestination(params, taskId)),
                )
              }
              renderApprovedReferences={(reuse, disabled) => (
                <CreativeApprovedReferences
                  state={state}
                  taskId={taskId}
                  projectId={current.task.projectId}
                  projectRevision={current.task.projectRevision}
                  disabled={disabled || !available}
                  onReuse={reuse}
                />
              )}
            />
          </div>
        )}
      </StyledCreativeBoundary>
    </StyledDeliveryStack>
  );
};
