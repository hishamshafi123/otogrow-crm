import {
  type DeliveryAdvertisingDraftPreviewQuery,
  type DeliveryAdvertisingDraftRunQuery,
  type DeliveryAdvertisingDraftRequestQuery,
} from '~/generated-metadata/graphql';

export type AdvertisingDraftPreview =
  DeliveryAdvertisingDraftPreviewQuery['deliveryAdvertisingDraftPreview'];
export type AdvertisingDraftDetail =
  DeliveryAdvertisingDraftRunQuery['deliveryAdvertisingDraftRun'];
export type AdvertisingDraftResult = NonNullable<
  AdvertisingDraftDetail['run']['result']
>;
export type AdvertisingDraftSuggestion =
  AdvertisingDraftResult['suggestions'][number];
export type AdvertisingDraftReceipt = NonNullable<
  DeliveryAdvertisingDraftRequestQuery['deliveryAdvertisingDraftRequest']['receipt']
>;
export type AdvertisingDraftIntent = {
  requestId: string;
  runId: string;
  agentId: string;
  requirementsRequired: boolean;
};
