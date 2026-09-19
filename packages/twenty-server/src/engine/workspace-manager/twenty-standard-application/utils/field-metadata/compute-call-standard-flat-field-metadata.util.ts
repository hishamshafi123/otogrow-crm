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
export const buildCallStandardFlatFieldMetadatas = ({
  now,
  objectName,
  workspaceId,
  standardObjectMetadataRelatedEntityIds,
  dependencyFlatEntityMaps,
  twentyStandardApplicationId,
}: Omit<CreateStandardFieldArgs<'call', FieldMetadataType>, 'context'>): Record<
  AllStandardObjectFieldName<'call'>,
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
            message: `Call record position`,
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
            message: `Whether the call was received or made`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconArrowsExchange',
        isNullable: false,
        defaultValue: "'OUTBOUND'",
        options: [
          {
            id: 'fe5cd5c0-373e-4882-ac6a-90660a7b3781',
            value: 'INBOUND',
            label: i18nLabel(
              msg({ message: `Inbound`, context: 'fieldMetadata.label' }),
            ),
            position: 0,
            color: 'turquoise',
          },
          {
            id: '1135e7a1-9484-4dd7-b1c1-d41cc857a6c8',
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
            message: `Lifecycle status of the call`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconProgress',
        isNullable: false,
        defaultValue: "'INITIATED'",
        options: [
          {
            id: 'e3b6e151-8512-4b97-abcd-66916ac1bc99',
            value: 'INITIATED',
            label: i18nLabel(
              msg({ message: `Initiated`, context: 'fieldMetadata.label' }),
            ),
            position: 0,
            color: 'gray',
          },
          {
            id: 'f9e34ffe-b600-4a05-81a5-993444056f20',
            value: 'RINGING',
            label: i18nLabel(
              msg({ message: `Ringing`, context: 'fieldMetadata.label' }),
            ),
            position: 1,
            color: 'blue',
          },
          {
            id: '3d1ffe6e-bf37-42a8-a6f7-ffd6df505c99',
            value: 'IN_PROGRESS',
            label: i18nLabel(
              msg({ message: `In progress`, context: 'fieldMetadata.label' }),
            ),
            position: 2,
            color: 'green',
          },
          {
            id: '5ce2772d-df7c-451e-b84f-1c6b386f54c6',
            value: 'COMPLETED',
            label: i18nLabel(
              msg({ message: `Completed`, context: 'fieldMetadata.label' }),
            ),
            position: 3,
            color: 'turquoise',
          },
          {
            id: 'f229882a-4ad9-47e7-90b2-26afaa408cd4',
            value: 'NO_ANSWER',
            label: i18nLabel(
              msg({ message: `No answer`, context: 'fieldMetadata.label' }),
            ),
            position: 4,
            color: 'yellow',
          },
          {
            id: '035a3b7e-1ae7-4dc6-9d47-a4244744817f',
            value: 'BUSY',
            label: i18nLabel(
              msg({ message: `Busy`, context: 'fieldMetadata.label' }),
            ),
            position: 5,
            color: 'orange',
          },
          {
            id: 'ff302175-b2b8-4dc6-8f30-cf1d9462fb9c',
            value: 'FAILED',
            label: i18nLabel(
              msg({ message: `Failed`, context: 'fieldMetadata.label' }),
            ),
            position: 6,
            color: 'red',
          },
          {
            id: 'd18a2133-6159-4ae9-b248-0512dcf09b47',
            value: 'CANCELED',
            label: i18nLabel(
              msg({ message: `Canceled`, context: 'fieldMetadata.label' }),
            ),
            position: 7,
            color: 'gray',
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
            message: `E.164 phone number the call was made from`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconPhoneOutgoing',
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
            message: `E.164 phone number the call was made to`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconPhoneIncoming',
        isNullable: false,
        isUIEditable: false,
      },
    }),
    durationSeconds: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'durationSeconds',
        type: FieldMetadataType.NUMBER,
        label: i18nLabel(
          msg({
            message: `Duration (seconds)`,
            context: 'fieldMetadata.label',
          }),
        ),
        description: i18nLabel(
          msg({
            message: `Answered duration of the call in seconds`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconClock',
        isNullable: true,
        isUIEditable: false,
      },
    }),
    startedAt: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'startedAt',
        type: FieldMetadataType.DATE_TIME,
        label: i18nLabel(
          msg({ message: `Started at`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `When the call was initiated`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconPlayerPlay',
        isNullable: true,
        isUIEditable: false,
        settings: { displayFormat: DateDisplayFormat.RELATIVE },
      },
    }),
    answeredAt: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'answeredAt',
        type: FieldMetadataType.DATE_TIME,
        label: i18nLabel(
          msg({ message: `Answered at`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `When the call was answered`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconPhoneCheck',
        isNullable: true,
        isUIEditable: false,
        settings: { displayFormat: DateDisplayFormat.RELATIVE },
      },
    }),
    endedAt: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'endedAt',
        type: FieldMetadataType.DATE_TIME,
        label: i18nLabel(
          msg({ message: `Ended at`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `When the call ended`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconPhoneOff',
        isNullable: true,
        isUIEditable: false,
        settings: { displayFormat: DateDisplayFormat.RELATIVE },
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
            message: `Provider call id (Twilio CallSid)`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconLink',
        isNullable: true,
        isUIEditable: false,
      },
    }),
    recordingSid: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'recordingSid',
        type: FieldMetadataType.TEXT,
        label: i18nLabel(
          msg({ message: `Recording id`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `Provider recording id (Twilio RecordingSid)`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconMicrophone',
        isNullable: true,
        isUIEditable: false,
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
            message: `Why the call failed`,
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
            message: `The person this call was with`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconUser',
        isNullable: true,
        targetObjectName: 'person',
        targetFieldName: 'calls',
        settings: {
          relationType: RelationType.MANY_TO_ONE,
          onDelete: RelationOnDeleteAction.SET_NULL,
          joinColumnName: 'personId',
        },
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
            message: `The company this call was with`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconBuildingSkyscraper',
        isNullable: true,
        targetObjectName: 'company',
        targetFieldName: 'calls',
        settings: {
          relationType: RelationType.MANY_TO_ONE,
          onDelete: RelationOnDeleteAction.SET_NULL,
          joinColumnName: 'companyId',
        },
      },
    }),
  };
};
