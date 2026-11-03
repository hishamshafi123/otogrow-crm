import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ActivityCurrentTaskViewer } from '@/otogrow-activity/analysis/ActivityCurrentTaskViewer';
import {
  activityAnalysisDestination,
  activityCurrentTaskClose,
  readActivityAnalysisNavigation,
} from '@/otogrow-activity/analysis/activity-analysis-navigation';
import { useLayoutEffect } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useAssistantPanelFocus } from '@/delivery/assistants/useAssistantPanelFocus';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { StyledActivityBoundary } from '@/otogrow-activity/activityStyles';
import { formatActivityTime } from '@/otogrow-activity/ActivityEvent';
import { type useActivityContext } from '@/otogrow-activity/useActivityContext';
import { useActivityAnalysisRun } from '@/otogrow-activity/analysis/useActivityAnalysisRun';
import { useActivityAnalysisLabels } from '@/otogrow-activity/analysis/useActivityAnalysisLabels';
import { ActivityAnalysisContextView } from '@/otogrow-activity/analysis/ActivityAnalysisContextView';
import { ActivityAnalysisResultView } from '@/otogrow-activity/analysis/ActivityAnalysisResultView';
import { ActivityAnalysisCancel } from '@/otogrow-activity/analysis/ActivityAnalysisCancel';
import {
  type ActivityAnalysisIntent,
  type ActivityAnalysisCitationTarget,
} from '@/otogrow-activity/analysis/activity-analysis.types';

export const ActivityAnalysisRunViewer = ({
  state,
  runId,
  cancelRequestId,
  intent,
  consumeIntent,
  enabled,
  onAuthorityLost,
  onCitation,
  onCancel,
}: {
  state: ReturnType<typeof useActivityContext>;
  runId: string;
  cancelRequestId: string | null;
  intent: ActivityAnalysisIntent | null;
  consumeIntent: (id: string) => void;
  enabled: boolean;
  onAuthorityLost: () => void;
  onCitation: (target: ActivityAnalysisCitationTarget) => void;
  onCancel: (id: string, revision: number) => void;
}) => {
  const { t } = useLingui();
  const [params] = useSearchParams();
  const navigation = readActivityAnalysisNavigation(params);
  const navigate = useNavigate();
  const { requestNavigation } = useDeliveryDraftGuard();
  const closeTask = () => {
    const destination = activityAnalysisDestination(
      params,
      activityCurrentTaskClose,
    );
    requestNavigation(destination, () => navigate(destination));
  };
  const labels = useActivityAnalysisLabels();
  const focus = useAssistantPanelFocus();
  const reading = useActivityAnalysisRun(state, runId, enabled);
  useLayoutEffect(() => {
    if (reading.denied) onAuthorityLost();
  }, [reading.denied, onAuthorityLost]);
  const refresh = () => {
    void Promise.allSettled([
      reading.query.refetch(),
      ...(reading.detail ? [reading.detailQuery.refetch()] : []),
    ]);
  };
  return (
    <section ref={focus} tabIndex={-1} aria-label={t`Saved work analysis`}>
      <StyledDeliveryStack>
        <StyledDeliveryRow>
          <h3>
            <Trans>Saved work analysis</Trans>
          </h3>
          <StyledDeliveryButton
            type="button"
            disabled={!enabled}
            onClick={refresh}
          >
            <Trans>Refresh this analysis</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryRow>
        {!reading.data && (
          <p role={reading.query.error ? 'alert' : 'status'}>
            {reading.query.error
              ? t`This run could not be verified. It may no longer be available.`
              : t`Loading analysis status…`}
          </p>
        )}
        <StyledActivityBoundary
          hidden={!enabled || reading.data === null || reading.denied}
          disabled={!enabled || reading.data === null || reading.denied}
          inert={
            !enabled || reading.data === null || reading.denied || undefined
          }
        >
          {reading.data && (
            <StyledDeliveryStack>
              <p>
                <strong>{labels.status(reading.data.run.status)}</strong> ·{' '}
                {reading.data.run.agent.name}
              </p>
              <p>
                {reading.data.run.initiatorName} ·{' '}
                <time dateTime={reading.data.run.createdAt}>
                  {formatActivityTime(reading.data.run.createdAt)}
                </time>
              </p>
              {reading.data.run.error && (
                <p role="alert">
                  <Trans>
                    The run did not produce a validated answer. Check current
                    evidence, model and spending setup before preparing a new
                    request.
                  </Trans>
                </p>
              )}
              {['QUEUED', 'RUNNING'].includes(reading.data.run.status) && (
                <p role="status">
                  <Trans>
                    The saved request is being processed. Status updates do not
                    reload its evidence or start another request.
                  </Trans>
                </p>
              )}
              {reading.data.canCancel && !cancelRequestId && (
                <StyledDeliveryButton
                  type="button"
                  onClick={() => {
                    const current = reading.data?.run;
                    if (current) onCancel(runId, current.revision);
                  }}
                >
                  <Trans>Prepare cancellation</Trans>
                </StyledDeliveryButton>
              )}
              {cancelRequestId && (
                <ActivityAnalysisCancel
                  key={cancelRequestId}
                  state={state}
                  requestId={cancelRequestId}
                  runId={runId}
                  intent={intent}
                  consumeIntent={consumeIntent}
                  enabled={enabled}
                  onAuthorityLost={onAuthorityLost}
                  onRecorded={refresh}
                />
              )}
              {reading.detail && (
                <StyledDeliveryStack>
                  {reading.detail.run.status === 'SUCCEEDED' && (
                    <ActivityAnalysisResultView
                      detail={reading.detail}
                      onCitation={onCitation}
                    />
                  )}
                  <details>
                    <summary>
                      <Trans>Review saved question, scope and evidence</Trans>
                    </summary>
                    <ActivityAnalysisContextView
                      context={reading.detail.context}
                      onCitation={onCitation}
                    />
                  </details>
                  <p>{t`Recorded model cost: ${labels.money(reading.detail.usage?.costUsd)}`}</p>
                  <p>
                    <Trans>
                      Unknown usage is not zero. Check AI spending for reserved
                      or uncertain charges.
                    </Trans>
                  </p>
                </StyledDeliveryStack>
              )}
              {navigation.currentTaskId && (
                <ActivityCurrentTaskViewer
                  key={`${state.source}:${navigation.currentTaskId}`}
                  state={state}
                  taskId={navigation.currentTaskId}
                  snapshot={reading.detail?.context.currentWork}
                  comparisonReady={
                    reading.detail !== null ||
                    !['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(
                      reading.data.run.status,
                    )
                  }
                  enabled={enabled}
                  onAuthorityLost={onAuthorityLost}
                  onClose={closeTask}
                />
              )}
              {!reading.detail &&
                ['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(
                  reading.data.run.status,
                ) && (
                  <p role={reading.detailQuery.error ? 'alert' : 'status'}>
                    {reading.detailQuery.error
                      ? t`The saved evidence and answer could not be verified. Refresh this analysis to try again.`
                      : t`Loading the saved evidence and answer…`}
                  </p>
                )}
            </StyledDeliveryStack>
          )}
        </StyledActivityBoundary>
      </StyledDeliveryStack>
    </section>
  );
};
