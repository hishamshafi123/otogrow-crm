import { useRef, type PropsWithChildren } from 'react';
import { styled } from '@linaria/react';
import { Trans } from '@lingui/react/macro';
import { isDefined } from 'twenty-shared/utils';
import { useIsLogged } from '@/auth/hooks/useIsLogged';
import { currentUserState } from '@/auth/states/currentUserState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { ClientConfigConnectionError } from '@/client-config/components/ClientConfigConnectionError';
import { useClientConfig } from '@/client-config/hooks/useClientConfig';
import { clientConfigApiStatusState } from '@/client-config/states/clientConfigApiStatusState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

const StyledConfigBoundary = styled.div`
  display: contents;
  &[hidden] {
    display: none;
  }
`;

type ClientConfigProviderProps = PropsWithChildren;

export const ClientConfigProvider = ({
  children,
}: ClientConfigProviderProps) => {
  const clientConfigApiStatus = useAtomStateValue(clientConfigApiStatusState);
  const { refetch } = useClientConfig();
  const currentUser = useAtomStateValue(currentUserState);
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);
  const isLogged = useIsLogged();
  const identity = `${isLogged}:${currentUser?.id ?? ''}:${currentWorkspace?.id ?? ''}:${currentWorkspaceMember?.id ?? ''}`;
  const configured =
    clientConfigApiStatus.isSaved &&
    isDefined(clientConfigApiStatus.data?.clientConfig);
  // Hidden content loses browser focus before the recovery dialog opens.
  // oxlint-disable-next-line twenty/no-state-useref
  const recoveryFocus = useRef<{
    identity: string;
    element: HTMLElement;
  } | null>(null);

  return (
    <>
      {clientConfigApiStatus.isErrored && (
        <ClientConfigConnectionError
          hasLoaded={configured}
          loading={clientConfigApiStatus.isLoading}
          onRetry={() => void refetch()}
          returnFocusTo={
            recoveryFocus.current?.identity === identity
              ? recoveryFocus.current.element
              : null
          }
        />
      )}
      {!configured && !clientConfigApiStatus.isErrored && (
        <p role="status">
          <Trans>Loading workspace configuration…</Trans>
        </p>
      )}
      {configured && (
        <StyledConfigBoundary
          key={identity}
          hidden={clientConfigApiStatus.isErrored}
          inert={clientConfigApiStatus.isErrored || undefined}
          aria-hidden={clientConfigApiStatus.isErrored || undefined}
          onFocusCapture={(event) => {
            if (event.target instanceof HTMLElement)
              recoveryFocus.current = { identity, element: event.target };
          }}
        >
          {children}
        </StyledConfigBoundary>
      )}
    </>
  );
};
