import { useState } from 'react';
import { NetworkStatus } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link, useSearchParams } from 'react-router-dom';
import { fastDeepEqual, isDefined } from 'twenty-shared/utils';
import { type DeliveryFounderPerformanceQuery } from '~/generated-metadata/graphql';
import { useWorkflowAccess } from '@/delivery/workflows/useWorkflowAccess';
import { useIsMobile } from '@/ui/utilities/responsive/hooks/useIsMobile';
import {
  PRIMARY_FINANCE_CURRENCIES,
  useFinanceLabels,
} from '@/delivery/finance/useFinanceLabels';
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
import { AdminDashboardPulse } from '@/delivery/founder/performance/AdminDashboardPulse';
import { AdminCashForecastPanel } from '@/delivery/founder/performance/AdminCashForecastPanel';
import { AdminAttentionStrip } from '@/delivery/founder/performance/AdminAttentionStrip';
import { AdminGrowthHandoffCard } from '@/delivery/founder/performance/AdminGrowthHandoffCard';
import { AdminOperationsDeck } from '@/delivery/founder/performance/AdminOperationsDeck';
import { AdminSixMonthTrendPanel } from '@/delivery/founder/performance/AdminSixMonthTrendPanel';
import { AdminPipelineAndRenewalDeck } from '@/delivery/founder/performance/AdminPipelineAndRenewalDeck';
import { buildExecutiveCsv } from '@/delivery/founder/performance/admin-dashboard-metrics';
import { useAdminExecutiveSignals } from '@/delivery/founder/performance/useAdminExecutiveSignals';
import {
  handleCardSpotlightLeave,
  handleCardSpotlightMove,
} from '@/delivery/founder/performance/cardSpotlight';
import {
  StyledAdminControlRow,
  StyledAdminEyebrow,
  StyledAdminPanel,
  StyledAdminExportButton,
  StyledAdminHeroBar,
  StyledAdminHeroTop,
  StyledAdminTwoColumn,
  StyledCurrencyPill,
  StyledCurrencyPills,
  StyledDataHealthDrawer,
  StyledHeroBeam,
  StyledLiveDot,
  StyledQuickLinks,
  StyledStatusPill,
} from '@/delivery/founder/performance/adminDashboardStyles';
import {
  StyledPerformanceFilters,
  StyledPerformanceFiltersDisclosure,
} from '@/delivery/founder/performance/performanceStyles';
import {
  StyledDeliveryButton,
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

  const forecastCurrency =
    filters.currency ??
    (data?.currencies.length === 1 ? data.currencies[0].currency : null);

  const signals = useAdminExecutiveSignals({
    authorized: authorized && parsed.success && Boolean(data),
    permission,
    month: filters.month,
    timezone: filters.timezone,
    selectedCurrency: filters.currency,
    forecastCurrency,
    observedAt: data?.observedAt,
  });

  const update = (changes: Partial<PerformanceNavigationValue>) =>
    setParams(writePerformanceNavigation(params, { ...filters, ...changes }));
  const selectCurrency = (currency?: string) =>
    update({
      currency,
      afterProjectId: undefined,
      afterMemberId: undefined,
    });

  const attentionParams = new URLSearchParams({
    view: 'health',
    founderPanel: 'attention',
    founderMonth: filters.month,
  });
  if (filters.currency)
    attentionParams.set('founderCurrency', filters.currency);
  const attentionHref = `/delivery?${attentionParams}`;

  const primaryCurrencies = PRIMARY_FINANCE_CURRENCIES.filter((currency) =>
    financeLabels.currencies.includes(currency),
  );

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
      <StyledAdminPanel>
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
      </StyledAdminPanel>
    );
  if (!permission.canManageRoles)
    return (
      <StyledAdminPanel>
        <p>
          <Trans>
            Current administrator access is required for company performance.
          </Trans>
        </p>
      </StyledAdminPanel>
    );
  return (
    <StyledDeliverySectionStack>
      <StyledAdminHeroBar
        aria-label={t`Admin dashboard controls`}
        onPointerLeave={handleCardSpotlightLeave}
        onPointerMove={handleCardSpotlightMove}
      >
        <StyledHeroBeam aria-hidden="true" />
        <StyledAdminHeroTop>
          <div>
            <StyledAdminEyebrow>
              <StyledLiveDot aria-hidden="true" />
              <Trans>Company overview</Trans>
            </StyledAdminEyebrow>
            <h2>
              <Trans>Executive command center</Trans>
            </h2>
            <p>
              <Trans>
                Cash flow, 90-day forecast, delivery health, sales handoffs and
                client contribution. Currencies always remain separate.
              </Trans>
            </p>
          </div>
          <StyledQuickLinks aria-label={t`Quick admin actions`}>
            <Link to="/delivery?view=clients">
              <Trans>Clients</Trans>
            </Link>
            <Link to="/delivery?view=planner">
              <Trans>Team planner</Trans>
            </Link>
            {permission.canReadFinance && (
              <Link
                to={`/delivery?view=finance&financeView=dashboard${filters.currency ? `&financeCurrency=${filters.currency}` : ''}`}
              >
                <Trans>Cash forecast</Trans>
              </Link>
            )}
            <Link to="/delivery?view=team">
              <Trans>Team & access</Trans>
            </Link>
            {data && (
              <StyledAdminExportButton
                type="button"
                onClick={() => {
                  const csv = buildExecutiveCsv({
                    month: data.month,
                    timezone: data.timezone,
                    observedAt: data.observedAt,
                    canReadFinance: data.canReadFinance,
                    currencies: data.currencies,
                    operations: data.operations,
                    clients: data.clients,
                  });
                  const blob = new Blob([csv], {
                    type: 'text/csv;charset=utf-8',
                  });
                  const url = URL.createObjectURL(blob);
                  const anchor = document.createElement('a');
                  anchor.href = url;
                  anchor.download = `otogrow-executive-${data.month}${data.currency ? `-${data.currency}` : ''}.csv`;
                  anchor.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <Trans>Export CSV</Trans>
              </StyledAdminExportButton>
            )}
          </StyledQuickLinks>
        </StyledAdminHeroTop>

        {parsed.success && (
          <StyledAdminControlRow>
            <StyledCurrencyPills
              role="group"
              aria-label={t`Primary currency filter`}
            >
              <StyledCurrencyPill
                type="button"
                aria-pressed={!filters.currency}
                onClick={() => selectCurrency(undefined)}
              >
                <Trans>All</Trans>
              </StyledCurrencyPill>
              {primaryCurrencies.map((currency) => (
                <StyledCurrencyPill
                  key={currency}
                  type="button"
                  aria-pressed={filters.currency === currency}
                  onClick={() => selectCurrency(currency)}
                >
                  {currency}
                </StyledCurrencyPill>
              ))}
            </StyledCurrencyPills>
            {data && (
              <small>
                <Trans>Checked at</Trans>{' '}
                <time dateTime={data.observedAt}>
                  {new Date(data.observedAt).toLocaleString()}
                </time>{' '}
                · {data.timezone}
                {refreshing && (
                  <span role="status">
                    {' '}
                    ·{' '}
                    <Trans>Refreshing; showing the last verified figures</Trans>
                  </span>
                )}
              </small>
            )}
          </StyledAdminControlRow>
        )}

        {!parsed.success && (
          <>
            <p role="alert">
              <Trans>
                This performance link has invalid reporting filters. Reset them
                before reviewing figures.
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
                    'Asia/Kolkata',
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
            <StyledDeliveryButton type="submit">
              <Trans>Apply reporting period</Trans>
            </StyledDeliveryButton>
          </StyledPerformanceFilters>
        </StyledPerformanceFiltersDisclosure>
      </StyledAdminHeroBar>

      {query.error ? (
        <StyledAdminPanel>
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
        </StyledAdminPanel>
      ) : !data ? (
        <StyledAdminPanel>
          <p role="status">
            <Trans>Checking current company performance…</Trans>
          </p>
        </StyledAdminPanel>
      ) : (
        <>
          {needsCoverageReview && (
            <p role="status">
              <Trans>
                Some evidence is incomplete. Review coverage before using these
                figures for final decisions.
              </Trans>
            </p>
          )}

          <AdminDashboardPulse
            data={data}
            activeCurrency={forecastCurrency}
            forecast={signals.forecast}
            attentionCount={signals.exceptions?.totalCount ?? null}
            degradedConnectionCount={signals.degradedConnections.length}
            attentionHref={attentionHref}
          />

          <AdminAttentionStrip
            exceptions={signals.exceptions}
            degradedConnections={signals.degradedConnections}
            attentionHref={attentionHref}
            month={data.month}
            currency={filters.currency}
          />

          {data.canReadFinance ? (
            forecastCurrency ? (
              <StyledAdminTwoColumn>
                <AdminCashForecastPanel
                  currency={forecastCurrency}
                  forecast={signals.forecast}
                  loading={signals.forecastLoading}
                  error={signals.forecastError}
                />
                <PerformanceFinancialSummary
                  currencies={data.currencies}
                  month={data.month}
                  previousMonth={data.previousMonth}
                />
              </StyledAdminTwoColumn>
            ) : (
              <PerformanceFinancialSummary
                currencies={data.currencies}
                month={data.month}
                previousMonth={data.previousMonth}
              />
            )
          ) : (
            <StyledAdminPanel>
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
            </StyledAdminPanel>
          )}

          {data.canReadFinance && signals.executiveInsights && (
            <AdminSixMonthTrendPanel
              trends={signals.executiveInsights.trends}
              canReadFinance={data.canReadFinance}
              month={data.month}
            />
          )}

          {signals.executiveInsights && (
            <AdminPipelineAndRenewalDeck
              salesFunnel={signals.executiveInsights.salesFunnel}
              renewals={signals.executiveInsights.renewals}
              inboxSla={signals.executiveInsights.inboxSla}
            />
          )}

          <StyledAdminTwoColumn>
            <PerformanceOperationsSummary operations={data.operations} />
            <AdminGrowthHandoffCard
              metaLeads={signals.metaLeads}
              handoffs={signals.handoffs}
            />
          </StyledAdminTwoColumn>

          <AdminOperationsDeck
            operations={data.operations}
            capacity={signals.capacity}
            aiBudget={signals.aiBudget}
            readiness={signals.readiness}
          />

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
            onEmployeeCreated={() => query.refetch()}
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

          <StyledDataHealthDrawer open={Boolean(needsCoverageReview)}>
            <summary>
              <span>
                <Trans>Reporting coverage and definitions</Trans>
              </span>
              <StyledStatusPill
                data-tone={needsCoverageReview ? 'warning' : 'neutral'}
              >
                {needsCoverageReview
                  ? t`${data.warnings.length} coverage notes`
                  : t`${data.warnings.length} definitions`}
              </StyledStatusPill>
            </summary>
            <StyledDeliveryStack>
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
                  to={`/delivery?view=finance&financeView=dashboard&financeMonth=${data.month}${data.currency ? `&financeCurrency=${data.currency}` : ''}`}
                >
                  <Trans>Review monthly source records</Trans>
                </Link>
              )}
            </StyledDeliveryStack>
          </StyledDataHealthDrawer>
        </>
      )}
    </StyledDeliverySectionStack>
  );
};
