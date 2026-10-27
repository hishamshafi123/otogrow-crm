import { hasOtogrowCapability } from '@/otogrow-access/otogrow-access.types';
import {
  EMPTY_OTOGROW_ACCESS,
  otogrowAccessState,
} from '@/otogrow-access/otogrowAccessState';
import { useOtogrowIdentity } from '@/otogrow-access/useOtogrowIdentity';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

export const useOtogrowAccess = () => {
  const { identity, workspaceId, memberId } = useOtogrowIdentity();
  const otogrowAccess = useAtomStateValue(otogrowAccessState);
  const isCurrentIdentity =
    identity !== null && otogrowAccess.identity === identity;
  const candidate = otogrowAccess.access;
  const access =
    isCurrentIdentity &&
    !otogrowAccess.loading &&
    !otogrowAccess.error &&
    candidate?.workspaceId === workspaceId &&
    candidate?.memberId === memberId
      ? candidate
      : undefined;
  return {
    access,
    scopeKey: access ? `${identity}:${access.userWorkspaceId}` : null,
    canUsePhone: access?.capabilities.includes('phone.use') === true,
    canReadFinance: hasOtogrowCapability(
      access?.capabilities ?? [],
      'finance.read',
    ),
    canManageFinance: hasOtogrowCapability(
      access?.capabilities ?? [],
      'finance.manage',
    ),
    canManageRoles: access?.capabilities.includes('workspace.admin') === true,
    loading: identity !== null && (!isCurrentIdentity || otogrowAccess.loading),
    error: isCurrentIdentity ? otogrowAccess.error : undefined,
    refetch: isCurrentIdentity
      ? otogrowAccess.refetch
      : EMPTY_OTOGROW_ACCESS.refetch,
  };
};
