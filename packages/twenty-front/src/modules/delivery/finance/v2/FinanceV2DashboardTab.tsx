import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  formatFeeCadenceLabel,
  formatMoneyMinor,
  formatYearMonthLabel,
} from '@/delivery/client-workspace/client-hub-format';
import { clientWorkspaceDestination } from '@/delivery/client-workspace/client-workspace-navigation';
import {
  StyledDeliveryButton,
  StyledDeliveryRow,
} from '@/delivery/deliveryStyles';
import { formatFinanceAmountMicros } from '@/delivery/finance/finance-money';
import {
  addDaysIso,
  buildExchangeRateNote,
  convertAedMicrosToDisplay,
  detectPeriodPreset,
  formatPercentDelta,
  formatRatioPercent,
  getMonthRange,
  getQuarterRange,
  isValidYearMonth,
  shiftYearMonth,
} from '@/delivery/finance/v2/finance-v2-currency';
import {
  StyledFinanceV2ActionGroup,
  StyledFinanceV2BarFill,
  StyledFinanceV2BarTrack,
  StyledFinanceV2BreakdownButton,
  StyledFinanceV2BreakdownHeader,
  StyledFinanceV2FormGrid,
  StyledFinanceV2HeaderRow,
  StyledFinanceV2HeroGrid,
  StyledFinanceV2Notice,
  StyledFinanceV2Panel,
  StyledFinanceV2Pill,
  StyledFinanceV2SplitGrid,
  StyledFinanceV2Stack,
  StyledFinanceV2StatCard,
  StyledFinanceV2StatementRow,
  StyledFinanceV2SubTabButton,
  StyledFinanceV2SubTabs,
  StyledFinanceV2Table,
  StyledFinanceV2TableWrap,
  StyledFinanceV2TrendGrid,
  StyledFinanceV2TrendItem,
} from '@/delivery/finance/v2/finance-v2.styles';
import {
  FINANCE_V2_CURRENCIES,
  type FinanceV2CommandRunner,
  type FinanceV2Currency,
  type FinanceV2Snapshot,
} from '@/delivery/finance/v2/finance-v2.types';

type FinanceV2DashboardTabProps = {
  data: FinanceV2Snapshot;
  busy: boolean;
  displayCurrency: FinanceV2Currency;
  onChangeDisplayCurrency: (currency: FinanceV2Currency) => void;
  onSelectExpenseCategory?: (category: string) => void;
  onFilterDates: (next: {
    fromDate: string;
    toDate: string;
    asOfDate: string;
  }) => void;
  onRunCommand: FinanceV2CommandRunner;
};

