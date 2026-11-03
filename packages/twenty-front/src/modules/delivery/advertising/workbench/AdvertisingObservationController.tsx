import { useLayoutEffect, useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { fastDeepEqual } from 'twenty-shared/utils';
import { useAssistantPanelFocus } from '@/delivery/assistants/useAssistantPanelFocus';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { type useAdvertisingContext } from '@/delivery/advertising/workbench/useAdvertisingContext';
import { type AdvertisingSourceSelection } from '@/delivery/advertising/workbench/useAdvertisingSource';
import { useAdvertisingReview } from '@/delivery/advertising/workbench/useAdvertisingReview';
import { AdvertisingObservationPanel } from '@/delivery/advertising/workbench/AdvertisingObservationPanel';
import { type AdvertisingReview } from '@/delivery/advertising/workbench/advertising-draft';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type AdvertisingObservationControllerProps = {
  state: ReturnType<typeof useAdvertisingContext>;
  selection: AdvertisingSourceSelection;
  sourceScope: string;
  reviewId: string;
  actionId: string;
  requestId: string | null;
  fresh: boolean;
  consumeIntent: () => void;
  enabled: boolean;
  authorityLost: boolean;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
  onAuthorityLost: () => void;
};
type LoadedObservationReview = {
  review: AdvertisingReview;
  actorScope: string;
  sourceFingerprint: string | null;
};
export const AdvertisingObservationController = ({
  state,
  selection,
  sourceScope,
  reviewId,
  actionId,
  requestId,
  fresh,
  consumeIntent,
  enabled,
  authorityLost,
  onClose,
  onSaved,
  onAuthorityLost,
}: AdvertisingObservationControllerProps) => {
  const { t } = useLingui();
  const focusPanel = useAssistantPanelFocus();
  const { cancelPendingNavigation } = useDeliveryDraftGuard();
  const [loaded, setLoaded] = useState<LoadedObservationReview | null>(null);
  const [lost, setLost] = useState(false);
  const [opened, setOpened] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');
  const packet = useAdvertisingReview({
    state,
    selection,
    reviewId,
    sourceScope,
    available: enabled && !lost && !authorityLost,
  });
  const actorScope = JSON.stringify({
    source: state.source,
    actor: state.data?.actor,
  });
  const exact = packet.detail?.review;
  const exactAction = exact?.actions.find((action) => action.id === actionId);
  const priorAction = loaded?.review.actions.find(
    (action) => action.id === actionId,
  );
  const structuralLoss = Boolean(
    exact &&
    loaded &&
    (exact.id !== loaded.review.id ||
      exact.state !== 'ASSIGNED' ||
      exact.source.id !== loaded.review.source.id ||
      exact.source.kind !== loaded.review.source.kind ||
      exact.source.projectId !== loaded.review.source.projectId ||
      exact.source.companyId !== loaded.review.source.companyId ||
      exactAction?.task?.id !== priorAction?.task?.id ||
      exactAction?.task?.ownerId !== priorAction?.task?.ownerId ||
      exactAction?.task?.reviewerId !== priorAction?.task?.reviewerId),
  );
  const knownLoss =
    authorityLost ||
    state.denied ||
    packet.denied ||
    structuralLoss ||
    Boolean(
      state.data !== null && loaded && actorScope !== loaded.actorScope,
    ) ||
    Boolean(packet.data?.blockingReasons.includes('ORIGINAL_CLIENT_CHANGED'));
  useLayoutEffect(() => {
    if (knownLoss && !lost) {
      cancelPendingNavigation();
      setLost(true);
      setLoaded(null);
      setOpened(false);
      onAuthorityLost();
    }
  }, [knownLoss, lost, cancelPendingNavigation, onAuthorityLost]);
  const canLoad =
    enabled &&
    state.data !== null &&
    !knownLoss &&
    !lost &&
    exact?.state === 'ASSIGNED' &&
    exact.id === reviewId &&
    exact.source.kind === selection.kind &&
    exact.source.id === selection.id &&
    exactAction != null;
  if (canLoad) {
    const next = {
      review: exact,
      actorScope,
      sourceFingerprint: packet.detail?.currentSourceFingerprint ?? null,
    };
    if (!fastDeepEqual(loaded, next)) setLoaded(next);
  }
  const task = loaded?.review.actions.find(
    (action) => action.id === actionId,
  )?.task;
  const taskState = packet.data?.tasks.find(
    (item) => item.actionId === actionId,
  );
  const taskVerified = task
    ? taskState?.taskId === task.id &&
      taskState.revision === task.revision &&
      taskState.state === task.state
    : taskState?.state === 'UNAVAILABLE' && taskState.revision === null;
  const current = Boolean(
    enabled &&
    state.data !== null &&
    !lost &&
    !knownLoss &&
    loaded &&
    exact &&
    packet.data?.review?.id === reviewId &&
    packet.data.review.state === 'ASSIGNED' &&
    packet.data.review.revision === loaded.review.revision &&
    packet.detail?.currentSourceFingerprint ===
      packet.data.currentSourceFingerprint &&
    loaded.sourceFingerprint === packet.data.currentSourceFingerprint &&
    taskVerified,
  );
  if (current && !opened) setOpened(true);
  const refresh = async () => {
    if (refreshing || lost || knownLoss) return;
    setRefreshing(true);
    setMessage('');
    try {
      await Promise.all([packet.query.refetch(), packet.detailQuery.refetch()]);
    } catch {
      setMessage(
        t`Current work could not be verified. Your mounted notes are kept while you retry.`,
      );
    } finally {
      setRefreshing(false);
    }
  };
  const loseAuthority = () => {
    cancelPendingNavigation();
    setLost(true);
    setLoaded(null);
    setOpened(false);
    onAuthorityLost();
  };
  return (
    <section
      ref={focusPanel}
      tabIndex={-1}
      aria-label={t`Advertising outcome review`}
    >
      <StyledDeliveryStack>
        {knownLoss || lost ? (
          <p role="alert">
            <Trans>
              Current action access or responsibilities changed. Private outcome
              notes were discarded. Close this view and reopen the current work.
            </Trans>
          </p>
        ) : !current ? (
          <p role="status">
            {loaded
              ? t`Current task and report details need verification. Your mounted notes are hidden and kept; refresh the current work before continuing.`
              : t`Loading the reviewed work and current task…`}
          </p>
        ) : null}
        {packet.detail?.review === null && !loaded && (
          <p role="alert">
            <Trans>This reviewed plan is no longer available.</Trans>
          </p>
        )}
        {exact && !exactAction && (
          <p role="alert">
            <Trans>
              This action does not belong to the selected reviewed plan.
            </Trans>
          </p>
        )}
        {message && <p role="status">{message}</p>}
        {loaded && !lost && (opened || current) && (
          <AdvertisingObservationPanel
            state={knownLoss ? { ...state, denied: true } : state}
            review={loaded.review}
            actionId={actionId}
            requestId={requestId}
            fresh={fresh && current}
            consumeIntent={consumeIntent}
            enabled={current}
            onClose={onClose}
            onAuthorityLost={loseAuthority}
            onSaved={async () => {
              await Promise.all([
                packet.query.refetch(),
                packet.detailQuery.refetch(),
              ]);
              await onSaved();
            }}
          />
        )}
        <StyledDeliveryRow>
          {!lost && !knownLoss && (
            <StyledDeliveryButton
              type="button"
              disabled={!enabled || refreshing}
              onClick={() => void refresh()}
            >
              {refreshing
                ? t`Refreshing current work…`
                : t`Refresh current task and plan`}
            </StyledDeliveryButton>
          )}
          {(!loaded || lost) && (
            <StyledDeliveryButton type="button" onClick={onClose}>
              <Trans>Close outcomes</Trans>
            </StyledDeliveryButton>
          )}
        </StyledDeliveryRow>
      </StyledDeliveryStack>
    </section>
  );
};
