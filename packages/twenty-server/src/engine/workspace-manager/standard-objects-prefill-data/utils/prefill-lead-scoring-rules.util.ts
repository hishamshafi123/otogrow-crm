import { type EntityManager } from 'typeorm';
import { FieldActorSource } from 'twenty-shared/types';

export const DEFAULT_LEAD_SCORING_RULES = [
  {
    id: '6a7b8c9d-0e1f-4a2b-bc3d-4e5f6a7b8c01',
    name: 'Form submission',
    ruleType: 'EVENT',
    property: null,
    operator: null,
    value: null,
    eventType: 'FORM_SUBMISSION',
    points: 10,
    position: 1,
  },
  {
    id: '6a7b8c9d-0e1f-4a2b-bc3d-4e5f6a7b8c02',
    name: 'Replied to sequence',
    ruleType: 'EVENT',
    property: null,
    operator: null,
    value: null,
    eventType: 'SEQUENCE_REPLIED',
    points: 20,
    position: 2,
  },
  {
    id: '6a7b8c9d-0e1f-4a2b-bc3d-4e5f6a7b8c03',
    name: 'WhatsApp reply',
    ruleType: 'EVENT',
    property: null,
    operator: null,
    value: null,
    eventType: 'INBOUND_WHATSAPP',
    points: 15,
    position: 3,
  },
  {
    id: '6a7b8c9d-0e1f-4a2b-bc3d-4e5f6a7b8c04',
    name: 'Has job title',
    ruleType: 'PROPERTY',
    property: 'jobTitle',
    operator: 'IS_SET',
    value: null,
    eventType: null,
    points: 5,
    position: 4,
  },
] as const;

export const prefillLeadScoringRules = async (
  entityManager: EntityManager,
  schemaName: string,
) => {
  await entityManager
    .createQueryBuilder()
    .insert()
    .into(`${schemaName}.leadScoringRule`, [
      'id',
      'name',
      'ruleType',
      'property',
      'operator',
      'value',
      'eventType',
      'points',
      'isActive',
      'position',
      'createdBySource',
      'createdByWorkspaceMemberId',
      'createdByName',
      'updatedBySource',
      'updatedByWorkspaceMemberId',
      'updatedByName',
    ])
    .orIgnore()
    .values(
      // Key order must match the column list above: TypeORM's insert builder
      // aligns object values positionally, not by key name
      DEFAULT_LEAD_SCORING_RULES.map((rule) => ({
        id: rule.id,
        name: rule.name,
        ruleType: rule.ruleType,
        property: rule.property,
        operator: rule.operator,
        value: rule.value,
        eventType: rule.eventType,
        points: rule.points,
        isActive: true,
        position: rule.position,
        createdBySource: FieldActorSource.SYSTEM,
        createdByWorkspaceMemberId: null,
        createdByName: 'System',
        updatedBySource: FieldActorSource.SYSTEM,
        updatedByWorkspaceMemberId: null,
        updatedByName: 'System',
      })),
    )
    .execute();
};
