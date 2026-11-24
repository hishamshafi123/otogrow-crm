import { Trans, useLingui } from '@lingui/react/macro';
import { Link } from 'react-router-dom';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { formatFinanceAmountMicros } from '@/delivery/finance/finance-money';
import { type DeliveryFounderCurrencyTrend } from '@/delivery/founder/performance/delivery-founder-executive-insights.graphql';
import {
  buildSixMonthTrendGeometry,
  isNegativeMicros,
} from '@/delivery/founder/performance/admin-dashboard-metrics';
import { formatPerformanceMonth } from '@/delivery/founder/performance/performance-format';
import {
  handleCardSpotlightLeave,
  handleCardSpotlightMove,
} from '@/delivery/founder/performance/cardSpotlight';
import {
  StyledChartAxisLabels,
  StyledChartFrame,
  StyledCostLegend,
  StyledLegendDot,
  StyledStatusPill,
  StyledAdminPanel,
  StyledAdminSectionHeader,
} from '@/delivery/founder/performance/adminDashboardStyles';
import {
  StyledDeliveryRow,
  StyledDeliverySectionStack,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type AdminSixMonthTrendPanelProps = {
  trends: DeliveryFounderCurrencyTrend[];
  canReadFinance: boolean;
  month: string;
};

export const AdminSixMonthTrendPanel = ({
  trends,
  canReadFinance,
  month,
}: AdminSixMonthTrendPanelProps) => {
  const { t } = useLingui();
  if (!canReadFinance || trends.length === 0) return null;

  return (
    <StyledDeliverySectionStack aria-label={t`6-month financial trends`}>
      {trends.map((series) => {
        const geometry = buildSixMonthTrendGeometry(series.points);
        if (!geometry) return null;
        const latest = series.points[series.points.length - 1];
        const latestNegative = isNegativeMicros(latest.resultMicros);
        const idPrefix = `six-month-trend-${series.currency.toLowerCase()}`;
        const revenueBarId = `${idPrefix}-rev`;
        const costBarId = `${idPrefix}-cost`;
        const resultGlowId = `${idPrefix}-glow`;
        return (
          <StyledAdminPanel
            key={series.currency}
            aria-label={t`${series.currency} 6-month revenue and cost trend`}
            data-accent="violet"
            onPointerLeave={handleCardSpotlightLeave}
            onPointerMove={handleCardSpotlightMove}
          >
            <StyledDeliveryStack>
              <StyledAdminSectionHeader>
                <div>
                  <h2>
                    <Trans>6-month financial trend</Trans> · {series.currency}
                  </h2>
                  <small>
                    <Trans>
                      Posted monthly recognized revenue vs. costs with net
                      result curve. Currencies remain strictly separate.
                    </Trans>
                  </small>
                </div>
                <StyledDeliveryRow>
                  <StyledStatusPill
                    data-tone={latestNegative ? 'warning' : 'positive'}
                  >
                    {t`${formatPerformanceMonth(latest.month)}: ${formatFinanceAmountMicros(latest.resultMicros, series.currency)}`}
                  </StyledStatusPill>
                  <Link
                    to={`/delivery?view=finance&financeView=dashboard&financeMonth=${month}&financeCurrency=${series.currency}`}
                  >
                    <Trans>Inspect ledger</Trans>
                  </Link>
                </StyledDeliveryRow>
              </StyledAdminSectionHeader>

              <StyledChartFrame>
                <svg
                  viewBox="0 0 560 160"
                  role="img"
                  aria-label={t`6-month recognized revenue and cost chart for ${series.currency}`}
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient
                      id={revenueBarId}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor={themeCssVariables.color.cyan9}
                      />
                      <stop
                        offset="100%"
                        stopColor={themeCssVariables.color.iris9}
                      />
                    </linearGradient>
                    <linearGradient id={costBarId} x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor={themeCssVariables.color.violet9}
                      />
                      <stop
                        offset="100%"
                        stopColor={themeCssVariables.color.purple8}
                        stopOpacity="0.65"
                      />
                    </linearGradient>
                    <filter
                      id={resultGlowId}
                      x="-10%"
                      y="-30%"
                      width="120%"
                      height="160%"
                    >
                      <feGaussianBlur stdDeviation="2.2" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>
                  {[28, 68, 108].map((gridY) => (
                    <line
                      key={gridY}
                      x1="16"
                      x2="544"
                      y1={gridY}
                      y2={gridY}
                      stroke={themeCssVariables.border.color.light}
                      strokeDasharray="3 5"
                      strokeWidth="1"
                    />
                  ))}
                  <line
                    x1="16"
                    x2="544"
                    y1={geometry.baselineY}
                    y2={geometry.baselineY}
                    stroke={themeCssVariables.border.color.medium}
                    strokeWidth="1"
                  />
                  {geometry.bars.map((bar) => (
                    <g key={bar.month}>
                      <rect
                        x={bar.revenueBar.x}
                        y={bar.revenueBar.y}
                        width={bar.revenueBar.width}
                        height={bar.revenueBar.height}
                        rx="5"
                        fill={`url(#${revenueBarId})`}
                      />
                      <rect
                        x={bar.costBar.x}
                        y={bar.costBar.y}
                        width={bar.costBar.width}
                        height={bar.costBar.height}
                        rx="5"
                        fill={`url(#${costBarId})`}
                      />
                    </g>
                  ))}
                  <path
                    d={geometry.resultLinePath}
                    fill="none"
                    stroke={themeCssVariables.color.jade9}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    filter={`url(#${resultGlowId})`}
                  />
                  {geometry.bars.map((bar) => (
                    <g key={`pt-${bar.month}`}>
                      <circle
                        cx={bar.centerX}
                        cy={bar.resultY}
                        r="7"
                        fill={
                          bar.resultNegative
                            ? themeCssVariables.color.transparent.red4
                            : themeCssVariables.color.transparent.jade4
                        }
                      />
                      <circle
                        cx={bar.centerX}
                        cy={bar.resultY}
                        r="3.75"
                        fill={
                          bar.resultNegative
                            ? themeCssVariables.color.red9
                            : themeCssVariables.color.jade9
                        }
                        stroke={themeCssVariables.background.primary}
                        strokeWidth="1.5"
                      />
                    </g>
                  ))}
                </svg>
                <StyledChartAxisLabels>
                  {geometry.bars.map((bar) => (
                    <span key={bar.month}>
                      {bar.month} ·{' '}
                      {formatFinanceAmountMicros(
                        bar.resultMicros,
                        series.currency,
                      )}
                    </span>
                  ))}
                </StyledChartAxisLabels>
              </StyledChartFrame>

              <StyledCostLegend>
                <li>
                  <StyledLegendDot data-segment="revenue" />
                  <span>
                    <Trans>Recognized revenue</Trans>
                  </span>
                </li>
                <li>
                  <StyledLegendDot data-segment="cost" />
                  <span>
                    <Trans>Recognized costs</Trans>
                  </span>
                </li>
                <li>
                  <StyledLegendDot data-segment="result" />
                  <span>
                    <Trans>Net result line (red dots = negative month)</Trans>
                  </span>
                </li>
              </StyledCostLegend>
            </StyledDeliveryStack>
          </StyledAdminPanel>
        );
      })}
    </StyledDeliverySectionStack>
  );
};
