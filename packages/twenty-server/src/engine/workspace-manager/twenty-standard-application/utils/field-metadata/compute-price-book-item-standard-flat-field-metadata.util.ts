import { msg } from '@lingui/core/macro';
import {
  DateDisplayFormat,
  FieldMetadataType,
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

export const buildPriceBookItemStandardFlatFieldMetadatas = ({
  now,
  objectName,
  workspaceId,
  standardObjectMetadataRelatedEntityIds,
  dependencyFlatEntityMaps,
  twentyStandardApplicationId,
}: Omit<
  CreateStandardFieldArgs<'priceBookItem', FieldMetadataType>,
  'context'
>): Record<AllStandardObjectFieldName<'priceBookItem'>, FlatFieldMetadata> => {
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
            message: `Price book item record position`,
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
        icon: 'IconTag',
        isSystem: true,
        isNullable: true,
      },
    }),
    name: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'name',
        type: FieldMetadataType.TEXT,
        label: i18nLabel(
          msg({ message: `Name`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `Name of the product or service`,
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
            message: `What this item covers`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconFileText',
        isNullable: true,
      },
    }),
    sku: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'sku',
        type: FieldMetadataType.TEXT,
        label: i18nLabel(
          msg({ message: `SKU`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `Stock keeping unit code`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconBarcode',
        isNullable: true,
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
            message: `Standard price per unit`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconCurrencyDollar',
        isNullable: false,
        defaultValue: { amountMicros: "'0'", currencyCode: "'USD'" },
      },
    }),
    bulkMinQuantity: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'bulkMinQuantity',
        type: FieldMetadataType.NUMBER,
        label: i18nLabel(
          msg({ message: `Bulk min quantity`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `Minimum quantity that unlocks the bulk unit price`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconStack2',
        isNullable: true,
      },
    }),
    bulkUnitPrice: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'bulkUnitPrice',
        type: FieldMetadataType.CURRENCY,
        label: i18nLabel(
          msg({ message: `Bulk unit price`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `Price per unit once the bulk minimum quantity is reached`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconCurrencyDollar',
        isNullable: true,
      },
    }),
    isActive: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'isActive',
        type: FieldMetadataType.BOOLEAN,
        label: i18nLabel(
          msg({ message: `Active`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `Whether this item can be added to new quotes`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconCheck',
        isNullable: false,
        defaultValue: true,
      },
    }),
    quoteLineItems: createStandardRelationFieldFlatMetadata({
      ...base,
      context: {
        type: FieldMetadataType.RELATION,
        morphId: null,
        fieldName: 'quoteLineItems',
        label: i18nLabel(
          msg({ message: `Quote line items`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `Quote lines that reference this price book item`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconListDetails',
        isNullable: true,
        isUIEditable: false,
        targetObjectName: 'quoteLineItem',
        targetFieldName: 'priceBookItem',
        settings: {
          relationType: RelationType.ONE_TO_MANY,
        },
      },
    }),
  };
};
