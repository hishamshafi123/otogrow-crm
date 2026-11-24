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
  handleCardSpotlightLeave,
  handleCardSpotlightMove,
} from '@/delivery/founder/performance/cardSpotlight';
import {
  StyledChartAxisLabels,
  StyledChartFrame,
  StyledCompactList,
  StyledCompactListItem,
  StyledStatusPill,
  StyledAdminPanel,
  StyledAdminSectionHeader,
} from '@/delivery/founder/performance/adminDashboardStyles';
import { StyledPerformanceRecordMetrics } from '@/delivery/founder/performance/performanceStyles';
import {
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
  const destination = `/delivery?view=finance&financeView=dashboard&financeCurrency=${currency}`;
  const reconciliationDestination = `/delivery?view=finance&financeView=documents&financeCurrency=${currency}`;

  if (error) {
    return (
      <StyledAdminPanel
        aria-label={t`${currency} 90-day cash forecast`}
        data-tone="warning"
        onPointerLeave={handleCardSpotlightLeave}
        onPointerMove={handleCardSpotlightMove}
      >
        <StyledDeliveryStack>
          <StyledAdminSectionHeader>
            <h2>
              <Trans>90-day cash forecast</Trans> · {currency}
            </h2>
            <Link to={destination}>
              <Trans>Open cash forecast</Trans>
            </Link>
          </StyledAdminSectionHeader>
          <p role="status">
            <Trans>
              Cash forecast details could not be loaded right now. Open the full
              forecast to review starting cash and scheduled collections.
            </Trans>
          </p>
        </StyledDeliveryStack>
      </StyledAdminPanel>
    );
  }

  if (loading && !forecast) {
    return (
      <StyledAdminPanel
        aria-label={t`${currency} 90-day cash forecast`}
        data-accent="cyan"
        onPointerLeave={handleCardSpotlightLeave}
        onPointerMove={handleCardSpotlightMove}
      >
        <StyledDeliveryStack>
          <StyledAdminSectionHeader>
            <h2>
              <Trans>90-day cash forecast</Trans> · {currency}
            </h2>
          </StyledAdminSectionHeader>
          <p role="status">
            <Trans>Checking 90-day cash forecast…</Trans>
          </p>
        </StyledDeliveryStack>
      </StyledAdminPanel>
    );
  }

  if (!forecast) return null;

  const geometry = buildForecastChartGeometry(forecast.timeline);
  const amount = (value: string | null | undefined) =>
    isDefined(value)
      ? formatFinanceAmountMicros(value, forecast.currency)
      : t`Not confirmed`;
  const hasShortfall = isDefined(forecast.firstNegativeDate);
  const gradientPrefix = `cash-forecast-${forecast.currency.toLowerCase()}`;
  const areaGradientId = `${gradientPrefix}-area`;
  const lineGradientId = `${gradientPrefix}-line`;
  const glowFilterId = `${gradientPrefix}-glow`;
  const primaryStopColor = hasShortfall
    ? themeCssVariables.color.red9
    : themeCssVariables.color.cyan9;
  const secondaryStopColor = hasShortfall
    ? themeCssVariables.color.orange9
    : themeCssVariables.color.iris9;

  const upcomingItems = forecast.items
    .filter((item) => item.status === 'OPEN')
    .slice(0, 5);
  const hasBacklog =
    isPositiveMicros(forecast.knownUnscheduledInflowMicros) ||
    isPositiveMicros(forecast.knownUnscheduledOutflowMicros) ||
    forecast.unknownCollectionCount > 0 ||
    isPositiveMicros(forecast.unappliedActualOutflowMicros);

  return (
    <StyledAdminPanel
      aria-label={t`${forecast.currency} 90-day cash forecast`}
      data-accent={hasShortfall ? undefined : 'cyan'}
      data-tone={hasShortfall ? 'danger' : undefined}
      onPointerLeave={handleCardSpotlightLeave}
      onPointerMove={handleCardSpotlightMove}
    >
      <StyledDeliveryStack>
        <StyledAdminSectionHeader>
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
        </StyledAdminSectionHeader>

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
              <defs>
                <linearGradient id={areaGradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={primaryStopColor}
                    stopOpacity="0.34"
                  />
                  <stop
                    offset="60%"
                    stopColor={secondaryStopColor}
                    stopOpacity="0.1"
                  />
                  <stop
                    offset="100%"
                    stopColor={secondaryStopColor}
                    stopOpacity="0"
                  />
                </linearGradient>
                <linearGradient id={lineGradientId} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={secondaryStopColor} />
                  <stop offset="100%" stopColor={primaryStopColor} />
                </linearGradient>
                <filter
                  id={glowFilterId}
                  x="-10%"
                  y="-30%"
                  width="120%"
                  height="160%"
                >
                  <feGaussianBlur stdDeviation="2.5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              {[28, 74, 120].map((gridY) => (
                <line
                  key={gridY}
                  x1="8"
                  x2="552"
                  y1={gridY}
                  y2={gridY}
                  stroke={themeCssVariables.border.color.light}
                  strokeDasharray="3 5"
                  strokeWidth="1"
                />
              ))}
              <path d={geometry.areaPath} fill={`url(#${areaGradientId})`} />
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
                stroke={`url(#${lineGradientId})`}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter={`url(#${glowFilterId})`}
              />
              <circle
                cx={geometry.minPoint.x}
                cy={geometry.minPoint.y}
                r="8"
                fill={
                  geometry.hasNegative
                    ? themeCssVariables.color.transparent.red4
                    : themeCssVariables.color.transparent.cyan4
                }
              />
              <circle
                cx={geometry.minPoint.x}
                cy={geometry.minPoint.y}
                r="4"
                fill={
                  geometry.hasNegative
                    ? themeCssVariables.color.red9
                    : themeCssVariables.color.cyan9
                }
                stroke={themeCssVariables.background.primary}
                strokeWidth="1.75"
              />
              <circle
                cx={geometry.endPoint.x}
                cy={geometry.endPoint.y}
                r="3.5"
                fill={primaryStopColor}
                stroke={themeCssVariables.background.primary}
                strokeWidth="1.5"
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
            <StyledAdminSectionHeader>
              <h3>
                <Trans>Upcoming scheduled cash movements</Trans>
              </h3>
              <small>{t`${forecast.itemCount} tracked items`}</small>
            </StyledAdminSectionHeader>
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
    </StyledAdminPanel>
  );
};
