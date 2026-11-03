import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { fastDeepEqual } from 'twenty-shared/utils';
import {
  useDeliveryDraftGuard,
  useDeliveryDraftStatus,
} from '@/delivery/drafts/DeliveryDraftGuard';
import { type useAdvertisingContext } from '@/delivery/advertising/workbench/useAdvertisingContext';
import { type AdvertisingSourceSelection } from '@/delivery/advertising/workbench/useAdvertisingSource';
import { advertisingDestination } from '@/delivery/advertising/workbench/advertising-navigation';
import { advertisingDraftClose } from '@/delivery/advertising/drafts/advertising-draft-navigation';
import { sameAdvertisingDraftGoal } from '@/delivery/advertising/drafts/advertising-draft-goal';
import { useAdvertisingDraftRun } from '@/delivery/advertising/drafts/useAdvertisingDraftRun';
import { useAdvertisingDraftCommands } from '@/delivery/advertising/drafts/useAdvertisingDraftCommands';
import { useAdvertisingDraftLabels } from '@/delivery/advertising/drafts/useAdvertisingDraftLabels';
import { AdvertisingDraftCancel } from '@/delivery/advertising/drafts/AdvertisingDraftCancel';
import { AdvertisingDraftResultView } from '@/delivery/advertising/drafts/AdvertisingDraftResultView';
import { AdvertisingDraftContextView } from '@/delivery/advertising/drafts/AdvertisingDraftContextView';
import { type AdvertisingDraftDetail } from '@/delivery/advertising/drafts/advertising-draft-types';
import {
  StyledAdvertisingBoundary,
  StyledAdvertisingFacts,
} from '@/delivery/advertising/workbench/advertisingWorkbenchStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { DateTimeDisplay } from '@/ui/field/display/components/DateTimeDisplay';
import {
  type CancelDeliveryAdvertisingDraftInput,
  type DeliveryAdvertisingGoalInput,
} from '~/generated-metadata/graphql';

type AdvertisingDraftRunViewerProps = {
  state: ReturnType<typeof useAdvertisingContext>;
  selection: AdvertisingSourceSelection;
  sourceFingerprint: string;
  scope: string;
  runId: string;
  requestId?: string | null;
  enabled: boolean;
  goal?: DeliveryAdvertisingGoalInput;
  insertedIds?: string[];
  remainingSlots?: number;
  canUseNoChange?: boolean;
  onApplyingChange?: (id: string, active: boolean) => void;
  onInsert?: (detail: AdvertisingDraftDetail, ids: string[]) => boolean;
  onNoChange?: (detail: AdvertisingDraftDetail) => boolean;
};
export const AdvertisingDraftRunViewer = (
  props: AdvertisingDraftRunViewerProps,
) => {
  const { t } = useLingui();
  const { cancelPendingNavigation } = useDeliveryDraftGuard();
  const [denied, setDenied] = useState(false);
  const loseAuthority = useCallback(() => {
    cancelPendingNavigation();
    setDenied(true);
  }, [cancelPendingNavigation]);
  return denied ? (
    <StyledDeliveryStack>
      <p role="alert">
        <Trans>
          Access to these AI suggestions changed. Private preparation and saved
          content were cleared from this view.
        </Trans>
      </p>
      <StyledDeliveryButton
        type="button"
        disabled={!props.enabled}
        onClick={() => setDenied(false)}
      >{t`Check current AI access`}</StyledDeliveryButton>
    </StyledDeliveryStack>
  ) : (
    <AdvertisingDraftRunWorkspace
      key={`${props.state.source}:${props.selection.kind}:${props.selection.id}:${props.runId}:${props.requestId ?? ''}`}
      state={props.state}
      selection={props.selection}
      sourceFingerprint={props.sourceFingerprint}
      scope={props.scope}
      runId={props.runId}
      requestId={props.requestId}
      enabled={props.enabled}
      goal={props.goal}
      insertedIds={props.insertedIds}
      remainingSlots={props.remainingSlots}
      canUseNoChange={props.canUseNoChange}
      onApplyingChange={props.onApplyingChange}
      onInsert={props.onInsert}
      onNoChange={props.onNoChange}
      onAuthorityLost={loseAuthority}
    />
  );
};

