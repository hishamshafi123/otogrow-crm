import { msg } from '@lingui/core/macro';
import {
  DateDisplayFormat,
  FieldMetadataType,
  RelationOnDeleteAction,
  RelationType,
} from 'twenty-shared/types';

import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { type AllStandardObjectFieldName } from 'src/engine/workspace-manager/twenty-standard-application/types/all-standard-object-field-name.type';
import {
  type CreateStandardFieldArgs,
  createStandardFieldFlatMetadata,
} from 'src/engine/workspace-manager/twenty-standard-application/utils/field-metadata/create-standard-field-flat-metadata.util';
import { createStandardRelationFieldFlatMetadata } from 'src/engine/workspace-manager/twenty-standard-application/utils/field-metadata/create-standard-relation-field-flat-metadata.util';
import { i18nLabel } from 'src/engine/workspace-manager/twenty-standard-application/utils/i18n-label.util';

export const buildQuoteLineItemStandardFlatFieldMetadatas = ({
  now,
  objectName,
  workspaceId,
  standardObjectMetadataRelatedEntityIds,
  dependencyFlatEntityMaps,
  twentyStandardApplicationId,
}: Omit<
  CreateStandardFieldArgs<'quoteLineItem', FieldMetadataType>,
  'context'
>): Record<AllStandardObjectFieldName<'quoteLineItem'>, FlatFieldMetadata> => {
  const base = {
    standardObjectMetadataRelatedEntityIds,
    dependencyFlatEntityMaps,
    twentyStandardApplicationId,
    now,
    objectName,
    workspaceId,
  };

  return {
    id: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'id',
        type: FieldMetadataType.UUID,
        label: i18nLabel(
          msg({ message: `Id`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({ message: `Id`, context: 'fieldMetadata.description' }),
        ),
        icon: 'Icon123',
        isSystem: true,
        isNullable: false,
        isUIEditable: false,
        defaultValue: 'uuid',
      },
    }),
    createdAt: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'createdAt',
        type: FieldMetadataType.DATE_TIME,
        label: i18nLabel(
          msg({ message: `Creation date`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `Creation date`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconCalendar',
        isSystem: true,
        isNullable: false,
        isUIEditable: false,
        defaultValue: 'now',
        settings: { displayFormat: DateDisplayFormat.RELATIVE },
      },
    }),
    updatedAt: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'updatedAt',
        type: FieldMetadataType.DATE_TIME,
        label: i18nLabel(
          msg({ message: `Last update`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `Last time the record was changed`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconCalendarClock',
        isSystem: true,
        isNullable: false,
        isUIEditable: false,
        defaultValue: 'now',
        settings: { displayFormat: DateDisplayFormat.RELATIVE },
      },
    }),
    deletedAt: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'deletedAt',
        type: FieldMetadataType.DATE_TIME,
        label: i18nLabel(
          msg({ message: `Deleted at`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `Date when the record was deleted`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconCalendarMinus',
        isSystem: true,
        isNullable: true,
        isUIEditable: false,
        settings: { displayFormat: DateDisplayFormat.RELATIVE },
      },
    }),
    createdBy: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'createdBy',
        type: FieldMetadataType.ACTOR,
        label: i18nLabel(
          msg({ message: `Created by`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `The creator of the record`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconCreativeCommonsSa',
        isSystem: true,
        isUIEditable: false,
        isNullable: false,
        defaultValue: {
          source: "'MANUAL'",
          name: "'System'",
          workspaceMemberId: null,
        },
      },
    }),
    updatedBy: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'updatedBy',
        type: FieldMetadataType.ACTOR,
        label: i18nLabel(
          msg({ message: `Updated by`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `The workspace member who last updated the record`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconUserCircle',
        isSystem: true,
        isUIEditable: false,
        isNullable: false,
        defaultValue: {
          source: "'MANUAL'",
          name: "'System'",
          workspaceMemberId: null,
        },
      },
    }),
    position: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'position',
        type: FieldMetadataType.POSITION,
        label: i18nLabel(
          msg({ message: `Position`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `Row order of this line within its quote`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconHierarchy2',
        isSystem: true,
        isNullable: false,
        defaultValue: 0,
      },
    }),
    searchVector: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'searchVector',
        type: FieldMetadataType.TS_VECTOR,
        label: i18nLabel(
          msg({ message: `Search vector`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `Field used for full-text search`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconListDetails',
        isSystem: true,
        isNullable: true,
      },
    }),
    label: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'label',
        type: FieldMetadataType.TEXT,
        label: i18nLabel(
          msg({ message: `Label`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `Name of the product or service on this line`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconTag',
        isNullable: false,
        defaultValue: "''",
      },
    }),
    description: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'description',
        type: FieldMetadataType.TEXT,
        label: i18nLabel(
          msg({ message: `Description`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `Extra detail shown under the line label`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconFileText',
        isNullable: true,
      },
    }),
    quantity: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'quantity',
        type: FieldMetadataType.NUMBER,
        label: i18nLabel(
          msg({ message: `Quantity`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `Number of units on this line`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconStack2',
        isNullable: false,
        defaultValue: 1,
      },
    }),
    unitPrice: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'unitPrice',
        type: FieldMetadataType.CURRENCY,
        label: i18nLabel(
          msg({ message: `Unit price`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `Price per unit applied to this line`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconCurrencyDollar',
        isNullable: false,
        defaultValue: { amountMicros: "'0'", currencyCode: "'USD'" },
      },
    }),
    discountPercent: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'discountPercent',
        type: FieldMetadataType.NUMBER,
        label: i18nLabel(
          msg({ message: `Discount %`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `Percentage discount applied to this line`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconPercentage',
        isNullable: false,
        defaultValue: 0,
      },
    }),
    lineTotal: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'lineTotal',
        type: FieldMetadataType.CURRENCY,
        label: i18nLabel(
          msg({ message: `Line total`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `Quantity times unit price minus the line discount`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconCurrencyDollar',
        isNullable: true,
        isUIEditable: false,
      },
    }),
    quote: createStandardRelationFieldFlatMetadata({
      ...base,
      context: {
        type: FieldMetadataType.RELATION,
        morphId: null,
        fieldName: 'quote',
        label: i18nLabel(
          msg({ message: `Quote`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `The quote this line belongs to`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconFileDollar',
        isNullable: false,
        targetObjectName: 'quote',
        targetFieldName: 'lineItems',
        settings: {
          relationType: RelationType.MANY_TO_ONE,
          onDelete: RelationOnDeleteAction.CASCADE,
          joinColumnName: 'quoteId',
        },
      },
    }),
    priceBookItem: createStandardRelationFieldFlatMetadata({
      ...base,
      context: {
        type: FieldMetadataType.RELATION,
        morphId: null,
        fieldName: 'priceBookItem',
        label: i18nLabel(
          msg({ message: `Price book item`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `The price book item this line was built from`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconTag',
        isNullable: true,
        targetObjectName: 'priceBookItem',
        targetFieldName: 'quoteLineItems',
        settings: {
          relationType: RelationType.MANY_TO_ONE,
          // Lines keep their denormalized pricing when the catalog item is removed
          onDelete: RelationOnDeleteAction.SET_NULL,
          joinColumnName: 'priceBookItemId',
        },
      },
    }),
  };
};
