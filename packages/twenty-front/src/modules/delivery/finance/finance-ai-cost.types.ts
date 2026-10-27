import { type DeliveryFinanceAiCostsQuery } from '~/generated-metadata/graphql';

export type FinanceAiCostSnapshot =
  DeliveryFinanceAiCostsQuery['deliveryFinanceAiCosts'];
export type FinanceAiCostSource = FinanceAiCostSnapshot['sources'][number];
export type FinanceAiCostEvidence =
  FinanceAiCostSource['evidenceOptions'][number];
export type FinanceAiCostEntryReference = NonNullable<
  FinanceAiCostSource['claim']['currentEntry']
>;
