import { Trans, useLingui } from '@lingui/react/macro';
import { Link } from 'react-router-dom';
import { isDefined } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { type DeliveryFinanceForecastQuery } from '~/generated-metadata/graphql';
import { formatFinanceAmountMicros } from '@/delivery/finance/finance-money';
import {
  buildForecastChartGeometry,
  isPositiveMicros,
} from '@/delivery/founder/performance/admin-dashboard-metrics';
import {
  StyledChartAxisLabels,
  StyledChartFrame,
  StyledCompactList,
  StyledCompactListItem,
  StyledStatusPill,
} from '@/delivery/founder/performance/adminDashboardStyles';
import { StyledPerformanceRecordMetrics } from '@/delivery/founder/performance/performanceStyles';
import {
  StyledDeliveryCard,
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type ForecastSnapshot = DeliveryFinanceForecastQuery['deliveryFinanceForecast'];

type AdminCashForecastPanelProps = {
  currency: string;
  forecast: ForecastSnapshot | null;
  loading: boolean;
  error: boolean;
};

export const AdminCashForecastPanel = ({
  currency,
  forecast,
  loading,
  error,
}: AdminCashForecastPanelProps) => {
  const { t } = useLingui();
  const destination = `/delivery?view=finance&financeView=forecast&financeCurrency=${currency}`;
  const reconciliationDestination = `/delivery?view=finance&financeView=reconciliation&financeCurrency=${currency}`;

  if (error) {
    return (
      <StyledDeliveryCard aria-label={t`${currency} 90-day cash forecast`}>
        <StyledDeliveryStack>
          <StyledDeliveryRow>
            <h2>
              <Trans>90-day cash forecast</Trans> · {currency}
            </h2>
            <Link to={destination}>
              <Trans>Open cash forecast</Trans>
            </Link>
          </StyledDeliveryRow>
          <p role="status">
            <Trans>
              Cash forecast details could not be loaded right now. Open the full
              forecast to review starting cash and scheduled collections.
            </Trans>
          </p>
        </StyledDeliveryStack>
      </StyledDeliveryCard>
    );
  }

  if (loading && !forecast) {
    return (
      <StyledDeliveryCard aria-label={t`${currency} 90-day cash forecast`}>
        <StyledDeliveryStack>
          <h2>
            <Trans>90-day cash forecast</Trans> · {currency}
          </h2>
          <p role="status">
            <Trans>Checking 90-day cash forecast…</Trans>
          </p>
        </StyledDeliveryStack>
      </StyledDeliveryCard>
    );
  }

  if (!forecast) return null;

  const geometry = buildForecastChartGeometry(forecast.timeline);
  const amount = (value: string | null | undefined) =>
    isDefined(value)
      ? formatFinanceAmountMicros(value, forecast.currency)
      : t`Not confirmed`;
  const hasShortfall = isDefined(forecast.firstNegativeDate);
  const strokeColor = hasShortfall
    ? themeCssVariables.color.red9
    : themeCssVariables.color.blue9;
  const fillColor = hasShortfall
    ? themeCssVariables.color.red3
    : themeCssVariables.color.blue3;

  const upcomingItems = forecast.items
    .filter((item) => item.status === 'OPEN')
    .slice(0, 5);
  const hasBacklog =
    isPositiveMicros(forecast.knownUnscheduledInflowMicros) ||
    isPositiveMicros(forecast.knownUnscheduledOutflowMicros) ||
    forecast.unknownCollectionCount > 0 ||
    isPositiveMicros(forecast.unappliedActualOutflowMicros);

  return (
    <StyledDeliveryCard
      aria-label={t`${forecast.currency} 90-day cash forecast`}
    >
      <StyledDeliveryStack>
        <StyledDeliveryRow>
          <div>
            <h2>
              <Trans>90-day cash forecast</Trans> · {forecast.currency}
            </h2>
            <small>
              {forecast.businessDate
                ? t`Reviewed 90-day scenario as of ${forecast.businessDate} (${forecast.timezone ?? 'UTC'})`
                : t`Set a confirmed starting cash anchor to project daily closing balances.`}
            </small>
          </div>
          <StyledDeliveryRow>
            <StyledStatusPill
              data-tone={
                hasShortfall
                  ? 'danger'
                  : !forecast.projectionComplete
                    ? 'warning'
                    : 'positive'
              }
            >
              {hasShortfall
                ? t`Shortfall on ${forecast.firstNegativeDate}`
                : !forecast.projectionComplete
                  ? t`Needs review`
                  : t`Positive 90-day close`}
            </StyledStatusPill>
            <Link to={destination}>
              <Trans>Manage forecast</Trans>
            </Link>
          </StyledDeliveryRow>
        </StyledDeliveryRow>

        <StyledPerformanceRecordMetrics>
          <div>
            <dt>
              <Trans>Current cash</Trans>
            </dt>
            <dd>{amount(forecast.currentCashMicros)}</dd>
          </div>
          <div>
            <dt>
              <Trans>Expected inflows</Trans>
            </dt>
            <dd>{amount(forecast.expectedInflowMicros)}</dd>
          </div>
          <div>
            <dt>
              <Trans>Expected outflows</Trans>
            </dt>
            <dd>{amount(forecast.expectedOutflowMicros)}</dd>
          </div>
          <div>
            <dt>
              <Trans>Projected 90d close</Trans>
            </dt>
            <dd>{amount(forecast.endingCashMicros)}</dd>
          </div>
          <div>
            <dt>
              <Trans>Lowest projected day</Trans>
            </dt>
            <dd>
              {geometry
                ? `${formatFinanceAmountMicros(geometry.minPoint.closingMicros, forecast.currency)} (${geometry.minPoint.date})`
                : t`Not confirmed`}
            </dd>
          </div>
          <div>
            <dt>
              <Trans>Forecast exceptions</Trans>
            </dt>
            <dd>{String(forecast.exceptionCount)}</dd>
          </div>
        </StyledPerformanceRecordMetrics>

        {geometry ? (
          <StyledChartFrame>
            <svg
              viewBox="0 0 560 148"
              role="img"
              aria-label={t`90-day projected closing cash curve for ${forecast.currency}`}
              preserveAspectRatio="none"
            >
              <path d={geometry.areaPath} fill={fillColor} opacity="0.65" />
              {geometry.zeroLineY !== null && (
                <line
                  x1="8"
                  x2="552"
                  y1={geometry.zeroLineY}
                  y2={geometry.zeroLineY}
                  stroke={themeCssVariables.color.orange9}
                  strokeDasharray="4 4"
                  strokeWidth="1.25"
                />
              )}
              <path
                d={geometry.linePath}
                fill="none"
                stroke={strokeColor}
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle
                cx={geometry.minPoint.x}
                cy={geometry.minPoint.y}
                r="4"
                fill={
                  geometry.hasNegative
                    ? themeCssVariables.color.red9
                    : themeCssVariables.color.blue11
                }
              />
            </svg>
            <StyledChartAxisLabels>
              <span>
                {geometry.startPoint.date} ·{' '}
                {formatFinanceAmountMicros(
                  geometry.startPoint.closingMicros,
                  forecast.currency,
                )}
              </span>
              <span>
                {t`Low: ${formatFinanceAmountMicros(geometry.minPoint.closingMicros, forecast.currency)} (${geometry.minPoint.date})`}
              </span>
              <span>
                {geometry.endPoint.date} ·{' '}
                {formatFinanceAmountMicros(
                  geometry.endPoint.closingMicros,
                  forecast.currency,
                )}
              </span>
            </StyledChartAxisLabels>
          </StyledChartFrame>
        ) : (
          <p>
            <Trans>
              No daily closing timeline is available yet. Confirm starting cash
              and schedule expected inflows or outflows in Cash forecast.
            </Trans>
          </p>
        )}

        {hasBacklog && (
          <StyledCompactList
            aria-label={t`Unscheduled and unreconciled cash items`}
          >
            {isPositiveMicros(forecast.knownUnscheduledInflowMicros) && (
              <StyledCompactListItem data-tone="warning">
                <span>
                  <Trans>Known unscheduled collections</Trans>
                </span>
                <strong>
                  {formatFinanceAmountMicros(
                    forecast.knownUnscheduledInflowMicros,
                    forecast.currency,
                  )}
                </strong>
              </StyledCompactListItem>
            )}
            {isPositiveMicros(forecast.knownUnscheduledOutflowMicros) && (
              <StyledCompactListItem data-tone="warning">
                <span>
                  <Trans>Known unscheduled outflows</Trans>
                </span>
                <strong>
                  {formatFinanceAmountMicros(
                    forecast.knownUnscheduledOutflowMicros,
                    forecast.currency,
                  )}
                </strong>
              </StyledCompactListItem>
            )}
            {forecast.unknownCollectionCount > 0 && (
              <StyledCompactListItem data-tone="warning">
                <span>
                  {t`${forecast.unknownCollectionCount} invoice balances need confirmation`}
                </span>
                <Link to={reconciliationDestination}>
                  <Trans>Review collections</Trans>
                </Link>
              </StyledCompactListItem>
            )}
            {isPositiveMicros(forecast.unappliedActualOutflowMicros) && (
              <StyledCompactListItem data-tone="warning">
                <span>
                  <Trans>Unapplied recorded payments</Trans>
                </span>
                <strong>
                  {formatFinanceAmountMicros(
                    forecast.unappliedActualOutflowMicros,
                    forecast.currency,
                  )}
                </strong>
              </StyledCompactListItem>
            )}
          </StyledCompactList>
        )}

        {upcomingItems.length > 0 && (
          <StyledDeliveryStack>
            <StyledDeliveryRow>
              <h3>
                <Trans>Upcoming scheduled cash movements</Trans>
              </h3>
              <small>{t`${forecast.itemCount} tracked items`}</small>
            </StyledDeliveryRow>
            <StyledCompactList>
              {upcomingItems.map((item) => (
                <StyledCompactListItem key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <div>
                      <small>
                        {item.kind === 'INFLOW' ? t`Inflow` : t`Outflow`} ·{' '}
                        {item.expectedDate ?? t`Undated`} · {item.ownerName}
                      </small>
                    </div>
                  </div>
                  <strong>
                    {formatFinanceAmountMicros(
                      item.remainingMicros ?? item.amountMicros,
                      item.currency,
                    )}
                  </strong>
                </StyledCompactListItem>
              ))}
            </StyledCompactList>
          </StyledDeliveryStack>
        )}
      </StyledDeliveryStack>
    </StyledDeliveryCard>
  );
};
