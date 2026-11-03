import { useApolloClient, useQuery } from '@apollo/client/react';
import { fastDeepEqual } from 'twenty-shared/utils';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { useFinanceExportRequestGuard } from '@/delivery/finance/export/useFinanceExportRequestGuard';
import { type useAdvertisingContext } from '@/delivery/advertising/workbench/useAdvertisingContext';
import { type AdvertisingSourceSelection } from '@/delivery/advertising/workbench/useAdvertisingSource';
import { isAdvertisingSourceUnavailable } from '@/delivery/advertising/workbench/isAdvertisingSourceUnavailable';
import {
  GET_ADVERTISING_DRAFT_RUN,
  GET_ADVERTISING_DRAFT_RUN_STATE,
} from '@/delivery/advertising/drafts/delivery-advertising-drafts.graphql';
import { type AdvertisingDraftDetail } from '@/delivery/advertising/drafts/advertising-draft-types';
import {
  type DeliveryAdvertisingDraftRunQuery,
  type DeliveryAdvertisingDraftRunStateQuery,
} from '~/generated-metadata/graphql';

export const useAdvertisingDraftRun = ({
  state,
  selection,
  runId,
  scope,
  enabled,
  onAuthorityLost,
}: {
  state: ReturnType<typeof useAdvertisingContext>;
  selection: AdvertisingSourceSelection;
  runId: string;
  scope: string;
  enabled: boolean;
  onAuthorityLost: () => void;
}) => {
  const client = useApolloClient();
  const source = `${state.source}:${selection.kind}:${selection.id}:${runId}`;
  const query = useQuery<DeliveryAdvertisingDraftRunStateQuery>(
    GET_ADVERTISING_DRAFT_RUN_STATE,
    {
      variables: { input: { id: runId }, identity: `${source}:${scope}` },
      fetchPolicy: 'no-cache',
      notifyOnNetworkStatusChange: true,
      pollInterval: 5000,
      skip: !enabled,
    },
  );
  const matches = (
    value: Pick<
      DeliveryAdvertisingDraftRunStateQuery['deliveryAdvertisingDraftRunState'],
      'workspaceId' | 'memberId' | 'userWorkspaceId' | 'actor'
    > & {
      run: Pick<
        DeliveryAdvertisingDraftRunStateQuery['deliveryAdvertisingDraftRunState']['run'],
        'id' | 'sourceKind' | 'sourceId'
      >;
    },
  ) =>
    state.permission.matches(value) &&
    fastDeepEqual(value.actor, state.data?.actor) &&
    value.run.id === runId &&
    value.run.sourceKind === selection.kind &&
    value.run.sourceId === selection.id;
  const reading = useAssistantRead({
    value: query.data?.deliveryAdvertisingDraftRunState,
    source: `${source}:${scope}`,
    enabled,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches,
  });
  const terminal =
    reading.data !== null &&
    ['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(reading.data.run.status);
  const detailQuery = useQuery<DeliveryAdvertisingDraftRunQuery>(
    GET_ADVERTISING_DRAFT_RUN,
    {
      variables: { input: { id: runId }, identity: source },
      fetchPolicy: 'no-cache',
      notifyOnNetworkStatusChange: true,
      skip: !enabled || !terminal,
    },
  );
  const matchesDetail = (value: AdvertisingDraftDetail) =>
    matches(value) &&
    value.run.context.source.kind === selection.kind &&
    value.run.context.source.id === selection.id;
  const detail = useAssistantRead({
    value: detailQuery.data?.deliveryAdvertisingDraftRun,
    source,
    enabled: enabled && terminal,
    loading: detailQuery.loading,
    error: detailQuery.error,
    networkStatus: detailQuery.networkStatus,
    matches: matchesDetail,
  });
  const startRequest = useFinanceExportRequestGuard(
    `${source}:${scope}`,
    enabled,
  );
  const verify = async () => {
    if (!enabled) return null;
    const current = startRequest();
    try {
      const value = (
        await client.query<DeliveryAdvertisingDraftRunQuery>({
          query: GET_ADVERTISING_DRAFT_RUN,
          variables: { input: { id: runId } },
          fetchPolicy: 'no-cache',
        })
      ).data?.deliveryAdvertisingDraftRun;
      if (!current() || !value || !matchesDetail(value)) return null;
      return value;
    } catch (error) {
      if (current() && isAdvertisingSourceUnavailable(error)) onAuthorityLost();
      return null;
    }
  };
  return {
    ...reading,
    query,
    detail: detail.data,
    detailQuery,
    verify,
    denied:
      isAdvertisingSourceUnavailable(query.error) ||
      isAdvertisingSourceUnavailable(detailQuery.error),
  };
};
