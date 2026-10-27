import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import {
  type CommitmentBilling,
  type CommitmentPeriodState,
} from 'src/modules/delivery/commitments/delivery-commitments.types';

@Entity({ name: 'deliveryCommitmentPeriod', schema: 'core' })
@Index(['workspaceId', 'engagementId', 'startDate'])
export class DeliveryCommitmentPeriodEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'uuid' }) engagementId: string;
  @Column({ type: 'uuid' }) projectId: string;
  @Column({ type: 'uuid' }) clientId: string;
  @Column({ type: 'text' }) label: string;
  @Column({ type: 'text' }) billing: CommitmentBilling;
  @Column({ type: 'date' }) startDate: string;
  @Column({ type: 'date', nullable: true }) endDateExclusive: string | null;
  @Column({ type: 'text' }) timezone: string;
  @Column({ type: 'text' }) state: CommitmentPeriodState;
  @Column({ type: 'integer' }) revision: number;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
