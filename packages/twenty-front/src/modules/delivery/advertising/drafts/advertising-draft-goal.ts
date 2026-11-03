import { fastDeepEqual } from 'twenty-shared/utils';
import { type DeliveryAdvertisingGoalInput } from '~/generated-metadata/graphql';

export const advertisingDraftGoal = (
  goal: DeliveryAdvertisingGoalInput,
): DeliveryAdvertisingGoalInput => ({
  kind: goal.kind,
  provenance: goal.provenance,
  metricKey: goal.metricKey ?? null,
  metricAdId: goal.metricAdId ?? null,
  value: goal.value?.trim() || null,
  evidence: goal.evidence.trim(),
  targetCostMicros: goal.targetCostMicros ?? null,
});

export const sameAdvertisingDraftGoal = (
  first: DeliveryAdvertisingGoalInput,
  second: DeliveryAdvertisingGoalInput,
) => fastDeepEqual(advertisingDraftGoal(first), advertisingDraftGoal(second));

export const advertisingDraftGoalReady = (goal: DeliveryAdvertisingGoalInput) =>
  [
    'PURCHASES',
    'LEADS',
    'QUALIFIED_LEADS',
    'BOOKED_CALLS',
    'REGISTRATIONS',
    'SALES',
  ].includes(goal.kind) &&
  goal.metricAdId == null &&
  (goal.provenance === 'REPORT' ||
    (goal.provenance === 'HUMAN' && goal.evidence.trim().length > 0)) &&
  (goal.value == null || /^(0|[1-9]\d{0,17})(\.\d{1,12})?$/.test(goal.value));
