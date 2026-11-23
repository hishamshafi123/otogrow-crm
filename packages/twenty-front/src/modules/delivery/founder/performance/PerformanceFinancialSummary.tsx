import { Trans, useLingui } from '@lingui/react/macro';
import { Link } from 'react-router-dom';
import { type DeliveryFounderPerformanceQuery } from '~/generated-metadata/graphql';
import {
  formatFinanceAmountMicros,
  formatFinanceRecordedMargin,
} from '@/delivery/finance/finance-money';
import { formatPerformanceMonth } from '@/delivery/founder/performance/performance-format';
import {
  calculateCostSegments,
  calculateMonthDelta,
} from '@/delivery/founder/performance/admin-dashboard-metrics';
import {
  handleCardSpotlightLeave,
  handleCardSpotlightMove,
} from '@/delivery/founder/performance/cardSpotlight';
import {
  StyledCostBarSegment,
  StyledCostBarTrack,
  StyledCostLegend,
  StyledLegendDot,
  StyledStatusPill,
  StyledAdminPanel,
  StyledAdminSectionHeader,
} from '@/delivery/founder/performance/adminDashboardStyles';
import { StyledPerformanceMetrics } from '@/delivery/founder/performance/performanceStyles';
import {
  StyledDeliveryRow,
  StyledDeliveryStack,
} from '@/delivery/deliveryStyles';

type PerformanceCurrency =
  DeliveryFounderPerformanceQuery['deliveryFounderPerformance']['currencies'][number];

