import { useQuery } from '@apollo/client/react';
import { fastDeepEqual } from 'twenty-shared/utils';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { isAdvertisingSourceUnavailable } from '@/delivery/advertising/workbench/isAdvertisingSourceUnavailable';
import { type useAdvertisingContext } from '@/delivery/advertising/workbench/useAdvertisingContext';
import {
  GET_ADVERTISING_SOURCE,
  GET_ADVERTISING_SOURCE_STATE,
} from '@/delivery/advertising/workbench/advertising-sources.graphql';
import {
  type DeliveryAdvertisingSourceQuery,
  type DeliveryAdvertisingSourceStateQuery,
} from '~/generated-metadata/graphql';

export type AdvertisingSourceSelection = {
  kind: 'META' | 'MANUAL';
  id: string;
};
export const useAdvertisingSource = ({
  state,
  selection,
  adOffset = 0,
  metricAdId = null,
}: {
  state: ReturnType<typeof useAdvertisingContext>;
  selection: AdvertisingSourceSelection;
  adOffset?: number;
  metricAdId?: string | null;
}) => {
  const source = `${state.source}:${selection.kind}:${selection.id}`;
  const query = useQuery<DeliveryAdvertisingSourceStateQuery>(
    GET_ADVERTISING_SOURCE_STATE,
    {
      variables: {
        input: { ...selection, metadataOnly: true },
        identity: source,
      },
      fetchPolicy: 'no-cache',
      notifyOnNetworkStatusChange: true,
      pollInterval: 30000,
      skip: state.data === null,
    },
  );
  const matches = (
    value: Pick<
      DeliveryAdvertisingSourceStateQuery['deliveryAdvertisingSource'],
      | 'workspaceId'
      | 'memberId'
      | 'userWorkspaceId'
      | 'actor'
      | 'source'
      | 'fingerprint'
      | 'evidenceFingerprint'
    >,
  ) =>
    state.permission.matches(value) &&
    fastDeepEqual(value.actor, state.data?.actor) &&
    value.source.kind === selection.kind &&
    value.source.id === selection.id &&
    value.source.fingerprint === value.fingerprint &&
    value.source.evidenceFingerprint === value.evidenceFingerprint;
  const reading = useAssistantRead({
    value: query.data?.deliveryAdvertisingSource,
    source,
    enabled: state.data !== null,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches: (value) => matches(value) && value.evidenceLoaded === false,
  });
  const scope = `${source}:${reading.data?.fingerprint ?? 'unverified'}`;
  const evidenceSource = `${scope}:${adOffset}:${metricAdId ?? 'account'}`;
  const evidenceQuery = useQuery<DeliveryAdvertisingSourceQuery>(
    GET_ADVERTISING_SOURCE,
    {
      variables: {
        input: { ...selection, adOffset, metricAdId, metadataOnly: false },
        identity: evidenceSource,
      },
      fetchPolicy: 'no-cache',
      notifyOnNetworkStatusChange: true,
      skip: reading.data === null,
    },
  );
  const evidence = useAssistantRead({
    value: evidenceQuery.data?.deliveryAdvertisingSource,
    source: evidenceSource,
    enabled: reading.data !== null,
    loading: evidenceQuery.loading,
    error: evidenceQuery.error,
    networkStatus: evidenceQuery.networkStatus,
    matches: (value) =>
      matches(value) &&
      value.evidenceLoaded === true &&
      value.fingerprint === reading.data?.fingerprint &&
      value.adOffset === adOffset &&
      (value.metricAdId ?? null) === metricAdId,
  });
  return {
    ...reading,
    query,
    evidence: evidence.data,
    evidenceQuery,
    scope,
    denied:
      isAdvertisingSourceUnavailable(query.error) ||
      isAdvertisingSourceUnavailable(evidenceQuery.error),
  };
};
