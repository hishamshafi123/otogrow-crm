import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';

// One row per workspace member who can receive leads; workspaceMemberId is the
// workspace-schema workspaceMember id (same value used as Task.assigneeId).
@Entity({ name: 'setterProfile', schema: 'core' })
@Index('IDX_SETTER_PROFILE_WORKSPACE_MEMBER', [
  'workspaceId',
  'workspaceMemberId',
])
export class SetterProfileEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: false })
  workspaceMemberId: string;

  @Column({ type: 'boolean', default: false })
  isSetter: boolean;

  // Comma-separated ISO weekdays ('1,2,3,4,5' = Mon-Fri), evaluated in UTC:
  // workspaces carry no timezone setting
  @Column({ type: 'text', default: '1,2,3,4,5' })
  activeDays: string;

  @Column({ type: 'int', default: 9 })
  activeStartHour: number;

  @Column({ type: 'int', default: 18 })
  activeEndHour: number;

  // Null means no daily cap
  @Column({ type: 'int', nullable: true })
  dailyLeadCap: number | null;

  @Column({ type: 'text', nullable: true })
  telegramChatId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastAssignedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamptz' })
  deletedAt: Date | null;
}
