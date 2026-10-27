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
import { useBlocker } from 'react-router-dom';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type DraftStatus = { dirty: boolean; saving: boolean };
type DraftGuard = {
  register: (id: string, status: DraftStatus | null) => void;
  requestAction: (action: () => void) => void;
};
const DraftContext = createContext<DraftGuard>({
  register: () => undefined,
  requestAction: (action) => action(),
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
  const [drafts, setDrafts] = useState<Record<string, DraftStatus>>({});
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
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
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !allowNextNavigation.current &&
      protectedDraft &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search),
  );
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
        previous[id]?.saving === status.saving
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
  useEffect(() => {
    if (protectedDraft) return;
    closeConfirmation();
    if (blocker.state === 'blocked') blocker.proceed();
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  }, [protectedDraft, blocker, pendingAction, closeConfirmation]);
  const keepEditing = () => {
    closeConfirmation();
    setPendingAction(null);
    if (blocker.state === 'blocked') blocker.reset();
  };
  const discardAndContinue = () => {
    if (saving) return;
    closeConfirmation();
    if (blocker.state === 'blocked') blocker.proceed();
    else if (pendingAction) {
      // A confirmed local close may also update the URL; authorize that one navigation.
      allowNextNavigation.current = true;
      pendingAction();
      queueMicrotask(() => {
        allowNextNavigation.current = false;
      });
    }
    setPendingAction(null);
  };
  return (
    <DraftContext.Provider
      value={{
        register,
        requestAction: (action) => {
          if (protectedDraft) setPendingAction(() => action);
          else action();
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

export const useDeliveryDraftStatus = ({ dirty, saving }: DraftStatus) => {
  const id = useId();
  const { register } = useDeliveryDraftGuard();
  // Register before paint so an immediate next navigation sees the edited form.
  useLayoutEffect(() => {
    register(id, { dirty, saving });
  }, [id, register, dirty, saving]);
  useEffect(() => () => register(id, null), [id, register]);
};
