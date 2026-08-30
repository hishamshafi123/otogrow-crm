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
export const buildSequenceEnrollmentStandardFlatFieldMetadatas = ({
  now,
  objectName,
  workspaceId,
  standardObjectMetadataRelatedEntityIds,
  dependencyFlatEntityMaps,
  twentyStandardApplicationId,
}: Omit<
  CreateStandardFieldArgs<'sequenceEnrollment', FieldMetadataType>,
  'context'
>): Record<
  AllStandardObjectFieldName<'sequenceEnrollment'>,
  FlatFieldMetadata
> => {
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
            message: `Sequence enrollment record position`,
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
        icon: 'IconUserPlus',
        isSystem: true,
        isNullable: true,
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
            message: `Enrollment lifecycle status`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconProgress',
        isNullable: false,
        defaultValue: "'ACTIVE'",
        options: [
          {
            id: 'ca0d1419-2c85-426c-8f28-6d82f2be0d81',
            value: 'ACTIVE',
            label: i18nLabel(
              msg({ message: `Active`, context: 'fieldMetadata.label' }),
            ),
            position: 0,
            color: 'green',
          },
          {
            id: '5b25385d-6e70-4870-b9ac-69809732b6cb',
            value: 'REPLIED',
            label: i18nLabel(
              msg({ message: `Replied`, context: 'fieldMetadata.label' }),
            ),
            position: 1,
            color: 'blue',
          },
          {
            id: 'a78eb9fa-2dab-4f44-8a1e-f4753e8c2d1d',
            value: 'UNSUBSCRIBED',
            label: i18nLabel(
              msg({ message: `Unsubscribed`, context: 'fieldMetadata.label' }),
            ),
            position: 2,
            color: 'orange',
          },
          {
            id: '81eecb69-1bd4-4493-b06e-0630ca56fa44',
            value: 'BOUNCED',
            label: i18nLabel(
              msg({ message: `Bounced`, context: 'fieldMetadata.label' }),
            ),
            position: 3,
            color: 'red',
          },
          {
            id: 'e2381982-e9c5-4adf-a8e0-8d46cc9d3956',
            value: 'COMPLETED',
            label: i18nLabel(
              msg({ message: `Completed`, context: 'fieldMetadata.label' }),
            ),
            position: 4,
            color: 'turquoise',
          },
          {
            id: 'f5766e70-dff4-4ee4-bfc5-617c6787c7c6',
            value: 'REMOVED',
            label: i18nLabel(
              msg({ message: `Removed`, context: 'fieldMetadata.label' }),
            ),
            position: 5,
            color: 'gray',
          },
          {
            id: '12ecab6f-a11e-47fe-b329-b92732b47ce6',
            value: 'ERROR',
            label: i18nLabel(
              msg({ message: `Error`, context: 'fieldMetadata.label' }),
            ),
            position: 6,
            color: 'red',
          },
        ],
      },
    }),
    currentStepPosition: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'currentStepPosition',
        type: FieldMetadataType.NUMBER,
        label: i18nLabel(
          msg({
            message: `Current step position`,
            context: 'fieldMetadata.label',
          }),
        ),
        description: i18nLabel(
          msg({
            message: `Position of the last step sent to this person`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconListNumbers',
        isNullable: false,
        isUIEditable: false,
        defaultValue: 0,
      },
    }),
    nextSendAt: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'nextSendAt',
        type: FieldMetadataType.DATE_TIME,
        label: i18nLabel(
          msg({ message: `Next send at`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `When the next step is scheduled to be sent`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconCalendarClock',
        isNullable: true,
        isUIEditable: false,
        settings: { displayFormat: DateDisplayFormat.RELATIVE },
      },
    }),
    lastSentAt: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'lastSentAt',
        type: FieldMetadataType.DATE_TIME,
        label: i18nLabel(
          msg({ message: `Last sent at`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `When the last step was sent to this person`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconSend',
        isNullable: true,
        isUIEditable: false,
        settings: { displayFormat: DateDisplayFormat.RELATIVE },
      },
    }),
    lastError: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'lastError',
        type: FieldMetadataType.TEXT,
        label: i18nLabel(
          msg({ message: `Last error`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `The error that last prevented a step from sending`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconAlertCircle',
        isNullable: true,
        isUIEditable: false,
      },
    }),
    threadExternalId: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'threadExternalId',
        type: FieldMetadataType.TEXT,
        label: i18nLabel(
          msg({
            message: `Thread external id`,
            context: 'fieldMetadata.label',
          }),
        ),
        description: i18nLabel(
          msg({
            message: `Provider thread id used to send follow-ups in-thread`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconMessages',
        isNullable: true,
        isUIEditable: false,
      },
    }),
    lastSentHeaderMessageId: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'lastSentHeaderMessageId',
        type: FieldMetadataType.TEXT,
        label: i18nLabel(
          msg({
            message: `Last sent header message id`,
            context: 'fieldMetadata.label',
          }),
        ),
        description: i18nLabel(
          msg({
            message: `RFC 5322 Message-Id of the last sent step, used for in-reply-to threading`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconMail',
        isNullable: true,
        isUIEditable: false,
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
            message: `The sequence this enrollment belongs to`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconMailFast',
        isNullable: false,
        targetObjectName: 'sequence',
        targetFieldName: 'enrollments',
        settings: {
          relationType: RelationType.MANY_TO_ONE,
          onDelete: RelationOnDeleteAction.CASCADE,
          joinColumnName: 'sequenceId',
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
            message: `The enrolled person`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconUser',
        isNullable: false,
        targetObjectName: 'person',
        targetFieldName: 'sequenceEnrollments',
        settings: {
          relationType: RelationType.MANY_TO_ONE,
          onDelete: RelationOnDeleteAction.CASCADE,
          joinColumnName: 'personId',
        },
      },
    }),
    messages: createStandardRelationFieldFlatMetadata({
      ...base,
      context: {
        type: FieldMetadataType.RELATION,
        morphId: null,
        fieldName: 'messages',
        label: i18nLabel(
          msg({ message: `Messages`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `Messages sent as part of this enrollment`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconMessage',
        isNullable: true,
        isUIEditable: false,
        targetObjectName: 'message',
        targetFieldName: 'sequenceEnrollment',
        settings: {
          relationType: RelationType.ONE_TO_MANY,
        },
      },
    }),
    channelMessages: createStandardRelationFieldFlatMetadata({
      ...base,
      context: {
        type: FieldMetadataType.RELATION,
        morphId: null,
        fieldName: 'channelMessages',
        label: i18nLabel(
          msg({
            message: `Channel Messages`,
            context: 'fieldMetadata.label',
          }),
        ),
        description: i18nLabel(
          msg({
            message: `WhatsApp and SMS messages sent as part of this enrollment`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconMessage',
        isNullable: true,
        isUIEditable: false,
        targetObjectName: 'channelMessage',
        targetFieldName: 'sequenceEnrollment',
        settings: {
          relationType: RelationType.ONE_TO_MANY,
        },
      },
    }),
  };
};
