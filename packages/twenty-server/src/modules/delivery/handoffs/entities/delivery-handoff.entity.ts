import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import { type DeliveryHandoffSource } from 'src/modules/delivery/handoffs/delivery-handoff-source.service';
@Entity({ name: 'deliveryHandoff', schema: 'core' })
@Index(['workspaceId', 'opportunityId'], { unique: true })
export class DeliveryHandoffEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) opportunityId: string;
  @Column({ type: 'uuid' }) projectId: string;
  @Column({ type: 'uuid' }) engagementId: string;
  @Column({ type: 'uuid' }) managerId: string;
  @Column({ type: 'uuid' }) reviewerId: string;
  @Column({ type: 'uuid' }) createdBy: string;
  @Column({ type: 'jsonb' }) source: DeliveryHandoffSource;
  @Column({ type: 'jsonb' }) setupTaskIds: string[];
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
