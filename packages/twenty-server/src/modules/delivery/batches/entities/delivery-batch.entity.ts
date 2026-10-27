import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
@Entity({ name: 'deliveryBatch', schema: 'core' })
@Index(['workspaceId', 'projectId', 'id'])
export class DeliveryBatchEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'uuid' }) projectId: string;
  @Column({ type: 'uuid', nullable: true }) periodId: string | null;
  @Column({ type: 'text' }) label: string;
  @Column({ type: 'date', nullable: true }) startDate: string | null;
  @Column({ type: 'date', nullable: true }) endDate: string | null;
  @Column({ type: 'text' }) timezone: string;
  @Column({ type: 'boolean', default: false }) closed: boolean;
  @Column({ type: 'integer' }) revision: number;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
