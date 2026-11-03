import {
  type DeliveryAssistantContextQuery,
  type DeliveryAssistantCatalogQuery,
  type DeliveryAssistantQuery,
  type DeliveryAssistantConfigurationQuery,
  type DeliveryAssistantRunsQuery,
  type DeliveryAssistantRunQuery,
  type PreviewDeliveryAssistantMutation,
  type SaveDeliveryAssistantMutation,
  type StartDeliveryAssistantMutation,
  type DeliveryAssistantTaskChoicesQuery,
} from '~/generated-metadata/graphql';

export type AssistantContext =
  DeliveryAssistantContextQuery['deliveryAssistantContext'];
export type AssistantCatalog =
  DeliveryAssistantCatalogQuery['deliveryAssistantCatalog'];
export type AssistantSelection = DeliveryAssistantQuery['deliveryAssistant'];
export type AssistantSummary = AssistantCatalog['items'][number];
export type AssistantConfigurationDetail =
  DeliveryAssistantConfigurationQuery['deliveryAssistantConfiguration'];
export type AssistantConfiguration =
  AssistantConfigurationDetail['configuration'];
export type AssistantRuns = DeliveryAssistantRunsQuery['deliveryAssistantRuns'];
export type AssistantRunSummary = AssistantRuns['items'][number];
export type AssistantRunDetail =
  DeliveryAssistantRunQuery['deliveryAssistantRun'];
export type AssistantPreview =
  PreviewDeliveryAssistantMutation['previewDeliveryAssistant'];
export type AssistantSaveReceipt =
  SaveDeliveryAssistantMutation['saveDeliveryAssistant'];
export type AssistantRunReceipt =
  StartDeliveryAssistantMutation['startDeliveryAssistant'];
export type AssistantTaskChoices =
  DeliveryAssistantTaskChoicesQuery['deliveryTaskList'];
