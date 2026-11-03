import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { NetworkStatus } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { fastDeepEqual, isDefined } from 'twenty-shared/utils';
import { type DeliveryFounderExceptionsQuery } from '~/generated-metadata/graphql';
import { GET_DELIVERY_FOUNDER_EXCEPTIONS } from '@/delivery/founder/delivery-founder.graphql';
import { type FounderSnapshot } from '@/delivery/founder/founder.types';
import { DeliveryFounderAlertRules } from '@/delivery/founder/escalation/DeliveryFounderAlertRules';
import { escalationDestination } from '@/delivery/founder/escalation/escalation-navigation';
import { FounderExceptionRow } from '@/delivery/founder/FounderExceptionRow';
import {
  founderQueryInput,
  readFounderNavigation,
  writeFounderNavigation,
  type FounderNavigationValue,
} from '@/delivery/founder/founder-navigation';
import { useFounderLabels } from '@/delivery/founder/useFounderLabels';
import {
  StyledFounderFilters,
  StyledFounderList,
} from '@/delivery/founder/founderStyles';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { useFinanceLabels } from '@/delivery/finance/useFinanceLabels';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

export const DeliveryFounderExceptions = () => {
  const permission = useWorkflowAccess();
  const [params] = useSearchParams();
  if (params.get('founderPanel') === 'alerts')
    return <DeliveryFounderAlertRules />;
  return (
    <FounderWorkspace
      key={`${permission.scope}:${permission.canManageRoles}:${params.toString()}`}
      permission={permission}
    />
  );
};
type FounderWorkspaceProps = {
  permission: ReturnType<typeof useWorkflowAccess>;
};
const FounderWorkspace = ({ permission }: FounderWorkspaceProps) => {
  const { t } = useLingui();
  const labels = useFounderLabels();
  const financeLabels = useFinanceLabels();
  const [params, setParams] = useSearchParams();
  const parsed = readFounderNavigation(params, financeLabels.currencies);
  const filters: FounderNavigationValue = parsed.success
    ? parsed.data
    : { domain: 'ALL' };
  const authorized = permission.ready && permission.canManageRoles;
  const query = useQuery<DeliveryFounderExceptionsQuery>(
    GET_DELIVERY_FOUNDER_EXCEPTIONS,
    {
      variables: {
        input: founderQueryInput(filters),
        identity: permission.scope,
      },
      fetchPolicy: 'no-cache',
      pollInterval: 30000,
      skip: !authorized || !parsed.success,
    },
  );
  const candidate = query.data?.deliveryFounderExceptions;
  const matchesCurrentAccess = (snapshot: FounderSnapshot) =>
    permission.matches(snapshot) &&
    snapshot.canReadFinance === permission.canReadFinance &&
    (permission.canReadFinance ||
      (!snapshot.items.some((item) => item.domain === 'FINANCE') &&
        !snapshot.counts.some(
          (count) => count.domain === 'FINANCE' && count.count > 0,
        )));
  const refreshing =
    query.loading &&
    [NetworkStatus.poll, NetworkStatus.refetch].includes(query.networkStatus);
  const [lastVerified, setLastVerified] = useState<FounderSnapshot | null>(
    null,
  );
  const trusted =
    authorized &&
    parsed.success &&
    !query.error &&
    (!isDefined(candidate) || matchesCurrentAccess(candidate));
  const fresh =
    trusted && !query.loading && isDefined(candidate) ? candidate : null;
  const retained =
    trusted &&
    refreshing &&
    isDefined(lastVerified) &&
    matchesCurrentAccess(lastVerified)
      ? lastVerified
      : null;
  if (fresh && !fastDeepEqual(fresh, lastVerified)) setLastVerified(fresh);
  else if (
    lastVerified &&
    (!trusted ||
      !matchesCurrentAccess(lastVerified) ||
      (query.loading && !refreshing))
  )
    setLastVerified(null);
  const data = fresh ?? retained;
  const update = (next: FounderNavigationValue) =>
    setParams(writeFounderNavigation(params, { ...next, after: undefined }));
  const firstPage = `/delivery?${writeFounderNavigation(params, { ...filters, after: undefined })}`;
  const additionalFilterCount = [
    filters.projectId,
    filters.ownerId,
    filters.currency,
    filters.serviceMonth,
  ].filter(Boolean).length;
  if (!permission.ready)
    return (
      <StyledDeliveryCard>
        <p role="status">
          <Trans>
            Company overview access could not be verified. Previous evidence is
            hidden.
          </Trans>
        </p>
        <StyledDeliveryButton
          onClick={() => void permission.refetch().catch(() => undefined)}
        >
          <Trans>Retry overview access</Trans>
        </StyledDeliveryButton>
      </StyledDeliveryCard>
    );
  if (!permission.canManageRoles)
    return (
      <StyledDeliveryCard>
        <p>
          <Trans>
            An administrator can review company exceptions. Your permitted work
            remains available from navigation.
          </Trans>
        </p>
      </StyledDeliveryCard>
    );
  return (
    <StyledDeliveryCard>
      <StyledDeliveryStack>
        <StyledDeliveryRow>
          <h2>
            <Trans>Needs attention</Trans>
          </h2>
          <Link to={escalationDestination(params, {})}>
            <Trans>Founder alert rules</Trans>
          </Link>
          <StyledDeliveryButton
            disabled={query.loading || !parsed.success}
            onClick={() => void query.refetch().catch(() => undefined)}
          >
            <Trans>Refresh exceptions</Trans>
          </StyledDeliveryButton>
        </StyledDeliveryRow>
        <p>
          <Trans>
            Review the evidence and open a source to take the next step.
          </Trans>
        </p>
        {!parsed.success ? (
          <>
            <p role="alert">
              <Trans>
                This exception link has invalid filters. Reset them before
                reviewing evidence.
              </Trans>
            </p>
            <StyledDeliveryButton onClick={() => update({ domain: 'ALL' })}>
              <Trans>Reset exception filters</Trans>
            </StyledDeliveryButton>
          </>
        ) : (
          <>
            <StyledFounderFilters>
              <label>
                <Trans>Area</Trans>
                <select
                  value={filters.domain}
                  onChange={(event) =>
                    update({
                      ...filters,
                      domain: event.target
                        .value as FounderNavigationValue['domain'],
                    })
                  }
                >
                  {Object.entries(labels.domains).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </StyledFounderFilters>
            <details open={additionalFilterCount > 0}>
              <summary>
                {additionalFilterCount > 0
                  ? t`More filters (${additionalFilterCount})`
                  : t`More filters`}
              </summary>
              <StyledFounderFilters>
                <label>
                  <Trans>Client project</Trans>
                  <select
                    value={filters.projectId ?? ''}
                    onChange={(event) =>
                      update({
                        ...filters,
                        projectId: event.target.value || undefined,
                      })
                    }
                  >
                    <option value="">{t`All client projects`}</option>
                    {filters.projectId &&
                      !data?.projects.some(
                        (project) => project.id === filters.projectId,
                      ) && (
                        <option
                          value={filters.projectId}
                        >{t`Selected client project`}</option>
                      )}
                    {data?.projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <Trans>Accountable person</Trans>
                  <select
                    value={filters.ownerId ?? ''}
                    onChange={(event) =>
                      update({
                        ...filters,
                        ownerId: event.target.value || undefined,
                      })
                    }
                  >
                    <option value="">{t`All owners, including unassigned`}</option>
                    {filters.ownerId &&
                      !data?.owners.some(
                        (owner) => owner.id === filters.ownerId,
                      ) && (
                        <option
                          value={filters.ownerId}
                        >{t`Selected owner`}</option>
                      )}
                    {data?.owners.map((owner) => (
                      <option key={owner.id} value={owner.id}>
                        {owner.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <Trans>Evidence currency</Trans>
                  <select
                    value={filters.currency ?? ''}
                    onChange={(event) =>
                      update({
                        ...filters,
                        currency: event.target.value || undefined,
                      })
                    }
                  >
                    <option value="">{t`All currencies, kept separate`}</option>
                    {financeLabels.currencies.map((currency) => (
                      <option key={currency}>{currency}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <Trans>Recorded result month (optional)</Trans>
                  <input
                    type="month"
                    value={filters.serviceMonth ?? ''}
                    onChange={(event) =>
                      update({
                        ...filters,
                        serviceMonth: event.target.value || undefined,
                      })
                    }
                  />
                </label>
              </StyledFounderFilters>
              <small>
                <Trans>
                  Currency narrows monetary evidence; delivery work and client
                  promises remain. A service month adds recorded monthly
                  results; current cash forecasts keep their own reporting
                  dates.
                </Trans>
              </small>
            </details>
            {(filters.domain !== 'ALL' ||
              filters.projectId ||
              filters.ownerId ||
              filters.currency ||
              filters.serviceMonth) && (
              <StyledDeliveryButton onClick={() => update({ domain: 'ALL' })}>
                <Trans>Reset exception filters</Trans>
              </StyledDeliveryButton>
            )}
            {query.error ? (
              <p role="alert">
                {query.error.message.includes('review limit') ||
                query.error.message.includes('no sources were truncated')
                  ? t`This selection exceeds the safe evidence review limit. Narrow the area or client project; no exceptions were truncated.`
                  : t`Company exceptions could not be checked. Previous evidence is hidden. Retry, or return to the first page if the source list changed.`}
              </p>
            ) : !data ? (
              <p role="status">
                <Trans>Checking current company evidence…</Trans>
              </p>
            ) : (
              <>
                {refreshing && (
                  <p role="status">
                    <Trans>
                      Refreshing evidence; showing the last verified check.
                    </Trans>
                  </p>
                )}
                <p>
                  {t`Known exceptions in this selection: ${data.totalCount}`} ·{' '}
                  <Trans>Checked at</Trans>{' '}
                  <time dateTime={data.observedAt}>
                    {new Date(data.observedAt).toLocaleString(undefined, {
                      timeZone: 'UTC',
                    })}{' '}
                    UTC
                  </time>
                </p>
                <p>
                  {data.counts
                    .map(
                      (count) =>
                        `${labels.domains[count.domain] ?? t`Area`}: ${count.count}`,
                    )
                    .join(' · ')}
                </p>
                <section aria-label={t`Evidence coverage`}>
                  <h3>
                    <Trans>What was checked</Trans>
                  </h3>
                  {data.coverage.some(
                    (coverage) =>
                      !['INCLUDED', 'NOT_SELECTED'].includes(coverage.status),
                  ) && (
                    <p role="status">
                      <Trans>
                        Coverage is incomplete. Missing or restricted evidence
                        is not a healthy result.
                      </Trans>
                    </p>
                  )}
                  <details>
                    <summary>
                      <Trans>Coverage and limits</Trans>
                    </summary>
                    {data.coverage.map((coverage) => (
                      <div key={coverage.domain}>
                        <strong>
                          {labels.domains[coverage.domain] ??
                            t`Company evidence`}
                          :{' '}
                          {labels.coverageStates[coverage.status] ??
                            t`Not verified`}
                        </strong>
                        {coverage.codes.map((code) => (
                          <p key={code}>{labels.warning(code)}</p>
                        ))}
                      </div>
                    ))}
                  </details>
                </section>
                {!data.items.length ? (
                  <p>
                    <Trans>
                      No known exceptions on this page in the selected evidence.
                      Check coverage before treating this as a complete company
                      review.
                    </Trans>
                  </p>
                ) : (
                  <StyledFounderList aria-label={t`Company exceptions`}>
                    {data.items.map((item) => (
                      <li key={item.key}>
                        <FounderExceptionRow item={item} />
                      </li>
                    ))}
                  </StyledFounderList>
                )}
                {data.nextCursor && (
                  <Link
                    to={`/delivery?${writeFounderNavigation(params, { ...filters, after: data.nextCursor })}`}
                  >
                    <Trans>More exceptions</Trans>
                  </Link>
                )}
              </>
            )}
            {isDefined(filters.after) && (
              <Link to={firstPage}>
                <Trans>First exceptions page</Trans>
              </Link>
            )}
          </>
        )}
      </StyledDeliveryStack>
    </StyledDeliveryCard>
  );
};
