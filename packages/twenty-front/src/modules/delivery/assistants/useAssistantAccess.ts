import { useState } from 'react';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';

export const useAssistantAccess = () => {
  const permission = useWorkflowAccess();
  const signature = permission.ready
    ? JSON.stringify({
        capabilities: [...(permission.access?.capabilities ?? [])].sort(),
        roles: [...(permission.access?.roleIds ?? [])].sort(),
        grants: permission.access?.grants ?? [],
      })
    : null;
  const [last, setLast] = useState({
    scope: permission.scope,
    signature: signature ?? '',
  });
  if (
    signature !== null &&
    (last.scope !== permission.scope || last.signature !== signature)
  )
    setLast({ scope: permission.scope, signature });
  const source = `${permission.scope}:${signature ?? (last.scope === permission.scope ? last.signature : '')}`;
  return {
    permission,
    source,
    administrator: permission.ready && permission.canManageRoles,
  };
};
