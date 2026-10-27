import { useId, useLayoutEffect, useRef } from 'react';
import { styled } from '@linaria/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { IconRefresh } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/input';
import {
  AnimatedPlaceholder,
  AnimatedPlaceholderEmptyContainer,
  AnimatedPlaceholderEmptySubTitle,
  AnimatedPlaceholderEmptyTextContainer,
  AnimatedPlaceholderEmptyTitle,
} from 'twenty-ui/feedback';
import { themeCssVariables } from 'twenty-ui/theme-constants';

type ClientConfigConnectionErrorProps = {
  hasLoaded: boolean;
  loading: boolean;
  onRetry: () => void;
  returnFocusTo: HTMLElement | null;
};

const StyledConnectionDialog = styled.dialog`
  background: ${themeCssVariables.background.primary};
  border: 0;
  box-sizing: border-box;
  color: ${themeCssVariables.font.color.primary};
  height: calc(100dvh / var(--t-zoom, 1));
  margin: 0;
  max-height: none;
  max-width: none;
  padding: 0;
  width: calc(100vw / var(--t-zoom, 1));
  &::backdrop {
    background: ${themeCssVariables.background.primary};
  }
`;

export const ClientConfigConnectionError = ({
  hasLoaded,
  loading,
  onRetry,
  returnFocusTo,
}: ClientConfigConnectionErrorProps) => {
  const { t } = useLingui();
  const titleId = useId();
  const descriptionId = useId();
  // oxlint-disable-next-line twenty/no-state-useref -- Native modal lifecycle and focus require DOM references.
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  // oxlint-disable-next-line twenty/no-state-useref -- An identity change can invalidate focus while the dialog remains open.
  const returnFocusRef = useRef(returnFocusTo);
  returnFocusRef.current = returnFocusTo;
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const preventCancel = (event: Event) => event.preventDefault();
    const preventEscape = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.key === 'Escape') event.preventDefault();
    };
    const keepOpen = () => {
      if (dialog.isConnected && !dialog.open) dialog.showModal();
    };
    dialog.addEventListener('cancel', preventCancel);
    dialog.addEventListener('keydown', preventEscape, true);
    // Embedded browsers may close native dialogs without a cancelable React event.
    dialog.addEventListener('close', keepOpen);
    // Body portals need the native modal boundary as well as the hidden app tree.
    if (!dialog.open) dialog.showModal();
    return () => {
      dialog.removeEventListener('cancel', preventCancel);
      dialog.removeEventListener('keydown', preventEscape, true);
      dialog.removeEventListener('close', keepOpen);
      if (dialog.open) dialog.close();
      queueMicrotask(() => {
        const target = returnFocusRef.current;
        if (
          target?.isConnected &&
          !target.closest('[hidden], [inert]') &&
          target.getClientRects().length > 0
        )
          target.focus();
      });
    };
  }, []);
  return (
    <StyledConnectionDialog
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-modal="true"
      aria-busy={loading}
      ref={dialogRef}
      onKeyUp={(event) => event.stopPropagation()}
    >
      <AnimatedPlaceholderEmptyContainer>
        <AnimatedPlaceholder type="errorIndex" />
        <AnimatedPlaceholderEmptyTextContainer>
          <AnimatedPlaceholderEmptyTitle id={titleId}>
            <Trans>Connection unavailable</Trans>
          </AnimatedPlaceholderEmptyTitle>
          <AnimatedPlaceholderEmptySubTitle id={descriptionId}>
            {hasLoaded ? (
              <Trans>
                Your page is hidden while the connection is unavailable. Unsaved
                work stays in this tab for your current account while you retry.
              </Trans>
            ) : (
              <Trans>
                Your workspace could not load. Retry the connection to continue.
              </Trans>
            )}
          </AnimatedPlaceholderEmptySubTitle>
        </AnimatedPlaceholderEmptyTextContainer>
        <Button
          Icon={IconRefresh}
          title={loading ? t`Retrying…` : t`Retry connection`}
          disabled={loading}
          variant="secondary"
          onClick={onRetry}
        />
      </AnimatedPlaceholderEmptyContainer>
    </StyledConnectionDialog>
  );
};
