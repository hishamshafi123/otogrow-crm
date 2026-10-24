import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import { type DeliveryDetails } from 'src/modules/delivery/delivery.types';

@Entity({ name: 'deliveryTask', schema: 'core' })
@Index(['workspaceId', 'taskId'], { unique: true })
export class DeliveryTaskEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  taskId: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'jsonb' })
  details: DeliveryDetails;

  @Column({ type: 'integer', default: 1 })
  revision: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
