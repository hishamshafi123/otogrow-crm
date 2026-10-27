import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';

@Entity({ name: 'otogrowAccessEvent', schema: 'core' })
@Index(['workspaceId', 'createdAt'])
@Index(['workspaceId', 'subjectMemberId', 'createdAt'])
export class OtogrowAccessEventEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  actorMemberId: string;

  @Column({ type: 'uuid', nullable: true })
  subjectMemberId: string | null;

  @Column({ type: 'uuid', nullable: true })
  roleId: string | null;

  @Column({ type: 'text' })
  action: 'ROLE_CREATED' | 'ROLE_UPDATED' | 'ROLES_ASSIGNED';

  @Column({ type: 'jsonb', nullable: true })
  before: Record<string, unknown> | null;

  @Column({ type: 'jsonb' })
  after: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
