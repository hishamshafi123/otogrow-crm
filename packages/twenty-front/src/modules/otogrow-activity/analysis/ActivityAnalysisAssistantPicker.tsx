import { useLayoutEffect, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link } from 'react-router-dom';
import { GET_ASSISTANT_CATALOG } from '@/delivery/assistants/delivery-assistants.graphql';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { isOtogrowAccessDenied } from '@/otogrow-access/isOtogrowAccessDenied';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { type useActivityContext } from '@/otogrow-activity/useActivityContext';
import { type DeliveryAssistantCatalogQuery } from '~/generated-metadata/graphql';

export const ActivityAnalysisAssistantPicker = ({
  state,
  enabled,
  onChoose,
  onAuthorityLost,
}: {
  state: ReturnType<typeof useActivityContext>;
  enabled: boolean;
  onChoose: (
    assistant: DeliveryAssistantCatalogQuery['deliveryAssistantCatalog']['items'][number],
  ) => void;
  onAuthorityLost: () => void;
}) => {
  const { t } = useLingui();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [after, setAfter] = useState<string | null>(null);
  const input = {
    kind: 'ACTIVITY',
    enabled: true,
    taskId: null,
    projectId: null,
    search,
    after,
    limit: 25,
  };
  const source = `${state.source}:${JSON.stringify(input)}`;
  const query = useQuery<DeliveryAssistantCatalogQuery>(GET_ASSISTANT_CATALOG, {
    variables: { input, identity: source },
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
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
  const denied = isOtogrowAccessDenied(query.error);
  useLayoutEffect(() => {
    if (denied) onAuthorityLost();
  }, [denied, onAuthorityLost]);
  return (
    <StyledDeliveryStack>
      <h3>
        <Trans>Choose a work-analysis assistant</Trans>
      </h3>
      <p>
        <Trans>
          Only a permitted workspace activity assistant can analyze these
          records. It cannot change tasks, send messages or rate employees.
        </Trans>
      </p>
      <StyledDeliveryRow>
        <label>
          <Trans>Find a work-analysis assistant</Trans>
          <input
            value={searchInput}
            maxLength={160}
            onChange={(event) => setSearchInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                setSearch(searchInput.trim());
                setAfter(null);
              }
            }}
          />
        </label>
        <StyledDeliveryButton
          type="button"
          onClick={() => {
            setSearch(searchInput.trim());
            setAfter(null);
          }}
        >
          <Trans>Find assistants</Trans>
        </StyledDeliveryButton>
      </StyledDeliveryRow>
      {reading.data ? (
        <>
          <small>{t`Showing ${reading.data.items.length} of ${reading.data.totalCount} matching assistants.`}</small>
          {reading.data.items.map((assistant) => (
            <article key={assistant.id}>
              <h4>{assistant.name}</h4>
              <p>{assistant.purpose}</p>
              <StyledDeliveryButton
                type="button"
                disabled={
                  !enabled ||
                  !assistant.enabled ||
                  !assistant.canRun ||
                  assistant.kind !== 'ACTIVITY'
                }
                onClick={() => onChoose(assistant)}
              >
                <Trans>Use this assistant</Trans>
              </StyledDeliveryButton>
              {!assistant.canRun && (
                <p>
                  <Trans>
                    This assistant is unavailable for your current administrator
                    role.
                  </Trans>
                </p>
              )}
            </article>
          ))}
          {reading.data.totalCount === 0 && (
            <p>
              <Trans>
                No enabled work-analysis assistant is available. You can still
                inspect and filter the recorded activity.
              </Trans>
            </p>
          )}
          {reading.data.nextCursor && (
            <StyledDeliveryButton
              type="button"
              onClick={() => setAfter(reading.data?.nextCursor ?? null)}
            >
              <Trans>More assistants</Trans>
            </StyledDeliveryButton>
          )}
        </>
      ) : (
        <p role={query.error ? 'alert' : 'status'}>
          {query.error
            ? t`Assistants could not be verified.`
            : t`Loading permitted assistants…`}
        </p>
      )}
      <StyledDeliveryRow>
        <StyledDeliveryButton
          type="button"
          onClick={() => {
            setAfter(null);
            void query.refetch().catch(() => undefined);
          }}
        >
          <Trans>First page and retry</Trans>
        </StyledDeliveryButton>
        <Link to="/delivery?view=agents">
          <Trans>Review assistant setup</Trans>
        </Link>
      </StyledDeliveryRow>
    </StyledDeliveryStack>
  );
};
