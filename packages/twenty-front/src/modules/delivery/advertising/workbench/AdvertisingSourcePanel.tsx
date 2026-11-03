import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useApolloClient } from '@apollo/client/react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { fastDeepEqual } from 'twenty-shared/utils';
import { useAssistantPanelFocus } from '@/delivery/assistants/useAssistantPanelFocus';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { type useAdvertisingContext } from '@/delivery/advertising/workbench/useAdvertisingContext';
import {
  useAdvertisingSource,
  type AdvertisingSourceSelection,
} from '@/delivery/advertising/workbench/useAdvertisingSource';
import { AdvertisingEvidence } from '@/delivery/advertising/workbench/AdvertisingEvidence';
import { AdvertisingPackets } from '@/delivery/advertising/workbench/AdvertisingPackets';
import { AdvertisingReviewEditor } from '@/delivery/advertising/workbench/AdvertisingReviewEditor';
import { AdvertisingAssignmentController } from '@/delivery/advertising/workbench/AdvertisingAssignmentController';
import { AdvertisingObservationController } from '@/delivery/advertising/workbench/AdvertisingObservationController';
import { AdvertisingDraftPanel } from '@/delivery/advertising/drafts/AdvertisingDraftPanel';
import {
  newAdvertisingReviewDraft,
  existingAdvertisingReviewDraft,
  type AdvertisingReview,
} from '@/delivery/advertising/workbench/advertising-draft';
import { type AdvertisingWorkbenchIntent } from '@/delivery/advertising/workbench/advertising-intent.types';
import {
  advertisingDestination,
  advertisingCloseReport,
  advertisingCloseCommand,
} from '@/delivery/advertising/workbench/advertising-navigation';
import { useAdvertisingLabels } from '@/delivery/advertising/workbench/useAdvertisingLabels';
import { StyledAdvertisingBoundary } from '@/delivery/advertising/workbench/advertisingWorkbenchStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

