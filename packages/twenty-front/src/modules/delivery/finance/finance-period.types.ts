import { type DeliveryFinancePeriodQuery } from '~/generated-metadata/graphql';

export type FinancePeriodSnapshot =
  DeliveryFinancePeriodQuery['deliveryFinancePeriod'];
export type FinancePeriodState = FinancePeriodSnapshot['period'];
