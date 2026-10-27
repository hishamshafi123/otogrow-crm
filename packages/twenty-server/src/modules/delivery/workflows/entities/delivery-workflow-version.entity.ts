import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import { type DeliveryWorkflowDefinition } from 'src/modules/delivery/workflows/delivery-workflows.types';
@Entity({ name: 'deliveryWorkflowVersion', schema: 'core' })
@Index(['workspaceId', 'templateId', 'version'], { unique: true })
export class DeliveryWorkflowVersionEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) templateId: string;
  @Column({ type: 'integer' }) version: number;
  @Column({ type: 'jsonb' }) definition: DeliveryWorkflowDefinition;
  @Column({ type: 'uuid' }) publishedBy: string;
  @Column({ type: 'text' }) publishedByName: string;
  @Column({ type: 'text' }) reason: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
