import { useCommitmentScope } from '@/delivery/commitments/useCommitmentScope';
import { useSearchParams } from 'react-router-dom';
import { useLayoutEffect, useState } from 'react';
import { NetworkStatus } from '@apollo/client';
import { fastDeepEqual } from 'twenty-shared/utils';
import { isDeliveryTaskUnavailable as isCommitmentSourceUnavailable } from '@/delivery/tasks/isDeliveryTaskUnavailable';
import {
  clearOrphanCleanupRecovery,
  orphanCleanupStorageKey,
} from '@/delivery/commitments/orphanCleanupStorage';
import { useOtogrowIdentity } from '@/otogrow-access/useOtogrowIdentity';
import { clientEngagementParams } from '@/delivery/commitments/clientCommitmentParams';
import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useOtogrowAccess } from '@/otogrow-access/useOtogrowAccess';
import { useDeliveryDraftGuard } from '@/delivery/drafts/DeliveryDraftGuard';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryCompactStack,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';
import { GET_COMMITMENT_ENGAGEMENTS } from '@/delivery/commitments/delivery-commitments.graphql';
import { DeliveryCommitments } from '@/delivery/commitments/DeliveryCommitments';
import { type DeliveryCommitmentEngagementsQuery } from '~/generated-metadata/graphql';

type DeliveryCommitmentDirectoryProps = {
  compact?: boolean;
};

export const DeliveryCommitmentDirectory = ({
  compact = false,
}: DeliveryCommitmentDirectoryProps) => {
  const scope = useCommitmentScope();
  return <CommitmentDirectory key={scope} compact={compact} />;
};
type CommitmentDirectoryProps = {
  compact: boolean;
};
const CommitmentDirectory = ({ compact }: CommitmentDirectoryProps) => {
  const { t } = useLingui();
  const permission = useOtogrowAccess();
  const { identity } = useOtogrowIdentity();
  const ready =
    !permission.loading && !permission.error && Boolean(permission.access);
  const { requestAction, cancelPendingNavigation } = useDeliveryDraftGuard();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('clientEngagement') ?? '';
  const currentAuthorization = ready
    ? JSON.stringify({
        capabilities: [...(permission.access?.capabilities ?? [])].sort(),
        roleIds: [...(permission.access?.roleIds ?? [])].sort(),
        grants: permission.access?.grants ?? [],
      })
    : null;
  const [lastAuthorization, setLastAuthorization] = useState(
    currentAuthorization ?? '',
  );
  if (
    currentAuthorization !== null &&
    currentAuthorization !== lastAuthorization
  )
    setLastAuthorization(currentAuthorization);
  const authorization = currentAuthorization ?? lastAuthorization;
  const [verifiedAuthorization, setVerifiedAuthorization] = useState<
    string | null
  >(null);
  const [remembered, setRemembered] = useState<
    | DeliveryCommitmentEngagementsQuery['deliveryCommitmentEngagements']['engagements'][number]
    | null
  >(null);
  const query = useQuery<
    DeliveryCommitmentEngagementsQuery,
    { identity: string | null; authorization: string }
  >(GET_COMMITMENT_ENGAGEMENTS, {
    variables: { identity: permission.scopeKey, authorization },
    skip: !ready,
    fetchPolicy: 'no-cache',
    notifyOnNetworkStatusChange: true,
    pollInterval: 30000,
  });
  const candidate = query.data?.deliveryCommitmentEngagements;
  const unavailable =
    isCommitmentSourceUnavailable(permission.error) ||
    isCommitmentSourceUnavailable(query.error);
  const trusted =
    !unavailable &&
    ready &&
    permission.access &&
    !query.error &&
    candidate?.workspaceId === permission.access.workspaceId &&
    candidate.memberId === permission.access.memberId &&
    candidate.userWorkspaceId === permission.access.userWorkspaceId
      ? candidate
      : undefined;
  const refreshing =
    query.loading &&
    [NetworkStatus.poll, NetworkStatus.refetch].includes(query.networkStatus);
  if (trusted && !query.loading && verifiedAuthorization !== authorization)
    setVerifiedAuthorization(authorization);
  else if (
    verifiedAuthorization !== null &&
    (!trusted || (query.loading && !refreshing))
  )
    setVerifiedAuthorization(null);
  const data =
    trusted &&
    (!query.loading || (refreshing && verifiedAuthorization === authorization))
      ? trusted
      : undefined;
  const selected = data?.engagements.find((item) => item.id === selectedId);
  const missingSelected = Boolean(
    data && !query.loading && selectedId && !selected,
  );
  if (selected && !fastDeepEqual(remembered, selected)) setRemembered(selected);
  useLayoutEffect(() => {
    if (unavailable || missingSelected) {
      setRemembered(null);
      cancelPendingNavigation();
      if (selectedId)
        clearOrphanCleanupRecovery(
          orphanCleanupStorageKey(identity, selectedId),
        );
    }
  }, [
    unavailable,
    missingSelected,
    selectedId,
    identity,
    cancelPendingNavigation,
  ]);
  const retained =
    !unavailable && !missingSelected && remembered?.id === selectedId
      ? remembered
      : null;
  const shown = selected ?? retained;
  const DirectorySurface = compact ? 'div' : StyledDeliveryCard;
  const DirectoryContent = compact
    ? StyledDeliveryCompactStack
    : StyledDeliveryStack;
  return (
    <StyledDeliveryStack>
      <DirectorySurface>
        <DirectoryContent>
          {!compact && (
            <>
              <h2>
                <Trans>Client service plans</Trans>
              </h2>
              <p>
                <Trans>
                  See promised work and fulfilment for your assigned client
                  projects.
                </Trans>
              </p>
            </>
          )}
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
        </DirectoryContent>
      </DirectorySurface>
      {shown && (
        <div hidden={!selected} inert={!selected || undefined}>
          <DeliveryCommitments
            engagementId={shown.id}
            billing={shown.billing}
          />
        </div>
      )}
    </StyledDeliveryStack>
  );
};
