import { useCallback, useLayoutEffect, useRef } from 'react';

export const useAssistantPanelFocus = (restoreLogicalFocus?: () => boolean) => {
  // oxlint-disable-next-line twenty/no-state-useref -- These are native focus targets, not render state.
  const panel = useRef<HTMLElement | null>(null);
  // oxlint-disable-next-line twenty/no-state-useref -- Capture the opener before opening the panel disables its button during the DOM commit.
  const opener = useRef(document.activeElement);
  // oxlint-disable-next-line twenty/no-state-useref -- Replayed layout effects must invalidate their earlier queued focus cleanup.
  const focusGeneration = useRef(0);
  useLayoutEffect(() => {
    const generation = ++focusGeneration.current;
    const ownedPanel = panel.current;
    const target = opener.current;
    ownedPanel?.focus();
    ownedPanel?.scrollIntoView?.({ block: 'nearest' });
    return () => {
      queueMicrotask(() => {
        // oxlint-disable-next-line react-hooks/exhaustive-deps -- This live generation must invalidate cleanup from a replayed effect.
        if (generation !== focusGeneration.current || ownedPanel?.isConnected)
          return;
        const active = document.activeElement;
        if (
          active instanceof HTMLElement &&
          active !== document.body &&
          active !== document.documentElement &&
          active.isConnected &&
          !ownedPanel?.contains(active)
        )
          return;
        if (
          target instanceof HTMLElement &&
          target !== document.body &&
          target !== document.documentElement &&
          target.isConnected &&
          !target.closest('[hidden], [inert]') &&
          (!(target instanceof HTMLButtonElement) || !target.disabled)
        )
          target.focus();
        else restoreLogicalFocus?.();
      });
    };
  }, [restoreLogicalFocus]);
  return useCallback((element: HTMLElement | null) => {
    panel.current = element;
  }, []);
};
