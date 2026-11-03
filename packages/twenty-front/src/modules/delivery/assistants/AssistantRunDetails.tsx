import { useAssistantPanelFocus } from '@/delivery/assistants/useAssistantPanelFocus';
import { AssistantContextSummary } from '@/delivery/assistants/AssistantContextSummary';
import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link, useSearchParams } from 'react-router-dom';
import { type DeliveryAssistantRunQuery } from '~/generated-metadata/graphql';
import { GET_ASSISTANT_RUN } from '@/delivery/assistants/delivery-assistants.graphql';
import { assistantDestination } from '@/delivery/assistants/assistant-navigation';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { useAssistantVisibility } from '@/delivery/assistants/useAssistantVisibility';
import { type useAssistantContext } from '@/delivery/assistants/useAssistantContext';
import { type useAssistantCommands } from '@/delivery/assistants/useAssistantCommands';
import { useAssistantLabels } from '@/delivery/assistants/useAssistantLabels';
import { useDeliveryDraftStatus } from '@/delivery/drafts/DeliveryDraftGuard';
import { StyledAssistantText } from '@/delivery/assistants/assistantStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

export const AssistantRunDetails = ({
  state,
  commands,
  runId,
}: {
  state: ReturnType<typeof useAssistantContext>;
  commands: ReturnType<typeof useAssistantCommands>;
  runId: string;
}) => {
  const { t } = useLingui();
  const unknownLabel = t`Unknown`;
  const focusPanel = useAssistantPanelFocus();
  const labels = useAssistantLabels();
  const [params] = useSearchParams();
  const visibility = useAssistantVisibility();
  const attachVisibility = visibility.attach;
  const attach = useCallback(
    (element: HTMLElement | null) => {
      attachVisibility(element);
      focusPanel(element);
    },
    [attachVisibility, focusPanel],
  );
  const source = `${state.scope}:${runId}`;
  const query = useQuery<DeliveryAssistantRunQuery>(GET_ASSISTANT_RUN, {
    variables: { input: { runId }, identity: source },
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    skip: state.data === null,
  });
  const { data } = useAssistantRead({
    value: query.data?.deliveryAssistantRun,
    source,
    enabled: state.data !== null,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches: (value) =>
      state.permission.matches(value) && value.run.id === runId,
  });
  const { startPolling, stopPolling } = query;
  const hasVerifiedData = state.data !== null;
  const active =
    data != null &&
    ['QUEUED', 'RUNNING', 'WAITING_REVIEW'].includes(data.run.status);
  useEffect(() => {
    if (visibility.visible && hasVerifiedData && active) startPolling(5000);
    else stopPolling();
    return stopPolling;
  }, [visibility.visible, hasVerifiedData, active, startPolling, stopPolling]);
  const [confirmed, setConfirmed] = useState(false);
  useDeliveryDraftStatus({ dirty: confirmed, saving: commands.busy });
  return (
    <StyledDeliveryCard
      ref={attach}
      tabIndex={-1}
      aria-label={t`Opened assistant run`}
    >
      <StyledDeliveryStack>
        <h3>
          <Trans>Saved run</Trans>
        </h3>
        <Link to={assistantDestination(params, { assistantRun: null })}>
          <Trans>Close saved run</Trans>
        </Link>
        <StyledDeliveryButton
          type="button"
          onClick={() => void query.refetch().catch(() => undefined)}
        >
          <Trans>Refresh opened run</Trans>
        </StyledDeliveryButton>
        {!data ? (
          <p role="status">
            {query.error
              ? t`This exact run could not be verified. Its private evidence is hidden.`
              : t`Loading the exact run…`}
          </p>
        ) : (
          <>
            <h4>
              {data.run.agentName} · {data.run.taskTitle}
            </h4>
            <Link to={`/delivery?view=home&task=${data.run.taskId}`}>
              <Trans>Open current task</Trans>
            </Link>
            <p>
              {labels.status(data.run.status)} ·{' '}
              {t`Assistant version ${data.run.agentVersion}`} ·{' '}
              {t`Task version ${data.run.taskRevision}`}
            </p>
            <p>{t`Last checked ${labels.time(data.observedAt)}`}</p>
            {data.result && (
              <>
                <p>{data.result.summary}</p>
                <ul>
                  {data.result.findings.map((finding, index) => (
                    <li key={index}>
                      <strong>{finding.severity}</strong>
                      <p>{finding.evidence}</p>
                      <p>{finding.correction}</p>
                    </li>
                  ))}
                </ul>
                {data.result.suggestedBrief != null && (
                  <details>
                    <summary>
                      <Trans>Proposed brief</Trans>
                    </summary>
                    <StyledAssistantText>
                      {data.result.suggestedBrief}
                    </StyledAssistantText>
                  </details>
                )}
                {data.result.suggestedCopy != null && (
                  <details>
                    <summary>
                      <Trans>Proposed copy</Trans>
                    </summary>
                    <StyledAssistantText>
                      {data.result.suggestedCopy}
                    </StyledAssistantText>
                  </details>
                )}
              </>
            )}
            {data.error && <p role="alert">{data.error}</p>}
            <p>
              {t`Input tokens: ${data.usage?.inputTokens ?? unknownLabel}`} ·{' '}
              {t`Output tokens: ${data.usage?.outputTokens ?? unknownLabel}`}
            </p>
            <p>{t`Recorded cost: ${data.usage?.cost == null ? unknownLabel : `USD ${data.usage.cost}`}`}</p>
            <details>
              <summary>
                <Trans>Original configuration and context</Trans>
              </summary>
              <p>
                {data.configuration.name} ·{' '}
                {data.configuration.modelId ?? t`Public page check; no model`}
              </p>
              <StyledAssistantText>
                {data.configuration.instructions}
              </StyledAssistantText>
              <AssistantContextSummary context={data.context} />
            </details>
            <details>
              <summary>
                <Trans>Run activity and human decision</Trans>
              </summary>
              <ul>
                {data.activity.map((event, index) => (
                  <li key={index}>
                    {labels.time(event.at)} · {event.message}
                  </li>
                ))}
              </ul>
              {data.decision && (
                <p>
                  {data.decision.action === 'ACCEPT'
                    ? t`Accepted`
                    : data.decision.action === 'REJECT'
                      ? t`Rejected`
                      : t`Decision recorded`}{' '}
                  · {labels.time(data.decision.at)}
                </p>
              )}
              {data.decision && (
                <details>
                  <summary>
                    <Trans>Recorded decision reference</Trans>
                  </summary>
                  <p>{data.decision.memberId}</p>
                </details>
              )}
            </details>
            {data.acceptanceBlockedReason && (
              <p role="status">
                {labels.blocked(data.acceptanceBlockedReason)}
              </p>
            )}
            {(data.canAcceptFindings ||
              data.canAcceptBrief ||
              data.canAcceptCopy ||
              data.canReject) && (
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                <Trans>
                  I reviewed these findings and the exact current task. This
                  does not approve client delivery.
                </Trans>
              </label>
            )}
            <StyledDeliveryRow>
              {[
                {
                  allowed: data.canAcceptFindings,
                  action: 'ACCEPT',
                  field: null,
                  label: t`Accept findings`,
                },
                {
                  allowed: data.canAcceptBrief,
                  action: 'ACCEPT',
                  field: 'brief',
                  label: t`Apply proposed brief`,
                },
                {
                  allowed: data.canAcceptCopy,
                  action: 'ACCEPT',
                  field: 'copy',
                  label: t`Apply proposed copy`,
                },
                {
                  allowed: data.canReject,
                  action: 'REJECT',
                  field: null,
                  label: t`Reject suggestions`,
                },
              ]
                .filter((action) => action.allowed)
                .map((action) => (
                  <StyledDeliveryButton
                    key={action.label}
                    type="button"
                    disabled={!confirmed || commands.busy}
                    onClick={async () => {
                      const receipt = await commands.decide(
                        { runId, action: action.action, field: action.field },
                        data.run.taskId,
                        data.run.agentId,
                      );
                      if (receipt) setConfirmed(false);
                    }}
                  >
                    {action.label}
                  </StyledDeliveryButton>
                ))}
              {data.canCancel && (
                <StyledDeliveryButton
                  type="button"
                  disabled={commands.busy}
                  onClick={() =>
                    void commands.cancel(
                      runId,
                      data.run.taskId,
                      data.run.agentId,
                    )
                  }
                >
                  <Trans>Cancel run</Trans>
                </StyledDeliveryButton>
              )}
            </StyledDeliveryRow>
            {data.canCancel && (
              <p>
                <Trans>
                  Cancellation does not guarantee a running provider request
                  stops or receives a refund.
                </Trans>
              </p>
            )}
          </>
        )}
      </StyledDeliveryStack>
    </StyledDeliveryCard>
  );
};
