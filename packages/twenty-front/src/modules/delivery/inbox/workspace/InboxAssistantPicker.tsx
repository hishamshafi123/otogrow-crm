import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { Link } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { GET_ASSISTANT_CATALOG } from '@/delivery/assistants/delivery-assistants.graphql';
import { type useInboxAccess } from '@/delivery/inbox/workspace/useInboxAccess';
import {
  StyledDeliveryButton,
  StyledDeliveryStack,
  StyledDeliveryRow,
} from '@/delivery/deliveryStyles';
import { type DeliveryAssistantCatalogQuery } from '~/generated-metadata/graphql';
type InboxAssistantPickerProps = {
  state: ReturnType<typeof useInboxAccess>;
  projectId: string;
  id: string | null;
  name: string | null;
  onChoose: (value: { id: string; name: string; version: number }) => void;
};

export const InboxAssistantPicker = ({
  state,
  projectId,
  id,
  name,
  onChoose,
}: InboxAssistantPickerProps) => {
  const { t } = useLingui();
  const [search, setSearch] = useState(''),
    [after, setAfter] = useState<string | null>(null);
  const input = {
    kind: 'COPY',
    projectId,
    taskId: null,
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
    skip: state.data === null,
  });
  const reading = useAssistantRead({
    value: query.data?.deliveryAssistantCatalog,
    source,
    enabled: state.data !== null,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches: state.permission.matches,
  });
  return (
    <details>
      <summary>{name ?? t`Choose a copy assistant`}</summary>
      <StyledDeliveryStack>
        <label>
          <Trans>Find a compatible assistant</Trans>
          <input
            maxLength={160}
            value={search}
            onChange={(event) => {
              setSearch(event.currentTarget.value);
              setAfter(null);
            }}
          />
        </label>
        {reading.data ? (
          <>
            <p>{t`${reading.data.totalCount} compatible catalog entries; current execution rights are checked again before quoting.`}</p>
            {reading.data.items.map((assistant) => (
              <StyledDeliveryButton
                type="button"
                key={assistant.id}
                disabled={
                  !assistant.canRun ||
                  !assistant.enabled ||
                  assistant.kind !== 'COPY'
                }
                onClick={() =>
                  onChoose({
                    id: assistant.id,
                    name: assistant.name,
                    version: assistant.version,
                  })
                }
              >
                {assistant.name}
                {assistant.id === id ? ` · ${t`Selected`}` : ''}
                {!assistant.canRun ? ` · ${t`Not currently permitted`}` : ''}
              </StyledDeliveryButton>
            ))}
            {!reading.data.items.length && (
              <p>
                <Trans>
                  No enabled copy assistant is available for this role and
                  project. Manual replies still work; ask an administrator to
                  configure the model, pricing and shared AI budget.
                </Trans>
              </p>
            )}
            <StyledDeliveryRow>
              {after && (
                <StyledDeliveryButton
                  type="button"
                  onClick={() => setAfter(null)}
                >
                  <Trans>First assistants</Trans>
                </StyledDeliveryButton>
              )}
              {reading.data.nextCursor && (
                <StyledDeliveryButton
                  type="button"
                  onClick={() => setAfter(reading.data?.nextCursor ?? null)}
                >
                  <Trans>More assistants</Trans>
                </StyledDeliveryButton>
              )}
            </StyledDeliveryRow>
          </>
        ) : (
          <p role={query.error ? 'alert' : 'status'}>
            {query.error
              ? t`Compatible assistants could not be checked.`
              : t`Checking assistants…`}
          </p>
        )}
        {state.administrator && (
          <Link to="/delivery?view=agents">
            <Trans>Manage assistant configuration</Trans>
          </Link>
        )}
      </StyledDeliveryStack>
    </details>
  );
};