export const PerformanceFinancialSummary = ({
  currencies,
  month,
  previousMonth,
}: {
  currencies: PerformanceCurrency[];
  month: string;
  previousMonth: string;
}) => {
  const { t } = useLingui();
  const segmentLabels = {
    salary: t`Salary`,
    overhead: t`Overhead`,
    ai: t`Production AI`,
    other: t`Other costs`,
    unassigned: t`Unassigned`,
  };
  if (!currencies.length)
    return (
      <StyledAdminPanel
        onPointerLeave={handleCardSpotlightLeave}
        onPointerMove={handleCardSpotlightMove}
      >
        <StyledDeliveryStack>
          <StyledAdminSectionHeader>
            <h2>
              <Trans>Financial performance</Trans>
            </h2>
          </StyledAdminSectionHeader>
          <p>
            <Trans>
              No posted monthly finance or cash records are available in this
              selection. Add a reviewed service-month entry to begin.
            </Trans>
          </p>
          <Link
            to={`/delivery?view=finance&financeView=monthly&financeMonth=${month}`}
          >
            <Trans>Open monthly finance</Trans>
          </Link>
        </StyledDeliveryStack>
      </StyledAdminPanel>
    );
  return (
    <StyledDeliveryStack>
      {currencies.map((summary) => {
        const destination = `/delivery?view=finance&financeView=monthly&financeMonth=${month}&financeCurrency=${summary.currency}`;
        const revenueDelta = calculateMonthDelta(
          summary.revenueMicros,
          summary.previousRevenueMicros,
        );
        const costSegments = calculateCostSegments(summary);
        const metrics = [
          {
            label: t`Recognized revenue`,
            value: formatFinanceAmountMicros(
              summary.revenueMicros,
              summary.currency,
            ),
          },
          {
            label: t`Recorded result`,
            value: formatFinanceAmountMicros(
              summary.resultMicros,
              summary.currency,
            ),
          },
          {
            label: t`Recorded margin`,
            value:
              formatFinanceRecordedMargin(
                summary.revenueMicros,
                summary.resultMicros,
              ) ?? t`Unavailable`,
          },
          {
            label: t`Cash collected this month`,
            value: formatFinanceAmountMicros(
              summary.cashCollectedMicros,
              summary.currency,
            ),
          },
          {
            label: t`Current receivables`,
            value: formatFinanceAmountMicros(
              summary.receivablesMicros,
              summary.currency,
            ),
          },
          {
            label: t`Overdue receivables`,
            value: formatFinanceAmountMicros(
              summary.overdueReceivablesMicros,
              summary.currency,
            ),
          },
        ];
        return (
          <StyledAdminPanel
            key={summary.currency}
            aria-label={t`${summary.currency} financial performance`}
            onPointerLeave={handleCardSpotlightLeave}
            onPointerMove={handleCardSpotlightMove}
          >
            <StyledDeliveryStack>
              <StyledAdminSectionHeader>
                <div>
                  <h2>
                    {summary.currency} · {formatPerformanceMonth(month)}
                  </h2>
                  <small>
                    <Trans>Recognized service-month performance</Trans>
                  </small>
                </div>
                <StyledDeliveryRow>
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
                      {t`MoM ${revenueDelta.percentText}`}
                    </StyledStatusPill>
                  )}
                  <StyledStatusPill
                    data-tone={
                      summary.periodStatus === 'LOCKED' ? 'positive' : 'accent'
                    }
                  >
                    {summary.periodStatus === 'LOCKED'
                      ? t`Month locked after review`
                      : t`Month open for reviewed posting`}
                  </StyledStatusPill>
                  <Link to={destination}>
                    <Trans>Review monthly records</Trans>
                  </Link>
                </StyledDeliveryRow>
              </StyledAdminSectionHeader>
              <StyledPerformanceMetrics>
                {metrics.map((metric) => (
                  <div key={metric.label}>
                    <dt>{metric.label}</dt>
                    <dd>{metric.value}</dd>
                  </div>
                ))}
              </StyledPerformanceMetrics>
              {costSegments.length > 0 && (
                <StyledDeliveryStack>
                  <StyledCostBarTrack
                    aria-label={t`${summary.currency} cost mix`}
                  >
                    {costSegments.map((segment) => (
                      <StyledCostBarSegment
                        key={segment.key}
                        data-segment={segment.key}
                        style={{ width: `${segment.sharePercent}%` }}
                      />
                    ))}
                  </StyledCostBarTrack>
                  <StyledCostLegend>
                    {costSegments.map((segment) => (
                      <li key={segment.key}>
                        <StyledLegendDot data-segment={segment.key} />
                        <span>{segmentLabels[segment.key]}</span>
                        <strong>
                          {formatFinanceAmountMicros(
                            segment.amountMicros,
                            summary.currency,
                          )}{' '}
                          ({segment.sharePercent.toFixed(0)}%)
                        </strong>
                      </li>
                    ))}
                  </StyledCostLegend>
                </StyledDeliveryStack>
              )}
              <p>
                <Trans>Previous month</Trans> ·{' '}
                {formatPerformanceMonth(previousMonth)}:{' '}
                {formatFinanceAmountMicros(
                  summary.previousRevenueMicros,
                  summary.currency,
                )}{' '}
                <Trans>revenue</Trans> ·{' '}
                {formatFinanceAmountMicros(
                  summary.previousResultMicros,
                  summary.currency,
                )}{' '}
                <Trans>recorded result</Trans> ·{' '}
                {t`${summary.postedEntryCount} posted entries`} ·{' '}
                {t`${summary.draftEntryCount} drafts excluded`}
              </p>
              {(!summary.financeComplete || !summary.cashComplete) && (
                <p role="status">
                  <Trans>
                    Some source records need review. Totals include valid
                    recorded sources only and are not complete profitability.
                  </Trans>
                </p>
              )}
              {!summary.cashReportingConfirmed && (
                <p role="status">
                  <Trans>
                    Cash overdue status uses UTC because no reporting calendar
                    is confirmed for this currency.
                  </Trans>
                </p>
              )}
              <details>
                <summary>
                  <Trans>Cost breakdown and company allocations</Trans>
                </summary>
                <StyledDeliveryStack>
                  <p>
                    <Trans>
                      Recorded result and margin use posted entries only.
                      Complete profitability requires every salary, overhead,
                      provider and other cost to be reviewed and allocated.
                    </Trans>
                  </p>
                  <StyledPerformanceMetrics>
                    {[
                      [t`Salary`, summary.salaryCostMicros],
                      [t`Overhead`, summary.overheadCostMicros],
                      [t`Production AI`, summary.aiCostMicros],
                      [t`Other costs`, summary.otherCostMicros],
                      [
                        t`Company / unassigned revenue`,
                        summary.unassignedRevenueMicros,
                      ],
                      [
                        t`Company / unassigned costs`,
                        summary.unassignedCostMicros,
                      ],
                    ].map(([label, amount]) => (
                      <div key={String(label)}>
                        <dt>{label}</dt>
                        <dd>
                          {formatFinanceAmountMicros(amount, summary.currency)}
                        </dd>
                      </div>
                    ))}
                  </StyledPerformanceMetrics>
                </StyledDeliveryStack>
              </details>
            </StyledDeliveryStack>
          </StyledAdminPanel>
        );
      })}
    </StyledDeliveryStack>
  );
};
