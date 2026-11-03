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
import { DeliveryReviewAssignmentEntity } from 'src/modules/delivery/reviews/entities/delivery-review-assignment.entity';

@Entity({ name: 'deliveryReviewAssignmentEvent', schema: 'core' })
@Index(['workspaceId', 'commandId'], { unique: true })
@Index(['workspaceId', 'taskId', 'assignmentId', 'revision'], { unique: true })
@Index(['workspaceId', 'taskId', 'submissionVersion', 'createdAt', 'id'])
@Check('revision>0 AND "submissionVersion">0')
@Check(
  `(mode='PRIMARY' AND "reviewerId" IS NULL) OR (mode='BACKUP' AND "reviewerId" IS NOT NULL)`,
)
@Check(`"previousMode" IN ('PRIMARY','BACKUP')`)
@Check('length(btrim(reason)) BETWEEN 1 AND 2000')
@Check(`"requestHash" ~ '^[0-9a-f]{64}$'`)
export class DeliveryReviewAssignmentEventEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) taskId: string;
  @Column({ type: 'uuid' }) assignmentId: string;
  @Column({ type: 'integer' }) submissionVersion: number;
  @Column({ type: 'uuid' }) commandId: string;
  @Column({ type: 'text' }) requestHash: string;
  @Column({ type: 'integer' }) revision: number;
  @Column({ type: 'text' }) mode: 'PRIMARY' | 'BACKUP';
  @Column({ type: 'uuid', nullable: true }) reviewerId: string | null;
  @Column({ type: 'text', nullable: true }) reviewerName: string | null;
  @Column({ type: 'text' }) primaryReviewerName: string;
  @Column({ type: 'uuid', nullable: true }) primaryReviewerId: string | null;
  @Column({ type: 'text' }) previousMode: 'PRIMARY' | 'BACKUP';
  @Column({ type: 'text', nullable: true }) previousReviewerName: string | null;
  @Column({ type: 'uuid', nullable: true }) previousReviewerId: string | null;
  @Column({ type: 'text' }) reason: string;
  @Column({ type: 'uuid' }) actorId: string;
  @Column({ type: 'text' }) actorName: string;
  @Column({ type: 'timestamptz' }) createdAt: Date;
  @ManyToOne(() => DeliveryReviewAssignmentEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'taskId', referencedColumnName: 'taskId' },
    { name: 'assignmentId', referencedColumnName: 'id' },
    { name: 'submissionVersion', referencedColumnName: 'submissionVersion' },
  ])
  assignment: Relation<DeliveryReviewAssignmentEntity>;
}
