import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import { type DeliveryOperations } from 'src/modules/delivery/operations/delivery-operations.types';

@Entity({ name: 'deliveryOperations', schema: 'core' })
@Index(['workspaceId'], { unique: true })
export class DeliveryOperationsEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'jsonb' })
  state: DeliveryOperations;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
