import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import { type CommitmentUnit } from 'src/modules/delivery/commitments/delivery-commitments.types';

@Entity({ name: 'deliveryCommitmentLine', schema: 'core' })
@Index(['workspaceId', 'periodId'])
export class DeliveryCommitmentLineEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'uuid' }) periodId: string;
  @Column({ type: 'text' }) label: string;
  @Column({ type: 'text' }) unit: CommitmentUnit;
  @Column({ type: 'integer' }) promisedQuantity: number;
  @Column({ type: 'integer' }) revision: number;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