const AdvertisingDraftRunWorkspace = ({
  state,
  selection,
  sourceFingerprint,
  scope,
  runId,
  requestId = null,
  enabled,
  goal,
  insertedIds = [],
  remainingSlots = 0,
  canUseNoChange = false,
  onApplyingChange,
  onInsert,
  onNoChange,
  onAuthorityLost,
}: AdvertisingDraftRunViewerProps & { onAuthorityLost: () => void }) => {
  const { t } = useLingui();
  const labels = useAdvertisingDraftLabels();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { requestNavigation } = useDeliveryDraftGuard();
  const [requestFound, setRequestFound] = useState(requestId === null);
  const [message, setMessage] = useState('');
  const [applying, setApplying] = useState(false);
  // oxlint-disable-next-line twenty/no-state-useref -- Unmounted or superseded verification must release only its own pending insertion, never another run's protection.
  const activeInsertions = useRef(new Set<string>());
  useLayoutEffect(() => {
    const operations = activeInsertions.current;
    return () => {
      for (const id of operations) onApplyingChange?.(id, false);
      operations.clear();
    };
  }, [onApplyingChange]);
  useDeliveryDraftStatus({ dirty: false, saving: applying });
  const [cancelIntent, setCancelIntent] =
    useState<CancelDeliveryAdvertisingDraftInput | null>(null);
  const commands = useAdvertisingDraftCommands({
    state,
    selection,
    scope: `${scope}:${runId}`,
    enabled,
    onAuthorityLost,
  });
  const reading = useAdvertisingDraftRun({
    state,
    selection,
    runId,
    scope,
    enabled: enabled && requestFound,
    onAuthorityLost,
  });
  const [retained, setRetained] = useState<AdvertisingDraftDetail | null>(
    reading.detail,
  );
  if (reading.detail && !fastDeepEqual(retained, reading.detail))
    setRetained(reading.detail);
  useLayoutEffect(() => {
    if (reading.denied) onAuthorityLost();
  }, [reading.denied, onAuthorityLost]);
  const consumeCancel = useCallback(
    (id: string) =>
      setCancelIntent((current) =>
        current?.requestId === id ? null : current,
      ),
    [],
  );
  const cancelRequest = params.get('adDraftCancelRequest');
  const current =
    enabled &&
    reading.data !== null &&
    reading.data.currentSourceFingerprint === sourceFingerprint;
  const eligible =
    current &&
    reading.data?.canUseResult === true &&
    retained !== null &&
    retained.canUseResult &&
    retained.currentSourceFingerprint === sourceFingerprint &&
    goal !== undefined &&
    sameAdvertisingDraftGoal(retained.run.context.goal, goal);
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
  const refresh = async () => {
    await reading.query.refetch().catch(() => undefined);
    if (
      retained ||
      ['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(
        reading.data?.run.status ?? '',
      )
    )
      await reading.detailQuery.refetch().catch(() => undefined);
  };
  const apply = async (ids?: string[]) => {
    if (!eligible || applying) return;
    const operationId = crypto.randomUUID();
    activeInsertions.current.add(operationId);
    onApplyingChange?.(operationId, true);
    setApplying(true);
    setMessage('');
    try {
      const verified = await reading.verify();
      if (
        !verified ||
        !verified.canUseResult ||
        verified.currentSourceFingerprint !== sourceFingerprint ||
        goal === undefined ||
        !sameAdvertisingDraftGoal(verified.run.context.goal, goal)
      ) {
        setMessage(
          t`The current report, outcome or suggestion eligibility changed. Review the saved run before adding it.`,
        );
        return;
      }
      const added = ids ? onInsert?.(verified, ids) : onNoChange?.(verified);
      setMessage(
        added
          ? t`The selected material was added to your draft. Review and edit it, then choose people and dates before saving.`
          : t`Your current draft could not accept this material. Existing text was kept. Review its current goal, actions and available space.`,
      );
    } finally {
      activeInsertions.current.delete(operationId);
      onApplyingChange?.(operationId, false);
      setApplying(false);
    }
  };
  return (
    <section
      aria-label={t`AI suggestion run`}
      data-advertising-draft-run-id={runId}
    >
      <StyledDeliveryStack>
        <StyledDeliveryRow>
          <h4>
            <Trans>AI suggestion run</Trans>
          </h4>
          <StyledDeliveryButton
            type="button"
            onClick={() => move(advertisingDraftClose)}
          >
            <Trans>Close AI run</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryRow>
        {message && <p role="status">{message}</p>}
        {!requestFound && requestId !== null && (
          <>
            <p>
              <Trans>
                This saved link needs its original start checked before opening
                a run. It cannot recreate an earlier private request.
              </Trans>
            </p>
            <StyledDeliveryButton
              type="button"
              disabled={!enabled || commands.busy}
              onClick={async () => {
                const result = await commands.check(
                  requestId,
                  runId,
                  'STARTED',
                );
                if (result.kind === 'FOUND') {
                  setRequestFound(true);
                  setMessage(t`The saved run was found.`);
                } else
                  setMessage(
                    result.kind === 'NOT_FOUND'
                      ? t`No saved start was found. Check again before preparing another run; this view cannot retry an unknown body.`
                      : t`The saved start could not be checked. Keep this view open and retry the check.`,
                  );
              }}
            >
              <Trans>Check saved AI request</Trans>
            </StyledDeliveryButton>
          </>
        )}
        {requestFound && !reading.data && (
          <p role={reading.query.error ? 'alert' : 'status'}>
            {reading.query.error
              ? t`The current AI run could not be verified. Retry before using any saved suggestions.`
              : t`Checking the current AI run…`}
          </p>
        )}
        {requestFound && (
          <StyledDeliveryButton
            type="button"
            disabled={!enabled || applying}
            onClick={() => void refresh()}
          >
            <Trans>Refresh AI run</Trans>
          </StyledDeliveryButton>
        )}
        <StyledAdvertisingBoundary
          hidden={!enabled || reading.data === null}
          disabled={!enabled || reading.data === null}
          inert={!enabled || reading.data === null || undefined}
        >
          {reading.data && (
            <>
              <p>
                {reading.data.run.agent.name} ·{' '}
                {labels.status(reading.data.run.status)}
              </p>
              <StyledDeliveryRow>
                <span>{reading.data.run.initiatorName} ·</span>
                <DateTimeDisplay value={reading.data.run.createdAt} />
              </StyledDeliveryRow>
              {reading.data.blockingReasons.map((reason) => (
                <p key={reason}>{labels.reason(reason)}</p>
              ))}
              {goal &&
                retained &&
                !sameAdvertisingDraftGoal(retained.run.context.goal, goal) && (
                  <p role="status">
                    <Trans>
                      This saved run used a different reviewed outcome. Its
                      suggestions cannot be inserted into the current draft.
                    </Trans>
                  </p>
                )}
              {reading.data.canCancel && !cancelRequest && (
                <StyledDeliveryButton
                  type="button"
                  disabled={!current || commands.busy}
                  onClick={() => {
                    const input = {
                      id: runId,
                      requestId: crypto.randomUUID(),
                      revision: reading.data?.run.revision ?? 0,
                    };
                    move({ adDraftCancelRequest: input.requestId }, () =>
                      setCancelIntent(input),
                    );
                  }}
                >
                  <Trans>Cancel suggestion run</Trans>
                </StyledDeliveryButton>
              )}
              {cancelRequest && (
                <AdvertisingDraftCancel
                  key={cancelRequest}
                  state={state}
                  selection={selection}
                  scope={scope}
                  runId={runId}
                  requestId={cancelRequest}
                  revision={reading.data.run.revision}
                  canCancel={reading.data.canCancel}
                  intent={cancelIntent}
                  consumeIntent={consumeCancel}
                  enabled={current}
                  onAuthorityLost={onAuthorityLost}
                  onChanged={refresh}
                  onClose={() => move({ adDraftCancelRequest: null })}
                />
              )}
            </>
          )}
          {retained && (
            <StyledDeliveryStack>
              <details>
                <summary>
                  <Trans>Evidence used for this saved run</Trans>
                </summary>
                <AdvertisingDraftContextView context={retained.run.context} />
              </details>
              <StyledAdvertisingFacts>
                <dt>
                  <Trans>Recorded cost</Trans>
                </dt>
                <dd>
                  {retained.run.usage?.costUsd == null
                    ? t`Unknown`
                    : `USD ${retained.run.usage.costUsd}`}
                </dd>
                <dt>
                  <Trans>Input / output tokens</Trans>
                </dt>
                <dd>
                  {retained.run.usage?.inputTokens ?? t`Unknown`} /{' '}
                  {retained.run.usage?.outputTokens ?? t`Unknown`}
                </dd>
              </StyledAdvertisingFacts>
              {retained.run.status === 'FAILED' && (
                <p role="alert">
                  <Trans>
                    The run did not complete. Review current setup and any
                    recorded exposure before starting another request.
                  </Trans>
                </p>
              )}
              {retained.run.result && (
                <AdvertisingDraftResultView
                  key={runId}
                  detail={retained}
                  enabled={eligible}
                  busy={applying}
                  insertedIds={insertedIds}
                  remainingSlots={remainingSlots}
                  canUseNoChange={canUseNoChange}
                  onInsert={onInsert ? (ids) => apply(ids) : undefined}
                  onNoChange={onNoChange ? () => apply() : undefined}
                />
              )}
            </StyledDeliveryStack>
          )}
        </StyledAdvertisingBoundary>
        <Link to="/delivery?view=agents&agentView=spending">
          <Trans>Review AI spending and unresolved exposure</Trans>
        </Link>
      </StyledDeliveryStack>
    </section>
  );
};
