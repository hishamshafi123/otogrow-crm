import { useState } from 'react';
import { useOtogrowIdentity } from '@/otogrow-access/useOtogrowIdentity';
import { useOtogrowAccess } from '@/otogrow-access/useOtogrowAccess';

export const useCommitmentScope = () => {
  const { identity } = useOtogrowIdentity();
  const permission = useOtogrowAccess();
  const [scope, setScope] = useState({
    identity,
    verified: permission.scopeKey,
  });
  const verified = permission.scopeKey ?? scope.verified;
  if (scope.identity !== identity || scope.verified !== verified)
    setScope({ identity, verified });
  return `${identity}:${verified}`;
};
