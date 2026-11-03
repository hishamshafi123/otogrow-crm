import { useEffect, useLayoutEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';
import { Trans } from '@lingui/react/macro';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type PortalLeaveGuardProps = {
  dirty: boolean;
  busy: boolean;
  generation: number;
};
export const PortalLeaveGuard = ({
  dirty,
  busy,
  generation,
}: PortalLeaveGuardProps) => {
  // oxlint-disable-next-line twenty/no-state-useref -- A blocked route belongs to the authority generation that requested it, before any denial can dispose its draft.
  const blockedGeneration = useRef(generation);
  // oxlint-disable-next-line twenty/no-state-useref -- Native modal focus is a DOM concern, independent of render state.
  const dialog = useRef<HTMLDialogElement | null>(null);
  // oxlint-disable-next-line twenty/no-state-useref -- Restore the actual invoking element after closing the native dialog.
  const previousFocus = useRef<HTMLElement | null>(null);
  // oxlint-disable-next-line twenty/no-state-useref -- Keep is the safe initial keyboard action for this native confirmation.
  const keepButton = useRef<HTMLButtonElement | null>(null);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    const blocked =
      (dirty || busy) &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search ||
        currentLocation.hash !== nextLocation.hash);
    if (blocked) blockedGeneration.current = generation;
    return blocked;
  });
  useLayoutEffect(() => {
    if (blocker.state === 'blocked' && blockedGeneration.current !== generation)
      blocker.reset();
  }, [blocker, generation]);
  const open =
    blocker.state === 'blocked' && blockedGeneration.current === generation;
  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, busy]);
  useEffect(() => {
    if (open) {
      previousFocus.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      dialog.current?.showModal();
      keepButton.current?.focus();
    } else {
      dialog.current?.close();
      previousFocus.current?.focus();
    }
  }, [open]);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="portal-leave-title"
      onCancel={(event) => {
        event.preventDefault();
        if (blocker.state === 'blocked') blocker.reset();
      }}
    >
      <StyledDeliveryStack>
        <h2 id="portal-leave-title">
          <Trans>Leave this client workspace?</Trans>
        </h2>
        <p>
          <Trans>
            Your unsaved notes and any pending response check are kept only on
            this page. An unconfirmed response may already be saved.
          </Trans>
        </p>
        {busy && (
          <p role="status">
            <Trans>Wait for the current request before leaving.</Trans>
          </p>
        )}
        <StyledDeliveryRow>
          <StyledDeliveryButton
            ref={keepButton}
            onClick={() => {
              if (blocker.state === 'blocked') blocker.reset();
            }}
          >
            <Trans>Keep editing</Trans>
          </StyledDeliveryButton>
          <StyledDeliveryButton
            disabled={busy}
            onClick={() => {
              if (
                blocker.state === 'blocked' &&
                blockedGeneration.current === generation
              )
                blocker.proceed();
            }}
          >
            <Trans>Leave and discard local notes</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryRow>
      </StyledDeliveryStack>
    </dialog>
  );
};
