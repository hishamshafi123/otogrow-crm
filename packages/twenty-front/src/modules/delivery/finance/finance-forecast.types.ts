import {
  type DeliveryFinanceForecastQuery,
  type DeliveryFinanceForecastSourcesQuery,
  type DeliveryFinanceForecastHistoryQuery,
} from '~/generated-metadata/graphql';

export type FinanceForecastSnapshot =
  DeliveryFinanceForecastQuery['deliveryFinanceForecast'];
export type FinanceForecastSources =
  DeliveryFinanceForecastSourcesQuery['deliveryFinanceForecastSources'];
export type FinanceForecastHistorySnapshot =
  DeliveryFinanceForecastHistoryQuery['deliveryFinanceForecastHistory'];
export type FinanceForecastProjection = Pick<
  FinanceForecastSnapshot,
  | 'actualInflowMicros'
  | 'actualOutflowMicros'
  | 'currentCashMicros'
  | 'expectedInflowMicros'
  | 'expectedOutflowMicros'
  | 'endingCashMicros'
  | 'firstNegativeDate'
  | 'timeline'
>;
export type FinanceForecastItem = FinanceForecastSnapshot['items'][number];
export type FinanceForecastSource = FinanceForecastSources['sources'][number];
export type FinanceForecastAnchor = NonNullable<
  FinanceForecastSnapshot['anchor']
>;
export type FinanceForecastRealization =
  FinanceForecastSnapshot['realizations'][number];
