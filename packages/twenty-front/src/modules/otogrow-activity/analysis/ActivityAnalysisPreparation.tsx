import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ActivityCurrentTaskViewer } from '@/otogrow-activity/analysis/ActivityCurrentTaskViewer';
import {
  activityAnalysisDestination,
  activityCurrentTaskClose,
  readActivityAnalysisNavigation,
  activityQuestionRetainsNavigation,
} from '@/otogrow-activity/analysis/activity-analysis-navigation';
import { useLayoutEffect, useMemo, useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  useDeliveryDraftStatus,
  useDeliveryDraftGuard,
} from '@/delivery/drafts/DeliveryDraftGuard';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { type useActivityContext } from '@/otogrow-activity/useActivityContext';
import { StyledActivityBoundary } from '@/otogrow-activity/activityStyles';
import { ActivityAnalysisContextView } from '@/otogrow-activity/analysis/ActivityAnalysisContextView';
import { useActivityAnalysisCommands } from '@/otogrow-activity/analysis/useActivityAnalysisCommands';
import { useActivityAnalysisLabels } from '@/otogrow-activity/analysis/useActivityAnalysisLabels';
import {
  type ActivityAnalysisIntent,
  type ActivityAnalysisCitationTarget,
  type ActivityAnalysisPreview,
  type ActivityAnalysisReceipt,
  type ActivityAnalysisCommand,
} from '@/otogrow-activity/analysis/activity-analysis.types';
import { type OtogrowActivityFiltersInput } from '~/generated-metadata/graphql';

