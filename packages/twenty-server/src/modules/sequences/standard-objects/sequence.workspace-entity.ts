import { BaseWorkspaceEntity } from 'src/engine/twenty-orm/base.workspace-entity';
import { type EntityRelation } from 'src/engine/workspace-manager/workspace-migration/types/entity-relation.interface';
import { type SequenceEnrollmentWorkspaceEntity } from 'src/modules/sequences/standard-objects/sequence-enrollment.workspace-entity';
import { type SequenceStepWorkspaceEntity } from 'src/modules/sequences/standard-objects/sequence-step.workspace-entity';
import { type WorkspaceMemberWorkspaceEntity } from 'src/modules/workspace-member/standard-objects/workspace-member.workspace-entity';

export class SequenceWorkspaceEntity extends BaseWorkspaceEntity {
  name: string;
  status: string;
  businessHoursTimeZone: string | null;
  dailySendCap: number | null;
  unsubscribeTopicId: string | null;
  owner: EntityRelation<WorkspaceMemberWorkspaceEntity> | null;
  ownerId: string | null;
  steps: EntityRelation<SequenceStepWorkspaceEntity[]>;
  enrollments: EntityRelation<SequenceEnrollmentWorkspaceEntity[]>;
  searchVector: string;
}