export const AdvertisingSourcePanel = ({
  state,
  selection,
}: {
  state: ReturnType<typeof useAdvertisingContext>;
  selection: AdvertisingSourceSelection;
}) => {
  const { t } = useLingui();
  const labels = useAdvertisingLabels();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const client = useApolloClient();
  const [adOffset, setAdOffset] = useState(0);
  const [metricAdId, setMetricAdId] = useState<string | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [adsOpen, setAdsOpen] = useState(false);
  const source = useAdvertisingSource({
    state,
    selection,
    adOffset,
    metricAdId,
  });
  const { requestAction, cancelPendingNavigation } = useDeliveryDraftGuard();
  const [retainedState, setRetainedState] = useState(source.data);
  const [retainedEvidence, setRetainedEvidence] = useState(source.evidence);
  if (source.data && !fastDeepEqual(retainedState, source.data))
    setRetainedState(source.data);
  if (source.evidence && !fastDeepEqual(retainedEvidence, source.evidence))
    setRetainedEvidence(source.evidence);
  const [intent, setIntent] = useState<AdvertisingWorkbenchIntent | null>(null);
  const [privateVersion, setPrivateVersion] = useState(0);
  const mode = params.get('adMode');
  const reviewId = params.get('adReview');
  const requestId = params.get('adRequest');
  const actionId = params.get('adAction');
  const metadata = source.data ?? retainedState;
  const evidence = source.evidence ?? retainedEvidence;
  const spendEvidence =
    source.evidence !== null &&
    source.data !== null &&
    source.evidence.source.kind === selection.kind &&
    source.evidence.source.id === selection.id &&
    source.evidence.fingerprint === source.data.fingerprint
      ? source.evidence
      : null;
  const verified =
    state.data !== null && source.data !== null && !source.denied;
  const privateMode = mode === 'review' || mode === 'assign';
  const draftAuthorityLost =
    privateMode &&
    ((state.permission.ready && !state.permission.manager) ||
      (source.data !== null && !source.data.canManageDraft));
  // oxlint-disable-next-line twenty/no-state-useref -- Only a verified loss may dispose a mounted private intent; temporary checks keep its last authority evidence.
  const authority = useRef({ readable: false, editable: false });
  useLayoutEffect(() => {
    const denied = source.denied || state.denied;
    const revoked =
      (denied && authority.current.readable) ||
      (draftAuthorityLost && authority.current.editable);
    if (revoked) {
      cancelPendingNavigation();
      setIntent(null);
      setPrivateVersion((value) => value + 1);
    }
    if (denied) {
      setRetainedState(null);
      setRetainedEvidence(null);
      setEvidenceOpen(false);
      setMetricsOpen(false);
      setAdsOpen(false);
      authority.current = { readable: false, editable: false };
    } else {
      if (source.data) authority.current.readable = true;
      if (source.data && state.permission.ready)
        authority.current.editable =
          source.data.canManageDraft && state.permission.manager;
      if (state.permission.ready && !state.permission.manager)
        authority.current.editable = false;
    }
  }, [
    source.denied,
    state.denied,
    source.data,
    state.permission.ready,
    state.permission.manager,
    draftAuthorityLost,
    cancelPendingNavigation,
  ]);
  const consumeIntent = useCallback(
    (id: string) =>
      setIntent((current) => (current?.requestId === id ? null : current)),
    [],
  );
  const consumeObservationIntent = useCallback(() => {
    if (requestId) consumeIntent(requestId);
  }, [consumeIntent, requestId]);
  const privateAuthorityLost = useCallback(() => {
    cancelPendingNavigation();
    setIntent(null);
    setPrivateVersion((value) => value + 1);
  }, [cancelPendingNavigation]);
  const restoreReport = useCallback(() => {
    const target = document.querySelector<HTMLAnchorElement>(
      `[data-advertising-report="${selection.id}"]`,
    );
    if (!target || target.closest('[hidden], [inert]')) return false;
    target.focus();
    return document.activeElement === target;
  }, [selection.id]);
  const focusPanel = useAssistantPanelFocus(restoreReport);
  // oxlint-disable-next-line twenty/no-navigate-prefer-link -- Controllers pass this callback through shared draft confirmation before closing a local preparation.
  const closeCommand = () =>
    navigate(advertisingDestination(params, advertisingCloseCommand));
  const refresh = useCallback(async () => {
    await client.refetchQueries({
      include: 'active',
      onQueryUpdated: (query) =>
        query.queryName?.startsWith('DeliveryAdvertising') ||
        query.queryName === 'DeliveryAssistantCatalog'
          ? query.refetch()
          : false,
    });
  }, [client]);
  const openReview = (review?: AdvertisingReview) =>
    requestAction(() => {
      if (
        !verified ||
        !source.data?.canManageDraft ||
        !source.evidence ||
        !state.permission.manager
      )
        return;
      if (!review && source.data.currentDraftId) {
        navigate(
          advertisingDestination(params, {
            ...advertisingCloseCommand,
            adReview: source.data.currentDraftId,
            adAction: null,
          }),
        );
        return;
      }
      if (review && review.state !== 'DRAFT') return;
      const nextRequest = crypto.randomUUID();
      const nextReview = review?.id ?? crypto.randomUUID();
      const draft = review
        ? existingAdvertisingReviewDraft(review, nextRequest)
        : newAdvertisingReviewDraft(nextReview, nextRequest, source.evidence);
      setIntent({
        mode: 'review',
        requestId: nextRequest,
        reviewId: nextReview,
        draft,
      });
      navigate(
        advertisingDestination(params, {
          adReview: nextReview,
          adRequest: nextRequest,
          adMode: 'review',
          adAction: null,
        }),
      );
    });
  const openAssignment = (review: AdvertisingReview) =>
    requestAction(() => {
      if (
        !verified ||
        !source.data?.canReview ||
        !state.permission.manager ||
        review.state !== 'DRAFT'
      )
        return;
      const nextRequest = crypto.randomUUID();
      setIntent({
        mode: 'assign',
        requestId: nextRequest,
        reviewId: review.id,
        review,
      });
      navigate(
        advertisingDestination(params, {
          adReview: review.id,
          adRequest: nextRequest,
          adMode: 'assign',
          adAction: null,
        }),
      );
    });
  const openObservation = (review: AdvertisingReview, selectedAction: string) =>
    requestAction(() => {
      if (!verified || review.state !== 'ASSIGNED') return;
      const nextRequest = crypto.randomUUID();
      setIntent({
        mode: 'observe',
        requestId: nextRequest,
        reviewId: review.id,
        actionId: selectedAction,
      });
      navigate(
        advertisingDestination(params, {
          adReview: review.id,
          adAction: selectedAction,
          adRequest: nextRequest,
          adMode: 'observe',
        }),
      );
    });
  return (
    <StyledDeliveryCard
      ref={focusPanel}
      tabIndex={-1}
      aria-label={t`Selected advertising report`}
    >
      <StyledDeliveryStack>
        <StyledDeliveryRow>
          <h2>{source.data?.source.title ?? t`Advertising report`}</h2>
          <Link to={advertisingDestination(params, advertisingCloseReport)}>
            <Trans>Close report</Trans>
          </Link>
        </StyledDeliveryRow>
        {source.data ? (
          <>
            <p>
              {labels.source(source.data.source.kind)} ·{' '}
              {source.data.source.fromDate} – {source.data.source.throughDate} ·{' '}
              {source.data.source.currency} ·{' '}
              {labels.state(source.data.source.sourceStatus)}
            </p>
            <p>
              {source.data.originalRouting.projectName ?? t`Project not mapped`}{' '}
              ·{' '}
              {spendEvidence
                ? labels.money(
                    spendEvidence.source.spendMicros,
                    spendEvidence.source.currency,
                  )
                : t`Spend evidence not loaded`}
            </p>
            {source.data.reasonCodes.map((reason) => (
              <p key={reason}>{labels.reason(reason)}</p>
            ))}
          </>
        ) : (
          <p role={source.query.error || source.denied ? 'alert' : 'status'}>
            {source.denied
              ? t`This report is unavailable under your current access.`
              : source.query.error
                ? t`The current report could not be verified. Your same-report preparation is hidden and retained.`
                : t`Loading the selected report…`}
          </p>
        )}
        <StyledDeliveryButton
          type="button"
          onClick={() => void refresh().catch(() => undefined)}
        >
          <Trans>Refresh selected report</Trans>
        </StyledDeliveryButton>
        {draftAuthorityLost && (
          <>
            <p role="alert">
              <Trans>
                Preparing or assigning recommendations requires current
                management access to the original client project. Private
                preparation is unavailable.
              </Trans>
            </p>
            <StyledDeliveryButton
              type="button"
              onClick={() => requestAction(closeCommand)}
            >
              <Trans>Close preparation</Trans>
            </StyledDeliveryButton>
          </>
        )}
        <StyledAdvertisingBoundary
          hidden={!verified}
          disabled={!verified}
          inert={!verified || undefined}
        >
          {metadata && !source.denied && (
            <StyledDeliveryStack>
              <details
                open={evidenceOpen}
                onToggle={(event) => setEvidenceOpen(event.currentTarget.open)}
              >
                <summary>
                  <Trans>Inspect report evidence and ads</Trans>
                </summary>
                {source.evidence ? (
                  <AdvertisingEvidence
                    data={source.evidence}
                    metricsOpen={metricsOpen}
                    adsOpen={adsOpen}
                    onMetricsToggle={setMetricsOpen}
                    onAdsToggle={setAdsOpen}
                    onAdPage={setAdOffset}
                    onMetricAd={(id) => {
                      setMetricAdId(id);
                      setMetricsOpen(true);
                    }}
                  />
                ) : (
                  <>
                    <p role={source.evidenceQuery.error ? 'alert' : 'status'}>
                      {source.evidenceQuery.error
                        ? t`Report evidence could not be verified. Retry before preparing recommendations.`
                        : t`Loading exact report evidence…`}
                    </p>
                    <StyledDeliveryButton
                      type="button"
                      onClick={() =>
                        void source.evidenceQuery
                          .refetch()
                          .catch(() => undefined)
                      }
                    >
                      <Trans>Retry report evidence</Trans>
                    </StyledDeliveryButton>
                  </>
                )}
              </details>
              {mode === 'review' &&
                reviewId &&
                requestId &&
                evidence &&
                !draftAuthorityLost && (
                  <AdvertisingReviewEditor
                    key={`review:${reviewId}:${requestId}:${privateVersion}`}
                    state={state}
                    selection={selection}
                    source={evidence}
                    scope={source.scope}
                    reviewId={reviewId}
                    requestId={requestId}
                    intent={intent}
                    consumeIntent={consumeIntent}
                    enabled={verified && source.evidence !== null}
                    authorityLost={source.denied || draftAuthorityLost}
                    onAuthorityLost={privateAuthorityLost}
                    onClose={closeCommand}
                    onSaved={refresh}
                  />
                )}
              {mode === 'assign' &&
                reviewId &&
                requestId &&
                !draftAuthorityLost && (
                  <AdvertisingAssignmentController
                    key={`assign:${reviewId}:${requestId}:${privateVersion}`}
                    state={state}
                    selection={selection}
                    sourceScope={source.scope}
                    sourceFingerprint={source.data?.fingerprint ?? null}
                    reviewId={reviewId}
                    requestId={requestId}
                    intent={intent}
                    consumeIntent={consumeIntent}
                    enabled={verified}
                    authorityLost={source.denied || draftAuthorityLost}
                    onAuthorityLost={privateAuthorityLost}
                    onClose={closeCommand}
                    onSaved={refresh}
                  />
                )}
              {(mode === 'observe' || (mode === null && actionId)) &&
                reviewId &&
                actionId && (
                  <AdvertisingObservationController
                    key={`observe:${reviewId}:${actionId}:${mode === 'observe' ? requestId : 'history'}:${privateVersion}`}
                    state={state}
                    selection={selection}
                    sourceScope={source.scope}
                    reviewId={reviewId}
                    actionId={actionId}
                    requestId={mode === 'observe' ? requestId : null}
                    fresh={
                      intent?.mode === 'observe' &&
                      intent.requestId === requestId &&
                      intent.reviewId === reviewId &&
                      intent.actionId === actionId
                    }
                    consumeIntent={consumeObservationIntent}
                    enabled={verified}
                    authorityLost={source.denied || state.denied}
                    onClose={() =>
                      requestAction(() =>
                        navigate(
                          advertisingDestination(params, {
                            ...advertisingCloseCommand,
                            ...(mode === null ? { adAction: null } : {}),
                          }),
                        ),
                      )
                    }
                    onSaved={refresh}
                    onAuthorityLost={privateAuthorityLost}
                  />
                )}
              {mode === null && (
                <>
                  {metadata.canManageDraft && params.has('adDraftRun') && (
                    <AdvertisingDraftPanel
                      state={state}
                      selection={selection}
                      sourceFingerprint={metadata.fingerprint}
                      projectId={metadata.source.projectId ?? null}
                      scope={source.scope}
                      enabled={verified && state.permission.manager}
                    />
                  )}
                  {source.data?.canManageDraft && state.permission.manager && (
                    <StyledDeliveryButton
                      type="button"
                      data-primary="true"
                      disabled={!verified || source.evidence === null}
                      onClick={() => openReview()}
                    >
                      {source.data.currentDraftId
                        ? t`Open current recommendation draft`
                        : source.data.latestAssignedId
                          ? t`Plan follow-up work`
                          : t`Prepare recommendations`}
                    </StyledDeliveryButton>
                  )}
                  <AdvertisingPackets
                    state={state}
                    selection={selection}
                    sourceScope={source.scope}
                    available={verified}
                    defaultReviewId={
                      metadata.currentDraftId ??
                      metadata.latestAssignedId ??
                      null
                    }
                    onEdit={openReview}
                    onAssign={openAssignment}
                    onObserve={openObservation}
                  />
                  {metadata.canManageDraft && !params.has('adDraftRun') && (
                    <AdvertisingDraftPanel
                      state={state}
                      selection={selection}
                      sourceFingerprint={metadata.fingerprint}
                      projectId={metadata.source.projectId ?? null}
                      scope={source.scope}
                      enabled={verified && state.permission.manager}
                    />
                  )}
                </>
              )}
            </StyledDeliveryStack>
          )}
        </StyledAdvertisingBoundary>
      </StyledDeliveryStack>
    </StyledDeliveryCard>
  );
};
