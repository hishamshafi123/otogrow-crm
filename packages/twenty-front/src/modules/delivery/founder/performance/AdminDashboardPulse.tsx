import { Trans, useLingui } from '@lingui/react/macro';
import { Link } from 'react-router-dom';
import { isDefined } from 'twenty-shared/utils';
import {
  type DeliveryFinanceForecastQuery,
  type DeliveryFounderPerformanceQuery,
} from '~/generated-metadata/graphql';
import {
  formatFinanceAmountMicros,
  formatFinanceRecordedMargin,
} from '@/delivery/finance/finance-money';
import { formatPerformanceRate } from '@/delivery/founder/performance/performance-format';
import {
  calculateMonthDelta,
  isNegativeMicros,
  isPositiveMicros,
} from '@/delivery/founder/performance/admin-dashboard-metrics';
import {
  StyledPulseCard,
  StyledPulseFoot,
  StyledPulseGrid,
  StyledPulseLabelRow,
  StyledPulseValue,
  StyledStatusPill,
} from '@/delivery/founder/performance/adminDashboardStyles';

type PerformanceSnapshot =
  DeliveryFounderPerformanceQuery['deliveryFounderPerformance'];
type ForecastSnapshot = DeliveryFinanceForecastQuery['deliveryFinanceForecast'];

type AdminDashboardPulseProps = {
  data: PerformanceSnapshot;
  activeCurrency: string | null;
  forecast: ForecastSnapshot | null;
  attentionCount: number | null;
  degradedConnectionCount: number;
  attentionHref: string;
};

