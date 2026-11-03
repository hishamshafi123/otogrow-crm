import { useLayoutEffect, useMemo, useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  useDeliveryDraftGuard,
  useDeliveryDraftStatus,
} from '@/delivery/drafts/DeliveryDraftGuard';
import { type useAdvertisingContext } from '@/delivery/advertising/workbench/useAdvertisingContext';
import { type AdvertisingSourceSelection } from '@/delivery/advertising/workbench/useAdvertisingSource';
import { advertisingDraftGoal } from '@/delivery/advertising/drafts/advertising-draft-goal';
import { advertisingPreparationRetainsNavigation } from '@/delivery/advertising/drafts/advertising-draft-retention';
import {
  useAdvertisingDraftCommands,
  type AdvertisingDraftCommand,
} from '@/delivery/advertising/drafts/useAdvertisingDraftCommands';
import { AdvertisingDraftPreviewView } from '@/delivery/advertising/drafts/AdvertisingDraftPreviewView';
import {
  type AdvertisingDraftIntent,
  type AdvertisingDraftPreview,
  type AdvertisingDraftReceipt,
} from '@/delivery/advertising/drafts/advertising-draft-types';
import { StyledAdvertisingBoundary } from '@/delivery/advertising/workbench/advertisingWorkbenchStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { type DeliveryAdvertisingGoalInput } from '~/generated-metadata/graphql';

