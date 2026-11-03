import {
  type DeliveryAtlasSettingsQuery,
  type DeliveryAtlasProductionQuery,
  type DeliveryAtlasRunQuery,
  type DeliveryAtlasRunsQuery,
  type QuoteDeliveryAtlasGenerationMutation,
} from '~/generated-metadata/graphql';
export type AtlasSettings = DeliveryAtlasSettingsQuery['deliveryAtlasSettings'];
export type AtlasProduction =
  DeliveryAtlasProductionQuery['deliveryAtlasProduction'];
export type AtlasProfile = AtlasSettings['profiles'][number];
export type AtlasFamily = AtlasSettings['families'][number];
export type AtlasRun = DeliveryAtlasRunQuery['deliveryAtlasRun'];
export type AtlasRuns = DeliveryAtlasRunsQuery['deliveryAtlasRuns'];
export type AtlasQuote =
  QuoteDeliveryAtlasGenerationMutation['quoteDeliveryAtlasGeneration'];
