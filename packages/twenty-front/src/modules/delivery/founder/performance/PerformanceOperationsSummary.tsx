import { Trans, useLingui } from '@lingui/react/macro';
import { type DeliveryFounderPerformanceQuery } from '~/generated-metadata/graphql';
import { formatPerformanceRate } from '@/delivery/founder/performance/performance-format';
import {
  handleCardSpotlightLeave,
  handleCardSpotlightMove,
} from '@/delivery/founder/performance/cardSpotlight';
import { StyledPerformanceMetrics } from '@/delivery/founder/performance/performanceStyles';
import {
  StyledAdminPanel,
  StyledAdminSectionHeader,
} from '@/delivery/founder/performance/adminDashboardStyles';
import { StyledDeliveryStack } from '@/delivery/deliveryStyles';

type PerformanceOperations =
  DeliveryFounderPerformanceQuery['deliveryFounderPerformance']['operations'];

export const PerformanceOperationsSummary = ({
  operations,
}: {
  operations: PerformanceOperations;
}) => {
  const { t } = useLingui();
  const metrics = [
    [t`Open work`, String(operations.openTaskCount)],
    [t`Overdue open work`, String(operations.overdueTaskCount)],
    [t`Blocked`, String(operations.blockedTaskCount)],
    [t`Approved this month`, String(operations.approvedTaskCount)],
    [
      t`On-time approval`,
      formatPerformanceRate(
        operations.onTimeApprovedTaskCount,
        operations.dueTaskCount,
      ) ?? t`Not measured`,
    ],
    [
      t`First-pass approval`,
      formatPerformanceRate(
        operations.firstPassApprovedTaskCount,
        operations.reviewedTaskCount,
      ) ?? t`Not measured`,
    ],
  ];
  return (
    <StyledAdminPanel
      aria-label={t`Delivery performance`}
      data-accent="violet"
      onPointerLeave={handleCardSpotlightLeave}
      onPointerMove={handleCardSpotlightMove}
    >
      <StyledDeliveryStack>
        <StyledAdminSectionHeader>
          <h2>
            <Trans>Delivery performance</Trans>
          </h2>
          <small>
            <Trans>
              Current open work plus selected-month approval evidence.
            </Trans>
          </small>
        </StyledAdminSectionHeader>
        <StyledPerformanceMetrics>
          {metrics.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </StyledPerformanceMetrics>
        <p>
          {t`${operations.waitingReviewCount} waiting review`} ·{' '}
          {t`${operations.revisionCount} revision rounds this month`} ·{' '}
          {t`${operations.internalRevisionCount} classified as internal defects`}
        </p>
      </StyledDeliveryStack>
    </StyledAdminPanel>
  );
};
