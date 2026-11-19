import { useState } from 'react';
import { useOtogrowIdentity } from '@/otogrow-access/useOtogrowIdentity';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import { useOtogrowAccess } from '@/otogrow-access/useOtogrowAccess';

export const useCommitmentScope = () => {
  const { identity } = useOtogrowIdentity();
  const permission = useOtogrowAccess();
  const [scope, setScope] = useState({
    identity,
    verified: permission.scopeKey,
  });
  const verified = isOtogrowAccessDenied(permission.error)
    ? null
    : (permission.scopeKey ??
      (scope.identity === identity ? scope.verified : null));
  if (scope.identity !== identity || scope.verified !== verified)
    setScope({ identity, verified });
  return `${identity}:${verified}`;
};
