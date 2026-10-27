import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
@Entity({ name: 'deliveryWorkflowTemplate', schema: 'core' })
@Index(['workspaceId'])
export class DeliveryWorkflowTemplateEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'integer' }) revision: number;
  @Column({ type: 'integer' }) currentVersion: number;
  @Column({ type: 'boolean', default: false }) archived: boolean;
  @Column({ type: 'text', default: '' }) stateReason: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
