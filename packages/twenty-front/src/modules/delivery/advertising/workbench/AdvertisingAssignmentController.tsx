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
import { type AdvertisingWorkbenchIntent } from '@/delivery/advertising/workbench/advertising-intent.types';
import { AdvertisingAssignmentReview } from '@/delivery/advertising/workbench/AdvertisingAssignmentReview';
import {
  advertisingDestination,
  advertisingCloseCommand,
} from '@/delivery/advertising/workbench/advertising-navigation';
import { StyledAdvertisingBoundary } from '@/delivery/advertising/workbench/advertisingWorkbenchStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type AdvertisingAssignmentControllerProps = {
  state: ReturnType<typeof useAdvertisingContext>;
  selection: AdvertisingSourceSelection;
  sourceScope: string;
  sourceFingerprint: string | null;
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
export const AdvertisingAssignmentController = ({
  state,
  selection,
  sourceScope,
  sourceFingerprint,
  reviewId,
  requestId,
  intent,
  consumeIntent,
  enabled,
  authorityLost,
  onAuthorityLost,
  onClose,
  onSaved,
}: AdvertisingAssignmentControllerProps) => {
  const { t } = useLingui();
  const [params] = useSearchParams();
  const focusPanel = useAssistantPanelFocus();
  const { requestAction, cancelPendingNavigation } = useDeliveryDraftGuard();
  const [opened, setOpened] = useState(() =>
    intent?.mode === 'assign' &&
    intent.requestId === requestId &&
    intent.reviewId === reviewId
      ? intent.review
      : null,
  );
  const [confirmed, setConfirmed] = useState(false);
  const [frozen, setFrozen] = useState<AdvertisingCommand | null>(null);
  const [receipt, setReceipt] = useState<AdvertisingReceipt | null>(null);
  const [retryAllowed, setRetryAllowed] = useState(false);
  const [message, setMessage] = useState('');
  const [denied, setDenied] = useState(false);
  useLayoutEffect(() => consumeIntent(requestId), [consumeIntent, requestId]);
  useLayoutEffect(() => {
    if (authorityLost) {
      cancelPendingNavigation();
      setOpened(null);
      setFrozen(null);
      setReceipt(null);
      setConfirmed(false);
      setDenied(true);
    }
  }, [authorityLost, cancelPendingNavigation]);
  const loseAuthority = () => {
    cancelPendingNavigation();
    setOpened(null);
    setFrozen(null);
    setConfirmed(false);
    setDenied(true);
    onAuthorityLost();
  };
  const packet = useAdvertisingReview({
    state,
    selection,
    reviewId,
    sourceScope,
    available: enabled && !denied,
    withDetail: false,
  });
  useLayoutEffect(() => {
    if (packet.denied) {
      cancelPendingNavigation();
      setOpened(null);
      setFrozen(null);
      setReceipt(null);
      setConfirmed(false);
      setDenied(true);
    }
  }, [packet.denied, cancelPendingNavigation]);
  const commands = useAdvertisingCommands({
    state,
    scope: `${sourceScope}:${reviewId}:${packet.data?.review?.revision ?? 'unknown'}`,
    available: enabled && !denied && state.permission.manager,
    onAuthorityLost: loseAuthority,
  });
  useDeliveryDraftStatus({ dirty: frozen !== null, saving: commands.busy });
  const current = Boolean(
    opened &&
    packet.data?.review &&
    packet.data.review.id === opened.id &&
    packet.data.review.state === 'DRAFT' &&
    packet.data.review.revision === opened.revision &&
    opened.source.fingerprint === sourceFingerprint &&
    packet.data.currentSourceFingerprint === sourceFingerprint &&
    packet.data.canAssign,
  );
  const committed = async (command: AdvertisingCommand) => {
    const result = await commands.execute(command);
    if (!result) {
      setMessage(
        t`The review outcome is uncertain. Check the saved review before trying again.`,
      );
      return;
    }
    setReceipt(result);
    setFrozen(null);
    setRetryAllowed(false);
    setMessage(
      result.actionTasks.length === 0
        ? t`The no-change review was recorded. No task was created.`
        : t`The reviewed work was assigned. Open its tasks for current evidence and independent approval.`,
    );
    await onSaved().catch(() => undefined);
  };
  const assign = async () => {
    if (!opened || !current || !confirmed || frozen || commands.busy) return;
    const command: AdvertisingCommand = {
      kind: 'assign',
      input: {
        requestId,
        id: opened.id,
        revision: opened.revision,
        sourceFingerprint: opened.source.fingerprint,
      },
      actionIds: opened.actions.map(({ id }) => id),
    };
    setFrozen(command);
    await committed(command);
  };
  const check = async () => {
    setRetryAllowed(false);
    const result = await commands.check(requestId, reviewId, 'assign');
    if (result.kind === 'FOUND') {
      setReceipt(result.receipt);
      setFrozen(null);
      setMessage(
        t`The saved review was found. Open the reviewed work to see its current tasks.`,
      );
      await onSaved().catch(() => undefined);
    } else if (result.kind === 'NOT_FOUND') {
      setRetryAllowed(frozen !== null);
      setMessage(
        frozen
          ? t`No saved assignment was found. You may retry the work you already reviewed.`
          : t`No saved assignment was found. Close this view and review the current recommendations before assigning work.`,
      );
    } else
      setMessage(
        t`This review could not be checked. Keep this view open and check again.`,
      );
  };
  return (
    <section
      ref={focusPanel}
      tabIndex={-1}
      aria-label={t`Advertising assignment confirmation`}
    >
      <StyledDeliveryStack>
        {message && <p role="status">{message}</p>}
        {!enabled && (
          <p role="status">
            <Trans>
              Current access could not be verified. Your reviewed work is hidden
              and kept while you retry.
            </Trans>
          </p>
        )}
        {denied && (
          <p role="alert">
            <Trans>
              Assignment access changed. This preparation was discarded.
            </Trans>
          </p>
        )}
        {opened === null && receipt === null && !denied && (
          <p>
            <Trans>
              This earlier preparation is no longer open. Check whether its
              assignment was saved before closing this view and reviewing the
              current recommendations.
            </Trans>
          </p>
        )}
        {opened && enabled && !denied && !current && receipt === null && (
          <p role="alert">
            <Trans>
              The report, goal, recipients or saved recommendations changed.
              Open the current plan before assigning work.
            </Trans>
          </p>
        )}
        <StyledAdvertisingBoundary
          hidden={!enabled || denied || receipt !== null}
          disabled={!enabled || denied || frozen !== null || commands.busy}
          inert={!enabled || denied || undefined}
        >
          {opened && receipt === null && !denied && (
            <AdvertisingAssignmentReview
              review={opened}
              enabled={enabled && current && frozen === null}
              busy={commands.busy}
              confirmed={confirmed}
              onConfirmedChange={setConfirmed}
              onAssign={() => void assign()}
              onClose={() => requestAction(onClose)}
            />
          )}
        </StyledAdvertisingBoundary>
        {(opened === null || frozen !== null) && receipt === null && (
          <StyledDeliveryButton
            type="button"
            disabled={!enabled || denied || commands.busy}
            onClick={() => void check()}
          >
            <Trans>Check saved assignment</Trans>
          </StyledDeliveryButton>
        )}
        {retryAllowed && frozen && current && (
          <StyledDeliveryButton
            type="button"
            disabled={!enabled || denied || commands.busy}
            onClick={() => void committed(frozen)}
          >
            <Trans>Retry reviewed assignment</Trans>
          </StyledDeliveryButton>
        )}
        {receipt && (
          <Link
            to={advertisingDestination(params, {
              ...advertisingCloseCommand,
              adReview: receipt.reviewId,
            })}
          >
            <Trans>Open reviewed work</Trans>
          </Link>
        )}
        {(opened === null || receipt !== null || !enabled) && (
          <StyledDeliveryButton
            type="button"
            disabled={commands.busy}
            onClick={() => requestAction(onClose)}
          >
            <Trans>Close assignment review</Trans>
          </StyledDeliveryButton>
        )}
      </StyledDeliveryStack>
    </section>
  );
};
