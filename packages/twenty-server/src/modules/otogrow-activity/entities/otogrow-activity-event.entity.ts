import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import {
  type OtogrowActivityChange,
  type OtogrowActivityInput,
} from 'src/modules/otogrow-activity/otogrow-activity.types';

@Entity({ name: 'otogrowActivityEvent', schema: 'core' })
@Index(['workspaceId', 'occurredAt', 'id'])
@Index(['workspaceId', 'actorId', 'occurredAt'])
@Index(['workspaceId', 'subjectMemberId', 'occurredAt'])
@Index(['workspaceId', 'clientId', 'occurredAt'])
@Index(['workspaceId', 'projectId', 'occurredAt'])
export class OtogrowActivityEventEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'timestamptz' }) occurredAt: Date;
  @CreateDateColumn({ type: 'timestamptz' }) recordedAt: Date;
  @Column({ type: 'uuid', nullable: true }) actorId: string | null;
  @Column({ type: 'text' }) actorName: string;
  @Column({ type: 'text' }) actorType: 'HUMAN' | 'AGENT' | 'SYSTEM' | 'CLIENT';
  @Column({ type: 'uuid', nullable: true }) subjectMemberId: string | null;
  @Column({ type: 'text', nullable: true }) subjectName: string | null;
  @Column({ type: 'text' }) category: OtogrowActivityInput['category'];
  @Column({ type: 'text' }) action: string;
  @Column({ type: 'text' }) outcome: OtogrowActivityInput['outcome'];
  @Column({ type: 'text' }) summary: string;
  @Column({ type: 'uuid', nullable: true }) projectId: string | null;
  @Column({ type: 'text', nullable: true }) projectName: string | null;
  @Column({ type: 'uuid', nullable: true }) clientId: string | null;
  @Column({ type: 'text', nullable: true }) clientName: string | null;
  @Column({ type: 'uuid', nullable: true }) taskId: string | null;
  @Column({ type: 'text', nullable: true }) taskName: string | null;
  @Column({ type: 'text', nullable: true }) agentName: string | null;
  @Column({ type: 'text' }) sourceType: OtogrowActivityInput['sourceType'];
  @Column({ type: 'uuid' }) sourceId: string;
  @Column({ type: 'jsonb', default: [] }) changes: OtogrowActivityChange[];
}
