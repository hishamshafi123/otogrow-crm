import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';

// Append-only log of lead assignments. The unique (workspaceId, personId)
// index is what makes assignment idempotent: a person is assigned at most
// once, and a concurrent duplicate insert is a successful no-op.
@Entity({ name: 'setterAssignment', schema: 'core' })
@Index('IDX_SETTER_ASSIGNMENT_PERSON', ['workspaceId', 'personId'], {
  unique: true,
})
@Index('IDX_SETTER_ASSIGNMENT_PROFILE_CREATED', [
  'setterProfileId',
  'createdAt',
])
export class SetterAssignmentEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: false })
  setterProfileId: string;

  @Column({ type: 'uuid', nullable: false })
  workspaceMemberId: string;

  @Column({ type: 'uuid', nullable: false })
  personId: string;

  @Column({ type: 'timestamptz', nullable: true })
  notificationSentAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
