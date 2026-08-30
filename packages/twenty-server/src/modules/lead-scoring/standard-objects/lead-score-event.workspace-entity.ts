import { BaseWorkspaceEntity } from 'src/engine/twenty-orm/base.workspace-entity';
import { type EntityRelation } from 'src/engine/workspace-manager/workspace-migration/types/entity-relation.interface';
import { type LeadScoringRuleWorkspaceEntity } from 'src/modules/lead-scoring/standard-objects/lead-scoring-rule.workspace-entity';
import { type PersonWorkspaceEntity } from 'src/modules/person/standard-objects/person.workspace-entity';

export class LeadScoreEventWorkspaceEntity extends BaseWorkspaceEntity {
  person: EntityRelation<PersonWorkspaceEntity> | null;
  personId: string | null;
  rule: EntityRelation<LeadScoringRuleWorkspaceEntity> | null;
  ruleId: string | null;
  points: number;
  reason: string | null;
  eventKey: string;
  searchVector: string;
}
