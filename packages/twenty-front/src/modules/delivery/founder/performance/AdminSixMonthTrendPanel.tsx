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
  StyledChartAxisLabels,
  StyledChartFrame,
  StyledCostLegend,
  StyledLegendDot,
  StyledStatusPill,
} from '@/delivery/founder/performance/adminDashboardStyles';
import {
  StyledDeliveryCard,
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
        return (
          <StyledDeliveryCard
            key={series.currency}
            aria-label={t`${series.currency} 6-month revenue and cost trend`}
          >
            <StyledDeliveryStack>
              <StyledDeliveryRow>
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
                    to={`/delivery?view=finance&financeView=monthly&financeMonth=${month}&financeCurrency=${series.currency}`}
                  >
                    <Trans>Inspect ledger</Trans>
                  </Link>
                </StyledDeliveryRow>
              </StyledDeliveryRow>

              <StyledChartFrame>
                <svg
                  viewBox="0 0 560 160"
                  role="img"
                  aria-label={t`6-month recognized revenue and cost chart for ${series.currency}`}
                  preserveAspectRatio="none"
                >
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
                        rx="3"
                        fill={themeCssVariables.color.blue9}
                      />
                      <rect
                        x={bar.costBar.x}
                        y={bar.costBar.y}
                        width={bar.costBar.width}
                        height={bar.costBar.height}
                        rx="3"
                        fill={themeCssVariables.color.purple9}
                      />
                    </g>
                  ))}
                  <path
                    d={geometry.resultLinePath}
                    fill="none"
                    stroke={themeCssVariables.color.green9}
                    strokeWidth="2.25"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {geometry.bars.map((bar) => (
                    <circle
                      key={`pt-${bar.month}`}
                      cx={bar.centerX}
                      cy={bar.resultY}
                      r="3.5"
                      fill={
                        bar.resultNegative
                          ? themeCssVariables.color.red9
                          : themeCssVariables.color.green11
                      }
                    />
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
                  <StyledLegendDot data-segment="salary" />
                  <span>
                    <Trans>Recognized revenue</Trans>
                  </span>
                </li>
                <li>
                  <StyledLegendDot data-segment="overhead" />
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
          </StyledDeliveryCard>
        );
      })}
    </StyledDeliverySectionStack>
  );
};
