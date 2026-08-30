import { BaseWorkspaceEntity } from 'src/engine/twenty-orm/base.workspace-entity';
import { type EntityRelation } from 'src/engine/workspace-manager/workspace-migration/types/entity-relation.interface';
import { type PersonWorkspaceEntity } from 'src/modules/person/standard-objects/person.workspace-entity';
import { type SequenceEnrollmentWorkspaceEntity } from 'src/modules/sequences/standard-objects/sequence-enrollment.workspace-entity';

export class ChannelMessageWorkspaceEntity extends BaseWorkspaceEntity {
  channel: string;
  direction: string;
  fromNumber: string;
  toNumber: string;
  body: string;
  externalId: string | null;
  status: string;
  sentAt: Date | null;
  receivedAt: Date | null;
  errorMessage: string | null;
  person: EntityRelation<PersonWorkspaceEntity> | null;
  personId: string | null;
  sequenceEnrollment: EntityRelation<SequenceEnrollmentWorkspaceEntity> | null;
  sequenceEnrollmentId: string | null;
  searchVector: string;
}
