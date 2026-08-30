import { BaseWorkspaceEntity } from 'src/engine/twenty-orm/base.workspace-entity';
import { type EntityRelation } from 'src/engine/workspace-manager/workspace-migration/types/entity-relation.interface';
import { type ChannelMessageWorkspaceEntity } from 'src/modules/messaging/channels/standard-objects/channel-message.workspace-entity';
import { type MessageWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message.workspace-entity';
import { type PersonWorkspaceEntity } from 'src/modules/person/standard-objects/person.workspace-entity';
import { type SequenceWorkspaceEntity } from 'src/modules/sequences/standard-objects/sequence.workspace-entity';

export class SequenceEnrollmentWorkspaceEntity extends BaseWorkspaceEntity {
  status: string;
  currentStepPosition: number;
  nextSendAt: Date | null;
  lastSentAt: Date | null;
  lastError: string | null;
  threadExternalId: string | null;
  lastSentHeaderMessageId: string | null;
  sequence: EntityRelation<SequenceWorkspaceEntity>;
  sequenceId: string;
  person: EntityRelation<PersonWorkspaceEntity>;
  personId: string;
  messages: EntityRelation<MessageWorkspaceEntity[]>;
  channelMessages: EntityRelation<ChannelMessageWorkspaceEntity[]>;
  searchVector: string;
}
