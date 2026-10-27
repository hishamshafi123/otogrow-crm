import { useClientConfig } from '@/client-config/hooks/useClientConfig';
import { clientConfigApiStatusState } from '@/client-config/states/clientConfigApiStatusState';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useEffect } from 'react';

export const ClientConfigProviderEffect = () => {
  const clientConfigApiStatus = useAtomStateValue(clientConfigApiStatusState);
  const { fetchClientConfig } = useClientConfig();

  useEffect(() => {
    if (
      !clientConfigApiStatus.isLoadedOnce &&
      !clientConfigApiStatus.isLoading
    ) {
      void fetchClientConfig();
    }
  }, [
    clientConfigApiStatus.isLoadedOnce,
    clientConfigApiStatus.isLoading,
    fetchClientConfig,
  ]);

  return null;
};
