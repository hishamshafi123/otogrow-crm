import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { type useAdvertisingContext } from '@/delivery/advertising/workbench/useAdvertisingContext';
import { type AdvertisingSourceSelection } from '@/delivery/advertising/workbench/useAdvertisingSource';
import { advertisingDestination } from '@/delivery/advertising/workbench/advertising-navigation';
import { advertisingDraftClose } from '@/delivery/advertising/drafts/advertising-draft-navigation';
import { AdvertisingDraftAssistantPicker } from '@/delivery/advertising/drafts/AdvertisingDraftAssistantPicker';
import { AdvertisingDraftPreparation } from '@/delivery/advertising/drafts/AdvertisingDraftPreparation';
import { AdvertisingDraftRunViewer } from '@/delivery/advertising/drafts/AdvertisingDraftRunViewer';
import { AdvertisingDraftHistory } from '@/delivery/advertising/drafts/AdvertisingDraftHistory';
import {
  type AdvertisingDraftIntent,
  type AdvertisingDraftDetail,
} from '@/delivery/advertising/drafts/advertising-draft-types';
import { StyledAdvertisingBoundary } from '@/delivery/advertising/workbench/advertisingWorkbenchStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { type DeliveryAdvertisingGoalInput } from '~/generated-metadata/graphql';

type AdvertisingDraftPanelProps = {
  state: ReturnType<typeof useAdvertisingContext>;
  selection: AdvertisingSourceSelection;
  sourceFingerprint: string;
  projectId: string | null;
  scope: string;
  enabled: boolean;
  review?: {
    id: string;
    requestId: string;
    goal: DeliveryAdvertisingGoalInput;
    goalReady: boolean;
    actionCount: number;
    onApplyingChange: (id: string, active: boolean) => void;
    origins: { runId: string; suggestionId: string }[];
    onInsert: (detail: AdvertisingDraftDetail, ids: string[]) => boolean;
    onNoChange: (detail: AdvertisingDraftDetail) => boolean;
  };
};
export const AdvertisingDraftPanel = (props: AdvertisingDraftPanelProps) => {
  const { t } = useLingui();
  const { cancelPendingNavigation, requestNavigation } =
    useDeliveryDraftGuard();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [denied, setDenied] = useState(false);
  // oxlint-disable-next-line twenty/no-state-useref -- A verified role reduction must cancel queued private navigation before its editor registrations disappear.
  const previousSource = useRef(props.state.source);
  useLayoutEffect(() => {
    if (
      previousSource.current !== props.state.source &&
      props.state.permission.ready
    )
      cancelPendingNavigation();
    previousSource.current = props.state.source;
  }, [
    props.state.source,
    props.state.permission.ready,
    cancelPendingNavigation,
  ]);
  const loseAuthority = useCallback(() => {
    cancelPendingNavigation();
    setDenied(true);
  }, [cancelPendingNavigation]);
  useLayoutEffect(() => {
    if (
      props.state.denied ||
      (props.state.permission.ready && !props.state.permission.manager)
    )
      loseAuthority();
  }, [
    props.state.denied,
    props.state.permission.ready,
    props.state.permission.manager,
    loseAuthority,
  ]);
  return denied ? (
    <StyledDeliveryStack>
      <p role="alert">
        <Trans>
          AI access changed. Private preparation was discarded. Manual
          recommendations remain separate.
        </Trans>
      </p>
      <StyledDeliveryButton
        type="button"
        disabled={!props.enabled}
        onClick={() => setDenied(false)}
      >{t`Check AI access again`}</StyledDeliveryButton>
      <StyledDeliveryButton
        type="button"
        onClick={() => {
          const destination = advertisingDestination(
            params,
            advertisingDraftClose,
          );
          requestNavigation(
            {
              pathname: '/delivery',
              search: destination.slice('/delivery'.length),
            },
            () => navigate(destination),
          );
        }}
      >
        <Trans>Close AI suggestions</Trans>
      </StyledDeliveryButton>
    </StyledDeliveryStack>
  ) : (
    <AdvertisingDraftWorkspace
      key={`${props.state.source}:${props.selection.kind}:${props.selection.id}`}
      state={props.state}
      selection={props.selection}
      sourceFingerprint={props.sourceFingerprint}
      projectId={props.projectId}
      scope={props.scope}
      enabled={props.enabled}
      review={props.review}
      onAuthorityLost={loseAuthority}
    />
  );
};

