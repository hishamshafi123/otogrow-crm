import { useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Trans } from '@lingui/react/macro';
import { isValidUuid } from 'twenty-shared/utils';
import { DeliveryOperationalPage } from '@/delivery/operations-pages/DeliveryOperationalPage';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { useCreativeProductionContext } from '@/delivery/creative/production/useCreativeProductionContext';
import { CreativeProductionQueue } from '@/delivery/creative/production/CreativeProductionQueue';
import { CreativeProductionTask } from '@/delivery/creative/production/CreativeProductionTask';
import { creativeProductionDestination } from '@/delivery/creative/production/creative-production-navigation';
import {
  StyledCreativeBoundary,
  StyledCreativeText,
} from '@/delivery/creative/production/creative-production-styles';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

export const DeliveryCreativeProductionPage = () => (
  <DeliveryOperationalPage view="creative">
    <CreativeProductionWorkspace />
  </DeliveryOperationalPage>
);
const CreativeProductionWorkspace = () => {
  const state = useCreativeProductionContext();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { requestAction, cancelPendingNavigation } = useDeliveryDraftGuard();
  const [owner, setOwner] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [requiresCheck, setRequiresCheck] = useState(false);
  const [checking, setChecking] = useState(false);
  // oxlint-disable-next-line twenty/no-state-useref -- A late access check cannot reopen preparation after another source or denial.
  const checkGeneration = useRef(0);
  // oxlint-disable-next-line twenty/no-state-useref -- The access button receives only focus lost when private content is removed.
  const accessButton = useRef<HTMLButtonElement | null>(null);
  useLayoutEffect(() => {
    checkGeneration.current += 1;
    return () => {
      checkGeneration.current += 1;
    };
  }, [state.source]);
  const currentOwner = state.data
    ? `${state.source}:${state.data.scope}`
    : null;
  const changed =
    owner !== null && currentOwner !== null && owner !== currentOwner;
  const denied = state.denied;
  useLayoutEffect(() => {
    if (denied || changed) {
      if (owner !== null || !requiresCheck) {
        checkGeneration.current += 1;
        cancelPendingNavigation();
        setOwner(null);
        setRequiresCheck(true);
        setEpoch((value) => value + 1);
      }
    } else if (!requiresCheck && currentOwner !== null && owner === null)
      setOwner(currentOwner);
  }, [
    denied,
    changed,
    owner,
    currentOwner,
    requiresCheck,
    cancelPendingNavigation,
  ]);
  useLayoutEffect(() => {
    if (
      requiresCheck &&
      owner === null &&
      (document.activeElement === document.body ||
        document.activeElement === document.documentElement)
    )
      accessButton.current?.focus();
  }, [requiresCheck, owner]);
  const checkAccess = async () => {
    if (checking || !state.permission.ready) return;
    const generation = checkGeneration.current;
    setChecking(true);
    try {
      const current = (await state.query.refetch()).data
        ?.deliveryCreativeContext;
      if (
        generation === checkGeneration.current &&
        current &&
        state.matches(current)
      )
        setRequiresCheck(false);
    } catch {
      // Current query state supplies the access or connection recovery message.
    } finally {
      setChecking(false);
    }
  };
  const taskId = params.get('task');
  const validTask = taskId === null || isValidUuid(taskId);
  const available =
    state.data !== null &&
    !denied &&
    !changed &&
    !requiresCheck &&
    owner === currentOwner;
  return (
    <StyledCreativeText>
      <StyledDeliveryStack>
        <Link
          to={`/delivery?view=creative&creativeView=learning${params.get('creativeProject') ? `&learningProject=${encodeURIComponent(params.get('creativeProject') ?? '')}` : ''}`}
        >
          <Trans>Inspect creative and ad learning</Trans>
        </Link>
        {!available && (
          <div
            role={
              denied || requiresCheck || state.query.error ? 'alert' : 'status'
            }
          >
            {denied ? (
              <Trans>
                Creative access was denied. Private preparation is no longer
                available.
              </Trans>
            ) : requiresCheck ? (
              <Trans>
                Check current creative access before reopening. Earlier private
                preparation was cleared.
              </Trans>
            ) : state.query.error ? (
              <Trans>
                Current creative access could not be checked. Information is
                hidden and unsaved work is kept while you retry.
              </Trans>
            ) : (
              <Trans>Checking creative workspace…</Trans>
            )}
            <StyledDeliveryButton
              ref={accessButton}
              type="button"
              disabled={checking || !state.permission.ready}
              onClick={() => void checkAccess()}
            >
              <Trans>Check creative access</Trans>
            </StyledDeliveryButton>
          </div>
        )}
        {!validTask && (
          <div role="alert">
            <Trans>This creative task link is invalid.</Trans>
            <StyledDeliveryButton
              type="button"
              onClick={() =>
                requestAction(() =>
                  navigate(
                    creativeProductionDestination(params, { task: null }),
                  ),
                )
              }
            >
              <Trans>Open production queue</Trans>
            </StyledDeliveryButton>
          </div>
        )}
        <StyledCreativeBoundary
          hidden={!available}
          disabled={!available}
          inert={!available || undefined}
        >
          {owner !== null && validTask && (
            <div key={`${owner}:${epoch}`}>
              {taskId ? (
                <CreativeProductionTask
                  key={taskId}
                  state={state}
                  taskId={taskId}
                />
              ) : (
                <CreativeProductionQueue state={state} />
              )}
            </div>
          )}
        </StyledCreativeBoundary>
      </StyledDeliveryStack>
    </StyledCreativeText>
  );
};