export const ActivityAnalysisPreparation = ({
  state,
  filters,
  requestId,
  runId,
  agentId,
  intent,
  consumeIntent,
  enabled,
  onAuthorityLost,
  onOpenRun,
  onCitation,
}: {
  state: ReturnType<typeof useActivityContext>;
  filters: OtogrowActivityFiltersInput;
  requestId: string;
  runId: string;
  agentId: string;
  intent: ActivityAnalysisIntent | null;
  consumeIntent: (requestId: string) => void;
  enabled: boolean;
  onAuthorityLost: () => void;
  onOpenRun: (id: string) => void;
  onCitation: (target: ActivityAnalysisCitationTarget) => void;
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
  const [owned] = useState(
    () =>
      intent?.kind === 'start' &&
      intent.requestId === requestId &&
      intent.runId === runId &&
      intent.agentId === agentId,
  );
  const [question, setQuestion] = useState('');
  const [includeCurrentWork, setIncludeCurrentWork] = useState(false);
  const [preview, setPreview] = useState<ActivityAnalysisPreview | null>(null);
  const [previewSignature, setPreviewSignature] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [frozen, setFrozen] = useState<ActivityAnalysisCommand | null>(null);
  const [receipt, setReceipt] = useState<ActivityAnalysisReceipt | null>(null);
  const [retryAllowed, setRetryAllowed] = useState(false);
  const [message, setMessage] = useState('');
  useLayoutEffect(() => consumeIntent(requestId), [consumeIntent, requestId]);
  const body = {
    filters,
    agentId,
    question: question.trim(),
    ...(includeCurrentWork ? { includeCurrentWork: true } : {}),
  };
  const currentScopeSelected = Boolean(
    filters.personId || filters.projectId || filters.clientId,
  );
  const signature = JSON.stringify(body);
  const commands = useActivityAnalysisCommands({
    state,
    scope: `${requestId}:${signature}`,
    enabled,
    onAuthorityLost,
  });
  const retainsNavigation = useMemo(
    () => activityQuestionRetainsNavigation(requestId, runId),
    [requestId, runId],
  );
  useDeliveryDraftStatus({
    dirty:
      owned &&
      receipt === null &&
      (question.length > 0 || includeCurrentWork || frozen !== null),
    saving: commands.busy,
    retainsNavigation,
  });
  const previewCurrent = preview !== null && previewSignature === signature;
  const canStart =
    owned &&
    enabled &&
    receipt === null &&
    frozen === null &&
    !commands.busy &&
    question.trim().length > 0 &&
    previewCurrent &&
    preview.canStart &&
    preview.context.includedCount +
      (preview.context.currentWork?.includedCount ?? 0) >
      0 &&
    preview.context.omittedCount === 0 &&
    (!includeCurrentWork ||
      (currentScopeSelected &&
        preview.context.currentWork?.complete === true &&
        preview.context.currentWork.omittedCount === 0 &&
        preview.context.currentWork.truncatedFieldCount === 0)) &&
    preview.budget.budgetReady &&
    preview.budget.maximumCostUsd != null &&
    preview.budget.pricingRevision != null &&
    confirmed;
  const execute = async (command: ActivityAnalysisCommand) => {
    const result = await commands.execute(command);
    if (result) {
      setReceipt(result);
      setFrozen(null);
      setRetryAllowed(false);
      setMessage(
        t`Your analysis request was recorded. Open the saved run to follow its progress.`,
      );
    } else
      setMessage(
        t`The response could not be confirmed. Your exact submitted question is kept. Check this request before trying again.`,
      );
  };
  const check = async () => {
    setRetryAllowed(false);
    const result = await commands.check(
      requestId,
      runId,
      'STARTED',
      frozen?.kind === 'STARTED' ? frozen.input.bodyFingerprint : undefined,
    );
    if (result.kind === 'FOUND') {
      setReceipt(result.receipt);
      setFrozen(null);
      setMessage(t`The saved analysis request was found.`);
    } else if (result.kind === 'NOT_FOUND') {
      setRetryAllowed(owned && frozen !== null);
      setMessage(
        frozen
          ? t`No saved request was found. You may retry only the question already submitted.`
          : t`No saved request was found. The unsaved question is no longer available. Close this preparation to start a new question.`,
      );
    } else
      setMessage(
        t`This request could not be checked. Keep this view open and check again.`,
      );
  };
  return (
    <section
      aria-label={t`Work-analysis preparation`}
      data-analysis-request={requestId}
      data-analysis-run={runId}
      data-analysis-agent={agentId}
      data-body-fingerprint={
        previewCurrent ? preview.bodyFingerprint : undefined
      }
      data-context-fingerprint={
        previewCurrent ? preview.contextFingerprint : undefined
      }
      data-evidence-fingerprint={
        previewCurrent ? preview.evidenceFingerprint : undefined
      }
    >
      <StyledDeliveryStack>
        <h3>
          <Trans>Your question</Trans>
        </h3>
        {message && <p role="status">{message}</p>}
        {!owned && receipt === null && (
          <p>
            <Trans>
              This earlier preparation must be checked first. Its private
              question cannot be reconstructed from a saved link.
            </Trans>
          </p>
        )}
        <StyledActivityBoundary
          hidden={!enabled}
          disabled={
            !enabled || commands.busy || frozen !== null || receipt !== null
          }
          inert={!enabled || undefined}
        >
          {owned && (
            <StyledDeliveryStack>
              <label>
                <Trans>Question about this recorded work</Trans>
                <textarea
                  rows={4}
                  maxLength={4000}
                  value={question}
                  onChange={(event) => {
                    setQuestion(event.target.value);
                    setConfirmed(false);
                  }}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={includeCurrentWork}
                  disabled={!currentScopeSelected}
                  onChange={(event) => {
                    setIncludeCurrentWork(event.target.checked);
                    setConfirmed(false);
                  }}
                />
                <Trans>Include current work status</Trans>
              </label>
              <p>
                <Trans>
                  Current work uses only the selected Person, Project and
                  Client. Audit dates, category, action and outcome apply only
                  to history. Current person means the task owner or effective
                  reviewer, including a valid backup.
                </Trans>
              </p>
              {!currentScopeSelected && (
                <p>
                  <Trans>
                    Select a Person, Project or Client before including current
                    work.
                  </Trans>
                </p>
              )}
              <StyledDeliveryRow>
                {[
                  t`Summarize the recorded work and decisions in this view.`,
                  t`Who acted, and who was affected by these changes?`,
                  t`Which recorded handoffs need a current-status check?`,
                ].map((prompt) => (
                  <StyledDeliveryButton
                    key={prompt}
                    type="button"
                    onClick={() => {
                      setQuestion(prompt);
                      setConfirmed(false);
                    }}
                  >
                    {prompt}
                  </StyledDeliveryButton>
                ))}
              </StyledDeliveryRow>
              <p>
                <Trans>
                  The scope uses your applied filters and explicit UTC dates. It
                  is independent of the log’s current page. Audit history cannot
                  establish current task status. Optional current work has its
                  own capture time. Neither source establishes working hours or
                  employee productivity.
                </Trans>
              </p>
              <StyledDeliveryButton
                type="button"
                disabled={!question.trim() || commands.busy}
                onClick={async () => {
                  setConfirmed(false);
                  const result = await commands.preview(body);
                  if (result) {
                    setPreview(result);
                    setPreviewSignature(signature);
                    setMessage('');
                  } else
                    setMessage(
                      t`The evidence preview could not be verified. Your question is kept; check access and try again.`,
                    );
                }}
              >
                <Trans>Preview evidence and cost</Trans>
              </StyledDeliveryButton>
            </StyledDeliveryStack>
          )}
        </StyledActivityBoundary>
        {previewCurrent && (
          <StyledDeliveryStack>
            <h4>
              <Trans>Evidence to be analyzed</Trans>
            </h4>
            <p>
              {preview.agent.name} ·{' '}
              {t`Configuration version ${preview.agent.version}`}
            </p>
            <ActivityAnalysisContextView
              context={preview.context}
              onCitation={onCitation}
            />
            <p>
              <strong>
                <Trans>Maximum reservation</Trans>
              </strong>
              : {labels.money(preview.budget.maximumCostUsd)}
            </p>
            <p>
              <Trans>
                The workspace spending limit applies. This reserves a maximum;
                actual usage can differ, and cancellation may still incur usage.
              </Trans>
            </p>
            {preview.context.includedCount === 0 &&
              (preview.context.currentWork?.includedCount ?? 0) === 0 && (
                <p role="status">
                  <Trans>
                    No recorded evidence matches these filters. No paid analysis
                    will start.
                  </Trans>
                </p>
              )}
            {preview.context.currentWork &&
              (!preview.context.currentWork.complete ||
                preview.context.currentWork.truncatedFieldCount > 0 ||
                preview.context.currentWork.omittedCount > 0) && (
                <p role="alert">
                  <Trans>
                    Current-work evidence is incomplete or shortened. Narrow the
                    selected people, projects or clients before starting.
                  </Trans>
                </p>
              )}
            {preview.context.omittedCount > 0 && (
              <p role="alert">
                <Trans>
                  Some matching records are omitted. Narrow the date range or
                  filters before starting.
                </Trans>
              </p>
            )}
            {preview.blockedReasons.map((reason) => (
              <p role="alert" key={reason}>
                {labels.reason(reason)}
              </p>
            ))}
            {!preview.budget.budgetReady &&
              (!preview.budget.blockedReason ||
                !preview.blockedReasons.includes(
                  preview.budget.blockedReason,
                )) && (
                <p role="alert">
                  {preview.budget.blockedReason
                    ? labels.reason(preview.budget.blockedReason)
                    : t`Current pricing and a funded spending limit must be verified.`}
                </p>
              )}
            <label>
              <input
                type="checkbox"
                checked={confirmed}
                disabled={
                  !enabled ||
                  commands.busy ||
                  frozen !== null ||
                  receipt !== null
                }
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <Trans>
                I reviewed this evidence, its gaps and the maximum reservation.
              </Trans>
            </label>
            <StyledDeliveryButton
              type="button"
              disabled={!canStart}
              onClick={() => {
                if (!canStart || preview.budget.pricingRevision == null) return;
                const command: ActivityAnalysisCommand = {
                  kind: 'STARTED',
                  input: {
                    ...body,
                    id: runId,
                    requestId,
                    bodyFingerprint: preview.bodyFingerprint,
                    contextFingerprint: preview.contextFingerprint,
                    evidenceFingerprint: preview.evidenceFingerprint,
                    capturedAt: preview.context.capturedAt,
                    agentVersion: preview.agent.version,
                    pricingRevision: preview.budget.pricingRevision,
                  },
                };
                setFrozen(command);
                setRetryAllowed(false);
                void execute(command);
              }}
            >
              <Trans>Start one work analysis</Trans>
            </StyledDeliveryButton>
            <Link to="/delivery?view=agents&agentView=spending">
              <Trans>Review AI spending setup</Trans>
            </Link>
          </StyledDeliveryStack>
        )}
        {navigation.currentTaskId && (
          <ActivityCurrentTaskViewer
            key={`${state.source}:${navigation.currentTaskId}`}
            state={state}
            taskId={navigation.currentTaskId}
            snapshot={previewCurrent ? preview.context.currentWork : null}
            enabled={enabled}
            onAuthorityLost={onAuthorityLost}
            onClose={closeTask}
          />
        )}
        {receipt ? (
          <StyledDeliveryButton
            type="button"
            disabled={!enabled}
            onClick={() => onOpenRun(receipt.runId)}
          >
            <Trans>Open saved analysis</Trans>
          </StyledDeliveryButton>
        ) : (
          (frozen !== null || !owned) && (
            <StyledDeliveryButton
              type="button"
              disabled={!enabled || commands.busy}
              onClick={() => void check()}
            >
              <Trans>Check saved analysis request</Trans>
            </StyledDeliveryButton>
          )
        )}
        {retryAllowed && frozen !== null && (
          <StyledDeliveryButton
            type="button"
            disabled={!enabled || commands.busy}
            onClick={() => void execute(frozen)}
          >
            <Trans>Retry the exact submitted question</Trans>
          </StyledDeliveryButton>
        )}
      </StyledDeliveryStack>
    </section>
  );
};
