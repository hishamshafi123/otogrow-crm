import {
  type DeliveryCapacitySummaryQuery,
  type DeliveryCapacityAssignmentsQuery,
} from '~/generated-metadata/graphql';
export type CapacitySummary =
  DeliveryCapacitySummaryQuery['deliveryCapacitySummary'];
export type CapacityAssignments =
  DeliveryCapacityAssignmentsQuery['deliveryCapacityAssignments'];
export type CapacityMemberDay =
  CapacitySummary['members'][number]['days'][number];
