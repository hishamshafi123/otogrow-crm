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

export const buildQuoteStandardFlatFieldMetadatas = ({
  now,
  objectName,
  workspaceId,
  standardObjectMetadataRelatedEntityIds,
  dependencyFlatEntityMaps,
  twentyStandardApplicationId,
}: Omit<
  CreateStandardFieldArgs<'quote', FieldMetadataType>,
  'context'
>): Record<AllStandardObjectFieldName<'quote'>, FlatFieldMetadata> => {
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
            message: `Quote record position`,
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
        icon: 'IconFileDollar',
        isSystem: true,
        isNullable: true,
      },
    }),
    quoteNumber: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'quoteNumber',
        type: FieldMetadataType.TEXT,
        label: i18nLabel(
          msg({ message: `Quote number`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `Unique human-readable quote number (e.g. QT-0001)`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconHash',
        isNullable: true,
        isUIEditable: false,
      },
    }),
    status: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'status',
        type: FieldMetadataType.SELECT,
        label: i18nLabel(
          msg({ message: `Status`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `Quote lifecycle status`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconProgress',
        isNullable: false,
        defaultValue: "'DRAFT'",
        options: [
          {
            id: 'e9fd86ce-d82e-40d1-a00e-668a390c6917',
            value: 'DRAFT',
            label: i18nLabel(
              msg({ message: `Draft`, context: 'fieldMetadata.label' }),
            ),
            position: 0,
            color: 'gray',
          },
          {
            id: '82c7c787-e7fb-4e47-8be0-a0bb2a9ae9b7',
            value: 'SENT',
            label: i18nLabel(
              msg({ message: `Sent`, context: 'fieldMetadata.label' }),
            ),
            position: 1,
            color: 'blue',
          },
          {
            id: 'ce51a3e0-5ba7-4da6-baf7-f6ccd3a20ba9',
            value: 'ACCEPTED',
            label: i18nLabel(
              msg({ message: `Accepted`, context: 'fieldMetadata.label' }),
            ),
            position: 2,
            color: 'green',
          },
          {
            id: 'ab7de343-d729-4d59-8792-95b193e03b6e',
            value: 'REJECTED',
            label: i18nLabel(
              msg({ message: `Rejected`, context: 'fieldMetadata.label' }),
            ),
            position: 3,
            color: 'red',
          },
          {
            id: '580e950a-4cd3-430f-b47d-52643eb497d5',
            value: 'EXPIRED',
            label: i18nLabel(
              msg({ message: `Expired`, context: 'fieldMetadata.label' }),
            ),
            position: 4,
            color: 'orange',
          },
        ],
      },
    }),
    taxPercent: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'taxPercent',
        type: FieldMetadataType.NUMBER,
        label: i18nLabel(
          msg({ message: `Tax %`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `Tax rate applied on the quote subtotal`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconPercentage',
        isNullable: false,
        defaultValue: 0,
      },
    }),
    validUntil: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'validUntil',
        type: FieldMetadataType.DATE,
        label: i18nLabel(
          msg({ message: `Valid until`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `Date until which the quote pricing is valid`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconCalendarEvent',
        isNullable: true,
      },
    }),
    subtotal: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'subtotal',
        type: FieldMetadataType.CURRENCY,
        label: i18nLabel(
          msg({ message: `Subtotal`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `Sum of line totals before tax`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconCurrencyDollar',
        isNullable: true,
        isUIEditable: false,
      },
    }),
    taxAmount: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'taxAmount',
        type: FieldMetadataType.CURRENCY,
        label: i18nLabel(
          msg({ message: `Tax amount`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `Tax amount computed from the subtotal and tax rate`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconCurrencyDollar',
        isNullable: true,
        isUIEditable: false,
      },
    }),
    total: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'total',
        type: FieldMetadataType.CURRENCY,
        label: i18nLabel(
          msg({ message: `Total`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `Quote total including tax`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconCurrencyDollar',
        isNullable: true,
        isUIEditable: false,
      },
    }),
    terms: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'terms',
        type: FieldMetadataType.TEXT,
        label: i18nLabel(
          msg({ message: `Terms`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `Terms and conditions printed on the quote PDF`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconFileText',
        isNullable: true,
      },
    }),
    company: createStandardRelationFieldFlatMetadata({
      ...base,
      context: {
        type: FieldMetadataType.RELATION,
        morphId: null,
        fieldName: 'company',
        label: i18nLabel(
          msg({ message: `Company`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `The company this quote is for`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconBuildingSkyscraper',
        isNullable: true,
        targetObjectName: 'company',
        targetFieldName: 'quotes',
        settings: {
          relationType: RelationType.MANY_TO_ONE,
          // Quotes are kept for audit when the customer record is deleted
          onDelete: RelationOnDeleteAction.SET_NULL,
          joinColumnName: 'companyId',
        },
      },
    }),
    person: createStandardRelationFieldFlatMetadata({
      ...base,
      context: {
        type: FieldMetadataType.RELATION,
        morphId: null,
        fieldName: 'person',
        label: i18nLabel(
          msg({ message: `Person`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `The contact this quote is addressed to`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconUser',
        isNullable: true,
        targetObjectName: 'person',
        targetFieldName: 'quotes',
        settings: {
          relationType: RelationType.MANY_TO_ONE,
          onDelete: RelationOnDeleteAction.SET_NULL,
          joinColumnName: 'personId',
        },
      },
    }),
    opportunity: createStandardRelationFieldFlatMetadata({
      ...base,
      context: {
        type: FieldMetadataType.RELATION,
        morphId: null,
        fieldName: 'opportunity',
        label: i18nLabel(
          msg({ message: `Opportunity`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `The opportunity this quote belongs to`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconTargetArrow',
        isNullable: true,
        targetObjectName: 'opportunity',
        targetFieldName: 'quotes',
        settings: {
          relationType: RelationType.MANY_TO_ONE,
          onDelete: RelationOnDeleteAction.SET_NULL,
          joinColumnName: 'opportunityId',
        },
      },
    }),
    lineItems: createStandardRelationFieldFlatMetadata({
      ...base,
      context: {
        type: FieldMetadataType.RELATION,
        morphId: null,
        fieldName: 'lineItems',
        label: i18nLabel(
          msg({ message: `Line items`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `Priced lines that make up this quote`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconListDetails',
        isNullable: true,
        isUIEditable: false,
        targetObjectName: 'quoteLineItem',
        targetFieldName: 'quote',
        settings: {
          relationType: RelationType.ONE_TO_MANY,
        },
      },
    }),
  };
};
