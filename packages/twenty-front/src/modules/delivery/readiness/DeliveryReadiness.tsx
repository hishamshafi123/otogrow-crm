import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link, useSearchParams } from 'react-router-dom';
import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { type DeliveryReadinessQuery } from '~/generated-metadata/graphql';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { GET_DELIVERY_READINESS } from '@/delivery/readiness/delivery-readiness.graphql';
import { useReadinessLabels } from '@/delivery/readiness/useReadinessLabels';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

const StyledCapabilities = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  > li {
    border-top: 1px solid ${themeCssVariables.border.color.light};
    padding: 16px 0;
  }
  > li:first-child {
    border-top: 0;
  }
`;
const StyledCapabilityHeading = styled.div`
  align-items: baseline;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  justify-content: space-between;
  margin-bottom: 8px;
  overflow-wrap: anywhere;
`;
const StyledState = styled.span`
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: 6px;
  padding: 2px 8px;
  white-space: nowrap;
`;
export const DeliveryReadiness = () => {
  const permission = useWorkflowAccess();
  return <ReadinessWorkspace key={permission.scope} permission={permission} />;
};
const ReadinessWorkspace = ({
  permission,
}: {
  permission: ReturnType<typeof useWorkflowAccess>;
}) => {
  const { t } = useLingui();
  const labels = useReadinessLabels();
  const [params, setParams] = useSearchParams();
  const requestedStatus = params.get('readinessStatus') ?? 'ALL';
  const filter = Object.hasOwn(labels.statuses, requestedStatus)
    ? requestedStatus
    : 'ALL';
  const setFilter = (value: string) => {
    const next = new URLSearchParams(params);
    if (value === 'ALL') next.delete('readinessStatus');
    else next.set('readinessStatus', value);
    setParams(next);
  };
  const query = useQuery<DeliveryReadinessQuery>(GET_DELIVERY_READINESS, {
    fetchPolicy: 'no-cache',
    pollInterval: 30000,
    skip: !permission.ready || !permission.canManageRoles,
  });
  const snapshot = query.data?.deliveryReadiness;
  const available =
    !query.error && permission.canManageRoles && permission.matches(snapshot);
  const items = available ? (snapshot?.items ?? []) : [];
  const visible = items.filter(
    (item) => filter === 'ALL' || item.status === filter,
  );
  return (
    <StyledDeliveryCard>
      <StyledDeliveryStack>
        <StyledDeliveryRow>
          <h3>
            <Trans>Features & connections</Trans>
          </h3>
          {permission.ready && permission.canManageRoles && (
            <StyledDeliveryButton
              disabled={query.loading}
              onClick={() => void query.refetch().catch(() => undefined)}
            >
              <Trans>Refresh readiness</Trans>
            </StyledDeliveryButton>
          )}
        </StyledDeliveryRow>
        <p>
          <Trans>
            Available means the workflow exists. Connected reflects saved
            evidence, not a live provider test or production approval.
          </Trans>
        </p>
        {!permission.ready ? (
          <p role="status">
            <Trans>Checking readiness access…</Trans>
          </p>
        ) : !permission.canManageRoles ? (
          <p>
            <Trans>
              An administrator can inspect workspace connection settings. Your
              permitted work remains available from navigation.
            </Trans>
          </p>
        ) : query.error ? (
          <p role="alert">
            <Trans>
              Readiness could not be checked. Refresh to retry; previous results
              are hidden.
            </Trans>
          </p>
        ) : !available || !snapshot ? (
          <p role="status">
            <Trans>Loading feature status…</Trans>
          </p>
        ) : (
          <>
            <small>{t`Saved configuration checked at ${new Date(snapshot.observedAt).toLocaleString()}.`}</small>
            <label>
              <Trans>Show feature status</Trans>
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              >
                <option value="ALL">{t`All features`}</option>
                {Object.entries(labels.statuses).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label} (
                    {items.filter((item) => item.status === value).length})
                  </option>
                ))}
              </select>
            </label>
            {!visible.length && (
              <p>
                <Trans>No features match this status.</Trans>
              </p>
            )}
            <StyledCapabilities>
              {visible.map((item) => (
                <li key={item.id}>
                  <StyledCapabilityHeading>
                    <strong>
                      {labels.capabilities[item.capability] ??
                        t`Unknown feature`}
                      {item.accountName ? ` · ${item.accountName}` : ''}
                    </strong>
                    <StyledState>
                      {labels.statuses[item.status] ?? t`Status unavailable`}
                    </StyledState>
                  </StyledCapabilityHeading>
                  <p>
                    {labels.reasons[item.reason] ??
                      t`No verified explanation is available. Ask an administrator to inspect setup.`}
                  </p>
                  {item.lastSuccessAt && (
                    <p>
                      <small>{t`Last recorded success: ${new Date(item.lastSuccessAt).toLocaleString()}`}</small>
                    </p>
                  )}
                  {labels.destinations[item.destination] && (
                    <Link
                      to={
                        item.destination === 'ads'
                          ? '/delivery?view=ads&adView=legacy'
                          : `/delivery?view=${encodeURIComponent(item.destination)}`
                      }
                    >
                      {item.capability === 'META'
                        ? t`Review Meta connection`
                        : labels.destinations[item.destination]}
                    </Link>
                  )}
                </li>
              ))}
            </StyledCapabilities>
          </>
        )}
        <small>
          <Trans>
            Deployment, backup restoration, real staff acceptance and live
            integration checks remain separate rollout requirements.
          </Trans>
        </small>
      </StyledDeliveryStack>
    </StyledDeliveryCard>
  );
};
