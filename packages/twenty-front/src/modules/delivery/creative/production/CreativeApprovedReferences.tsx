import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAssistantRead } from '@/delivery/assistants/useAssistantRead';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import { type useCreativeProductionContext } from '@/delivery/creative/production/useCreativeProductionContext';
import { GET_CREATIVE_REFERENCES } from '@/delivery/creative/production/creative-production.graphql';
import { creativeProductionDestination } from '@/delivery/creative/production/creative-production-navigation';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { type DeliveryCreativeReferencesQuery } from '~/generated-metadata/graphql';

export const CreativeApprovedReferences = ({
  state,
  taskId,
  projectId,
  projectRevision,
  disabled,
  onReuse,
}: {
  state: ReturnType<typeof useCreativeProductionContext>;
  taskId: string;
  projectId: string;
  projectRevision: number;
  disabled: boolean;
  onReuse: (sourceTaskId: string, referenceId: string) => Promise<boolean>;
}) => {
  const { t } = useLingui();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { requestAction } = useDeliveryDraftGuard();
  const input = {
    taskId,
    search: params.get('creativeReferenceSearch'),
    after: params.get('creativeReferenceAfter'),
    limit: 25,
  };
  const source = `${state.source}:${state.data?.scope ?? ''}:${JSON.stringify(input)}`;
  const query = useQuery<DeliveryCreativeReferencesQuery>(
    GET_CREATIVE_REFERENCES,
    {
      variables: { input, identity: source },
      fetchPolicy: 'no-cache',
      notifyOnNetworkStatusChange: true,
      skip: state.data === null,
    },
  );
  const reading = useAssistantRead({
    value: query.data?.deliveryCreativeReferences,
    source,
    enabled: state.data !== null,
    loading: query.loading,
    error: query.error,
    networkStatus: query.networkStatus,
    matches: (value) =>
      state.matches(value) &&
      value.scope === state.data?.scope &&
      value.taskId === taskId &&
      value.projectId === projectId &&
      value.projectRevision === projectRevision,
  });
  const go = (changes: Record<string, string | null>) =>
    requestAction(() =>
      navigate(creativeProductionDestination(params, changes)),
    );
  return (
    <StyledDeliveryStack>
      <p>
        <Trans>
          Approved links from other tasks in this project. Reuse copies the
          reference into this task for a new review; it does not approve new
          work.
        </Trans>
      </p>
      <form
        key={input.search}
        onSubmit={(event) => {
          event.preventDefault();
          go({
            creativeReferenceSearch: String(
              new FormData(event.currentTarget).get('search') ?? '',
            ).trim(),
            creativeReferenceAfter: null,
          });
        }}
      >
        <label>
          <Trans>Find approved references</Trans>
          <input
            name="search"
            maxLength={160}
            defaultValue={input.search ?? ''}
          />
        </label>
        <StyledDeliveryButton type="submit">
          <Trans>Search references</Trans>
        </StyledDeliveryButton>
      </form>
      {query.error && (
        <p role="alert">
          <Trans>Approved references could not be checked.</Trans>
          <StyledDeliveryButton
            type="button"
            onClick={() => void query.refetch()}
          >
            <Trans>Retry references</Trans>
          </StyledDeliveryButton>
          <StyledDeliveryButton
            type="button"
            onClick={() => go({ creativeReferenceAfter: null })}
          >
            <Trans>First reference page</Trans>
          </StyledDeliveryButton>
        </p>
      )}
      {!reading.data && !query.error && (
        <p role="status">
          <Trans>Checking approved references…</Trans>
        </p>
      )}
      {reading.data && (
        <>
          <p>
            <Trans>
              {reading.data.items.length} shown of {reading.data.totalCount}{' '}
              approved references
            </Trans>
          </p>
          {reading.data.items.length === 0 && (
            <p>
              <Trans>
                No approved links match this search in the current project.
              </Trans>
            </p>
          )}
          {reading.data.items.map((reference) => (
            <StyledDeliveryCard
              key={`${reference.sourceTaskId}:${reference.id}`}
            >
              <StyledDeliveryStack>
                <strong>
                  {reference.title} · v{reference.version}
                </strong>
                <small>{reference.sourceTaskTitle}</small>
                <p>
                  {reference.summaryPreview}
                  {reference.summaryTruncated ? '…' : ''}
                </p>
                <a
                  href={reference.url}
                  target="_blank"
                  rel="noreferrer"
                >{t`Open reference · content not automatically inspected`}</a>
                <StyledDeliveryButton
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    void onReuse(reference.sourceTaskId, reference.id)
                  }
                >
                  <Trans>Reuse for this task</Trans>
                </StyledDeliveryButton>
              </StyledDeliveryStack>
            </StyledDeliveryCard>
          ))}
          <StyledDeliveryRow>
            {input.after && (
              <StyledDeliveryButton
                type="button"
                onClick={() => go({ creativeReferenceAfter: null })}
              >
                <Trans>First references</Trans>
              </StyledDeliveryButton>
            )}
            {reading.data.nextCursor && (
              <StyledDeliveryButton
                type="button"
                onClick={() =>
                  go({
                    creativeReferenceAfter: reading.data?.nextCursor ?? null,
                  })
                }
              >
                <Trans>More references</Trans>
              </StyledDeliveryButton>
            )}
          </StyledDeliveryRow>
        </>
      )}
    </StyledDeliveryStack>
  );
};
