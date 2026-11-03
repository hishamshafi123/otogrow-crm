import {
  Column,
  Check,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';

@Entity({ name: 'deliveryKnowledgeSource', schema: 'core' })
@Index(['workspaceId', 'projectId', 'id'])
@Index(['workspaceId', 'projectId', 'createdAt', 'id'])
@Index(['workspaceId', 'projectId', 'fathomRecordingId'], { unique: true })
@Check(
  '"fathomRecordingId" IS NULL OR "fathomRecordingId" ~ \'^[1-9][0-9]{0,14}$\'',
)
export class DeliveryKnowledgeSourceEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'uuid' }) projectId: string;
  @Column({ type: 'uuid' }) createdBy: string;
  @Column({ type: 'integer' }) revision: number;
  @Column({ type: 'integer' }) currentVersion: number;
  @Column({ type: 'text', nullable: true }) fathomRecordingId: string | null;
  @Column({ type: 'integer', nullable: true }) publishedVersion: number | null;
  @Column({ type: 'uuid', nullable: true }) publishedBy: string | null;
  @Column({ type: 'timestamptz', nullable: true }) publishedAt: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
