import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import { type CommitmentAllocationState } from 'src/modules/delivery/commitments/delivery-commitments.types';

@Entity({ name: 'deliveryCommitmentAllocation', schema: 'core' })
@Index(['workspaceId', 'taskId'], { unique: true })
@Index(['workspaceId', 'periodId', 'id'])
@Index(['workspaceId', 'parentTaskId'])
export class DeliveryCommitmentAllocationEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) periodId: string;
  @Column({ type: 'uuid' }) lineId: string;
  @Column({ type: 'uuid' }) taskId: string;
  @Column({ type: 'text' }) taskName: string;
  @Column({ type: 'uuid', nullable: true }) parentTaskId: string | null;
  @Column({ type: 'text' }) state: CommitmentAllocationState;
  @Column({ type: 'integer' }) revision: number;
  @Column({ type: 'integer', nullable: true }) creditedCycle: number | null;
  @Column({ type: 'integer', nullable: true }) creditedSubmissionVersion:
    | number
    | null;
  @Column({ type: 'timestamptz', nullable: true }) fulfilledAt: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
