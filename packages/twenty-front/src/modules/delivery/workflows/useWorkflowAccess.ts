import { useState } from 'react';
import { useOtogrowAccess } from '@/otogrow-access/useOtogrowAccess';
import { useOtogrowIdentity } from '@/otogrow-access/useOtogrowIdentity';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';

type WorkflowIdentity = {
  workspaceId: string;
  memberId: string;
  userWorkspaceId: string;
};
export const useWorkflowAccess = () => {
  const permission = useOtogrowAccess();
  const { identity } = useOtogrowIdentity();
  const denied = isOtogrowAccessDenied(permission.error);
  const ready =
    !permission.loading && !permission.error && Boolean(permission.access);
  const [scope, setScope] = useState({
    identity,
    verified: permission.scopeKey,
    lastVerifiedCanReadFinance: ready && permission.canReadFinance,
  });
  const sameIdentity = scope.identity === identity;
  const verified = denied
    ? null
    : (permission.scopeKey ?? (sameIdentity ? scope.verified : null));
  const lastVerifiedCanReadFinance = denied
    ? false
    : ready
      ? permission.canReadFinance
      : sameIdentity && scope.lastVerifiedCanReadFinance;
  if (
    !sameIdentity ||
    scope.verified !== verified ||
    scope.lastVerifiedCanReadFinance !== lastVerifiedCanReadFinance
  )
    setScope({ identity, verified, lastVerifiedCanReadFinance });
  return {
    ...permission,
    ready,
    denied,
    lastVerifiedCanReadFinance,
    scope: `${identity}:${verified}`,
    manager:
      ready &&
      (permission.access?.capabilities.includes('workspace.admin') === true ||
        permission.access?.capabilities.includes('delivery.manage') === true),
    matches: (data: WorkflowIdentity | null | undefined) =>
      ready &&
      Boolean(data) &&
      data?.workspaceId === permission.access?.workspaceId &&
      data?.memberId === permission.access?.memberId &&
      data?.userWorkspaceId === permission.access?.userWorkspaceId,
  };
};
