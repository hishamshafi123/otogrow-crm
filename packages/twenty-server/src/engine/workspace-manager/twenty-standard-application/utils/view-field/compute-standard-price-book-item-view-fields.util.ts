import { type FlatViewField } from 'src/engine/metadata-modules/flat-view-field/types/flat-view-field.type';
import { type AllStandardObjectFieldName } from 'src/engine/workspace-manager/twenty-standard-application/types/all-standard-object-field-name.type';
import { type AllStandardObjectViewFieldGroupName } from 'src/engine/workspace-manager/twenty-standard-application/types/all-standard-object-view-field-group-name.type';
import { type AllStandardObjectViewFieldName } from 'src/engine/workspace-manager/twenty-standard-application/types/all-standard-object-view-field-name.type';
import { type AllStandardObjectViewName } from 'src/engine/workspace-manager/twenty-standard-application/types/all-standard-object-view-name.type';
import {
  createStandardViewFieldFlatMetadata,
  type CreateStandardViewFieldArgs,
} from 'src/engine/workspace-manager/twenty-standard-application/utils/view-field/create-standard-view-field-flat-metadata.util';

export const computeStandardPriceBookItemViewFields = (
  args: Omit<CreateStandardViewFieldArgs<'priceBookItem'>, 'context'>,
): Record<string, FlatViewField> => {
  const buildViewField = <V extends AllStandardObjectViewName<'priceBookItem'>>(
    viewName: V,
    fieldName: AllStandardObjectFieldName<'priceBookItem'> &
      AllStandardObjectViewFieldName<'priceBookItem', V>,
    position: number,
    viewFieldGroupName?: AllStandardObjectViewFieldGroupName<
      'priceBookItem',
      V
    >,
  ) =>
    createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'priceBookItem',
      context: {
        viewName,
        viewFieldName: fieldName,
        fieldName,
        position,
        isVisible: true,
        size: 150,
        ...(viewFieldGroupName !== undefined ? { viewFieldGroupName } : {}),
      },
    });

  return {
    allPriceBookItemsName: buildViewField('allPriceBookItems', 'name', 0),
    allPriceBookItemsSku: buildViewField('allPriceBookItems', 'sku', 1),
    allPriceBookItemsUnitPrice: buildViewField(
      'allPriceBookItems',
      'unitPrice',
      2,
    ),
    allPriceBookItemsIsActive: buildViewField(
      'allPriceBookItems',
      'isActive',
      3,
    ),
    allPriceBookItemsCreatedAt: buildViewField(
      'allPriceBookItems',
      'createdAt',
      4,
    ),
    priceBookItemRecordPageFieldsName: buildViewField(
      'priceBookItemRecordPageFields',
      'name',
      0,
      'general',
    ),
    priceBookItemRecordPageFieldsDescription: buildViewField(
      'priceBookItemRecordPageFields',
      'description',
      1,
      'general',
    ),
    priceBookItemRecordPageFieldsSku: buildViewField(
      'priceBookItemRecordPageFields',
      'sku',
      2,
      'general',
    ),
    priceBookItemRecordPageFieldsIsActive: buildViewField(
      'priceBookItemRecordPageFields',
      'isActive',
      3,
      'general',
    ),
    priceBookItemRecordPageFieldsUnitPrice: buildViewField(
      'priceBookItemRecordPageFields',
      'unitPrice',
      0,
      'pricing',
    ),
    priceBookItemRecordPageFieldsBulkMinQuantity: buildViewField(
      'priceBookItemRecordPageFields',
      'bulkMinQuantity',
      1,
      'pricing',
    ),
    priceBookItemRecordPageFieldsBulkUnitPrice: buildViewField(
      'priceBookItemRecordPageFields',
      'bulkUnitPrice',
      2,
      'pricing',
    ),
    priceBookItemRecordPageFieldsQuoteLineItems: buildViewField(
      'priceBookItemRecordPageFields',
      'quoteLineItems',
      3,
      'pricing',
    ),
    priceBookItemRecordPageFieldsCreatedAt: buildViewField(
      'priceBookItemRecordPageFields',
      'createdAt',
      0,
      'system',
    ),
    priceBookItemRecordPageFieldsCreatedBy: buildViewField(
      'priceBookItemRecordPageFields',
      'createdBy',
      1,
      'system',
    ),
    priceBookItemRecordPageFieldsUpdatedAt: buildViewField(
      'priceBookItemRecordPageFields',
      'updatedAt',
      2,
      'system',
    ),
    priceBookItemRecordPageFieldsUpdatedBy: buildViewField(
      'priceBookItemRecordPageFields',
      'updatedBy',
      3,
      'system',
    ),
  };
};
