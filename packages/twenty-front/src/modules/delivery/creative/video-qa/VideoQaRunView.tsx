import { useLayoutEffect, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { Link, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { fastDeepEqual } from 'twenty-shared/utils';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { useAssistantPanelFocus } from '@/delivery/assistants/useAssistantPanelFocus';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import { type useVideoQaAccess } from '@/delivery/creative/video-qa/useVideoQaAccess';
import {
  GET_VIDEO_QA_STATE,
  GET_VIDEO_QA_RUN,
} from '@/delivery/creative/video-qa/delivery-video-qa.graphql';
import {
  type VideoQaIntent,
  type VideoQaRun,
} from '@/delivery/creative/video-qa/video-qa.types';
import { videoQaNotFound } from '@/delivery/creative/video-qa/useVideoQaCommands';
import { videoQaDestination } from '@/delivery/creative/video-qa/video-qa-navigation';
import { VideoQaResult } from '@/delivery/creative/video-qa/VideoQaResult';
import { VideoQaCancel } from '@/delivery/creative/video-qa/VideoQaCancel';
import { StyledVideoQaBoundary } from '@/delivery/creative/video-qa/videoQaStyles';
import {
  type DeliveryVideoQaStateQuery,
  type DeliveryVideoQaRunQuery,
} from '~/generated-metadata/graphql';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
export const VideoQaRunView = ({
  access,
  taskId,
  runId,
  enabled,
  onDenied,
  intent,
  consumeIntent,
  openCancel,
}: {
  access: ReturnType<typeof useVideoQaAccess>;
  taskId: string;
  runId: string;
  enabled: boolean;
  onDenied: () => void;
  intent: VideoQaIntent | null;
  consumeIntent: (id: string) => void;
  openCancel: () => void;
}) => {
  const { t } = useLingui();
  const [params] = useSearchParams();
  const focus = useAssistantPanelFocus();
  const { cancelPendingNavigation } = useDeliveryDraftGuard();
  const source = `${access.source}:${taskId}:${runId}`;
  const [pollInterval, setPollInterval] = useState(5000);
  const stateQuery = useQuery<DeliveryVideoQaStateQuery>(GET_VIDEO_QA_STATE, {
    variables: { input: { taskId, runId }, identity: source },
    fetchPolicy: 'no-cache',
    pollInterval,
    notifyOnNetworkStatusChange: true,
    skip: !enabled,
  });
  const state = useAssistantRead({
    value: stateQuery.data?.deliveryVideoQaState,
    source,
    enabled,
    loading: stateQuery.loading,
    error: stateQuery.error,
    networkStatus: stateQuery.networkStatus,
    matches: (value) =>
      access.matches(value) && value.taskId === taskId && value.runId === runId,
  });
  const query = useQuery<DeliveryVideoQaRunQuery>(GET_VIDEO_QA_RUN, {
    variables: { input: { taskId, runId }, identity: source },
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    skip: !enabled || !state.data,
  });
  const detail = useAssistantRead({
    value: query.data?.deliveryVideoQaRun,
    source,
    enabled: enabled && state.data !== null,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches: (value) =>
      access.matches(value) &&
      value.taskId === taskId &&
      value.runId === runId &&
      value.input.taskId === taskId &&
      value.assetId === value.input.asset.id,
  });
  const [retained, setRetained] = useState<VideoQaRun | null>(null);
  if (detail.data && !fastDeepEqual(retained, detail.data))
    setRetained(detail.data);
  const denied =
    isOtogrowAccessDenied(query.error) ||
    isOtogrowAccessDenied(stateQuery.error);
  const missing =
    videoQaNotFound(query.error) || videoQaNotFound(stateQuery.error);
  const nextPollInterval = missing
    ? 0
    : state.data && !['QUEUED', 'RUNNING'].includes(state.data.status)
      ? 30000
      : 5000;
  if (pollInterval !== nextPollInterval) setPollInterval(nextPollInterval);
  useLayoutEffect(() => {
    if (denied) onDenied();
    else if (missing) {
      cancelPendingNavigation();
      setRetained(null);
    }
  }, [denied, missing, onDenied, cancelPendingNavigation]);
  const value = detail.data ?? retained;
  const changed =
    state.data !== null &&
    value !== null &&
    (state.data.updatedAt !== value.updatedAt ||
      state.data.status !== value.status ||
      state.data.sourceCurrent !== value.sourceCurrent);
  const available =
    enabled &&
    !denied &&
    !missing &&
    state.data !== null &&
    detail.data !== null &&
    !changed;
  const refresh = async () => {
    await Promise.allSettled([stateQuery.refetch(), query.refetch()]);
  };
  const statuses: Record<string, string> = {
    QUEUED: t`Queued for inspection`,
    RUNNING: t`Inspecting video and audio`,
    SUCCEEDED: t`Inspection complete — review the findings`,
    FAILED: t`Inspection failed — review the recorded reason`,
    CANCELLED: t`Inspection cancelled`,
  };
  return (
    <section
      ref={focus}
      tabIndex={-1}
      aria-label={t`Recorded video inspection`}
    >
      <StyledDeliveryStack>
        <StyledDeliveryRow>
          <h4>
            <Trans>Recorded video inspection</Trans>
          </h4>
          <Link
            to={videoQaDestination(params, {
              creativeQaRun: null,
              creativeQaCancel: null,
            })}
          >
            <Trans>Close inspection</Trans>
          </Link>
        </StyledDeliveryRow>
        {state.data && (
          <p role="status">
            {statuses[state.data.status] ?? t`Recorded inspection`}
          </p>
        )}
        {!available && (
          <p
            role={
              missing || denied || query.error || stateQuery.error
                ? 'alert'
                : 'status'
            }
          >
            {missing
              ? t`This saved inspection is unavailable for the selected task.`
              : changed
                ? t`The recorded inspection changed. Open the latest status and result before relying on these findings.`
                : t`Current inspection access could not be verified. Private evidence is hidden while you reconnect.`}
          </p>
        )}
        <StyledDeliveryButton type="button" onClick={() => void refresh()}>
          <Trans>Refresh inspection result</Trans>
        </StyledDeliveryButton>
        <StyledVideoQaBoundary
          hidden={!available}
          disabled={!available}
          inert={!available || undefined}
        >
          {value && (
            <StyledDeliveryStack>
              {value.error && <p role="alert">{value.error}</p>}
              <p>
                {t`Recorded ${new Date(value.createdAt).toLocaleString()}`}
                {value.completedAt
                  ? ` · ${t`Completed ${new Date(value.completedAt).toLocaleString()}`}`
                  : ''}
              </p>
              <VideoQaResult
                run={value}
                enabled={available}
                onDenied={onDenied}
              />
            </StyledDeliveryStack>
          )}
        </StyledVideoQaBoundary>
        {state.data?.canCancel && !params.has('creativeQaCancel') && (
          <StyledDeliveryButton
            type="button"
            disabled={!enabled}
            onClick={openCancel}
          >
            <Trans>Prepare inspection cancellation</Trans>
          </StyledDeliveryButton>
        )}
        {params.get('creativeQaCancel') && (
          <VideoQaCancel
            key={`${runId}:${params.get('creativeQaCancel')}`}
            access={access}
            taskId={taskId}
            runId={runId}
            requestId={params.get('creativeQaCancel') ?? ''}
            intent={intent}
            consumeIntent={consumeIntent}
            enabled={enabled && state.data !== null && !denied && !missing}
            canCancel={state.data?.canCancel === true}
            onDenied={onDenied}
            onSaved={refresh}
          />
        )}
      </StyledDeliveryStack>
    </section>
  );
};
