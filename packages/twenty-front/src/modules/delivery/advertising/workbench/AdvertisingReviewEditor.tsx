import { useLayoutEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { useAssistantPanelFocus } from '@/delivery/assistants/useAssistantPanelFocus';
import {
  useDeliveryDraftGuard,
  useDeliveryDraftStatus,
} from '@/delivery/drafts/DeliveryDraftGuard';
import { type useAdvertisingContext } from '@/delivery/advertising/workbench/useAdvertisingContext';
import { type AdvertisingSourceSelection } from '@/delivery/advertising/workbench/useAdvertisingSource';
import { useAdvertisingReview } from '@/delivery/advertising/workbench/useAdvertisingReview';
import {
  useAdvertisingCommands,
  type AdvertisingCommand,
  type AdvertisingReceipt,
} from '@/delivery/advertising/workbench/useAdvertisingCommands';
import { type AdvertisingSourceEvidence } from '@/delivery/advertising/workbench/AdvertisingEvidence';
import { type AdvertisingWorkbenchIntent } from '@/delivery/advertising/workbench/advertising-intent.types';
import { AdvertisingReviewForm } from '@/delivery/advertising/workbench/AdvertisingReviewForm';
import {
  advertisingDestination,
  advertisingCloseCommand,
} from '@/delivery/advertising/workbench/advertising-navigation';
import { StyledAdvertisingBoundary } from '@/delivery/advertising/workbench/advertisingWorkbenchStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type AdvertisingReviewEditorProps = {
  state: ReturnType<typeof useAdvertisingContext>;
  selection: AdvertisingSourceSelection;
  source: AdvertisingSourceEvidence;
  scope: string;
  reviewId: string;
  requestId: string;
  intent: AdvertisingWorkbenchIntent | null;
  consumeIntent: (requestId: string) => void;
  enabled: boolean;
  authorityLost: boolean;
  onAuthorityLost: () => void;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
};
export const AdvertisingReviewEditor = ({
  state,
  selection,
  source,
  scope,
  reviewId,
  requestId,
  intent,
  consumeIntent,
  enabled,
  authorityLost,
  onAuthorityLost,
  onClose,
  onSaved,
}: AdvertisingReviewEditorProps) => {
  const { t } = useLingui();
  const [params] = useSearchParams();
  const focusPanel = useAssistantPanelFocus();
  const { requestAction, cancelPendingNavigation } = useDeliveryDraftGuard();
  const [opened, setOpened] = useState(() =>
    intent?.mode === 'review' &&
    intent.requestId === requestId &&
    intent.reviewId === reviewId
      ? intent.draft
      : null,
  );
  const [frozen, setFrozen] = useState<AdvertisingCommand | null>(null);
  const [receipt, setReceipt] = useState<AdvertisingReceipt | null>(null);
  const [retryAllowed, setRetryAllowed] = useState(false);
  const [message, setMessage] = useState('');
  const [denied, setDenied] = useState(false);
  useLayoutEffect(() => consumeIntent(requestId), [consumeIntent, requestId]);
  const loseAuthority = () => {
    cancelPendingNavigation();
    setOpened(null);
    setFrozen(null);
    setReceipt(null);
    setRetryAllowed(false);
    setDenied(true);
    onAuthorityLost();
  };
  useLayoutEffect(() => {
    if (authorityLost) {
      cancelPendingNavigation();
      setOpened(null);
      setFrozen(null);
      setReceipt(null);
      setRetryAllowed(false);
      setDenied(true);
    }
  }, [authorityLost, cancelPendingNavigation]);
  const packet = useAdvertisingReview({
    state,
    selection,
    reviewId,
    sourceScope: scope,
    available: enabled && !denied,
    withDetail: false,
  });
  useLayoutEffect(() => {
    if (packet.denied) {
      cancelPendingNavigation();
      setOpened(null);
      setFrozen(null);
      setReceipt(null);
      setRetryAllowed(false);
      setDenied(true);
    }
  }, [packet.denied, cancelPendingNavigation]);
  const commands = useAdvertisingCommands({
    state,
    scope: `${scope}:${reviewId}:${packet.data?.review?.revision ?? 'unknown'}`,
    available: enabled && !denied && state.permission.manager,
    onAuthorityLost: loseAuthority,
  });
  useDeliveryDraftStatus({ dirty: frozen !== null, saving: commands.busy });
  const changed =
    receipt === null &&
    Boolean(
      opened &&
      ((opened.revision > 0 && packet.data?.review === null) ||
        (packet.data?.review &&
          (packet.data.review.state !== 'DRAFT' ||
            packet.data.review.revision !== opened.revision))),
    );
  const otherDraft =
    opened?.revision === 0 &&
    source.currentDraftId != null &&
    source.currentDraftId !== reviewId;
  const canRetry =
    retryAllowed &&
    frozen?.kind === 'review' &&
    frozen.input.sourceFingerprint === source.fingerprint &&
    packet.data !== null &&
    packet.data.review !== undefined &&
    (packet.data.review === null
      ? frozen.input.revision === 0
      : packet.data.review.state === 'DRAFT' &&
        packet.data.review.revision === frozen.input.revision);
  const saved = async (command: AdvertisingCommand) => {
    const result = await commands.execute(command);
    if (!result) {
      setMessage(
        t`We could not confirm the save. Your submitted recommendations are kept. Check the saved review before trying again.`,
      );
      return false;
    }
    setReceipt(result);
    setFrozen(null);
    setRetryAllowed(false);
    setMessage(
      t`Recommendations saved as a draft. Review the recipients and evidence before assigning work.`,
    );
    await onSaved().catch(() => undefined);
    return true;
  };
  const check = async () => {
    setRetryAllowed(false);
    const result = await commands.check(requestId, reviewId, 'review');
    if (result.kind === 'FOUND') {
      setReceipt(result.receipt);
      setFrozen(null);
      setMessage(t`The saved recommendation review was found.`);
      await onSaved().catch(() => undefined);
    } else if (result.kind === 'NOT_FOUND') {
      setRetryAllowed(frozen !== null);
      setMessage(
        frozen
          ? t`No saved review was found. You may retry the recommendations you already submitted.`
          : t`No saved review was found. The unsaved recommendations are no longer available. Close this view to review the report again.`,
      );
    } else
      setMessage(
        t`The saved review could not be checked. Keep this view open and check again.`,
      );
  };
  return (
    <section
      ref={focusPanel}
      tabIndex={-1}
      aria-label={t`Recommendation preparation`}
    >
      <StyledDeliveryStack>
        <StyledDeliveryRow>
          <h3>
            <Trans>Recommendation draft</Trans>
          </h3>
          <StyledDeliveryButton
            type="button"
            disabled={commands.busy}
            onClick={() => requestAction(onClose)}
          >
            <Trans>Close preparation</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryRow>
        {message && <p role="status">{message}</p>}
        {(!enabled || denied) && (
          <p role="status">
            {denied
              ? t`Editing access changed. Private recommendations were discarded.`
              : t`Current report access could not be verified. Your draft is hidden and kept while you retry.`}
          </p>
        )}
        {changed && (
          <p role="alert">
            <Trans>
              This plan changed or was assigned elsewhere. Keep your notes here
              while you review the current saved plan; this older draft cannot
              be saved.
            </Trans>
          </p>
        )}
        {otherDraft && (
          <>
            <p role="alert">
              <Trans>
                This report already has a draft in preparation. Open it instead
                of creating another.
              </Trans>
            </p>
            <Link
              to={advertisingDestination(params, {
                ...advertisingCloseCommand,
                adReview: source.currentDraftId ?? null,
              })}
            >
              <Trans>Open the existing draft</Trans>
            </Link>
          </>
        )}
        {(opened === null || frozen !== null) && receipt === null && (
          <StyledDeliveryButton
            type="button"
            disabled={!enabled || denied || commands.busy}
            onClick={() => void check()}
          >
            <Trans>Check saved recommendation review</Trans>
          </StyledDeliveryButton>
        )}
        <StyledAdvertisingBoundary
          hidden={!enabled || denied || receipt !== null}
          disabled={!enabled || denied || frozen !== null || commands.busy}
          inert={!enabled || denied || undefined}
        >
          {opened && !denied && receipt === null && (
            <AdvertisingReviewForm
              initial={opened}
              state={state}
              selection={selection}
              source={source}
              scope={scope}
              enabled={enabled && source.canManageDraft && !otherDraft}
              busy={commands.busy}
              readOnly={frozen !== null}
              stale={changed}
              onSave={async (input) => {
                if (
                  !enabled ||
                  denied ||
                  changed ||
                  otherDraft ||
                  !source.canManageDraft ||
                  input.sourceFingerprint !== source.fingerprint ||
                  frozen !== null
                )
                  return false;
                const command: AdvertisingCommand = { kind: 'review', input };
                setFrozen(command);
                setRetryAllowed(false);
                return saved(command);
              }}
            />
          )}
        </StyledAdvertisingBoundary>
        {canRetry && (
          <StyledDeliveryButton
            type="button"
            disabled={!enabled || denied || commands.busy}
            onClick={() => void saved(frozen)}
          >
            <Trans>Retry submitted recommendations</Trans>
          </StyledDeliveryButton>
        )}
        {receipt && (
          <Link
            to={advertisingDestination(params, {
              ...advertisingCloseCommand,
              adReview: receipt.reviewId,
            })}
          >
            <Trans>Open saved recommendations</Trans>
          </Link>
        )}
      </StyledDeliveryStack>
    </section>
  );
};
