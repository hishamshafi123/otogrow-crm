import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import {
  type CommitmentActor,
  type CommitmentChange,
} from 'src/modules/delivery/commitments/delivery-commitments.types';

@Entity({ name: 'deliveryCommitmentEvent', schema: 'core' })
@Index(['workspaceId', 'periodId', 'createdAt', 'id'])
export class DeliveryCommitmentEventEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) periodId: string;
  @Column({ type: 'uuid', nullable: true }) actorId: string | null;
  @Column({ type: 'text' }) actorType: CommitmentActor['actorType'];
  @Column({ type: 'text' }) actorName: string;
  @Column({ type: 'text' }) action: string;
  @Column({ type: 'uuid', nullable: true }) taskId: string | null;
  @Column({ type: 'text', nullable: true }) taskName: string | null;
  @Column({ type: 'text' }) reason: string;
  @Column({ type: 'jsonb' }) changes: CommitmentChange[];
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
