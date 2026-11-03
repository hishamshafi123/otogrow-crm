import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { Trans } from '@lingui/react/macro';
import { styled } from '@linaria/react';
import { useBlocker, useLocation, useNavigate } from 'react-router-dom';
import { isValidUuid } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

export type DeliveryDraftNavigationLocation = {
  pathname: string;
  search: string;
};
export type DeliveryDraftNavigationRetention = (
  current: DeliveryDraftNavigationLocation,
  next: DeliveryDraftNavigationLocation,
) => boolean;
type DraftStatus = {
  dirty: boolean;
  saving: boolean;
  retainsNavigation?: DeliveryDraftNavigationRetention;
};
const blocksDraftNavigation = (
  drafts: Record<string, DraftStatus>,
  current: DeliveryDraftNavigationLocation,
  next: DeliveryDraftNavigationLocation,
) =>
  Object.values(drafts).some((draft) => {
    if (draft.saving) return true;
    if (!draft.dirty) return false;
    try {
      return draft.retainsNavigation?.(current, next) !== true;
    } catch {
      return true;
    }
  });
type PendingAction = { generation: number; action: () => void };
type BlockedNavigation = { generation: number; locationKey: string };
type DraftGuard = {
  register: (id: string, status: DraftStatus | null) => void;
  requestAction: (action: () => void) => void;
  requestNavigation: (
    destination: DeliveryDraftNavigationLocation,
    action: () => void,
  ) => boolean;
  cancelPendingNavigation: () => void;
  recordSetupRecoveryId: (kind: 'company' | 'setup', id: string) => boolean;
};
const DraftContext = createContext<DraftGuard>({
  register: () => undefined,
  requestAction: (action) => action(),
  requestNavigation: (_destination, action) => {
    action();
    return true;
  },
  cancelPendingNavigation: () => undefined,
  recordSetupRecoveryId: () => false,
});

const StyledDialog = styled.dialog`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 12px;
  box-sizing: border-box;
  color: ${themeCssVariables.font.color.primary};
  max-width: 440px;
  padding: 24px;
  width: calc(100% - 32px);
  &::backdrop {
    background: ${themeCssVariables.background.overlaySecondary};
  }
  h2,
  p {
    margin: 0;
  }
  h2 {
    font-size: 18px;
  }
`;
const StyledActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

type DeliveryDraftGuardProviderProps = { children: ReactNode };

