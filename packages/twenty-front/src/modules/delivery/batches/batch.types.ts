import {
  type DeliveryBatchesQuery,
  type DeliveryBatchSaveInput,
  type DeliveryBatchStateInput,
  type DeliveryBatchItemInput,
} from '~/generated-metadata/graphql';
export type BatchSnapshot = DeliveryBatchesQuery['deliveryBatches'];
export type Batch = NonNullable<BatchSnapshot['selected']>;
export type BatchTask = BatchSnapshot['tasks'][number];
export type BatchEditorSelection = { key: string } & (
  | { kind: 'plan'; batch?: Batch; id: string }
  | { kind: 'state'; batch: Batch }
  | { kind: 'item'; batch: Batch; task?: BatchTask; remove?: boolean }
);
export type BatchCommand =
  | { kind: 'plan'; input: DeliveryBatchSaveInput }
  | { kind: 'state'; input: DeliveryBatchStateInput }
  | { kind: 'item'; input: DeliveryBatchItemInput };
