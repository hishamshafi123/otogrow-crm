import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
@Entity({ name: 'deliveryBatchItem', schema: 'core' })
@Index(['workspaceId', 'batchId', 'taskId'], { unique: true })
@Index(['workspaceId', 'batchId', 'active', 'id'])
export class DeliveryBatchItemEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) batchId: string;
  @Column({ type: 'uuid' }) taskId: string;
  @Column({ type: 'text' }) taskName: string;
  @Column({ type: 'text', default: '' }) concept: string;
  @Column({ type: 'boolean', default: true }) active: boolean;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
