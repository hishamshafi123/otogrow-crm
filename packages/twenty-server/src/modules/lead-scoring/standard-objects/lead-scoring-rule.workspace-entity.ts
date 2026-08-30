import { BaseWorkspaceEntity } from 'src/engine/twenty-orm/base.workspace-entity';
import { type EntityRelation } from 'src/engine/workspace-manager/workspace-migration/types/entity-relation.interface';
import { type LeadScoreEventWorkspaceEntity } from 'src/modules/lead-scoring/standard-objects/lead-score-event.workspace-entity';

export class LeadScoringRuleWorkspaceEntity extends BaseWorkspaceEntity {
  name: string;
  ruleType: string;
  property: string | null;
  operator: string | null;
  value: string | null;
  eventType: string | null;
  points: number;
  isActive: boolean;
  leadScoreEvents: EntityRelation<LeadScoreEventWorkspaceEntity[]>;
  searchVector: string;
}
