import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { fastDeepEqual } from 'twenty-shared/utils';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { type useAdvertisingContext } from '@/delivery/advertising/workbench/useAdvertisingContext';
import { type AdvertisingSourceSelection } from '@/delivery/advertising/workbench/useAdvertisingSource';
import { GET_ADVERTISING_DRAFT_RUNS } from '@/delivery/advertising/drafts/delivery-advertising-drafts.graphql';
import { useAdvertisingDraftLabels } from '@/delivery/advertising/drafts/useAdvertisingDraftLabels';
import { StyledAdvertisingItem } from '@/delivery/advertising/workbench/advertisingWorkbenchStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { DateTimeDisplay } from '@/ui/field/display/components/DateTimeDisplay';
import { type DeliveryAdvertisingDraftRunsQuery } from '~/generated-metadata/graphql';

export const AdvertisingDraftHistory = ({
  state,
  selection,
  scope,
  after,
  enabled,
  onOpen,
  onPage,
}: {
  state: ReturnType<typeof useAdvertisingContext>;
  selection: AdvertisingSourceSelection;
  scope: string;
  after: string | null;
  enabled: boolean;
  onOpen: (runId: string) => void;
  onPage: (after: string | null) => void;
}) => {
  const { t } = useLingui();
  const labels = useAdvertisingDraftLabels();
  const input = {
    sourceKind: selection.kind,
    sourceId: selection.id,
    after,
    limit: 25,
  };
  const source = `${state.source}:${scope}:${JSON.stringify(input)}`;
  const query = useQuery<DeliveryAdvertisingDraftRunsQuery>(
    GET_ADVERTISING_DRAFT_RUNS,
    {
      variables: { input, identity: source },
      fetchPolicy: 'no-cache',
      notifyOnNetworkStatusChange: true,
      pollInterval: 30000,
      skip: !enabled,
    },
  );
  const reading = useAssistantRead({
    value: query.data?.deliveryAdvertisingDraftRuns,
    source,
    enabled,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches: (value) =>
      state.permission.matches(value) &&
      fastDeepEqual(value.actor, state.data?.actor),
  });
  return (
    <section aria-label={t`Previous AI suggestion runs`}>
      <StyledDeliveryStack>
        <h4>
          <Trans>Previous AI suggestion runs</Trans>
        </h4>
        {reading.data ? (
          <>
            <p>{t`Showing ${reading.data.items.length} of ${reading.data.totalCount} saved runs.`}</p>
            {reading.data.items.map((run) => (
              <StyledAdvertisingItem key={run.id}>
                <strong>
                  {run.agent.name} · {labels.status(run.status)}
                </strong>
                <StyledDeliveryRow>
                  <span>{run.initiatorName} ·</span>
                  <DateTimeDisplay value={run.createdAt} />
                </StyledDeliveryRow>
                <StyledDeliveryButton
                  type="button"
                  disabled={!enabled}
                  onClick={() => onOpen(run.id)}
                >
                  <Trans>Open saved suggestions</Trans>
                </StyledDeliveryButton>
              </StyledAdvertisingItem>
            ))}
            {reading.data.totalCount === 0 && (
              <p>
                <Trans>
                  No suggestion runs have been recorded for this report. You can
                  keep preparing recommendations manually.
                </Trans>
              </p>
            )}
            {reading.data.nextCursor && (
              <StyledDeliveryButton
                type="button"
                disabled={!enabled}
                onClick={() => onPage(reading.data?.nextCursor ?? null)}
              >
                <Trans>More AI runs</Trans>
              </StyledDeliveryButton>
            )}
          </>
        ) : (
          <p role={query.error ? 'alert' : 'status'}>
            {query.error
              ? t`Saved AI runs could not be verified. Retry or return to the first page.`
              : t`Loading saved suggestion runs…`}
          </p>
        )}
        <StyledDeliveryRow>
          {(after || query.error) && (
            <StyledDeliveryButton type="button" onClick={() => onPage(null)}>
              <Trans>First AI run page</Trans>
            </StyledDeliveryButton>
          )}
          <StyledDeliveryButton
            type="button"
            disabled={!enabled}
            onClick={() => void query.refetch().catch(() => undefined)}
          >
            <Trans>Refresh AI history</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryRow>
      </StyledDeliveryStack>
    </section>
  );
};
