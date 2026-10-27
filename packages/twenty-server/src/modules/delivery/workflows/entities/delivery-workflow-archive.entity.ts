import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import { type DeliveryAppliedWorkflow } from 'src/modules/delivery/workflows/delivery-workflows.types';
@Entity({ name: 'deliveryWorkflowArchive', schema: 'core' })
@Index(['workspaceId', 'taskId', 'createdAt', 'id'])
export class DeliveryWorkflowArchiveEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) taskId: string;
  @Column({ type: 'jsonb' }) snapshot: DeliveryAppliedWorkflow;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
