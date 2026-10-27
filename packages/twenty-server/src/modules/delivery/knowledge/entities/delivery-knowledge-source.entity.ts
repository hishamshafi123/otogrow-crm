import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';

@Entity({ name: 'deliveryKnowledgeSource', schema: 'core' })
@Index(['workspaceId', 'projectId', 'id'])
export class DeliveryKnowledgeSourceEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'uuid' }) projectId: string;
  @Column({ type: 'uuid' }) createdBy: string;
  @Column({ type: 'integer' }) revision: number;
  @Column({ type: 'integer' }) currentVersion: number;
  @Column({ type: 'integer', nullable: true }) publishedVersion: number | null;
  @Column({ type: 'uuid', nullable: true }) publishedBy: string | null;
  @Column({ type: 'timestamptz', nullable: true }) publishedAt: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
