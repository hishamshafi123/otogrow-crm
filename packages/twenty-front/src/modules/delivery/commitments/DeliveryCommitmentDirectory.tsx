import { useCommitmentScope } from '@/delivery/commitments/useCommitmentScope';
import { useSearchParams } from 'react-router-dom';
import { clientEngagementParams } from '@/delivery/commitments/clientCommitmentParams';
import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useOtogrowAccess } from '@/otogrow-access/useOtogrowAccess';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { GET_COMMITMENT_ENGAGEMENTS } from '@/delivery/commitments/delivery-commitments.graphql';
import { DeliveryCommitments } from '@/delivery/commitments/DeliveryCommitments';
import { type DeliveryCommitmentEngagementsQuery } from '~/generated-metadata/graphql';

export const DeliveryCommitmentDirectory = () => {
  const scope = useCommitmentScope();
  return <CommitmentDirectory key={scope} />;
};
const CommitmentDirectory = () => {
  const { t } = useLingui();
  const permission = useOtogrowAccess();
  const ready =
    !permission.loading && !permission.error && Boolean(permission.access);
  const { requestAction } = useDeliveryDraftGuard();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('clientEngagement') ?? '';
  const query = useQuery<
    DeliveryCommitmentEngagementsQuery,
    { identity: string | null }
  >(GET_COMMITMENT_ENGAGEMENTS, {
    variables: { identity: permission.scopeKey },
    skip: !ready,
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    pollInterval: 30000,
  });
  const candidate = query.data?.deliveryCommitmentEngagements;
  const data =
    ready &&
    permission.access &&
    !query.error &&
    candidate?.workspaceId === permission.access.workspaceId &&
    candidate.memberId === permission.access.memberId &&
    candidate.userWorkspaceId === permission.access.userWorkspaceId
      ? candidate
      : undefined;
  const selected = data?.engagements.find((item) => item.id === selectedId);
  return (
    <StyledDeliveryStack>
      <StyledDeliveryCard>
        <StyledDeliveryStack>
          <h2>
            <Trans>Client commitments</Trans>
          </h2>
          <p>
            <Trans>
              See promised work and fulfilment for your assigned client
              projects.
            </Trans>
          </p>
          {(permission.loading || query.loading) && (
            <p role="status">
              <Trans>Loading your client projects…</Trans>
            </p>
          )}
          {(permission.error ||
            (!permission.loading && !permission.access) ||
            query.error) && (
            <>
              <p role="alert">
                <Trans>
                  Client projects are hidden until your access can be verified.
                </Trans>
              </p>
              <StyledDeliveryButton
                onClick={() => {
                  void permission.refetch();
                  void query.refetch().catch(() => undefined);
                }}
              >
                <Trans>Check access again</Trans>
              </StyledDeliveryButton>
            </>
          )}
          {data &&
            (data.engagements.length ? (
              <label>
                <Trans>Client service plan</Trans>
                <select
                  value={selectedId}
                  onChange={(event) => {
                    const id = event.target.value;
                    requestAction(() =>
                      setParams(clientEngagementParams(params, id)),
                    );
                  }}
                >
                  <option value="">{t`Choose a client service plan`}</option>
                  {selectedId && !selected && (
                    <option
                      value={selectedId}
                      disabled
                    >{t`Selected client service plan unavailable`}</option>
                  )}
                  {data.engagements.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p>
                <Trans>
                  No client service plans are available in your assigned
                  projects.
                </Trans>
              </p>
            ))}
          {data && selectedId && !selected && (
            <p role="alert">
              <Trans>
                This linked client service plan is unavailable in your assigned
                projects. Choose a client service plan you can currently access.
              </Trans>{' '}
              <StyledDeliveryButton
                type="button"
                onClick={() =>
                  requestAction(() =>
                    setParams(clientEngagementParams(params, null)),
                  )
                }
              >
                <Trans>Clear service plan selection</Trans>
              </StyledDeliveryButton>
            </p>
          )}
        </StyledDeliveryStack>
      </StyledDeliveryCard>
      {selected && (
        <DeliveryCommitments
          engagementId={selected.id}
          billing={selected.billing}
        />
      )}
    </StyledDeliveryStack>
  );
};
