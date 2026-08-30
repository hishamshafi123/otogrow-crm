import { msg } from '@lingui/core/macro';
import { i18nLabel } from 'src/engine/workspace-manager/twenty-standard-application/utils/i18n-label.util';
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
export const buildSequenceStepStandardFlatFieldMetadatas = ({
  now,
  objectName,
  workspaceId,
  standardObjectMetadataRelatedEntityIds,
  dependencyFlatEntityMaps,
  twentyStandardApplicationId,
}: Omit<
  CreateStandardFieldArgs<'sequenceStep', FieldMetadataType>,
  'context'
>): Record<AllStandardObjectFieldName<'sequenceStep'>, FlatFieldMetadata> => {
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
            message: `Sequence step record position`,
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
        icon: 'IconListNumbers',
        isSystem: true,
        isNullable: true,
      },
    }),
    stepPosition: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'stepPosition',
        type: FieldMetadataType.NUMBER,
        label: i18nLabel(
          msg({ message: `Step position`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `Ordering of the step within the sequence, starting at 1`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconListNumbers',
        isNullable: false,
        defaultValue: 0,
      },
    }),
    delayValue: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'delayValue',
        type: FieldMetadataType.NUMBER,
        label: i18nLabel(
          msg({ message: `Delay value`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `How long to wait after the previous step before sending`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconClock',
        isNullable: false,
        defaultValue: 0,
      },
    }),
    delayUnit: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'delayUnit',
        type: FieldMetadataType.SELECT,
        label: i18nLabel(
          msg({ message: `Delay unit`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `Unit of the delay before sending this step`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconClock',
        isNullable: false,
        defaultValue: "'HOURS'",
        options: [
          {
            id: '43719426-7139-4b7c-90bb-9445714b31c2',
            value: 'MINUTES',
            label: i18nLabel(
              msg({ message: `Minutes`, context: 'fieldMetadata.label' }),
            ),
            position: 0,
            color: 'blue',
          },
          {
            id: '27537a0f-6dc0-4516-a134-ea66453aa14a',
            value: 'HOURS',
            label: i18nLabel(
              msg({ message: `Hours`, context: 'fieldMetadata.label' }),
            ),
            position: 1,
            color: 'blue',
          },
          {
            id: '22571992-4572-440a-8c9a-9390ecfdb929',
            value: 'DAYS',
            label: i18nLabel(
              msg({ message: `Days`, context: 'fieldMetadata.label' }),
            ),
            position: 2,
            color: 'blue',
          },
        ],
      },
    }),
    subject: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'subject',
        type: FieldMetadataType.TEXT,
        label: i18nLabel(
          msg({ message: `Subject`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `Email subject line`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconMail',
        isNullable: true,
      },
    }),
    channel: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'channel',
        type: FieldMetadataType.SELECT,
        label: i18nLabel(
          msg({ message: `Channel`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `The channel this step sends on`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconMessage',
        isNullable: false,
        defaultValue: "'EMAIL'",
        options: [
          {
            id: '6c953737-7242-46e1-a85d-0ae7cd9cb7fa',
            value: 'EMAIL',
            label: i18nLabel(
              msg({ message: `Email`, context: 'fieldMetadata.label' }),
            ),
            position: 0,
            color: 'blue',
          },
          {
            id: '4ffeabf1-886c-499c-83a5-5be95e362303',
            value: 'WHATSAPP',
            label: i18nLabel(
              msg({ message: `WhatsApp`, context: 'fieldMetadata.label' }),
            ),
            position: 1,
            color: 'green',
          },
          {
            id: '36728a64-ba05-4e86-954f-3f18ee8fd1f4',
            value: 'SMS',
            label: i18nLabel(
              msg({ message: `SMS`, context: 'fieldMetadata.label' }),
            ),
            position: 2,
            color: 'purple',
          },
        ],
      },
    }),
    body: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'body',
        type: FieldMetadataType.TEXT,
        label: i18nLabel(
          msg({ message: `Body`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `Message body sent to the enrolled person`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconFileText',
        isNullable: true,
      },
    }),
    whatsappTemplateName: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'whatsappTemplateName',
        type: FieldMetadataType.TEXT,
        label: i18nLabel(
          msg({
            message: `WhatsApp template name`,
            context: 'fieldMetadata.label',
          }),
        ),
        description: i18nLabel(
          msg({
            message: `Approved WhatsApp template used when the 24-hour messaging window is closed`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconBrandWhatsapp',
        isNullable: true,
      },
    }),
    whatsappTemplateParams: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'whatsappTemplateParams',
        type: FieldMetadataType.TEXT,
        label: i18nLabel(
          msg({
            message: `WhatsApp template params`,
            context: 'fieldMetadata.label',
          }),
        ),
        description: i18nLabel(
          msg({
            message: `JSON map of WhatsApp template variable values`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconBraces',
        isNullable: true,
      },
    }),
    sequence: createStandardRelationFieldFlatMetadata({
      ...base,
      context: {
        type: FieldMetadataType.RELATION,
        morphId: null,
        fieldName: 'sequence',
        label: i18nLabel(
          msg({ message: `Sequence`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `The sequence this step belongs to`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconMailFast',
        isNullable: false,
        targetObjectName: 'sequence',
        targetFieldName: 'steps',
        settings: {
          relationType: RelationType.MANY_TO_ONE,
          onDelete: RelationOnDeleteAction.CASCADE,
          joinColumnName: 'sequenceId',
        },
      },
    }),
  };
};
