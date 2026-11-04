import { useLayoutEffect } from 'react';
import { type NetworkStatus } from '@apollo/client';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import { type CompetitorIdentity } from '@/delivery/competitors/competitor.types';
import { type useCompetitorAccess } from '@/delivery/competitors/useCompetitorAccess';

export const useCompetitorRead = <TData extends CompetitorIdentity>({
  value,
  access,
  scope,
  query,
  matches,
  onDenied,
}: {
  value: TData | null | undefined;
  access: ReturnType<typeof useCompetitorAccess>;
  scope: string;
  query: { loading: boolean; error?: unknown; networkStatus: NetworkStatus };
  matches?: (value: TData) => boolean;
  onDenied: () => void;
}) => {
  const denied = isOtogrowAccessDenied(query.error);
  useLayoutEffect(() => {
    if (denied) onDenied();
  }, [denied, onDenied]);
  return useAssistantRead({
    value,
    source: `${access.source}:${scope}`,
    enabled: access.permission.ready && !denied,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches: (candidate) =>
      access.matches(candidate) && (matches?.(candidate) ?? true),
  });
};
