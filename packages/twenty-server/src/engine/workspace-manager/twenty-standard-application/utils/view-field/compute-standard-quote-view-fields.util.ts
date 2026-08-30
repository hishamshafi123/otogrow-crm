import { type FlatViewField } from 'src/engine/metadata-modules/flat-view-field/types/flat-view-field.type';
import { type AllStandardObjectFieldName } from 'src/engine/workspace-manager/twenty-standard-application/types/all-standard-object-field-name.type';
import { type AllStandardObjectViewFieldGroupName } from 'src/engine/workspace-manager/twenty-standard-application/types/all-standard-object-view-field-group-name.type';
import { type AllStandardObjectViewFieldName } from 'src/engine/workspace-manager/twenty-standard-application/types/all-standard-object-view-field-name.type';
import { type AllStandardObjectViewName } from 'src/engine/workspace-manager/twenty-standard-application/types/all-standard-object-view-name.type';
import {
  createStandardViewFieldFlatMetadata,
  type CreateStandardViewFieldArgs,
} from 'src/engine/workspace-manager/twenty-standard-application/utils/view-field/create-standard-view-field-flat-metadata.util';

export const computeStandardQuoteViewFields = (
  args: Omit<CreateStandardViewFieldArgs<'quote'>, 'context'>,
): Record<string, FlatViewField> => {
  const buildViewField = <V extends AllStandardObjectViewName<'quote'>>(
    viewName: V,
    fieldName: AllStandardObjectFieldName<'quote'> &
      AllStandardObjectViewFieldName<'quote', V>,
    position: number,
    viewFieldGroupName?: AllStandardObjectViewFieldGroupName<'quote', V>,
  ) =>
    createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'quote',
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
    allQuotesQuoteNumber: buildViewField('allQuotes', 'quoteNumber', 0),
    allQuotesStatus: buildViewField('allQuotes', 'status', 1),
    allQuotesTotal: buildViewField('allQuotes', 'total', 2),
    allQuotesValidUntil: buildViewField('allQuotes', 'validUntil', 3),
    allQuotesCreatedAt: buildViewField('allQuotes', 'createdAt', 4),
    quoteRecordPageFieldsQuoteNumber: buildViewField(
      'quoteRecordPageFields',
      'quoteNumber',
      0,
      'details',
    ),
    quoteRecordPageFieldsStatus: buildViewField(
      'quoteRecordPageFields',
      'status',
      1,
      'details',
    ),
    quoteRecordPageFieldsValidUntil: buildViewField(
      'quoteRecordPageFields',
      'validUntil',
      2,
      'details',
    ),
    quoteRecordPageFieldsTaxPercent: buildViewField(
      'quoteRecordPageFields',
      'taxPercent',
      3,
      'details',
    ),
    quoteRecordPageFieldsTerms: buildViewField(
      'quoteRecordPageFields',
      'terms',
      4,
      'details',
    ),
    quoteRecordPageFieldsSubtotal: buildViewField(
      'quoteRecordPageFields',
      'subtotal',
      0,
      'pricing',
    ),
    quoteRecordPageFieldsTaxAmount: buildViewField(
      'quoteRecordPageFields',
      'taxAmount',
      1,
      'pricing',
    ),
    quoteRecordPageFieldsTotal: buildViewField(
      'quoteRecordPageFields',
      'total',
      2,
      'pricing',
    ),
    quoteRecordPageFieldsCompany: buildViewField(
      'quoteRecordPageFields',
      'company',
      0,
      'relations',
    ),
    quoteRecordPageFieldsPerson: buildViewField(
      'quoteRecordPageFields',
      'person',
      1,
      'relations',
    ),
    quoteRecordPageFieldsOpportunity: buildViewField(
      'quoteRecordPageFields',
      'opportunity',
      2,
      'relations',
    ),
    quoteRecordPageFieldsLineItems: buildViewField(
      'quoteRecordPageFields',
      'lineItems',
      3,
      'relations',
    ),
    quoteRecordPageFieldsCreatedAt: buildViewField(
      'quoteRecordPageFields',
      'createdAt',
      0,
      'system',
    ),
    quoteRecordPageFieldsCreatedBy: buildViewField(
      'quoteRecordPageFields',
      'createdBy',
      1,
      'system',
    ),
    quoteRecordPageFieldsUpdatedAt: buildViewField(
      'quoteRecordPageFields',
      'updatedAt',
      2,
      'system',
    ),
    quoteRecordPageFieldsUpdatedBy: buildViewField(
      'quoteRecordPageFields',
      'updatedBy',
      3,
      'system',
    ),
  };
};
