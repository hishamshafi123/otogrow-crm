import { useState } from 'react';
import { NetworkStatus } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link, useSearchParams } from 'react-router-dom';
import { fastDeepEqual, isDefined } from 'twenty-shared/utils';
import { type DeliveryFounderPerformanceQuery } from '~/generated-metadata/graphql';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { useIsMobile } from '@/ui/utilities/responsive/hooks/useIsMobile';
import { useFinanceLabels } from '@/delivery/finance/useFinanceLabels';
import { FounderViewNavigation } from '@/delivery/founder/FounderViewNavigation';
import { GET_DELIVERY_FOUNDER_PERFORMANCE } from '@/delivery/founder/performance/delivery-founder-performance.graphql';
import {
  currentPerformanceMonth,
  defaultPerformanceTimezone,
  performanceQueryInput,
  readPerformanceNavigation,
  writePerformanceNavigation,
  type PerformanceNavigationValue,
} from '@/delivery/founder/performance/performance-navigation';
import { PerformanceFinancialSummary } from '@/delivery/founder/performance/PerformanceFinancialSummary';
import { PerformanceOperationsSummary } from '@/delivery/founder/performance/PerformanceOperationsSummary';
import {
  PerformanceClients,
  PerformanceEmployees,
} from '@/delivery/founder/performance/PerformanceDirectories';
import {
  StyledPerformanceFilters,
  StyledPerformanceFiltersDisclosure,
} from '@/delivery/founder/performance/performanceStyles';
import {
  StyledDeliveryButton,
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliverySectionStack,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type PerformanceSnapshot =
  DeliveryFounderPerformanceQuery['deliveryFounderPerformance'];

export const DeliveryFounderPerformance = () => {
  const permission = useWorkflowAccess();
  return (
    <>
      <FounderViewNavigation active="performance" />
      <PerformanceWorkspace
        key={`${permission.scope}:${permission.canReadFinance}`}
        permission={permission}
      />
    </>
  );
};

const PerformanceWorkspace = ({
  permission,
}: {
  permission: ReturnType<typeof useWorkflowAccess>;
}) => {
  const { t } = useLingui();
  const mobile = useIsMobile();
  const financeLabels = useFinanceLabels();
  const [params, setParams] = useSearchParams();
  const defaultTimezone = defaultPerformanceTimezone();
  const parsed = readPerformanceNavigation(
    params,
    financeLabels.currencies,
    defaultTimezone,
  );
  const fallback: PerformanceNavigationValue = {
    month: currentPerformanceMonth(defaultTimezone),
    timezone: defaultTimezone,
  };
  const filters = parsed.success ? parsed.data : fallback;
  const authorized = permission.ready && permission.canManageRoles;
  const query = useQuery<DeliveryFounderPerformanceQuery>(
    GET_DELIVERY_FOUNDER_PERFORMANCE,
    {
      variables: {
        input: performanceQueryInput(filters),
        identity: permission.scope,
      },
      fetchPolicy: 'no-cache',
      pollInterval: 30000,
      skip: !authorized || !parsed.success,
    },
  );
  const candidate = query.data?.deliveryFounderPerformance;
  const matchesCurrentAccess = (snapshot: PerformanceSnapshot) =>
    permission.matches(snapshot) &&
    snapshot.canReadFinance === permission.canReadFinance &&
    snapshot.month === filters.month &&
    snapshot.previousMonth !== snapshot.month &&
    snapshot.timezone === filters.timezone &&
    snapshot.currency === (filters.currency ?? null);
  const refreshing =
    query.loading &&
    [NetworkStatus.poll, NetworkStatus.refetch].includes(query.networkStatus);
  const [lastVerified, setLastVerified] = useState<PerformanceSnapshot | null>(
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
  const update = (changes: Partial<PerformanceNavigationValue>) =>
    setParams(writePerformanceNavigation(params, { ...filters, ...changes }));
  const warningLabels: Record<string, string> = {
    COST_COMPLETENESS_NOT_VERIFIED: t`Recorded results are not complete profitability until all salary, overhead, provider and other costs are reviewed and allocated.`,
    CURRENT_ASSIGNMENT_HISTORY: t`Employee approval, on-time, first-review and revision evidence follows the task’s current assignee after reassignment; it is not historic performer attribution.`,
    NO_MONTHLY_ENTRIES: t`No monthly recognition entries exist for the selected month. Recognized revenue and costs are not inferred from contracts.`,
    MONTHLY_DRAFTS_EXCLUDED: t`Draft entries are excluded from recognized results until reviewed and posted.`,
    UNASSIGNED_FINANCE: t`Company or unassigned amounts are excluded from client contribution and remain visible in the company cost breakdown.`,
    INVALID_MONTHLY_SOURCE: t`Some monthly entries have invalid or incomplete allocations. Their amounts are excluded and the affected currency is marked incomplete.`,
    INVALID_FINANCE_CURRENCY: t`An unsupported financial currency was excluded instead of being combined with another currency.`,
    CASH_SOURCE_WARNINGS: t`Some cash or invoice sources need review. Recorded cash and receivables may be incomplete.`,
    INVALID_TASK_SOURCE: t`Some current task records have unavailable states, dates or client links. Operational KPIs are incomplete.`,
    INVALID_SUBMISSION_HISTORY: t`Some submission or review timestamps are unavailable or invalid. Approval rates exclude that unsupported history.`,
    UNAVAILABLE_TASK_OWNER: t`Some current work belongs to an inactive or unavailable teammate. It remains in company and client totals but has no current employee row.`,
    INVALID_REVISION_SOURCE: t`Some selected-month revision records could not be matched to current client evidence.`,
    FINANCE_READ_REQUIRED: t`Finance read access is required for revenue, margins, cash and salary allocations.`,
  };
  const needsCoverageReview = data?.warnings.some((warning) =>
    [
      'INVALID_MONTHLY_SOURCE',
      'INVALID_FINANCE_CURRENCY',
      'CASH_SOURCE_WARNINGS',
      'INVALID_TASK_SOURCE',
      'INVALID_SUBMISSION_HISTORY',
      'INVALID_REVISION_SOURCE',
      'FINANCE_READ_REQUIRED',
    ].includes(warning),
  );
  if (!permission.ready)
    return (
      <StyledDeliveryCard>
        <p role={permission.error ? 'alert' : 'status'}>
          {permission.error
            ? t`Company performance access could not be verified. Previous figures are hidden.`
            : t`Checking company performance access…`}
        </p>
        {permission.error && (
          <StyledDeliveryButton
            onClick={() => void permission.refetch().catch(() => undefined)}
          >
            <Trans>Retry access</Trans>
          </StyledDeliveryButton>
        )}
      </StyledDeliveryCard>
    );
  if (!permission.canManageRoles)
    return (
      <StyledDeliveryCard>
        <p>
          <Trans>
            Current administrator access is required for company performance.
          </Trans>
        </p>
      </StyledDeliveryCard>
    );
  return (
    <StyledDeliverySectionStack>
      <StyledDeliveryCard>
        <StyledDeliveryStack>
          <div>
            <h2>
              <Trans>Business performance</Trans>
            </h2>
            <p>
              <Trans>
                Review recognized revenue, recorded margins, cash and delivery
                evidence. Currencies always remain separate.
              </Trans>
            </p>
          </div>
          {!parsed.success && (
            <>
              <p role="alert">
                <Trans>
                  This performance link has invalid reporting filters. Reset
                  them before reviewing figures.
                </Trans>
              </p>
              <StyledDeliveryButton onClick={() => update(fallback)}>
                <Trans>Reset performance filters</Trans>
              </StyledDeliveryButton>
            </>
          )}
          <StyledPerformanceFiltersDisclosure open={!mobile || !parsed.success}>
            <summary>
              <Trans>Reporting filters</Trans>
              <small>
                {filters.month} · {filters.currency ?? t`All currencies`}
              </small>
            </summary>
            <StyledPerformanceFilters
              key={`${filters.month}:${filters.timezone}:${filters.currency ?? ''}`}
              aria-label={t`Performance reporting filters`}
              onSubmit={(event) => {
                event.preventDefault();
                const fields = new FormData(event.currentTarget);
                update({
                  month: String(fields.get('month') ?? ''),
                  timezone: String(fields.get('timezone') ?? ''),
                  currency: String(fields.get('currency') ?? '') || undefined,
                  afterProjectId: undefined,
                  afterMemberId: undefined,
                });
              }}
            >
              <label>
                <Trans>Service month</Trans>
                <input
                  name="month"
                  type="month"
                  required
                  defaultValue={filters.month}
                />
              </label>
              <label>
                <Trans>Reporting time zone</Trans>
                <input
                  name="timezone"
                  required
                  defaultValue={filters.timezone}
                  list="performance-timezones"
                />
                <datalist id="performance-timezones">
                  {[
                    ...new Set([
                      defaultTimezone,
                      'UTC',
                      'Asia/Qatar',
                      'Asia/Dubai',
                    ]),
                  ].map((timezone) => (
                    <option key={timezone} value={timezone} />
                  ))}
                </datalist>
              </label>
              <label>
                <Trans>Currency</Trans>
                <select name="currency" defaultValue={filters.currency ?? ''}>
                  <option value="">{t`All currencies — kept separate`}</option>
                  {financeLabels.currencies.map((currency) => (
                    <option key={currency}>{currency}</option>
                  ))}
                </select>
              </label>
              <StyledDeliveryButton type="submit" data-primary="true">
                <Trans>Apply reporting period</Trans>
              </StyledDeliveryButton>
            </StyledPerformanceFilters>
          </StyledPerformanceFiltersDisclosure>
        </StyledDeliveryStack>
      </StyledDeliveryCard>
      {query.error ? (
        <StyledDeliveryCard>
          <StyledDeliveryStack>
            <p role="alert">
              {query.error.message.includes('reporting limit') ||
              query.error.message.includes('No sources were truncated')
                ? t`This selection exceeds the safe reporting limit. No figures were truncated.`
                : query.error.message.includes('no longer available')
                  ? t`This page changed. Return to the first client or employee page before continuing.`
                  : t`Company performance could not be checked. Previous figures are hidden while you retry.`}
            </p>
            <StyledDeliveryButton
              onClick={() => void query.refetch().catch(() => undefined)}
            >
              <Trans>Retry performance</Trans>
            </StyledDeliveryButton>
          </StyledDeliveryStack>
        </StyledDeliveryCard>
      ) : !data ? (
        <StyledDeliveryCard>
          <p role="status">
            <Trans>Checking current company performance…</Trans>
          </p>
        </StyledDeliveryCard>
      ) : (
        <>
          <p>
            <Trans>Checked at</Trans>{' '}
            <time dateTime={data.observedAt}>
              {new Date(data.observedAt).toLocaleString()}
            </time>{' '}
            · <Trans>Reporting time zone</Trans> {data.timezone}
            {refreshing && (
              <span role="status">
                {' '}
                · <Trans>Refreshing; showing the last verified figures</Trans>
              </span>
            )}
          </p>
          {needsCoverageReview && (
            <p role="status">
              <Trans>
                Some evidence is incomplete. Review coverage before using these
                figures for final decisions.
              </Trans>
            </p>
          )}
          {data.canReadFinance ? (
            <PerformanceFinancialSummary
              currencies={data.currencies}
              month={data.month}
              previousMonth={data.previousMonth}
            />
          ) : (
            <StyledDeliveryCard>
              <StyledDeliveryStack>
                <h2>
                  <Trans>Financial figures are restricted</Trans>
                </h2>
                <p>
                  <Trans>
                    Finance read access is required. Revenue, margins, cash,
                    salary costs and whether financial records exist remain
                    unknown; no empty or zero values are inferred.
                  </Trans>
                </p>
              </StyledDeliveryStack>
            </StyledDeliveryCard>
          )}
          <PerformanceOperationsSummary operations={data.operations} />
          <PerformanceClients
            clients={data.clients}
            total={data.clientTotal}
            month={data.month}
            timezone={data.timezone}
            canReadFinance={data.canReadFinance}
          />
          <StyledDeliveryRow>
            {data.nextProjectId && (
              <Link
                to={`/delivery?${writePerformanceNavigation(params, {
                  ...filters,
                  afterProjectId: data.nextProjectId,
                })}`}
              >
                <Trans>More clients</Trans>
              </Link>
            )}
            {filters.afterProjectId && (
              <Link
                to={`/delivery?${writePerformanceNavigation(params, {
                  ...filters,
                  afterProjectId: undefined,
                })}`}
              >
                <Trans>First clients page</Trans>
              </Link>
            )}
          </StyledDeliveryRow>
          <PerformanceEmployees
            employees={data.employees}
            total={data.employeeTotal}
            month={data.month}
            timezone={data.timezone}
            canReadFinance={data.canReadFinance}
          />
          <StyledDeliveryRow>
            {data.nextMemberId && (
              <Link
                to={`/delivery?${writePerformanceNavigation(params, {
                  ...filters,
                  afterMemberId: data.nextMemberId,
                })}`}
              >
                <Trans>More employees</Trans>
              </Link>
            )}
            {filters.afterMemberId && (
              <Link
                to={`/delivery?${writePerformanceNavigation(params, {
                  ...filters,
                  afterMemberId: undefined,
                })}`}
              >
                <Trans>First employees page</Trans>
              </Link>
            )}
          </StyledDeliveryRow>
          <StyledDeliveryCard>
            <StyledDeliveryStack>
              <h3>
                <Trans>Reporting coverage and definitions</Trans>
              </h3>
              <p>
                <Trans>
                  Recognized revenue and costs use posted service-month entries.
                  Cash collected uses actual dated receipts; receivables are
                  current outstanding balances. These are different measures and
                  are never added together.
                </Trans>
              </p>
              <p>
                <Trans>
                  On-time approval uses elapsed due dates in the selected month.
                  First-pass approval uses the first recorded review decision.
                  Employee history follows the current task assignee after
                  reassignment; it is not historic performer attribution,
                  revenue ownership or an overall performance score.
                </Trans>
              </p>
              {data.warnings.map((warning) => (
                <p key={warning}>{warningLabels[warning] ?? warning}</p>
              ))}
              {data.canReadFinance && (
                <Link
                  to={`/delivery?view=finance&financeView=monthly&financeMonth=${data.month}${data.currency ? `&financeCurrency=${data.currency}` : ''}`}
                >
                  <Trans>Review monthly source records</Trans>
                </Link>
              )}
            </StyledDeliveryStack>
          </StyledDeliveryCard>
        </>
      )}
    </StyledDeliverySectionStack>
  );
};
