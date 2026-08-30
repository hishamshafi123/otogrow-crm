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

export const buildLeadScoreEventStandardFlatFieldMetadatas = ({
  now,
  objectName,
  workspaceId,
  standardObjectMetadataRelatedEntityIds,
  dependencyFlatEntityMaps,
  twentyStandardApplicationId,
}: Omit<
  CreateStandardFieldArgs<'leadScoreEvent', FieldMetadataType>,
  'context'
>): Record<AllStandardObjectFieldName<'leadScoreEvent'>, FlatFieldMetadata> => {
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
            message: `Lead score event record position`,
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
            message: `The person whose score changed`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconUser',
        isNullable: true,
        targetObjectName: 'person',
        targetFieldName: 'leadScoreEvents',
        settings: {
          relationType: RelationType.MANY_TO_ONE,
          onDelete: RelationOnDeleteAction.CASCADE,
          joinColumnName: 'personId',
        },
      },
    }),
    rule: createStandardRelationFieldFlatMetadata({
      ...base,
      context: {
        type: FieldMetadataType.RELATION,
        morphId: null,
        fieldName: 'rule',
        label: i18nLabel(
          msg({ message: `Rule`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `The lead scoring rule that granted these points`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconScoreboard',
        isNullable: true,
        targetObjectName: 'leadScoringRule',
        targetFieldName: 'leadScoreEvents',
        settings: {
          relationType: RelationType.MANY_TO_ONE,
          // History survives rule deletion so the score breakdown stays readable
          onDelete: RelationOnDeleteAction.SET_NULL,
          joinColumnName: 'ruleId',
        },
      },
    }),
    points: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'points',
        type: FieldMetadataType.NUMBER,
        label: i18nLabel(
          msg({ message: `Points`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `Points granted by this event (can be negative)`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconScoreboard',
        isNullable: false,
        isUIEditable: false,
        defaultValue: 0,
      },
    }),
    reason: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'reason',
        type: FieldMetadataType.TEXT,
        label: i18nLabel(
          msg({ message: `Reason`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `Human-readable explanation of why points were granted`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconFileText',
        isNullable: true,
        isUIEditable: false,
      },
    }),
    eventKey: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'eventKey',
        type: FieldMetadataType.TEXT,
        label: i18nLabel(
          msg({ message: `Event key`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `Deduplication key, one score event per key`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconKey',
        isNullable: false,
        isUIEditable: false,
        defaultValue: "''",
      },
    }),
  };
};