export const DeliveryDraftGuardProvider = ({
  children,
}: DeliveryDraftGuardProviderProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState<Record<string, DraftStatus>>({});
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  // oxlint-disable-next-line twenty/no-state-useref -- Authority loss must invalidate callbacks before an earlier render's passive effect can run.
  const navigationGeneration = useRef(0);
  // oxlint-disable-next-line twenty/no-state-useref -- Pending callback ownership must change synchronously, independently of React state batching.
  const pendingActionEvidence = useRef<PendingAction | null>(null);
  // oxlint-disable-next-line twenty/no-state-useref -- Record the authority generation when the router actually blocks, before descendant layout effects can cancel it.
  const blockedNavigationEvidence = useRef<BlockedNavigation | null>(null);
  // oxlint-disable-next-line twenty/no-state-useref -- A cancellation may run before the provider's next layout effect commits the latest blocker.
  const currentBlocker = useRef<ReturnType<typeof useBlocker> | null>(null);
  // oxlint-disable-next-line twenty/no-state-useref -- A same-event navigation authorization must be synchronous; it does not render UI.
  const allowNextNavigation = useRef(false);
  // oxlint-disable-next-line twenty/no-state-useref -- Native dialog close restores focus before React removes the top-layer element.
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  // oxlint-disable-next-line twenty/no-state-useref -- This is the DOM focus target, not application state.
  const previousFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const saving = Object.values(drafts).some((draft) => draft.saving);
  const protectedDraft =
    saving || Object.values(drafts).some((draft) => draft.dirty);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    const blocked =
      !allowNextNavigation.current &&
      blocksDraftNavigation(drafts, currentLocation, nextLocation) &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search);
    if (blocked)
      blockedNavigationEvidence.current = {
        generation: navigationGeneration.current,
        locationKey: nextLocation.key,
      };
    return blocked;
  });
  const blockedAttempt =
    blocker.state === 'blocked' &&
    blockedNavigationEvidence.current?.locationKey === blocker.location.key
      ? blockedNavigationEvidence.current
      : null;
  useLayoutEffect(() => {
    currentBlocker.current = blocker;
    if (
      blocker.state === 'blocked' &&
      (!blockedAttempt ||
        blockedAttempt.generation !== navigationGeneration.current)
    )
      blocker.reset();
  }, [blocker, blockedAttempt]);
  // oxlint-disable-next-line twenty/no-state-useref -- Delayed setup callers must check the current route and confirmation before recording a recovery ID.
  const recoveryBoundary = useRef({
    location,
    pending: pendingAction !== null,
    blocked: blocker.state === 'blocked',
    drafts,
    active: true,
  });
  useLayoutEffect(() => {
    recoveryBoundary.current = {
      location,
      pending: pendingAction !== null,
      blocked: blocker.state === 'blocked',
      drafts,
      active: true,
    };
    return () => {
      recoveryBoundary.current.active = false;
    };
  }, [location, pendingAction, blocker.state, drafts]);
  const register = useCallback((id: string, status: DraftStatus | null) => {
    setDrafts((previous) => {
      if (status === null) {
        if (!(id in previous)) return previous;
        const next = { ...previous };
        delete next[id];
        return next;
      }
      if (
        previous[id]?.dirty === status.dirty &&
        previous[id]?.saving === status.saving &&
        previous[id]?.retainsNavigation === status.retainsNavigation
      )
        return previous;
      return { ...previous, [id]: status };
    });
  }, []);
  useEffect(() => {
    if (!protectedDraft) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [protectedDraft]);
  const closeConfirmation = useCallback(() => {
    dialogRef.current?.close();
    if (previousFocus.current?.isConnected) previousFocus.current.focus();
  }, []);
  const cancelPendingNavigation = useCallback(() => {
    navigationGeneration.current += 1;
    pendingActionEvidence.current = null;
    allowNextNavigation.current = false;
    recoveryBoundary.current = {
      ...recoveryBoundary.current,
      pending: false,
      blocked: false,
    };
    setPendingAction(null);
    closeConfirmation();
    if (currentBlocker.current?.state === 'blocked')
      currentBlocker.current.reset();
  }, [closeConfirmation]);
  const currentBlockedAttempt = useCallback(
    () =>
      blocker.state === 'blocked' &&
      currentBlocker.current?.state === 'blocked' &&
      currentBlocker.current.location.key === blocker.location.key &&
      blockedAttempt !== null &&
      blockedNavigationEvidence.current === blockedAttempt &&
      blockedAttempt.generation === navigationGeneration.current,
    [blocker, blockedAttempt],
  );
  useEffect(() => {
    if (protectedDraft) return;
    if (blocker.state === 'blocked' && currentBlockedAttempt()) {
      pendingActionEvidence.current = null;
      setPendingAction(null);
      closeConfirmation();
      if (currentBlockedAttempt()) blocker.proceed();
      return;
    }
    if (
      pendingAction &&
      pendingActionEvidence.current === pendingAction &&
      pendingAction.generation === navigationGeneration.current
    ) {
      pendingActionEvidence.current = null;
      closeConfirmation();
      setPendingAction(null);
      if (pendingAction.generation === navigationGeneration.current)
        pendingAction.action();
    }
  }, [
    protectedDraft,
    blocker,
    pendingAction,
    closeConfirmation,
    currentBlockedAttempt,
  ]);
  const keepEditing = cancelPendingNavigation;
  const discardAndContinue = () => {
    if (saving) return;
    if (
      (blocker.state === 'blocked' && !currentBlockedAttempt()) ||
      (pendingAction &&
        (pendingActionEvidence.current !== pendingAction ||
          pendingAction.generation !== navigationGeneration.current))
    ) {
      cancelPendingNavigation();
      return;
    }
    pendingActionEvidence.current = null;
    closeConfirmation();
    if (blocker.state === 'blocked') {
      if (currentBlockedAttempt()) blocker.proceed();
    } else if (pendingAction) {
      // A confirmed local close may also update the URL; authorize that one navigation.
      allowNextNavigation.current = true;
      try {
        if (pendingAction.generation === navigationGeneration.current)
          pendingAction.action();
      } finally {
        queueMicrotask(() => {
          allowNextNavigation.current = false;
        });
      }
    }
    setPendingAction(null);
  };
  const requestConfirmation = (action: () => void) => {
    const pending = { generation: navigationGeneration.current, action };
    pendingActionEvidence.current = pending;
    recoveryBoundary.current = { ...recoveryBoundary.current, pending: true };
    setPendingAction(pending);
  };
  return (
    <DraftContext.Provider
      value={{
        register,
        cancelPendingNavigation,
        recordSetupRecoveryId: (kind, id) => {
          const boundary = recoveryBoundary.current;
          const params = new URLSearchParams(boundary.location.search);
          if (
            !isValidUuid(id) ||
            !['company', 'setup'].includes(kind) ||
            boundary.location.pathname !== '/delivery' ||
            params.get('view') !== 'onboarding' ||
            boundary.pending ||
            boundary.blocked
          )
            return false;
          const name =
            kind === 'company' ? 'setupCompanyRequest' : 'setupRequest';
          if (params.get(name) === id) return true;
          params.set(name, id);
          allowNextNavigation.current = true;
          try {
            void navigate(
              {
                pathname: boundary.location.pathname,
                search: `?${params}`,
                hash: boundary.location.hash,
              },
              { replace: true },
            );
            return true;
          } catch {
            return false;
          } finally {
            queueMicrotask(() => {
              allowNextNavigation.current = false;
            });
          }
        },
        requestAction: (action) => {
          if (protectedDraft) {
            requestConfirmation(action);
          } else action();
        },
        requestNavigation: (destination, action) => {
          const boundary = recoveryBoundary.current;
          if (!boundary.active || boundary.pending || boundary.blocked)
            return false;
          if (
            blocksDraftNavigation(
              boundary.drafts,
              boundary.location,
              destination,
            )
          ) {
            requestConfirmation(action);
            return false;
          }
          action();
          return true;
        },
      }}
    >
      {children}
      {(pendingAction || blocker.state === 'blocked') && (
        <StyledDialog
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          ref={(dialog) => {
            dialogRef.current = dialog;
            if (dialog && !dialog.open) {
              previousFocus.current =
                document.activeElement instanceof HTMLElement
                  ? document.activeElement
                  : null;
              dialog.showModal();
            }
          }}
          onCancel={(event) => {
            event.preventDefault();
            keepEditing();
          }}
        >
          <StyledDeliveryStack>
            <h2 id={titleId}>
              <Trans>Keep your changes?</Trans>
            </h2>
            <p id={descriptionId}>
              {saving ? (
                <Trans>
                  A save is in progress. Wait for the result before leaving.
                </Trans>
              ) : (
                <Trans>
                  You have unsaved changes. Keep editing or discard them to
                  continue.
                </Trans>
              )}
            </p>
            <StyledActions>
              <StyledDeliveryButton data-primary="true" onClick={keepEditing}>
                <Trans>Keep editing</Trans>
              </StyledDeliveryButton>
              <StyledDeliveryButton
                onClick={discardAndContinue}
                disabled={saving}
              >
                <Trans>Discard and continue</Trans>
              </StyledDeliveryButton>
            </StyledActions>
          </StyledDeliveryStack>
        </StyledDialog>
      )}
    </DraftContext.Provider>
  );
};

export const useDeliveryDraftGuard = () => useContext(DraftContext);

export const useDeliveryDraftStatus = ({
  dirty,
  saving,
  retainsNavigation,
}: DraftStatus) => {
  const id = useId();
  const { register } = useDeliveryDraftGuard();
  // Register before paint so an immediate next navigation sees the edited form.
  useLayoutEffect(() => {
    register(id, { dirty, saving, retainsNavigation });
  }, [id, register, dirty, saving, retainsNavigation]);
  useEffect(() => () => register(id, null), [id, register]);
};
