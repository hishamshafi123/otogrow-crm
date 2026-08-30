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
export const buildChannelMessageStandardFlatFieldMetadatas = ({
  now,
  objectName,
  workspaceId,
  standardObjectMetadataRelatedEntityIds,
  dependencyFlatEntityMaps,
  twentyStandardApplicationId,
}: Omit<
  CreateStandardFieldArgs<'channelMessage', FieldMetadataType>,
  'context'
>): Record<AllStandardObjectFieldName<'channelMessage'>, FlatFieldMetadata> => {
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
            message: `Channel message record position`,
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
            message: `The messaging channel the message went through`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconMessage',
        isNullable: false,
        defaultValue: "'WHATSAPP'",
        options: [
          {
            id: '708d596b-6803-407c-aac1-1e0157ff4ce4',
            value: 'WHATSAPP',
            label: i18nLabel(
              msg({ message: `WhatsApp`, context: 'fieldMetadata.label' }),
            ),
            position: 0,
            color: 'green',
          },
          {
            id: 'e943b8bc-f895-4701-bd03-f360b69f73c3',
            value: 'SMS',
            label: i18nLabel(
              msg({ message: `SMS`, context: 'fieldMetadata.label' }),
            ),
            position: 1,
            color: 'blue',
          },
        ],
      },
    }),
    direction: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'direction',
        type: FieldMetadataType.SELECT,
        label: i18nLabel(
          msg({ message: `Direction`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `Whether the message was received or sent`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconArrowsExchange',
        isNullable: false,
        defaultValue: "'OUTBOUND'",
        options: [
          {
            id: 'c2d3696d-ad20-4728-ae77-e34c23833325',
            value: 'INBOUND',
            label: i18nLabel(
              msg({ message: `Inbound`, context: 'fieldMetadata.label' }),
            ),
            position: 0,
            color: 'turquoise',
          },
          {
            id: 'ddc659af-52cd-481d-875e-883d33e335a6',
            value: 'OUTBOUND',
            label: i18nLabel(
              msg({ message: `Outbound`, context: 'fieldMetadata.label' }),
            ),
            position: 1,
            color: 'blue',
          },
        ],
      },
    }),
    fromNumber: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'fromNumber',
        type: FieldMetadataType.TEXT,
        label: i18nLabel(
          msg({ message: `From number`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `E.164 phone number the message was sent from`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconPhone',
        isNullable: false,
        isUIEditable: false,
      },
    }),
    toNumber: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'toNumber',
        type: FieldMetadataType.TEXT,
        label: i18nLabel(
          msg({ message: `To number`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `E.164 phone number the message was sent to`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconPhone',
        isNullable: false,
        isUIEditable: false,
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
            message: `Text content of the message`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconFileText',
        isNullable: false,
      },
    }),
    externalId: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'externalId',
        type: FieldMetadataType.TEXT,
        label: i18nLabel(
          msg({ message: `External id`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `Provider message id (Twilio SID)`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconLink',
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
            message: `Delivery status of the message`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconProgress',
        isNullable: false,
        defaultValue: "'QUEUED'",
        options: [
          {
            id: 'a1b6465d-62a2-40e9-b542-23389bafe1c3',
            value: 'QUEUED',
            label: i18nLabel(
              msg({ message: `Queued`, context: 'fieldMetadata.label' }),
            ),
            position: 0,
            color: 'gray',
          },
          {
            id: 'ca503da5-6020-49e5-be6c-e8dddac494d2',
            value: 'SENT',
            label: i18nLabel(
              msg({ message: `Sent`, context: 'fieldMetadata.label' }),
            ),
            position: 1,
            color: 'blue',
          },
          {
            id: '960d2538-197c-4ff3-8018-ea7272b1d466',
            value: 'DELIVERED',
            label: i18nLabel(
              msg({ message: `Delivered`, context: 'fieldMetadata.label' }),
            ),
            position: 2,
            color: 'green',
          },
          {
            id: '6e8e67e6-fc53-4cbd-8862-6246106a637c',
            value: 'FAILED',
            label: i18nLabel(
              msg({ message: `Failed`, context: 'fieldMetadata.label' }),
            ),
            position: 3,
            color: 'red',
          },
          {
            id: '7c47d888-a229-497f-b6ef-126ed1aa9114',
            value: 'RECEIVED',
            label: i18nLabel(
              msg({ message: `Received`, context: 'fieldMetadata.label' }),
            ),
            position: 4,
            color: 'turquoise',
          },
        ],
      },
    }),
    sentAt: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'sentAt',
        type: FieldMetadataType.DATE_TIME,
        label: i18nLabel(
          msg({ message: `Sent at`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `When the message was sent`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconSend',
        isNullable: true,
        isUIEditable: false,
        settings: { displayFormat: DateDisplayFormat.RELATIVE },
      },
    }),
    receivedAt: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'receivedAt',
        type: FieldMetadataType.DATE_TIME,
        label: i18nLabel(
          msg({ message: `Received at`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `When the message was received`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconCalendarDown',
        isNullable: true,
        isUIEditable: false,
        settings: { displayFormat: DateDisplayFormat.RELATIVE },
      },
    }),
    errorMessage: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'errorMessage',
        type: FieldMetadataType.TEXT,
        label: i18nLabel(
          msg({ message: `Error message`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `Why the message failed to send or deliver`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconAlertCircle',
        isNullable: true,
        isUIEditable: false,
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
            message: `The person this message was exchanged with`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconUser',
        isNullable: true,
        targetObjectName: 'person',
        targetFieldName: 'channelMessages',
        settings: {
          relationType: RelationType.MANY_TO_ONE,
          onDelete: RelationOnDeleteAction.SET_NULL,
          joinColumnName: 'personId',
        },
      },
    }),
    sequenceEnrollment: createStandardRelationFieldFlatMetadata({
      ...base,
      context: {
        type: FieldMetadataType.RELATION,
        morphId: null,
        fieldName: 'sequenceEnrollment',
        label: i18nLabel(
          msg({
            message: `Sequence enrollment`,
            context: 'fieldMetadata.label',
          }),
        ),
        description: i18nLabel(
          msg({
            message: `The sequence enrollment this message was sent for`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconMailFast',
        isNullable: true,
        targetObjectName: 'sequenceEnrollment',
        targetFieldName: 'channelMessages',
        settings: {
          relationType: RelationType.MANY_TO_ONE,
          onDelete: RelationOnDeleteAction.SET_NULL,
          joinColumnName: 'sequenceEnrollmentId',
        },
      },
    }),
  };
};
