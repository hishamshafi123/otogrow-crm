import { useState } from 'react';
import { NetworkStatus } from '@apollo/client';
import { fastDeepEqual } from 'twenty-shared/utils';

export const useAssistantRead = <TData>({
  value,
  source,
  enabled,
  loading,
  error,
  networkStatus,
  matches,
}: {
  value: TData | null | undefined;
  source: string;
  enabled: boolean;
  loading: boolean;
  error: unknown;
  networkStatus: NetworkStatus;
  matches: (value: TData) => boolean;
}) => {
  const trusted = value != null && matches(value);
  const fresh = enabled && !error && !loading && trusted ? value : null;
  const [evidence, setEvidence] = useState<{
    source: string;
    data: TData;
  } | null>(null);
  if (
    fresh != null &&
    (evidence?.source !== source || !fastDeepEqual(evidence.data, fresh))
  )
    setEvidence({ source, data: fresh });
  const refreshing =
    loading &&
    [NetworkStatus.poll, NetworkStatus.refetch].includes(networkStatus);
  const canRetain =
    enabled &&
    !error &&
    evidence?.source === source &&
    matches(evidence.data) &&
    (value == null || trusted);
  const [validSource, setValidSource] = useState<string | null>(null);
  if (fresh != null && validSource !== source) setValidSource(source);
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
