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
export const buildSequenceStandardFlatFieldMetadatas = ({
  now,
  objectName,
  workspaceId,
  standardObjectMetadataRelatedEntityIds,
  dependencyFlatEntityMaps,
  twentyStandardApplicationId,
}: Omit<
  CreateStandardFieldArgs<'sequence', FieldMetadataType>,
  'context'
>): Record<AllStandardObjectFieldName<'sequence'>, FlatFieldMetadata> => {
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
            message: `Sequence record position`,
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
        icon: 'IconMailFast',
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
            message: `Internal name of the sequence`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconAbc',
        isNullable: false,
        defaultValue: "''",
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
            message: `Sequence lifecycle status`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconProgress',
        isNullable: false,
        defaultValue: "'DRAFT'",
        options: [
          {
            id: '24bd7a8e-f868-48cf-8bb0-242abe735c32',
            value: 'DRAFT',
            label: i18nLabel(
              msg({ message: `Draft`, context: 'fieldMetadata.label' }),
            ),
            position: 0,
            color: 'gray',
          },
          {
            id: 'ae26fee1-5a2d-4406-80eb-8204ec2db1a8',
            value: 'ACTIVE',
            label: i18nLabel(
              msg({ message: `Active`, context: 'fieldMetadata.label' }),
            ),
            position: 1,
            color: 'green',
          },
          {
            id: 'a18dd610-91ba-4bab-aa9a-ed71a4b3b7ad',
            value: 'PAUSED',
            label: i18nLabel(
              msg({ message: `Paused`, context: 'fieldMetadata.label' }),
            ),
            position: 2,
            color: 'yellow',
          },
          {
            id: '5ad6220a-b3df-498f-9204-06cd3b318344',
            value: 'ARCHIVED',
            label: i18nLabel(
              msg({ message: `Archived`, context: 'fieldMetadata.label' }),
            ),
            position: 3,
            color: 'gray',
          },
        ],
      },
    }),
    businessHoursTimeZone: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'businessHoursTimeZone',
        type: FieldMetadataType.TEXT,
        label: i18nLabel(
          msg({
            message: `Business hours time zone`,
            context: 'fieldMetadata.label',
          }),
        ),
        description: i18nLabel(
          msg({
            message: `Time zone used to clamp sends to business hours`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconWorld',
        isNullable: true,
      },
    }),
    dailySendCap: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'dailySendCap',
        type: FieldMetadataType.NUMBER,
        label: i18nLabel(
          msg({ message: `Daily send cap`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `Maximum number of sequence emails sent per day`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconMailFast',
        isNullable: true,
      },
    }),
    unsubscribeTopicId: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'unsubscribeTopicId',
        type: FieldMetadataType.UUID,
        label: i18nLabel(
          msg({
            message: `Unsubscribe topic id`,
            context: 'fieldMetadata.label',
          }),
        ),
        description: i18nLabel(
          msg({
            message: `The unsubscribe topic this sequence is sent under`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconMailbox',
        isNullable: true,
        isUIEditable: false,
      },
    }),
    owner: createStandardRelationFieldFlatMetadata({
      ...base,
      context: {
        type: FieldMetadataType.RELATION,
        morphId: null,
        fieldName: 'owner',
        label: i18nLabel(
          msg({ message: `Owner`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `The workspace member whose mailbox sends the sequence`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconUserCircle',
        isNullable: true,
        targetObjectName: 'workspaceMember',
        targetFieldName: 'sequences',
        settings: {
          relationType: RelationType.MANY_TO_ONE,
          onDelete: RelationOnDeleteAction.SET_NULL,
          joinColumnName: 'ownerWorkspaceMemberId',
        },
      },
    }),
    steps: createStandardRelationFieldFlatMetadata({
      ...base,
      context: {
        type: FieldMetadataType.RELATION,
        morphId: null,
        fieldName: 'steps',
        label: i18nLabel(
          msg({ message: `Steps`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `The steps of this sequence`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconListNumbers',
        isNullable: true,
        isUIEditable: false,
        targetObjectName: 'sequenceStep',
        targetFieldName: 'sequence',
        settings: {
          relationType: RelationType.ONE_TO_MANY,
        },
      },
    }),
    enrollments: createStandardRelationFieldFlatMetadata({
      ...base,
      context: {
        type: FieldMetadataType.RELATION,
        morphId: null,
        fieldName: 'enrollments',
        label: i18nLabel(
          msg({ message: `Enrollments`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `The people enrolled in this sequence`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconUsers',
        isNullable: true,
        isUIEditable: false,
        targetObjectName: 'sequenceEnrollment',
        targetFieldName: 'sequence',
        settings: {
          relationType: RelationType.ONE_TO_MANY,
        },
      },
    }),
  };
};