export const AdvertisingDraftPreparation = ({
  state,
  selection,
  sourceFingerprint,
  scope,
  goal,
  reviewId,
  reviewRequestId,
  requestId,
  runId,
  agentId,
  intent,
  consumeIntent,
  enabled,
  onOpenRun,
  onClose,
  onAuthorityLost,
}: {
  state: ReturnType<typeof useAdvertisingContext>;
  selection: AdvertisingSourceSelection;
  sourceFingerprint: string;
  scope: string;
  goal: DeliveryAdvertisingGoalInput;
  reviewId: string;
  reviewRequestId: string;
  requestId: string;
  runId: string;
  agentId: string;
  intent: AdvertisingDraftIntent | null;
  consumeIntent: (requestId: string) => void;
  enabled: boolean;
  onOpenRun: (runId: string) => void;
  onClose: () => void;
  onAuthorityLost: () => void;
}) => {
  const { t } = useLingui();
  const { cancelPendingNavigation } = useDeliveryDraftGuard();
  const [owned, setOwned] = useState(
    () =>
      intent?.requestId === requestId &&
      intent.runId === runId &&
      intent.agentId === agentId,
  );
  const [requirementsRequired] = useState(
    () => intent?.requirementsRequired ?? false,
  );
  const [instructions, setInstructions] = useState('');
  const [preview, setPreview] = useState<AdvertisingDraftPreview | null>(null);
  const [previewSignature, setPreviewSignature] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [frozen, setFrozen] = useState<AdvertisingDraftCommand | null>(null);
  const [receipt, setReceipt] = useState<AdvertisingDraftReceipt | null>(null);
  const [retryAllowed, setRetryAllowed] = useState(false);
  const [message, setMessage] = useState('');
  const [denied, setDenied] = useState(false);
  const loseAuthority = () => {
    cancelPendingNavigation();
    setOwned(false);
    setInstructions('');
    setPreview(null);
    setFrozen(null);
    setReceipt(null);
    setRetryAllowed(false);
    setDenied(true);
    onAuthorityLost();
  };
  const body = {
    sourceKind: selection.kind,
    sourceId: selection.id,
    sourceFingerprint,
    agentId,
    goal: advertisingDraftGoal(goal),
    instructions: instructions.trim(),
  };
  const signature = JSON.stringify(body);
  const commands = useAdvertisingDraftCommands({
    state,
    selection,
    scope: `${scope}:${requestId}:${signature}`,
    enabled: enabled && !denied,
    onAuthorityLost: loseAuthority,
  });
  const retainsNavigation = useMemo(
    () =>
      advertisingPreparationRetainsNavigation(
        {
          sourceKind: selection.kind,
          sourceId: selection.id,
          reviewId,
          requestId: reviewRequestId,
        },
        requestId,
        runId,
      ),
    [selection.kind, selection.id, reviewId, reviewRequestId, requestId, runId],
  );
  useDeliveryDraftStatus({
    dirty:
      receipt === null &&
      (frozen !== null || (owned && instructions.length > 0)),
    saving: commands.busy,
    retainsNavigation,
  });
  useLayoutEffect(() => consumeIntent(requestId), [consumeIntent, requestId]);
  const previewCurrent = preview !== null && previewSignature === signature;
  const start = async (command: AdvertisingDraftCommand) => {
    const value = await commands.execute(command);
    if (!value) {
      setMessage(
        t`The start could not be confirmed. Your exact submitted request is kept. Check it before trying again.`,
      );
      return;
    }
    setReceipt(value);
    setFrozen(null);
    setRetryAllowed(false);
    setMessage(
      t`The suggestion run was recorded. Open it to follow its progress.`,
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
      setMessage(t`The saved suggestion run was found.`);
    } else if (result.kind === 'NOT_FOUND') {
      setRetryAllowed(frozen !== null);
      setMessage(
        frozen
          ? t`No saved start was found. Retry only the request you already reviewed, or check again.`
          : t`No saved start was found. The unsaved preparation is no longer available. Close this view to prepare current inputs.`,
      );
    } else
      setMessage(
        t`The request could not be checked. Keep this view open and check again.`,
      );
  };
  return (
    <section
      aria-label={t`AI suggestion preparation`}
      data-advertising-draft-request-id={requestId}
      data-advertising-draft-run-id={runId}
      data-source-fingerprint={sourceFingerprint}
      data-body-fingerprint={preview?.bodyFingerprint}
      data-context-fingerprint={preview?.contextFingerprint}
      data-agent-version={preview?.agent.version}
      data-knowledge-fingerprint={preview?.knowledgeFingerprint}
      data-pricing-revision={preview?.budget.pricingRevision}
    >
      <StyledDeliveryStack>
        <StyledDeliveryRow>
          <h4>
            <Trans>Prepare AI suggestions</Trans>
          </h4>
          <StyledDeliveryButton
            type="button"
            disabled={commands.busy}
            onClick={onClose}
          >
            <Trans>Close AI preparation</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryRow>
        {message && <p role="status">{message}</p>}
        {!owned && receipt === null && (
          <p>
            <Trans>
              This earlier preparation is no longer open. Check whether its run
              was saved before preparing another request.
            </Trans>
          </p>
        )}
        {denied && (
          <p role="alert">
            <Trans>AI access changed. Private preparation was discarded.</Trans>
          </p>
        )}
        {(!owned || frozen !== null) && receipt === null && (
          <StyledDeliveryButton
            type="button"
            disabled={!enabled || denied || commands.busy}
            onClick={() => void check()}
          >
            <Trans>Check saved AI request</Trans>
          </StyledDeliveryButton>
        )}
        <StyledAdvertisingBoundary
          hidden={!enabled || denied || !owned || receipt !== null}
          disabled={!enabled || denied || commands.busy || frozen !== null}
          inert={!enabled || denied || undefined}
        >
          {owned && !denied && receipt === null && (
            <StyledDeliveryStack>
              <label>
                <Trans>Additional requirements for these suggestions</Trans>
                <textarea
                  maxLength={4000}
                  rows={3}
                  aria-required={requirementsRequired}
                  value={instructions}
                  onChange={(event) => {
                    setInstructions(event.target.value);
                    setConfirmed(false);
                  }}
                />
              </label>
              {requirementsRequired && !instructions.trim() && (
                <p role="status">
                  <Trans>
                    This assistant requires additional requirements before
                    previewing.
                  </Trans>
                </p>
              )}
              <StyledDeliveryButton
                type="button"
                disabled={
                  !enabled ||
                  commands.busy ||
                  frozen !== null ||
                  (requirementsRequired && !instructions.trim())
                }
                onClick={async () => {
                  const result = await commands.preview(body);
                  if (result) {
                    setPreview(result);
                    setPreviewSignature(signature);
                    setConfirmed(false);
                    setMessage('');
                  } else
                    setMessage(
                      t`The current inputs could not be verified. Review assistant, provider and spending setup, then retry the preview.`,
                    );
                }}
              >
                <Trans>Preview report inputs and cost</Trans>
              </StyledDeliveryButton>
              {preview && (
                <AdvertisingDraftPreviewView
                  preview={preview}
                  confirmed={confirmed}
                  disabled={!enabled || commands.busy || frozen !== null}
                  stale={!previewCurrent}
                  onConfirmedChange={setConfirmed}
                  onStart={() => {
                    if (
                      !previewCurrent ||
                      !confirmed ||
                      preview.budget.pricingRevision == null ||
                      !preview.budget.budgetReady ||
                      frozen !== null
                    )
                      return;
                    const command: AdvertisingDraftCommand = {
                      kind: 'STARTED',
                      input: {
                        ...body,
                        id: runId,
                        requestId,
                        bodyFingerprint: preview.bodyFingerprint,
                        contextFingerprint: preview.contextFingerprint,
                        agentVersion: preview.agent.version,
                        knowledgeFingerprint: preview.knowledgeFingerprint,
                        pricingRevision: preview.budget.pricingRevision,
                      },
                    };
                    setFrozen(command);
                    setRetryAllowed(false);
                    void start(command);
                  }}
                />
              )}
            </StyledDeliveryStack>
          )}
        </StyledAdvertisingBoundary>
        {retryAllowed && frozen?.kind === 'STARTED' && previewCurrent && (
          <StyledDeliveryButton
            type="button"
            disabled={!enabled || denied || commands.busy}
            onClick={() => void start(frozen)}
          >
            <Trans>Retry this exact AI request</Trans>
          </StyledDeliveryButton>
        )}
        {receipt && (
          <StyledDeliveryButton
            type="button"
            onClick={() => onOpenRun(receipt.runId)}
          >
            <Trans>Open saved AI run</Trans>
          </StyledDeliveryButton>
        )}
      </StyledDeliveryStack>
    </section>
  );
};
