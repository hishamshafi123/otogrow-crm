import { BaseWorkspaceEntity } from 'src/engine/twenty-orm/base.workspace-entity';
import { type EntityRelation } from 'src/engine/workspace-manager/workspace-migration/types/entity-relation.interface';
import { type SequenceWorkspaceEntity } from 'src/modules/sequences/standard-objects/sequence.workspace-entity';

export class SequenceStepWorkspaceEntity extends BaseWorkspaceEntity {
  stepPosition: number;
  delayValue: number;
  delayUnit: string;
  channel: string;
  subject: string | null;
  body: string | null;
  whatsappTemplateName: string | null;
  whatsappTemplateParams: string | null;
  sequence: EntityRelation<SequenceWorkspaceEntity>;
  sequenceId: string;
  searchVector: string;
}