export const AdminDashboardPulse = ({
  data,
  activeCurrency,
  forecast,
  attentionCount,
  degradedConnectionCount,
  attentionHref,
}: AdminDashboardPulseProps) => {
  const { t } = useLingui();
  const primarySummary =
    (activeCurrency
      ? data.currencies.find((item) => item.currency === activeCurrency)
      : data.currencies.length === 1
        ? data.currencies[0]
        : null) ?? null;

  const revenueDelta = primarySummary
    ? calculateMonthDelta(
        primarySummary.revenueMicros,
        primarySummary.previousRevenueMicros,
      )
    : null;
  const marginText = primarySummary
    ? formatFinanceRecordedMargin(
        primarySummary.revenueMicros,
        primarySummary.resultMicros,
      )
    : null;
  const hasOverdueReceivables = isPositiveMicros(
    primarySummary?.overdueReceivablesMicros,
  );
  const hasShortfall = isDefined(forecast?.firstNegativeDate);

  const onTimeRate = formatPerformanceRate(
    data.operations.onTimeApprovedTaskCount,
    data.operations.dueTaskCount,
  );
  const deliveryRiskCount =
    data.operations.overdueTaskCount + data.operations.blockedTaskCount;
  const totalAlerts = (attentionCount ?? 0) + degradedConnectionCount;

  const financeMonthHref = primarySummary
    ? `/delivery?view=finance&financeView=monthly&financeMonth=${data.month}&financeCurrency=${primarySummary.currency}`
    : `/delivery?view=finance&financeView=monthly&financeMonth=${data.month}`;
  const reconciliationHref = primarySummary
    ? `/delivery?view=finance&financeView=reconciliation&financeCurrency=${primarySummary.currency}`
    : `/delivery?view=finance&financeView=reconciliation`;
  const forecastHref = forecast
    ? `/delivery?view=finance&financeView=forecast&financeCurrency=${forecast.currency}`
    : activeCurrency
      ? `/delivery?view=finance&financeView=forecast&financeCurrency=${activeCurrency}`
      : `/delivery?view=finance&financeView=forecast`;

  return (
    <StyledPulseGrid aria-label={t`Executive summary`}>
      {data.canReadFinance && (
        <>
          <StyledPulseCard
            data-tone={
              isNegativeMicros(primarySummary?.resultMicros)
                ? 'warning'
                : undefined
            }
          >
            <StyledPulseLabelRow>
              <span>
                <Trans>Recognized revenue</Trans>
                {primarySummary ? ` · ${primarySummary.currency}` : ''}
              </span>
              {revenueDelta && (
                <StyledStatusPill
                  data-tone={
                    revenueDelta.direction === 'up'
                      ? 'positive'
                      : revenueDelta.direction === 'down'
                        ? 'warning'
                        : undefined
                  }
                >
                  {revenueDelta.percentText}
                </StyledStatusPill>
              )}
            </StyledPulseLabelRow>
            <StyledPulseValue>
              {primarySummary
                ? formatFinanceAmountMicros(
                    primarySummary.revenueMicros,
                    primarySummary.currency,
                  )
                : data.currencies.length > 1
                  ? t`${data.currencies.length} currencies`
                  : t`No posted entries`}
            </StyledPulseValue>
            <StyledPulseFoot>
              <span>
                {primarySummary
                  ? marginText
                    ? t`Margin ${marginText} · ${primarySummary.draftEntryCount} drafts`
                    : t`${primarySummary.postedEntryCount} posted · ${primarySummary.draftEntryCount} drafts`
                  : t`Select INR, USD, QAR or AED above`}
              </span>
              <Link to={financeMonthHref}>
                <Trans>Monthly finance</Trans>
              </Link>
            </StyledPulseFoot>
          </StyledPulseCard>

          <StyledPulseCard>
            <StyledPulseLabelRow>
              <span>
                <Trans>Cash collected (MTD)</Trans>
                {primarySummary ? ` · ${primarySummary.currency}` : ''}
              </span>
              {forecast?.currentCashMicros && (
                <StyledStatusPill data-tone="accent">
                  {t`On hand: ${formatFinanceAmountMicros(forecast.currentCashMicros, forecast.currency)}`}
                </StyledStatusPill>
              )}
            </StyledPulseLabelRow>
            <StyledPulseValue>
              {primarySummary
                ? formatFinanceAmountMicros(
                    primarySummary.cashCollectedMicros,
                    primarySummary.currency,
                  )
                : data.currencies.length > 1
                  ? t`Kept separate`
                  : t`No cash recorded`}
            </StyledPulseValue>
            <StyledPulseFoot>
              <span>
                {primarySummary
                  ? t`Receivables: ${formatFinanceAmountMicros(primarySummary.receivablesMicros, primarySummary.currency)}`
                  : t`Switch currency pill for exact cash`}
              </span>
              <Link to={reconciliationHref}>
                <Trans>Collections</Trans>
              </Link>
            </StyledPulseFoot>
          </StyledPulseCard>

          <StyledPulseCard
            data-tone={
              hasShortfall
                ? 'danger'
                : forecast && !forecast.projectionComplete
                  ? 'warning'
                  : forecast?.endingCashMicros
                    ? 'positive'
                    : undefined
            }
          >
            <StyledPulseLabelRow>
              <span>
                <Trans>90-day projected close</Trans>
                {forecast ? ` · ${forecast.currency}` : ''}
              </span>
              {hasShortfall ? (
                <StyledStatusPill data-tone="danger">
                  {t`Dip ${forecast.firstNegativeDate}`}
                </StyledStatusPill>
              ) : forecast && !forecast.projectionComplete ? (
                <StyledStatusPill data-tone="warning">
                  <Trans>Incomplete</Trans>
                </StyledStatusPill>
              ) : forecast?.endingCashMicros ? (
                <StyledStatusPill data-tone="positive">
                  <Trans>Positive</Trans>
                </StyledStatusPill>
              ) : null}
            </StyledPulseLabelRow>
            <StyledPulseValue>
              {forecast?.endingCashMicros
                ? formatFinanceAmountMicros(
                    forecast.endingCashMicros,
                    forecast.currency,
                  )
                : forecast
                  ? t`Anchor needed`
                  : t`Choose currency`}
            </StyledPulseValue>
            <StyledPulseFoot>
              <span>
                {forecast
                  ? forecast.exceptionCount > 0
                    ? t`${forecast.exceptionCount} forecast items need review`
                    : t`Reviewed 90-day scenario`
                  : t`Pick INR, USD, QAR or AED`}
              </span>
              <Link to={forecastHref}>
                <Trans>Open forecast</Trans>
              </Link>
            </StyledPulseFoot>
          </StyledPulseCard>

          <StyledPulseCard
            data-tone={hasOverdueReceivables ? 'danger' : undefined}
          >
            <StyledPulseLabelRow>
              <span>
                <Trans>Overdue receivables</Trans>
                {primarySummary ? ` · ${primarySummary.currency}` : ''}
              </span>
              {primarySummary && (
                <StyledStatusPill
                  data-tone={hasOverdueReceivables ? 'danger' : 'positive'}
                >
                  {hasOverdueReceivables ? t`Action needed` : t`Current`}
                </StyledStatusPill>
              )}
            </StyledPulseLabelRow>
            <StyledPulseValue>
              {primarySummary
                ? formatFinanceAmountMicros(
                    primarySummary.overdueReceivablesMicros,
                    primarySummary.currency,
                  )
                : data.currencies.length > 1
                  ? t`Kept separate`
                  : t`No invoices`}
            </StyledPulseValue>
            <StyledPulseFoot>
              <span>
                {primarySummary && !primarySummary.cashReportingConfirmed
                  ? t`Using UTC overdue calendar`
                  : t`Outstanding past invoice due date`}
              </span>
              <Link to={reconciliationHref}>
                <Trans>Reconcile</Trans>
              </Link>
            </StyledPulseFoot>
          </StyledPulseCard>
        </>
      )}

      <StyledPulseCard
        data-tone={
          deliveryRiskCount > 0
            ? data.operations.blockedTaskCount > 0
              ? 'danger'
              : 'warning'
            : undefined
        }
      >
        <StyledPulseLabelRow>
          <span>
            <Trans>Delivery health</Trans>
          </span>
          <StyledStatusPill
            data-tone={deliveryRiskCount > 0 ? 'warning' : 'positive'}
          >
            {deliveryRiskCount > 0
              ? t`${deliveryRiskCount} at risk`
              : t`On track`}
          </StyledStatusPill>
        </StyledPulseLabelRow>
        <StyledPulseValue>
          {onTimeRate ?? t`${data.operations.openTaskCount} open`}
        </StyledPulseValue>
        <StyledPulseFoot>
          <span>
            {t`${data.operations.overdueTaskCount} overdue · ${data.operations.blockedTaskCount} blocked · ${data.operations.waitingReviewCount} waiting review`}
          </span>
          <Link to="/delivery?view=planner">
            <Trans>Team planner</Trans>
          </Link>
        </StyledPulseFoot>
      </StyledPulseCard>

      <StyledPulseCard data-tone={totalAlerts > 0 ? 'warning' : 'positive'}>
        <StyledPulseLabelRow>
          <span>
            <Trans>Needs attention & systems</Trans>
          </span>
          <StyledStatusPill
            data-tone={totalAlerts > 0 ? 'warning' : 'positive'}
          >
            {totalAlerts > 0 ? t`${totalAlerts} open` : t`Clear`}
          </StyledStatusPill>
        </StyledPulseLabelRow>
        <StyledPulseValue>
          {attentionCount === null
            ? t`${degradedConnectionCount} connections`
            : String(attentionCount)}
        </StyledPulseValue>
        <StyledPulseFoot>
          <span>
            {degradedConnectionCount > 0
              ? t`${degradedConnectionCount} connection checks need review`
              : t`Company exceptions across active areas`}
          </span>
          <Link to={attentionHref}>
            <Trans>Review queue</Trans>
          </Link>
        </StyledPulseFoot>
      </StyledPulseCard>
    </StyledPulseGrid>
  );
};