export const FinanceV2DashboardTab = ({
  data,
  busy,
  displayCurrency,
  onChangeDisplayCurrency,
  onSelectExpenseCategory,
  onFilterDates,
  onRunCommand,
}: FinanceV2DashboardTabProps) => {
  const { t } = useLingui();
  const [fromDate, setFromDate] = useState(data.fromDate);
  const [toDate, setToDate] = useState(data.toDate);
  const [asOfDate, setAsOfDate] = useState(data.asOfDate);
  const [customAsOf, setCustomAsOf] = useState(data.asOfDate !== data.toDate);
  const [selectedMonth, setSelectedMonth] = useState(data.fromDate.slice(0, 7));

  const {
    profitAndLoss: pnl,
    balanceSheet: bs,
    pendingReceivables,
    analytics,
  } = data;
  const exchangeRates = data.profile.exchangeRates;

  const formatDisplay = (aedMicros: string | bigint): string =>
    formatFinanceAmountMicros(
      convertAedMicrosToDisplay(aedMicros, displayCurrency, exchangeRates),
      displayCurrency,
    );

  const totalExpenseAedMicros =
    pnl.totalExpenseAedMicros ??
    (
      BigInt(pnl.directExpenseAedMicros) + BigInt(pnl.indirectExpenseAedMicros)
    ).toString();

  const activePreset = detectPeriodPreset(
    data.fromDate,
    data.toDate,
    data.today,
  );

  const applyRange = (nextFrom: string, nextTo: string) => {
    const resolvedAsOf = customAsOf ? asOfDate : nextTo;
    setFromDate(nextFrom);
    setToDate(nextTo);
    setAsOfDate(resolvedAsOf);
    setSelectedMonth(nextFrom.slice(0, 7));
    onFilterDates({
      fromDate: nextFrom,
      toDate: nextTo,
      asOfDate: resolvedAsOf,
    });
  };

  const applyMonth = (month: string) => {
    if (!isValidYearMonth(month)) return;
    const range = getMonthRange(month);
    const nextTo = month === data.today.slice(0, 7) ? data.today : range.toDate;
    applyRange(range.fromDate, nextTo);
  };

  const categoryLabel = (category: string): string => {
    switch (category) {
      case 'DIRECT_SUBSCRIPTION':
        return t`Subscriptions & tools`;
      case 'DIRECT_SALARY':
        return t`Team base salaries`;
      case 'DIRECT_CONTRACTOR':
        return t`Freelancers & contractors`;
      case 'DIRECT_AI':
        return t`AI production spend`;
      case 'DIRECT_OTHER':
        return t`Other direct expenses`;
      case 'PAYROLL_OVERTIME':
        return t`Payroll overtime`;
      case 'PAYROLL_LEAVE_REDUCTION':
        return t`Payroll unpaid leave reductions`;
      case 'PAYROLL_BONUS':
        return t`Payroll bonuses`;
      case 'INDIRECT_MEALS':
        return t`Team meals`;
      case 'INDIRECT_COURSES':
        return t`Courses & training`;
      case 'INDIRECT_OFFICE':
        return t`Office & utilities`;
      case 'INDIRECT_ADMIN':
        return t`Admin, legal & banking`;
      case 'INDIRECT_OTHER':
        return t`Other indirect expenses`;
      default:
        return category;
    }
  };

  const agingLabel = (
    key: 'NOT_DUE' | 'DAYS_1_15' | 'DAYS_16_30' | 'DAYS_31_PLUS',
  ): string => {
    switch (key) {
      case 'NOT_DUE':
        return t`Not yet due`;
      case 'DAYS_1_15':
        return t`1–15 days overdue`;
      case 'DAYS_16_30':
        return t`16–30 days overdue`;
      case 'DAYS_31_PLUS':
        return t`31+ days overdue`;
    }
  };

  const revenueDelta = analytics
    ? formatPercentDelta(
        pnl.revenueAedMicros,
        analytics.previousPeriod.revenueAedMicros,
      )
    : null;
  const expenseDelta = analytics
    ? formatPercentDelta(
        totalExpenseAedMicros,
        analytics.previousPeriod.totalExpenseAedMicros,
      )
    : null;
  const grossDelta = analytics
    ? formatPercentDelta(
        pnl.grossProfitAedMicros,
        analytics.previousPeriod.grossProfitAedMicros,
      )
    : null;
  const netDelta = analytics
    ? formatPercentDelta(
        pnl.netProfitAedMicros,
        analytics.previousPeriod.netProfitAedMicros,
      )
    : null;

  const combinedExpenseBreakdown = [
    ...pnl.directBreakdown.map((item) => ({
      ...item,
      group: 'DIRECT' as const,
    })),
    ...pnl.indirectBreakdown.map((item) => ({
      ...item,
      group: 'INDIRECT' as const,
    })),
  ].sort((left, right) => {
    const leftVal = BigInt(left.aedMicros);
    const rightVal = BigInt(right.aedMicros);
    const leftAbs = leftVal < 0n ? -leftVal : leftVal;
    const rightAbs = rightVal < 0n ? -rightVal : rightVal;
    return rightAbs > leftAbs ? 1 : rightAbs < leftAbs ? -1 : 0;
  });

  const totalExpenseBig = BigInt(totalExpenseAedMicros);
  const totalRevenueBig = BigInt(pnl.revenueAedMicros);
  const maxCategoryAbs = combinedExpenseBreakdown.reduce((max, item) => {
    const raw = BigInt(item.aedMicros);
    const abs = raw < 0n ? -raw : raw;
    return abs > max ? abs : max;
  }, 0n);
  const breakdownBarDenominator =
    totalExpenseBig > 0n ? totalExpenseBig : maxCategoryAbs;
  const fxNote = buildExchangeRateNote([], displayCurrency, exchangeRates);
  const safeSelectedMonth = isValidYearMonth(selectedMonth)
    ? selectedMonth
    : data.fromDate.slice(0, 7);

  const trendPoints = analytics?.monthlyTrend ?? [];
  const maxTrendMagnitude = trendPoints.reduce((max, point) => {
    const rev = BigInt(point.revenueAedMicros);
    const exp = BigInt(point.totalExpenseAedMicros);
    const revAbs = rev < 0n ? -rev : rev;
    const expAbs = exp < 0n ? -exp : exp;
    const larger = revAbs > expAbs ? revAbs : expAbs;
    return larger > max ? larger : max;
  }, 0n);

  const barPercent = (value: string, max: bigint): number => {
    if (max <= 0n) return 0;
    const raw = BigInt(value);
    const abs = raw < 0n ? -raw : raw;
    const pct = Number((abs * 100n) / max);
    return Math.min(100, Math.max(abs > 0n ? 4 : 0, pct));
  };

  return (
    <StyledFinanceV2Stack>
      <StyledFinanceV2Panel>
        <StyledFinanceV2HeaderRow>
          <div>
            <h2>{t`Financial Overview (${displayCurrency})`}</h2>
            <small>
              {displayCurrency === 'AED' ? (
                <Trans>
                  All currencies automatically roll up into AED. Revenue counts
                  when client payments arrive.
                </Trans>
              ) : (
                t`Canonical ledger is in AED, displayed in ${displayCurrency} via workspace FX (${fxNote}).`
              )}
            </small>
          </div>
          <StyledFinanceV2ActionGroup>
            <label>
              <Trans>Display currency</Trans>
              <select
                aria-label={t`Dashboard display currency`}
                value={displayCurrency}
                onChange={(event) =>
                  onChangeDisplayCurrency(
                    event.target.value as FinanceV2Currency,
                  )
                }
              >
                {FINANCE_V2_CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
            {data.canManage && data.canViewPayroll && (
              <StyledDeliveryButton
                disabled={busy}
                onClick={() =>
                  void onRunCommand({
                    action: 'runDueAutomation',
                    asOfDate: data.today,
                  })
                }
              >
                <Trans>Run due recurring items now</Trans>
              </StyledDeliveryButton>
            )}
          </StyledFinanceV2ActionGroup>
        </StyledFinanceV2HeaderRow>

        <StyledFinanceV2HeaderRow>
          <StyledFinanceV2SubTabs>
            <StyledFinanceV2SubTabButton
              type="button"
              aria-pressed={activePreset === 'thisMonth'}
              data-active={activePreset === 'thisMonth' ? 'true' : undefined}
              onClick={() => {
                const currentMonth = data.today.slice(0, 7);
                applyRange(`${currentMonth}-01`, data.today);
              }}
            >
              <Trans>This Month</Trans>
            </StyledFinanceV2SubTabButton>
            <StyledFinanceV2SubTabButton
              type="button"
              aria-pressed={activePreset === 'lastMonth'}
              data-active={activePreset === 'lastMonth' ? 'true' : undefined}
              onClick={() =>
                applyMonth(shiftYearMonth(data.today.slice(0, 7), -1))
              }
            >
              <Trans>Last Month</Trans>
            </StyledFinanceV2SubTabButton>
            <StyledFinanceV2SubTabButton
              type="button"
              aria-pressed={activePreset === 'last30Days'}
              data-active={activePreset === 'last30Days' ? 'true' : undefined}
              onClick={() =>
                applyRange(addDaysIso(data.today, -29), data.today)
              }
            >
              <Trans>Last 30 Days</Trans>
            </StyledFinanceV2SubTabButton>
            <StyledFinanceV2SubTabButton
              type="button"
              aria-pressed={activePreset === 'thisQuarter'}
              data-active={activePreset === 'thisQuarter' ? 'true' : undefined}
              onClick={() => {
                const q = getQuarterRange(data.today);
                applyRange(q.fromDate, q.toDate);
              }}
            >
              <Trans>This Quarter</Trans>
            </StyledFinanceV2SubTabButton>
            <StyledFinanceV2SubTabButton
              type="button"
              aria-pressed={activePreset === 'ytd'}
              data-active={activePreset === 'ytd' ? 'true' : undefined}
              onClick={() =>
                applyRange(`${data.today.slice(0, 4)}-01-01`, data.today)
              }
            >
              <Trans>Year to Date</Trans>
            </StyledFinanceV2SubTabButton>
            <StyledFinanceV2SubTabButton
              type="button"
              aria-pressed={activePreset === 'allTime'}
              data-active={activePreset === 'allTime' ? 'true' : undefined}
              onClick={() => applyRange('2000-01-01', data.today)}
            >
              <Trans>All Time</Trans>
            </StyledFinanceV2SubTabButton>
          </StyledFinanceV2SubTabs>

          <StyledFinanceV2ActionGroup>
            <StyledDeliveryButton
              type="button"
              aria-label={t`Previous month`}
              onClick={() => applyMonth(shiftYearMonth(safeSelectedMonth, -1))}
            >
              ←
            </StyledDeliveryButton>
            <label>
              <Trans>Month</Trans>
              <input
                type="month"
                aria-label={t`Report month`}
                value={selectedMonth}
                onChange={(event) => {
                  setSelectedMonth(event.target.value);
                  if (isValidYearMonth(event.target.value)) {
                    applyMonth(event.target.value);
                  }
                }}
              />
            </label>
            <StyledDeliveryButton
              type="button"
              aria-label={t`Next month`}
              onClick={() => applyMonth(shiftYearMonth(safeSelectedMonth, 1))}
            >
              →
            </StyledDeliveryButton>
          </StyledFinanceV2ActionGroup>
        </StyledFinanceV2HeaderRow>

        <StyledFinanceV2FormGrid>
          <label>
            <Trans>P&amp;L from</Trans>
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </label>
          <label>
            <Trans>P&amp;L to</Trans>
            <input
              type="date"
              value={toDate}
              onChange={(event) => {
                setToDate(event.target.value);
                if (!customAsOf) setAsOfDate(event.target.value);
              }}
            />
          </label>
          <label>
            <Trans>Balance sheet as of</Trans>
            <input
              type="date"
              value={customAsOf ? asOfDate : toDate}
              disabled={!customAsOf}
              onChange={(event) => setAsOfDate(event.target.value)}
            />
          </label>
          <label style={{ alignSelf: 'end' }}>
            <input
              type="checkbox"
              checked={customAsOf}
              onChange={(event) => {
                setCustomAsOf(event.target.checked);
                if (!event.target.checked) setAsOfDate(toDate);
              }}
            />
            <Trans>Custom balance sheet date</Trans>
          </label>
          <div style={{ alignSelf: 'end' }}>
            <StyledDeliveryButton
              data-primary="true"
              disabled={busy}
              onClick={() =>
                onFilterDates({
                  fromDate,
                  toDate,
                  asOfDate: customAsOf ? asOfDate : toDate,
                })
              }
            >
              <Trans>Update reports</Trans>
            </StyledDeliveryButton>
          </div>
        </StyledFinanceV2FormGrid>
      </StyledFinanceV2Panel>

      <StyledFinanceV2HeroGrid>
        <StyledFinanceV2StatCard data-highlight="true">
          <small>{t`Total Revenue (${pnl.fromDate} → ${pnl.toDate})`}</small>
          <strong>{formatDisplay(pnl.revenueAedMicros)}</strong>
          <p>
            {revenueDelta
              ? t`${revenueDelta.label} vs previous period`
              : t`Paid client invoices in range`}
          </p>
        </StyledFinanceV2StatCard>

        <StyledFinanceV2StatCard>
          <small>{t`Total Expenses (${pnl.fromDate} → ${pnl.toDate})`}</small>
          <strong>{formatDisplay(totalExpenseAedMicros)}</strong>
          <p>
            {t`Direct ${formatDisplay(pnl.directExpenseAedMicros)} · Indirect ${formatDisplay(pnl.indirectExpenseAedMicros)}`}
            {expenseDelta ? ` (${expenseDelta.label} prev)` : ''}
          </p>
        </StyledFinanceV2StatCard>

        <StyledFinanceV2StatCard>
          <small>
            <Trans>Gross Profit &amp; Margin</Trans>
          </small>
          <strong>{formatDisplay(pnl.grossProfitAedMicros)}</strong>
          <p>
            {pnl.grossMarginPercent !== null
              ? t`Gross margin ${pnl.grossMarginPercent}%${grossDelta ? ` · ${grossDelta.label} prev` : ''}`
              : t`No paid revenue in this period`}
          </p>
        </StyledFinanceV2StatCard>

        <StyledFinanceV2StatCard>
          <small>{t`Net Profit & Margin (${pnl.fromDate} → ${pnl.toDate})`}</small>
          <strong>{formatDisplay(pnl.netProfitAedMicros)}</strong>
          <p>
            {pnl.netMarginPercent !== null
              ? t`Net margin ${pnl.netMarginPercent}%${netDelta ? ` · ${netDelta.label} prev` : ''}`
              : t`No paid revenue in this period`}
          </p>
        </StyledFinanceV2StatCard>

        <StyledFinanceV2StatCard>
          <small>{t`Company Cash (${displayCurrency} total)`}</small>
          <strong>{formatDisplay(bs.totalCashAedMicros)}</strong>
          <p>
            {bs.cashByCurrency.length > 0
              ? bs.cashByCurrency
                  .map((item) =>
                    formatFinanceAmountMicros(
                      item.originalMicros,
                      item.currency,
                    ),
                  )
                  .join(' · ')
              : t`Set opening cash in Setup`}
          </p>
        </StyledFinanceV2StatCard>

        <StyledFinanceV2StatCard>
          <small>
            <Trans>Unpaid Client Invoices</Trans>
          </small>
          <strong>{formatDisplay(pendingReceivables.totalAedMicros)}</strong>
          <p>
            {pendingReceivables.overdueCount > 0
              ? t`${pendingReceivables.overdueCount} overdue (${formatDisplay(pendingReceivables.overdueAedMicros)})`
              : t`${pendingReceivables.count} unpaid · none overdue`}
          </p>
        </StyledFinanceV2StatCard>

        {analytics?.projectedMrr && (
          <StyledFinanceV2StatCard data-highlight="true">
            <small>
              {t`Projected MRR (${formatYearMonthLabel(analytics.projectedMrr.month)})`}
            </small>
            <strong>
              {formatDisplay(analytics.projectedMrr.projectedMrrAedMicros)}
            </strong>
            <p>
              {analytics.projectedMrr.mrrClientCount > 0
                ? t`${analytics.projectedMrr.collectionPercent}% collected (${formatDisplay(analytics.projectedMrr.collectedTowardMrrAedMicros)}) · ${formatDisplay(analytics.projectedMrr.remainingAedMicros)} remaining`
                : analytics.projectedMrr.oneTime.clientCount > 0
                  ? t`${analytics.projectedMrr.oneTime.clientCount} one-time agreed fees (excluded from MRR)`
                  : t`Set agreed client fees in Clients to project monthly MRR`}
            </p>
          </StyledFinanceV2StatCard>
        )}

        <StyledFinanceV2StatCard>
          <small>
            <Trans>Owed to People (Liabilities)</Trans>
          </small>
          <strong>{formatDisplay(bs.totalLiabilitiesAedMicros)}</strong>
          <p>{t`${bs.liabilitiesByPerson.length} people tracked`}</p>
        </StyledFinanceV2StatCard>
      </StyledFinanceV2HeroGrid>

      {analytics?.projectedMrr && (
        <StyledFinanceV2Panel
          aria-label={t`Current month projected MRR breakdown`}
        >
          <StyledFinanceV2HeaderRow>
            <div>
              <h3>
                {t`Projected MRR · ${formatYearMonthLabel(analytics.projectedMrr.month)} (${displayCurrency})`}
              </h3>
              <small>
                <Trans>
                  Monthly retainers count at 100%, quarterly retainers at 1/3
                  per month, and one-time fees are tracked separately below.
                </Trans>
              </small>
            </div>
            <StyledFinanceV2ActionGroup>
              {analytics.projectedMrr.mrrClientCount > 0 && (
                <>
                  <StyledFinanceV2Pill data-tone="success">
                    {t`${analytics.projectedMrr.paidClientCount} paid`}
                  </StyledFinanceV2Pill>
                  <StyledFinanceV2Pill data-tone="warning">
                    {t`${analytics.projectedMrr.partialClientCount} partial`}
                  </StyledFinanceV2Pill>
                  <StyledFinanceV2Pill data-tone="danger">
                    {t`${analytics.projectedMrr.unpaidClientCount} unpaid`}
                  </StyledFinanceV2Pill>
                </>
              )}
              <Link to="/delivery?view=clients">
                <Trans>Manage client fees →</Trans>
              </Link>
            </StyledFinanceV2ActionGroup>
          </StyledFinanceV2HeaderRow>

          {analytics.projectedMrr.mrrClientCount > 0 ? (
            <>
              <StyledFinanceV2HeroGrid>
                <StyledFinanceV2StatCard>
                  <small>
                    <Trans>Projected MRR</Trans>
                  </small>
                  <strong>
                    {formatDisplay(
                      analytics.projectedMrr.projectedMrrAedMicros,
                    )}
                  </strong>
                  <p>
                    {analytics.projectedMrr.byCurrency
                      .map(
                        (item) =>
                          `${formatMoneyMinor(item.projectedMrrMinor, item.currency)}/mo`,
                      )
                      .join(' · ')}
                  </p>
                </StyledFinanceV2StatCard>
                <StyledFinanceV2StatCard>
                  <small>
                    <Trans>Collected This Month (toward MRR)</Trans>
                  </small>
                  <strong>
                    {formatDisplay(
                      analytics.projectedMrr.collectedTowardMrrAedMicros,
                    )}
                  </strong>
                  <p>
                    {t`${analytics.projectedMrr.collectionPercent}% of ${formatYearMonthLabel(analytics.projectedMrr.month)} MRR`}
                  </p>
                </StyledFinanceV2StatCard>
                <StyledFinanceV2StatCard>
                  <small>
                    <Trans>Remaining to Collect</Trans>
                  </small>
                  <strong>
                    {formatDisplay(analytics.projectedMrr.remainingAedMicros)}
                  </strong>
                  <p>
                    {analytics.projectedMrr.unpaidClientCount +
                      analytics.projectedMrr.partialClientCount ===
                    0
                      ? t`All recurring clients paid this month`
                      : t`${analytics.projectedMrr.unpaidClientCount + analytics.projectedMrr.partialClientCount} clients with balance due`}
                  </p>
                </StyledFinanceV2StatCard>
                {analytics.projectedMrr.oneTime.clientCount > 0 && (
                  <StyledFinanceV2StatCard>
                    <small>
                      <Trans>One-Time Agreed Fees (Excl. MRR)</Trans>
                    </small>
                    <strong>
                      {formatDisplay(
                        analytics.projectedMrr.oneTime.totalAedMicros,
                      )}
                    </strong>
                    <p>
                      {analytics.projectedMrr.oneTime.byCurrency
                        .map((item) =>
                          formatMoneyMinor(item.amountMinor, item.currency),
                        )
                        .join(' · ')}
                    </p>
                  </StyledFinanceV2StatCard>
                )}
              </StyledFinanceV2HeroGrid>

              <StyledFinanceV2BarTrack
                role="progressbar"
                aria-label={t`Current month projected MRR collection progress`}
                aria-valuenow={analytics.projectedMrr.collectionPercent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <StyledFinanceV2BarFill
                  data-tone={
                    analytics.projectedMrr.collectionPercent >= 100
                      ? 'success'
                      : analytics.projectedMrr.collectionPercent > 0
                        ? 'warning'
                        : undefined
                  }
                  style={{
                    width: `${analytics.projectedMrr.collectionPercent}%`,
                  }}
                />
              </StyledFinanceV2BarTrack>

              <StyledFinanceV2TableWrap>
                <StyledFinanceV2Table>
                  <thead>
                    <tr>
                      <th>
                        <Trans>Client</Trans>
                      </th>
                      <th>
                        <Trans>Cadence</Trans>
                      </th>
                      <th data-numeric="true">
                        <Trans>Agreed Fee</Trans>
                      </th>
                      <th data-numeric="true">
                        {t`Monthly MRR (${displayCurrency})`}
                      </th>
                      <th data-numeric="true">
                        {t`Collected (${displayCurrency})`}
                      </th>
                      <th data-numeric="true">
                        {t`Remaining (${displayCurrency})`}
                      </th>
                      <th>
                        <Trans>Status</Trans>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.projectedMrr.clients.map((row) => (
                      <tr key={row.companyId}>
                        <td>
                          <Link
                            to={clientWorkspaceDestination({
                              companyId: row.companyId,
                              section: 'overview',
                            })}
                          >
                            {row.companyName}
                          </Link>
                        </td>
                        <td>{formatFeeCadenceLabel(row.cadence)}</td>
                        <td data-numeric="true">
                          {formatMoneyMinor(row.agreedFeeMinor, row.currency)}
                          {row.cadence === 'QUARTERLY'
                            ? ` (${formatMoneyMinor(row.monthlyEquivalentMinor, row.currency)}/mo)`
                            : ''}
                        </td>
                        <td data-numeric="true">
                          {formatDisplay(row.monthlyEquivalentAedMicros)}
                        </td>
                        <td data-numeric="true">
                          {formatDisplay(row.collectedThisMonthAedMicros)}
                        </td>
                        <td data-numeric="true">
                          {formatDisplay(row.remainingAedMicros)}
                        </td>
                        <td>
                          <StyledFinanceV2Pill
                            data-tone={
                              row.status === 'PAID'
                                ? 'success'
                                : row.status === 'PARTIAL'
                                  ? 'warning'
                                  : 'danger'
                            }
                          >
                            {row.status === 'PAID'
                              ? t`Paid`
                              : row.status === 'PARTIAL'
                                ? t`Partial (${row.collectionPercent}%)`
                                : t`Unpaid`}
                          </StyledFinanceV2Pill>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </StyledFinanceV2Table>
              </StyledFinanceV2TableWrap>
            </>
          ) : (
            <StyledFinanceV2Notice>
              {analytics.projectedMrr.oneTime.clientCount > 0
                ? t`No monthly or quarterly retainers configured yet. ${analytics.projectedMrr.oneTime.clientCount} one-time agreed fees totaling ${formatDisplay(analytics.projectedMrr.oneTime.totalAedMicros)} (${analytics.projectedMrr.oneTime.byCurrency.map((item) => formatMoneyMinor(item.amountMinor, item.currency)).join(' · ')}) are tracked outside MRR.`
                : t`No agreed client fees set yet. Save a Monthly or Quarterly agreed fee on any client to track Projected MRR and collection progress for ${formatYearMonthLabel(analytics.projectedMrr.month)}.`}
            </StyledFinanceV2Notice>
          )}
        </StyledFinanceV2Panel>
      )}

      {analytics && (
        <StyledFinanceV2SplitGrid>
          <StyledFinanceV2Panel>
            <StyledFinanceV2HeaderRow>
              <div>
                <h3>{t`6-Month Performance Trend (${displayCurrency})`}</h3>
                <small>
                  <Trans>
                    Monthly paid revenue vs total expenses and net margin.
                  </Trans>
                </small>
              </div>
              <StyledFinanceV2ActionGroup>
                <StyledFinanceV2Pill data-tone="success">
                  <Trans>Revenue</Trans>
                </StyledFinanceV2Pill>
                <StyledFinanceV2Pill data-tone="danger">
                  <Trans>Expenses</Trans>
                </StyledFinanceV2Pill>
              </StyledFinanceV2ActionGroup>
            </StyledFinanceV2HeaderRow>
            <StyledFinanceV2TrendGrid>
              {trendPoints.map((point) => {
                const revPct = barPercent(
                  point.revenueAedMicros,
                  maxTrendMagnitude,
                );
                const expPct = barPercent(
                  point.totalExpenseAedMicros,
                  maxTrendMagnitude,
                );
                const isPositiveProfit = BigInt(point.netProfitAedMicros) > 0n;
                return (
                  <StyledFinanceV2TrendItem key={point.month}>
                    <div
                      aria-hidden="true"
                      style={{
                        display: 'flex',
                        alignItems: 'flex-end',
                        gap: '4px',
                        height: '88px',
                        width: '100%',
                        justifyContent: 'center',
                      }}
                    >
                      <div
                        title={`${point.month} Revenue: ${formatDisplay(point.revenueAedMicros)}`}
                        style={{
                          width: '16px',
                          height: `${revPct}%`,
                          borderRadius: '4px 4px 0 0',
                          background: 'var(--t-color-green9)',
                        }}
                      />
                      <div
                        title={`${point.month} Expenses: ${formatDisplay(point.totalExpenseAedMicros)}`}
                        style={{
                          width: '16px',
                          height: `${expPct}%`,
                          borderRadius: '4px 4px 0 0',
                          background: 'var(--t-color-red9)',
                        }}
                      />
                    </div>
                    <strong>{point.month}</strong>
                    <small>
                      {isPositiveProfit ? '+' : ''}
                      {formatDisplay(point.netProfitAedMicros)}
                    </small>
                    <small>
                      {point.netMarginPercent !== null
                        ? `${point.netMarginPercent}%`
                        : '—'}
                    </small>
                  </StyledFinanceV2TrendItem>
                );
              })}
            </StyledFinanceV2TrendGrid>
            <StyledFinanceV2TableWrap>
              <StyledFinanceV2Table>
                <thead>
                  <tr>
                    <th>
                      <Trans>Month</Trans>
                    </th>
                    <th data-numeric="true">
                      <Trans>Revenue</Trans>
                    </th>
                    <th data-numeric="true">
                      <Trans>Expenses</Trans>
                    </th>
                    <th data-numeric="true">
                      <Trans>Net Profit</Trans>
                    </th>
                    <th data-numeric="true">
                      <Trans>Margin</Trans>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {trendPoints.map((point) => (
                    <tr key={point.month}>
                      <td>{point.month}</td>
                      <td data-numeric="true">
                        {formatDisplay(point.revenueAedMicros)}
                      </td>
                      <td data-numeric="true">
                        {formatDisplay(point.totalExpenseAedMicros)}
                      </td>
                      <td data-numeric="true">
                        {formatDisplay(point.netProfitAedMicros)}
                      </td>
                      <td data-numeric="true">
                        {point.netMarginPercent !== null
                          ? `${point.netMarginPercent}%`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </StyledFinanceV2Table>
            </StyledFinanceV2TableWrap>
          </StyledFinanceV2Panel>

          <StyledFinanceV2Panel>
            <StyledFinanceV2HeaderRow>
              <div>
                <h3>{t`Expense Breakdown (${displayCurrency})`}</h3>
                <small>
                  <Trans>
                    Share of total expenses and paid revenue. Click a category
                    to inspect ledger entries.
                  </Trans>
                </small>
              </div>
              <StyledFinanceV2Pill data-tone="info">
                {formatDisplay(totalExpenseAedMicros)}
              </StyledFinanceV2Pill>
            </StyledFinanceV2HeaderRow>
            {combinedExpenseBreakdown.length === 0 ? (
              <small>
                <Trans>No posted expenses in this period.</Trans>
              </small>
            ) : (
              combinedExpenseBreakdown.map((item) => {
                const shareOfExpenses = formatRatioPercent(
                  item.aedMicros,
                  totalExpenseBig,
                );
                const shareOfRevenue = formatRatioPercent(
                  item.aedMicros,
                  totalRevenueBig,
                );
                const isCredit = BigInt(item.aedMicros) < 0n;
                const fillPct = barPercent(
                  item.aedMicros,
                  breakdownBarDenominator,
                );
                return (
                  <StyledFinanceV2BreakdownButton
                    key={`${item.group}:${item.category}`}
                    type="button"
                    onClick={() => onSelectExpenseCategory?.(item.category)}
                  >
                    <StyledFinanceV2BreakdownHeader>
                      <span>
                        <strong>{categoryLabel(item.category)}</strong>{' '}
                        <small>
                          ({item.group === 'DIRECT' ? t`Direct` : t`Indirect`})
                        </small>
                      </span>
                      <span>
                        <strong>{formatDisplay(item.aedMicros)}</strong>{' '}
                        <small>
                          {shareOfExpenses !== null
                            ? `${shareOfExpenses}%`
                            : '0%'}
                          {shareOfRevenue !== null
                            ? ` · ${shareOfRevenue}% rev`
                            : ''}
                        </small>
                      </span>
                    </StyledFinanceV2BreakdownHeader>
                    <StyledFinanceV2BarTrack>
                      <StyledFinanceV2BarFill
                        data-tone={
                          isCredit
                            ? 'success'
                            : item.group === 'DIRECT'
                              ? 'warning'
                              : undefined
                        }
                        style={{ width: `${fillPct}%` }}
                      />
                    </StyledFinanceV2BarTrack>
                  </StyledFinanceV2BreakdownButton>
                );
              })
            )}
          </StyledFinanceV2Panel>
        </StyledFinanceV2SplitGrid>
      )}

      {analytics && (
        <StyledFinanceV2HeroGrid>
          <StyledFinanceV2StatCard>
            <small>
              <Trans>Cash Flow &amp; Runway</Trans>
            </small>
            <strong>
              {analytics.burnAndRunway.estimatedRunwayMonths !== null
                ? t`${analytics.burnAndRunway.estimatedRunwayMonths} mo runway`
                : analytics.burnAndRunway.avgMonthlyExpense3mAedMicros ===
                      '0' &&
                    analytics.burnAndRunway.periodNetCashFlowAedMicros === '0'
                  ? t`No burn recorded`
                  : t`Cash-flow positive`}
            </strong>
            <p>
              {t`Period net cash flow: ${formatDisplay(analytics.burnAndRunway.periodNetCashFlowAedMicros)}`}
            </p>
            <p>
              {t`3-mo avg spend: ${formatDisplay(analytics.burnAndRunway.avgMonthlyExpense3mAedMicros)}/mo`}
              {BigInt(analytics.burnAndRunway.avgMonthlyNetBurn3mAedMicros) > 0n
                ? ` · ${t`Burn ${formatDisplay(analytics.burnAndRunway.avgMonthlyNetBurn3mAedMicros)}/mo`}`
                : ''}
            </p>
          </StyledFinanceV2StatCard>

          <StyledFinanceV2StatCard>
            <small>
              {t`Next 30 Days Commitments (${analytics.upcomingCommitments30d.windowStart} → ${analytics.upcomingCommitments30d.windowEnd})`}
            </small>
            <strong>
              {formatDisplay(
                (
                  BigInt(
                    analytics.upcomingCommitments30d.recurringExpensesAedMicros,
                  ) +
                  BigInt(analytics.upcomingCommitments30d.payrollAedMicros ?? 0)
                ).toString(),
              )}
            </strong>
            <p>
              {t`Recurring bills (${analytics.upcomingCommitments30d.recurringExpenseCount}): ${formatDisplay(analytics.upcomingCommitments30d.recurringExpensesAedMicros)}`}
              {analytics.upcomingCommitments30d.payrollAedMicros !== null
                ? ` · ${t`Payroll (${analytics.upcomingCommitments30d.payrollCount ?? 0}): ${formatDisplay(analytics.upcomingCommitments30d.payrollAedMicros)}`}`
                : ''}
            </p>
            <p>
              {t`Expected receivables (${analytics.upcomingCommitments30d.expectedReceivableCount}): ${formatDisplay(analytics.upcomingCommitments30d.expectedReceivablesAedMicros)}`}
            </p>
          </StyledFinanceV2StatCard>

          <StyledFinanceV2StatCard>
            <small>
              <Trans>Invoice Aging Buckets</Trans>
            </small>
            <strong>{formatDisplay(pendingReceivables.totalAedMicros)}</strong>
            {analytics.invoiceAging.map((bucket) => (
              <p key={bucket.key}>
                {agingLabel(bucket.key)}: {bucket.count} ·{' '}
                {formatDisplay(bucket.aedMicros)}
              </p>
            ))}
          </StyledFinanceV2StatCard>
        </StyledFinanceV2HeroGrid>
      )}

      <StyledFinanceV2SplitGrid>
        <StyledFinanceV2Panel>
          <StyledFinanceV2HeaderRow>
            <h3>{t`Profit & Loss (${displayCurrency})`}</h3>
            <StyledFinanceV2Pill data-tone="info">
              {pnl.fromDate} → {pnl.toDate}
            </StyledFinanceV2Pill>
          </StyledFinanceV2HeaderRow>

          <StyledFinanceV2StatementRow data-bold="true">
            <span>
              <Trans>Revenue (paid invoices)</Trans>
            </span>
            <span>{formatDisplay(pnl.revenueAedMicros)}</span>
          </StyledFinanceV2StatementRow>

          <small>
            <Trans>Direct Expenses</Trans>
          </small>
          {pnl.directBreakdown.length === 0 ? (
            <small>
              <Trans>No direct expenses in this period.</Trans>
            </small>
          ) : (
            pnl.directBreakdown.map((item) => (
              <StyledFinanceV2StatementRow key={item.category}>
                <span>{categoryLabel(item.category)}</span>
                <span>{formatDisplay(item.aedMicros)}</span>
              </StyledFinanceV2StatementRow>
            ))
          )}
          <StyledFinanceV2StatementRow data-bold="true">
            <span>
              <Trans>Total Direct Expenses</Trans>
            </span>
            <span>{formatDisplay(pnl.directExpenseAedMicros)}</span>
          </StyledFinanceV2StatementRow>

          <StyledFinanceV2StatementRow data-bold="true">
            <span>
              {pnl.grossMarginPercent !== null
                ? t`Gross Profit (${pnl.grossMarginPercent}%)`
                : t`Gross Profit`}
            </span>
            <span>{formatDisplay(pnl.grossProfitAedMicros)}</span>
          </StyledFinanceV2StatementRow>

          <small>
            <Trans>Indirect Expenses</Trans>
          </small>
          {pnl.indirectBreakdown.length === 0 ? (
            <small>
              <Trans>No indirect expenses in this period.</Trans>
            </small>
          ) : (
            pnl.indirectBreakdown.map((item) => (
              <StyledFinanceV2StatementRow key={item.category}>
                <span>{categoryLabel(item.category)}</span>
                <span>{formatDisplay(item.aedMicros)}</span>
              </StyledFinanceV2StatementRow>
            ))
          )}
          <StyledFinanceV2StatementRow data-bold="true">
            <span>
              <Trans>Total Indirect Expenses</Trans>
            </span>
            <span>{formatDisplay(pnl.indirectExpenseAedMicros)}</span>
          </StyledFinanceV2StatementRow>

          <StyledFinanceV2StatementRow data-bold="true">
            <span>
              <Trans>Total Expenses (Direct + Indirect)</Trans>
            </span>
            <span>{formatDisplay(totalExpenseAedMicros)}</span>
          </StyledFinanceV2StatementRow>

          {pnl.fxGainLossAedMicros !== '0' && (
            <StyledFinanceV2StatementRow>
              <span>
                <Trans>Currency Exchange Gain / Loss</Trans>
              </span>
              <span>{formatDisplay(pnl.fxGainLossAedMicros)}</span>
            </StyledFinanceV2StatementRow>
          )}

          <StyledFinanceV2StatementRow data-bold="true">
            <span>
              {pnl.netMarginPercent !== null
                ? t`Net Profit (${pnl.netMarginPercent}%)`
                : t`Net Profit`}
            </span>
            <span>{formatDisplay(pnl.netProfitAedMicros)}</span>
          </StyledFinanceV2StatementRow>
        </StyledFinanceV2Panel>

        <StyledFinanceV2Panel>
          <StyledFinanceV2HeaderRow>
            <h3>{t`Balance Sheet (${displayCurrency})`}</h3>
            <StyledDeliveryRow>
              <StyledFinanceV2Pill
                data-tone={bs.isBalanced ? 'success' : 'danger'}
              >
                {bs.isBalanced ? t`Balanced ✓` : t`Check imbalance`}
              </StyledFinanceV2Pill>
              <StyledFinanceV2Pill>{bs.asOfDate}</StyledFinanceV2Pill>
            </StyledDeliveryRow>
          </StyledFinanceV2HeaderRow>

          <small>
            <Trans>Assets</Trans>
          </small>
          {bs.cashByCurrency.map((cash) => (
            <StyledFinanceV2StatementRow key={cash.accountId}>
              <span>
                {t`Company Cash (${cash.currency})`} ·{' '}
                {formatFinanceAmountMicros(cash.originalMicros, cash.currency)}
              </span>
              <span>{formatDisplay(cash.aedMicros)}</span>
            </StyledFinanceV2StatementRow>
          ))}
          <StyledFinanceV2StatementRow>
            <span>
              <Trans>Equipment &amp; Assets (purchase value)</Trans>
            </span>
            <span>{formatDisplay(bs.fixedAssetsAedMicros)}</span>
          </StyledFinanceV2StatementRow>
          <StyledFinanceV2StatementRow data-bold="true">
            <span>
              <Trans>Total Assets</Trans>
            </span>
            <span>{formatDisplay(bs.totalAssetsAedMicros)}</span>
          </StyledFinanceV2StatementRow>

          <small>
            <Trans>Liabilities (Owed to People)</Trans>
          </small>
          {bs.liabilitiesByPerson.length === 0 ? (
            <small>
              <Trans>No amounts owed to people.</Trans>
            </small>
          ) : (
            bs.liabilitiesByPerson.map((person) => (
              <StyledFinanceV2StatementRow key={person.accountId}>
                <span>{t`Owed to ${person.personName}`}</span>
                <span>{formatDisplay(person.balanceOwedAedMicros)}</span>
              </StyledFinanceV2StatementRow>
            ))
          )}
          <StyledFinanceV2StatementRow data-bold="true">
            <span>
              <Trans>Total Liabilities</Trans>
            </span>
            <span>{formatDisplay(bs.totalLiabilitiesAedMicros)}</span>
          </StyledFinanceV2StatementRow>

          <small>
            <Trans>Equity</Trans>
          </small>
          <StyledFinanceV2StatementRow>
            <span>
              <Trans>Opening Accumulated Profits</Trans>
            </span>
            <span>{formatDisplay(bs.openingEquityAedMicros)}</span>
          </StyledFinanceV2StatementRow>
          <StyledFinanceV2StatementRow>
            <span>
              <Trans>Accumulated Net Profit</Trans>
            </span>
            <span>{formatDisplay(bs.accumulatedNetProfitAedMicros)}</span>
          </StyledFinanceV2StatementRow>
          <StyledFinanceV2StatementRow data-bold="true">
            <span>
              <Trans>Total Equity</Trans>
            </span>
            <span>{formatDisplay(bs.totalEquityAedMicros)}</span>
          </StyledFinanceV2StatementRow>

          <StyledFinanceV2Notice>
            <Trans>
              Pending unpaid client invoices:{' '}
              {formatDisplay(pendingReceivables.totalAedMicros)} (
              {pendingReceivables.count} open). Under cash-basis accounting,
              these move into Cash and Revenue once paid.
            </Trans>
          </StyledFinanceV2Notice>
        </StyledFinanceV2Panel>
      </StyledFinanceV2SplitGrid>

      {analytics && analytics.projectProfitability.length > 0 && (
        <StyledFinanceV2Panel>
          <StyledFinanceV2HeaderRow>
            <div>
              <h3>{t`Client / Project Profitability (${displayCurrency})`}</h3>
              <small>
                <Trans>
                  Paid revenue vs direct project expenses for the selected
                  period.
                </Trans>
              </small>
            </div>
            <StyledFinanceV2Pill data-tone="info">
              {pnl.fromDate} → {pnl.toDate}
            </StyledFinanceV2Pill>
          </StyledFinanceV2HeaderRow>
          <StyledFinanceV2TableWrap>
            <StyledFinanceV2Table>
              <thead>
                <tr>
                  <th>
                    <Trans>Project</Trans>
                  </th>
                  <th data-numeric="true">
                    <Trans>Paid Revenue</Trans>
                  </th>
                  <th data-numeric="true">
                    <Trans>Direct Expenses</Trans>
                  </th>
                  <th data-numeric="true">
                    <Trans>Gross Profit</Trans>
                  </th>
                  <th data-numeric="true">
                    <Trans>Gross Margin</Trans>
                  </th>
                </tr>
              </thead>
              <tbody>
                {analytics.projectProfitability.map((row) => (
                  <tr key={row.projectId ?? 'unassigned'}>
                    <td>
                      <strong>{row.projectName}</strong>
                    </td>
                    <td data-numeric="true">
                      {formatDisplay(row.revenueAedMicros)}
                    </td>
                    <td data-numeric="true">
                      {formatDisplay(row.directExpenseAedMicros)}
                    </td>
                    <td data-numeric="true">
                      <strong>{formatDisplay(row.grossProfitAedMicros)}</strong>
                    </td>
                    <td data-numeric="true">
                      {row.grossMarginPercent !== null
                        ? `${row.grossMarginPercent}%`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </StyledFinanceV2Table>
          </StyledFinanceV2TableWrap>
        </StyledFinanceV2Panel>
      )}
    </StyledFinanceV2Stack>
  );
};
