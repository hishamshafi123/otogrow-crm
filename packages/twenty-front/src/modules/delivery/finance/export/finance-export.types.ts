import {
  type DeliveryFinanceExportsQuery,
  type DeliveryFinanceExportPreviewQuery,
  type DeliveryFinanceExportHistoryQuery,
} from '~/generated-metadata/graphql';

export type FinanceExportsSnapshot =
  DeliveryFinanceExportsQuery['deliveryFinanceExports'];
export type FinanceExportProfile = FinanceExportsSnapshot['profiles'][number];
export type FinanceExportBatch = FinanceExportsSnapshot['batches'][number];
export type FinanceExportBatchDetail = NonNullable<
  FinanceExportsSnapshot['selectedBatch']
>;
export type FinanceExportPreview =
  DeliveryFinanceExportPreviewQuery['deliveryFinanceExportPreview'];
export type FinanceExportRow = FinanceExportPreview['rows'][number];
export type FinanceExportExclusion = FinanceExportPreview['exclusions'][number];
export type FinanceExportTotals = FinanceExportPreview['totals'];
export type FinanceExportHistory =
  DeliveryFinanceExportHistoryQuery['deliveryFinanceExportHistory'];
export type FinanceExportDestination = (
  changes: Record<string, string | null>,
) => string;
