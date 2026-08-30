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

// The `property` field holds a dot path on person or its company. The scoring
// engine only resolves this whitelist: `jobTitle`, `city`, `company.name`,
// `company.addressCountry`, `company.domainName`.
export const buildLeadScoringRuleStandardFlatFieldMetadatas = ({
  now,
  objectName,
  workspaceId,
  standardObjectMetadataRelatedEntityIds,
  dependencyFlatEntityMaps,
  twentyStandardApplicationId,
}: Omit<
  CreateStandardFieldArgs<'leadScoringRule', FieldMetadataType>,
  'context'
>): Record<
  AllStandardObjectFieldName<'leadScoringRule'>,
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
            message: `Lead scoring rule record position`,
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
            message: `Name of the lead scoring rule`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconAbc',
        isNullable: false,
      },
    }),
    ruleType: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'ruleType',
        type: FieldMetadataType.SELECT,
        label: i18nLabel(
          msg({ message: `Rule type`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `Whether points come from a person property or an event`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconSwitch3',
        isNullable: false,
        defaultValue: "'PROPERTY'",
        options: [
          {
            id: '3c4d5e6f-7a8b-4c9d-ae0f-1a2b3c4d5e01',
            value: 'PROPERTY',
            label: i18nLabel(
              msg({ message: `Property`, context: 'fieldMetadata.label' }),
            ),
            position: 0,
            color: 'blue',
          },
          {
            id: '3c4d5e6f-7a8b-4c9d-ae0f-1a2b3c4d5e02',
            value: 'EVENT',
            label: i18nLabel(
              msg({ message: `Event`, context: 'fieldMetadata.label' }),
            ),
            position: 1,
            color: 'purple',
          },
        ],
      },
    }),
    property: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'property',
        type: FieldMetadataType.TEXT,
        label: i18nLabel(
          msg({ message: `Property`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `Dot path on the person or its company (e.g. jobTitle, company.name)`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconRoute',
        isNullable: true,
      },
    }),
    operator: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'operator',
        type: FieldMetadataType.SELECT,
        label: i18nLabel(
          msg({ message: `Operator`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `How the property value is compared`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconMathSymbols',
        isNullable: true,
        options: [
          {
            id: '4d5e6f7a-8b9c-4d0e-bf1a-2b3c4d5e6f01',
            value: 'EQ',
            label: i18nLabel(
              msg({ message: `Equals`, context: 'fieldMetadata.label' }),
            ),
            position: 0,
            color: 'blue',
          },
          {
            id: '4d5e6f7a-8b9c-4d0e-bf1a-2b3c4d5e6f02',
            value: 'NEQ',
            label: i18nLabel(
              msg({
                message: `Does not equal`,
                context: 'fieldMetadata.label',
              }),
            ),
            position: 1,
            color: 'blue',
          },
          {
            id: '4d5e6f7a-8b9c-4d0e-bf1a-2b3c4d5e6f03',
            value: 'CONTAINS',
            label: i18nLabel(
              msg({ message: `Contains`, context: 'fieldMetadata.label' }),
            ),
            position: 2,
            color: 'turquoise',
          },
          {
            id: '4d5e6f7a-8b9c-4d0e-bf1a-2b3c4d5e6f04',
            value: 'GT',
            label: i18nLabel(
              msg({ message: `Greater than`, context: 'fieldMetadata.label' }),
            ),
            position: 3,
            color: 'green',
          },
          {
            id: '4d5e6f7a-8b9c-4d0e-bf1a-2b3c4d5e6f05',
            value: 'LT',
            label: i18nLabel(
              msg({ message: `Less than`, context: 'fieldMetadata.label' }),
            ),
            position: 4,
            color: 'green',
          },
          {
            id: '4d5e6f7a-8b9c-4d0e-bf1a-2b3c4d5e6f06',
            value: 'IS_SET',
            label: i18nLabel(
              msg({ message: `Is set`, context: 'fieldMetadata.label' }),
            ),
            position: 5,
            color: 'purple',
          },
        ],
      },
    }),
    value: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'value',
        type: FieldMetadataType.TEXT,
        label: i18nLabel(
          msg({ message: `Value`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `Value the property is compared against`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconQuote',
        isNullable: true,
      },
    }),
    eventType: createStandardFieldFlatMetadata({
      ...base,
      context: {
        fieldName: 'eventType',
        type: FieldMetadataType.SELECT,
        label: i18nLabel(
          msg({ message: `Event type`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `The event that grants points`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconBolt',
        isNullable: true,
        options: [
          {
            id: '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a01',
            value: 'FORM_SUBMISSION',
            label: i18nLabel(
              msg({
                message: `Form submission`,
                context: 'fieldMetadata.label',
              }),
            ),
            position: 0,
            color: 'blue',
          },
          {
            id: '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a02',
            value: 'INBOUND_EMAIL',
            label: i18nLabel(
              msg({ message: `Inbound email`, context: 'fieldMetadata.label' }),
            ),
            position: 1,
            color: 'blue',
          },
          {
            id: '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a03',
            value: 'INBOUND_WHATSAPP',
            label: i18nLabel(
              msg({
                message: `Inbound WhatsApp`,
                context: 'fieldMetadata.label',
              }),
            ),
            position: 2,
            color: 'green',
          },
          {
            id: '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a04',
            value: 'INBOUND_SMS',
            label: i18nLabel(
              msg({ message: `Inbound SMS`, context: 'fieldMetadata.label' }),
            ),
            position: 3,
            color: 'green',
          },
          {
            id: '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a05',
            value: 'SEQUENCE_ENROLLED',
            label: i18nLabel(
              msg({
                message: `Enrolled in sequence`,
                context: 'fieldMetadata.label',
              }),
            ),
            position: 4,
            color: 'purple',
          },
          {
            id: '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a06',
            value: 'SEQUENCE_REPLIED',
            label: i18nLabel(
              msg({
                message: `Replied to sequence`,
                context: 'fieldMetadata.label',
              }),
            ),
            position: 5,
            color: 'purple',
          },
          {
            id: '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a07',
            value: 'SEQUENCE_COMPLETED',
            label: i18nLabel(
              msg({
                message: `Sequence completed`,
                context: 'fieldMetadata.label',
              }),
            ),
            position: 6,
            color: 'purple',
          },
        ],
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
            message: `Points granted when the rule matches (can be negative)`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconScoreboard',
        isNullable: false,
        defaultValue: 0,
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
            message: `Whether the rule currently grants points`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconPower',
        isNullable: false,
        defaultValue: true,
      },
    }),
    leadScoreEvents: createStandardRelationFieldFlatMetadata({
      ...base,
      context: {
        type: FieldMetadataType.RELATION,
        morphId: null,
        fieldName: 'leadScoreEvents',
        label: i18nLabel(
          msg({ message: `Score events`, context: 'fieldMetadata.label' }),
        ),
        description: i18nLabel(
          msg({
            message: `Score events granted by this rule`,
            context: 'fieldMetadata.description',
          }),
        ),
        icon: 'IconChartArrowsVertical',
        isUIEditable: false,
        isNullable: true,
        targetObjectName: 'leadScoreEvent',
        targetFieldName: 'rule',
        settings: {
          relationType: RelationType.ONE_TO_MANY,
        },
      },
    }),
  };
};
