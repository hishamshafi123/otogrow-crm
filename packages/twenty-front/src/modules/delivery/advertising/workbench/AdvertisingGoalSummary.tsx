import { Trans, useLingui } from '@lingui/react/macro';
import { type AdvertisingReview } from '@/delivery/advertising/workbench/advertising-draft';
import { useAdvertisingLabels } from '@/delivery/advertising/workbench/useAdvertisingLabels';
import {
  StyledAdvertisingFacts,
  StyledAdvertisingText,
} from '@/delivery/advertising/workbench/advertisingWorkbenchStyles';
import { StyledDeliveryStack } from '@/delivery/deliveryStyles';
import { parseFinanceAmountMicros } from '@/delivery/finance/finance-money';

export const AdvertisingGoalSummary = ({
  goal,
}: {
  goal: AdvertisingReview['goal'];
}) => {
  const { t } = useLingui();
  const labels = useAdvertisingLabels();
  const amount =
    goal.metricUnit === 'MONEY' && goal.value != null
      ? parseFinanceAmountMicros(goal.value)
      : null;
  return (
    <StyledDeliveryStack>
      <StyledAdvertisingFacts>
        <dt>
          <Trans>Reviewed outcome</Trans>
        </dt>
        <dd>{labels.goal(goal.kind)}</dd>
        <dt>
          <Trans>Chosen metric</Trans>
        </dt>
        <dd>{goal.metricLabel ?? t`Not mapped — outcome unknown`}</dd>
        <dt>
          <Trans>Reported value</Trans>
        </dt>
        <dd>
          {goal.metricUnit === 'MONEY' && goal.value != null
            ? amount === null
              ? `${goal.value} ${goal.currency}`
              : labels.money(amount, goal.currency)
            : labels.count(goal.value)}
        </dd>
        <dt>
          <Trans>Evidence basis</Trans>
        </dt>
        <dd>{labels.provenance(goal.metricProvenance)}</dd>
        <dt>
          <Trans>Reporting period</Trans>
        </dt>
        <dd>
          {goal.fromDate} – {goal.throughDate} ·{' '}
          {goal.timezone ?? t`Timezone not recorded`}
        </dd>
        {goal.metricUnit !== 'MONEY' && (
          <>
            <dt>
              <Trans>Target cost per outcome</Trans>
            </dt>
            <dd>
              {goal.targetCostMicros == null
                ? t`No target recorded`
                : labels.money(goal.targetCostMicros, goal.currency)}
            </dd>
          </>
        )}
      </StyledAdvertisingFacts>
      {goal.metricReason && <p>{labels.reason(goal.metricReason)}</p>}
      {goal.evidence && (
        <StyledAdvertisingText>{goal.evidence}</StyledAdvertisingText>
      )}
    </StyledDeliveryStack>
  );
};
