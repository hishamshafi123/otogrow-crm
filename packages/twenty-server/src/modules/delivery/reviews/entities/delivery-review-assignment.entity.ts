import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Relation,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import { DeliveryTaskEntity } from 'src/modules/delivery/entities/delivery-task.entity';

@Entity({ name: 'deliveryReviewAssignment', schema: 'core' })
@Index(['workspaceId', 'taskId', 'submissionVersion'], { unique: true })
@Index(['workspaceId', 'taskId', 'id', 'submissionVersion'], { unique: true })
@Check('revision>0 AND "submissionVersion">0')
@Check(
  `(mode='PRIMARY' AND "reviewerId" IS NULL) OR (mode='BACKUP' AND "reviewerId" IS NOT NULL)`,
)
@Check('length(btrim(reason)) BETWEEN 1 AND 2000')
export class DeliveryReviewAssignmentEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) taskId: string;
  @Column({ type: 'integer' }) submissionVersion: number;
  @Column({ type: 'integer' }) revision: number;
  @Column({ type: 'text' }) mode: 'PRIMARY' | 'BACKUP';
  @Column({ type: 'uuid', nullable: true }) reviewerId: string | null;
  @Column({ type: 'text', nullable: true }) reviewerName: string | null;
  @Column({ type: 'text' }) reason: string;
  @Column({ type: 'uuid' }) changedBy: string;
  @Column({ type: 'text' }) changedByName: string;
  @Column({ type: 'timestamptz' }) changedAt: Date;
  @ManyToOne(() => DeliveryTaskEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'taskId', referencedColumnName: 'taskId' },
  ])
  task: Relation<DeliveryTaskEntity>;
}
