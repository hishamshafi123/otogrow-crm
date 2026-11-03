import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link } from 'react-router-dom';
import { GET_ASSISTANT_CATALOG } from '@/delivery/assistants/delivery-assistants.graphql';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { type useAdvertisingContext } from '@/delivery/advertising/workbench/useAdvertisingContext';
import { StyledAdvertisingItem } from '@/delivery/advertising/workbench/advertisingWorkbenchStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { type DeliveryAssistantCatalogQuery } from '~/generated-metadata/graphql';

export const AdvertisingDraftAssistantPicker = ({
  state,
  projectId,
  enabled,
  onChoose,
}: {
  state: ReturnType<typeof useAdvertisingContext>;
  projectId: string;
  enabled: boolean;
  onChoose: (
    assistant: DeliveryAssistantCatalogQuery['deliveryAssistantCatalog']['items'][number],
  ) => void;
}) => {
  const { t } = useLingui();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [after, setAfter] = useState<string | null>(null);
  const input = {
    taskId: null,
    projectId,
    kind: 'ADVERTISING',
    enabled: true,
    search,
    after,
    limit: 25,
  };
  const source = `${state.source}:${JSON.stringify(input)}`;
  const query = useQuery<DeliveryAssistantCatalogQuery>(GET_ASSISTANT_CATALOG, {
    variables: { input, identity: source },
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    pollInterval: 30000,
    skip: !enabled,
  });
  const reading = useAssistantRead({
    value: query.data?.deliveryAssistantCatalog,
    source,
    enabled,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches: state.permission.matches,
  });
  const searchNow = () => {
    setSearch(searchInput.trim());
    setAfter(null);
  };
  return (
    <section aria-label={t`Choose an advertising assistant`}>
      <StyledDeliveryStack>
        <h4>
          <Trans>Choose an advertising assistant</Trans>
        </h4>
        <StyledDeliveryRow>
          <label>
            <Trans>Find an advertising assistant</Trans>
            <input
              value={searchInput}
              maxLength={160}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  searchNow();
                }
              }}
            />
          </label>
          <StyledDeliveryButton
            type="button"
            disabled={!enabled}
            onClick={searchNow}
          >
            <Trans>Find assistants</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryRow>
        {reading.data ? (
          <>
            <p>{t`Showing ${reading.data.items.length} of ${reading.data.totalCount} matching assistants.`}</p>
            {reading.data.items.map((assistant) => (
              <StyledAdvertisingItem key={assistant.id}>
                <h5>{assistant.name}</h5>
                <p>{assistant.purpose}</p>
                <StyledDeliveryButton
                  type="button"
                  disabled={
                    !enabled ||
                    !assistant.enabled ||
                    !assistant.canRun ||
                    assistant.kind !== 'ADVERTISING'
                  }
                  onClick={() => onChoose(assistant)}
                >
                  <Trans>Prepare with this assistant</Trans>
                </StyledDeliveryButton>
                {!assistant.canRun && (
                  <p>
                    <Trans>
                      This assistant is not available for your current role and
                      project.
                    </Trans>
                  </p>
                )}
              </StyledAdvertisingItem>
            ))}
            {reading.data.totalCount === 0 && (
              <p>
                <Trans>
                  No enabled advertising assistant matches this project and
                  search. Manual recommendations remain available.
                </Trans>
              </p>
            )}
            {reading.data.nextCursor && (
              <StyledDeliveryButton
                type="button"
                disabled={!enabled}
                onClick={() => setAfter(reading.data?.nextCursor ?? null)}
              >
                <Trans>More assistants</Trans>
              </StyledDeliveryButton>
            )}
          </>
        ) : (
          <p role={query.error ? 'alert' : 'status'}>
            {query.error
              ? t`Advertising assistants could not be verified. Retry or return to the first page.`
              : t`Loading permitted advertising assistants…`}
          </p>
        )}
        <StyledDeliveryRow>
          <StyledDeliveryButton
            type="button"
            disabled={!enabled}
            onClick={() => {
              setAfter(null);
              void query.refetch().catch(() => undefined);
            }}
          >
            <Trans>Refresh assistants</Trans>
          </StyledDeliveryButton>
          <Link to="/delivery?view=agents">
            <Trans>Review assistant setup</Trans>
          </Link>
        </StyledDeliveryRow>
      </StyledDeliveryStack>
    </section>
  );
};
