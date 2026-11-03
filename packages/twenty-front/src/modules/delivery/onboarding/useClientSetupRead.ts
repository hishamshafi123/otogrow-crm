import { useState } from 'react';
import { NetworkStatus } from '@apollo/client';
import { fastDeepEqual } from 'twenty-shared/utils';
import { type ClientSetupContext } from '@/delivery/onboarding/client-setup.types';

export const useClientSetupRead = ({
  value,
  source,
  available,
  loading,
  error,
  networkStatus,
  matches,
}: {
  value: ClientSetupContext | null | undefined;
  source: string;
  available: boolean;
  loading: boolean;
  error: unknown;
  networkStatus: NetworkStatus;
  matches: (data: ClientSetupContext) => boolean;
}) => {
  const trusted = value != null && matches(value);
  const fresh = available && !error && !loading && trusted ? value : null;
  const [evidence, setEvidence] = useState<{
    source: string;
    data: ClientSetupContext;
  } | null>(null);
  if (
    fresh &&
    (evidence?.source !== source || !fastDeepEqual(fresh, evidence.data))
  )
    setEvidence({ source, data: fresh });
  const refreshing =
    loading &&
    [NetworkStatus.poll, NetworkStatus.refetch].includes(networkStatus);
  const canRetain =
    available &&
    !error &&
    evidence?.source === source &&
    matches(evidence.data) &&
    (value == null || trusted);
  const [validSource, setValidSource] = useState<string | null>(null);
  if (fresh && validSource !== source) setValidSource(source);
  else if (validSource !== null && (!canRetain || (loading && !refreshing)))
    setValidSource(null);
  return {
    data:
      fresh ??
      (refreshing && validSource === source && canRetain
        ? (evidence?.data ?? null)
        : null),
    refreshing,
  };
};
