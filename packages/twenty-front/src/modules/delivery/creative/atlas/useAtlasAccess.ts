import { useState } from 'react';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
export const useAtlasAccess = () => {
  const permission = useWorkflowAccess();
  const current = permission.ready
    ? JSON.stringify({
        capabilities: [...(permission.access?.capabilities ?? [])].sort(),
        roles: [...(permission.access?.roleIds ?? [])].sort(),
        grants: permission.access?.grants ?? [],
      })
    : null;
  const [last, setLast] = useState({
    scope: permission.scope,
    signature: current ?? '',
  });
  if (
    current !== null &&
    (last.scope !== permission.scope || last.signature !== current)
  )
    setLast({ scope: permission.scope, signature: current });
  const signature =
    current ?? (last.scope === permission.scope ? last.signature : '');
  return {
    permission,
    source: `${permission.scope}:${signature}`,
    administrator:
      permission.ready &&
      permission.access?.capabilities.includes('workspace.admin') === true,
  };
};
