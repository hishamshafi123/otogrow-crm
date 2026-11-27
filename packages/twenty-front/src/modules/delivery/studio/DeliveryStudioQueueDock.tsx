import { useMutation } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { useState } from 'react';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import {
  CANCEL_DELIVERY_STUDIO_JOB,
  RETRY_DELIVERY_STUDIO_JOB,
} from '@/delivery/studio/delivery-studio.graphql';
import {
  type StudioClientOption,
  type StudioJobDTO,
  type StudioRoutingMode,
} from '@/delivery/studio/delivery-studio.types';
import { StyledDeliveryButton } from '@/delivery/deliveryStyles';

const StyledDock = styled.div`
  background: ${themeCssVariables.background.secondary};
  border-top: 1px solid ${themeCssVariables.border.color.medium};
  display: flex;
  flex-direction: column;
`;

const StyledDockHeader = styled.div`
  align-items: center;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  padding: 8px 16px;
  user-select: none;
`;

const StyledDockTitle = styled.div`
  align-items: center;
  display: flex;
  font-size: 12px;
  font-weight: 600;
  gap: 10px;
`;

const StyledPill = styled.span<{ tone?: 'active' | 'ok' | 'fail' | 'warn' }>`
  background: ${({ tone }) =>
    tone === 'active'
      ? themeCssVariables.color.transparent.iris3
      : tone === 'ok'
        ? themeCssVariables.color.transparent.green3
        : tone === 'fail'
          ? themeCssVariables.color.transparent.red3
          : themeCssVariables.color.transparent.amber3};
  border-radius: 999px;
  color: ${({ tone }) =>
    tone === 'active'
      ? themeCssVariables.color.iris11
      : tone === 'ok'
        ? themeCssVariables.color.green11
        : tone === 'fail'
          ? themeCssVariables.color.red11
          : themeCssVariables.color.amber11};
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
`;

const StyledJobList = styled.div`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 220px;
  overflow-y: auto;
  padding: 10px 16px;
`;

const StyledJobRow = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: space-between;
  padding: 8px 12px;
`;

const StyledBarTrack = styled.div`
  background: ${themeCssVariables.background.tertiary};
  border-radius: 999px;
  height: 5px;
  overflow: hidden;
  width: 90px;
`;

const StyledBarFill = styled.div<{ pct: number }>`
  background: ${themeCssVariables.color.blue};
  height: 100%;
  transition: width 220ms ease;
  width: ${({ pct }) => `${Math.max(4, Math.min(100, pct))}%`};
`;

type DeliveryStudioQueueDockProps = {
  jobs: StudioJobDTO[];
  clients: StudioClientOption[];
  onJumpToClient: (companyId: string, projectId: string | null) => void;
  onRefresh: () => void;
};

export const DeliveryStudioQueueDock = ({
  jobs,
  clients,
  onJumpToClient,
  onRefresh,
}: DeliveryStudioQueueDockProps) => {
  const [expanded, setExpanded] = useState(false);
  const [retryJob] = useMutation(RETRY_DELIVERY_STUDIO_JOB);
  const [cancelJob] = useMutation(CANCEL_DELIVERY_STUDIO_JOB);

  const activeJobs = jobs.filter((j) =>
    ['QUEUED', 'STAGING', 'PROCESSING', 'DOWNLOADING'].includes(j.status),
  );
  const failedJobs = jobs.filter((j) => j.status === 'FAILED');

  const clientName = (companyId: string) =>
    clients.find((c) => c.id === companyId)?.name ?? 'Client';

  const handleRetry = async (jobId: string, routingMode?: StudioRoutingMode) => {
    await retryJob({ variables: { jobId, routingMode } });
    onRefresh();
  };

  const handleCancel = async (jobId: string) => {
    await cancelJob({ variables: { jobId } });
    onRefresh();
  };

  return (
    <StyledDock>
      <StyledDockHeader onClick={() => setExpanded((prev) => !prev)}>
        <StyledDockTitle>
          <span>Global Render Queue (All Clients)</span>
          <StyledPill tone={activeJobs.length > 0 ? 'active' : 'ok'}>
            {activeJobs.length > 0
              ? `${activeJobs.length} running`
              : `${jobs.length} recent`}
          </StyledPill>
          {failedJobs.length > 0 && (
            <StyledPill tone="fail">{failedJobs.length} failed</StyledPill>
          )}
        </StyledDockTitle>
        <span style={{ fontSize: 12, opacity: 0.7 }}>
          {expanded ? 'Hide queue ▼' : 'Open queue ▲'}
        </span>
      </StyledDockHeader>

      {expanded && (
        <StyledJobList>
          {jobs.length === 0 && (
            <span style={{ fontSize: 12, opacity: 0.7 }}>
              No AI Studio generations queued yet. Start a Character Sheet or AI
              Video above.
            </span>
          )}
          {jobs.slice(0, 25).map((job) => {
            const isActive = [
              'QUEUED',
              'STAGING',
              'PROCESSING',
              'DOWNLOADING',
            ].includes(job.status);
            return (
              <StyledJobRow key={job.id}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 13,
                    }}
                  >
                    <strong>{job.title}</strong>
                    <StyledPill
                      tone={
                        job.status === 'COMPLETED'
                          ? 'ok'
                          : job.status === 'FAILED'
                            ? 'fail'
                            : isActive
                              ? 'active'
                              : 'warn'
                      }
                    >
                      {job.status}
                    </StyledPill>
                    {job.failoverTriggered && (
                      <StyledPill tone="warn">
                        Auto-Failover → {job.providerUsed}
                      </StyledPill>
                    )}
                    {!job.failoverTriggered && job.providerUsed && (
                      <span style={{ fontSize: 11, opacity: 0.65 }}>
                        via {job.providerUsed}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 11, opacity: 0.7 }}>
                    {clientName(job.companyId)} · {job.modelKey} · est. $
                    {Number(job.estimatedCostUsd || 0).toFixed(2)}
                    {job.errorMessage ? ` · ${job.errorMessage}` : ''}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {isActive && (
                    <>
                      <StyledBarTrack>
                        <StyledBarFill pct={job.progress} />
                      </StyledBarTrack>
                      <StyledDeliveryButton
                        type="button"
                        onClick={() => void handleCancel(job.id)}
                      >
                        Cancel
                      </StyledDeliveryButton>
                    </>
                  )}
                  {(job.status === 'FAILED' || job.status === 'CANCELLED') && (
                    <>
                      <StyledDeliveryButton
                        type="button"
                        onClick={() => void handleRetry(job.id, 'AUTO_FAILOVER')}
                      >
                        Retry Auto
                      </StyledDeliveryButton>
                      <StyledDeliveryButton
                        type="button"
                        onClick={() => void handleRetry(job.id, 'KIE_ONLY')}
                      >
                        Retry on Kie.ai
                      </StyledDeliveryButton>
                    </>
                  )}
                  <StyledDeliveryButton
                    type="button"
                    onClick={() => onJumpToClient(job.companyId, job.projectId)}
                  >
                    Open Tab
                  </StyledDeliveryButton>
                </div>
              </StyledJobRow>
            );
          })}
        </StyledJobList>
      )}
    </StyledDock>
  );
};
