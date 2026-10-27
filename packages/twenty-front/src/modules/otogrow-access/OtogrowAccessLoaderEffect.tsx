import { useEffect } from 'react';
import { useQuery } from '@apollo/client/react';
import { GET_OTOGROW_ACCESS } from '@/otogrow-access/otogrow-access.graphql';
import {
  EMPTY_OTOGROW_ACCESS,
  otogrowAccessState,
} from '@/otogrow-access/otogrowAccessState';
import { useOtogrowIdentity } from '@/otogrow-access/useOtogrowIdentity';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { type OtogrowAccessQuery } from '~/generated-metadata/graphql';

export const OtogrowAccessLoaderEffect = () => {
  const { identity } = useOtogrowIdentity();
  const setOtogrowAccess = useSetAtomState(otogrowAccessState);
  const { data, loading, error, refetch } = useQuery<OtogrowAccessQuery>(
    GET_OTOGROW_ACCESS,
    {
      skip: identity === null,
      fetchPolicy: 'no-cache',
      pollInterval: 15000,
      notifyOnNetworkStatusChange: false,
      // A changed login must start a fresh request even when the operation is unchanged.
      variables: { identity },
    },
  );

  useEffect(() => {
    setOtogrowAccess({
      identity,
      access: data?.otogrowAccess,
      loading,
      error,
      refetch,
    });
  }, [identity, data, loading, error, refetch, setOtogrowAccess]);

  useEffect(
    () => () => setOtogrowAccess(EMPTY_OTOGROW_ACCESS),
    [setOtogrowAccess],
  );

  return null;
};