const AdvertisingDraftWorkspace = ({
  state,
  selection,
  sourceFingerprint,
  projectId,
  scope,
  enabled,
  review,
  onAuthorityLost,
}: AdvertisingDraftPanelProps & { onAuthorityLost: () => void }) => {
  const { t } = useLingui();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { requestNavigation } = useDeliveryDraftGuard();
  const [intent, setIntent] = useState<AdvertisingDraftIntent | null>(null);
  const consumeIntent = useCallback(
    (id: string) =>
      setIntent((current) => (current?.requestId === id ? null : current)),
    [],
  );
  const runId = params.get('adDraftRun');
  const requestId = params.get('adDraftRequest');
  const agentId = params.get('adDraftAssistant');
  const view = params.get('adDraftView') ?? (runId ? 'history' : null);
  const move = (
    changes: Record<string, string | null>,
    action?: () => void,
  ) => {
    const destination = advertisingDestination(params, changes);
    requestNavigation(
      { pathname: '/delivery', search: destination.slice('/delivery'.length) },
      () => {
        action?.();
        navigate(destination);
      },
    );
  };
  const openRun = (id: string) =>
    move({
      adDraftView: 'history',
      adDraftRun: id,
      adDraftRequest: null,
      adDraftAssistant: null,
      adDraftCancelRequest: null,
    });
  return (
    <section aria-label={t`Optional AI advertising suggestions`}>
      <StyledDeliveryStack>
        <h4>
          <Trans>AI suggestions (optional)</Trans>
        </h4>
        <p>
          <Trans>
            Prepare evidence-cited ideas for human review. No ad, budget,
            assignment or client message is changed by a suggestion run.
          </Trans>
        </p>
        {review && !review.goalReady && (
          <p role="status">
            {review.goal.metricAdId != null
              ? t`This initial assistant uses account totals. Choose an account-level outcome before preparing suggestions; it cannot analyze an individual ad.`
              : t`Choose and review a valid business outcome before preparing AI suggestions. Manual work stays available.`}
          </p>
        )}
        <StyledDeliveryRow>
          {review && (
            <StyledDeliveryButton
              type="button"
              disabled={!enabled || !review.goalReady || projectId === null}
              onClick={() =>
                move({ ...advertisingDraftClose, adDraftView: 'assistants' })
              }
            >
              <Trans>Choose an advertising assistant</Trans>
            </StyledDeliveryButton>
          )}
          <StyledDeliveryButton
            type="button"
            disabled={!enabled}
            onClick={() => move({ adDraftView: 'history' })}
          >
            <Trans>Review previous AI runs</Trans>
          </StyledDeliveryButton>
          {view && (
            <StyledDeliveryButton
              type="button"
              onClick={() => move(advertisingDraftClose)}
            >
              <Trans>Close AI suggestions</Trans>
            </StyledDeliveryButton>
          )}
        </StyledDeliveryRow>
        {!review && (
          <p>
            <Trans>
              Inspect saved runs here. Prepare new suggestions from a
              recommendation draft after choosing its business outcome.
            </Trans>
          </p>
        )}
        <StyledAdvertisingBoundary
          hidden={!enabled}
          disabled={!enabled}
          inert={!enabled || undefined}
        >
          {view === 'assistants' && review && review.goalReady && projectId && (
            <AdvertisingDraftAssistantPicker
              state={state}
              projectId={projectId}
              enabled={enabled}
              onChoose={(assistant) => {
                const next = {
                  requestId: crypto.randomUUID(),
                  runId: crypto.randomUUID(),
                  agentId: assistant.id,
                  requirementsRequired:
                    assistant.requiredInputs.includes('requirements'),
                };
                move(
                  {
                    ...advertisingDraftClose,
                    adDraftView: 'prepare',
                    adDraftAssistant: next.agentId,
                    adDraftRequest: next.requestId,
                    adDraftRun: next.runId,
                  },
                  () => setIntent(next),
                );
              }}
            />
          )}
          {view === 'prepare' && review && runId && requestId && agentId && (
            <AdvertisingDraftPreparation
              key={`${requestId}:${runId}:${agentId}`}
              state={state}
              selection={selection}
              sourceFingerprint={sourceFingerprint}
              scope={scope}
              goal={review.goal}
              reviewId={review.id}
              reviewRequestId={review.requestId}
              requestId={requestId}
              runId={runId}
              agentId={agentId}
              intent={intent}
              consumeIntent={consumeIntent}
              enabled={enabled && review.goalReady}
              onOpenRun={openRun}
              onClose={() => move(advertisingDraftClose)}
              onAuthorityLost={onAuthorityLost}
            />
          )}
          {(view === 'history' || (!review && runId)) && (
            <StyledDeliveryStack>
              {runId && (
                <AdvertisingDraftRunViewer
                  key={`${runId}:${requestId ?? ''}`}
                  state={state}
                  selection={selection}
                  sourceFingerprint={sourceFingerprint}
                  scope={`${scope}:${JSON.stringify(review?.goal ?? null)}`}
                  runId={runId}
                  requestId={requestId}
                  enabled={enabled}
                  goal={review?.goal}
                  insertedIds={review?.origins
                    .filter((origin) => origin.runId === runId)
                    .map((origin) => origin.suggestionId)}
                  remainingSlots={review ? 20 - review.actionCount : 0}
                  canUseNoChange={review?.actionCount === 0}
                  onApplyingChange={review?.onApplyingChange}
                  onInsert={review?.onInsert}
                  onNoChange={review?.onNoChange}
                />
              )}
              <AdvertisingDraftHistory
                state={state}
                selection={selection}
                scope={scope}
                after={params.get('adDraftAfter')}
                enabled={enabled}
                onOpen={openRun}
                onPage={(after) => move({ adDraftAfter: after })}
              />
            </StyledDeliveryStack>
          )}
        </StyledAdvertisingBoundary>
      </StyledDeliveryStack>
    </section>
  );
};
