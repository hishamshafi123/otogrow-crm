import { useIsLogged } from '@/auth/hooks/useIsLogged';
import { currentUserState } from '@/auth/states/currentUserState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

export const useOtogrowIdentity = () => {
  const isLogged = useIsLogged();
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);
  const currentUser = useAtomStateValue(currentUserState);
  return {
    identity:
      isLogged &&
      currentWorkspace?.id &&
      currentWorkspaceMember?.id &&
      currentUser?.id
        ? `${currentWorkspace.id}:${currentWorkspaceMember.id}:${currentUser.id}`
        : null,
    workspaceId: currentWorkspace?.id,
    memberId: currentWorkspaceMember?.id,
  };
};
