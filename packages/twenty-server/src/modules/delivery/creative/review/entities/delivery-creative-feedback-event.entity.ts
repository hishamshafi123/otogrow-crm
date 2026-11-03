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
import { DeliveryCreativeFeedbackEntity } from 'src/modules/delivery/creative/review/entities/delivery-creative-feedback.entity';
import { type DeliveryCreativeReviewTargetDTO } from 'src/modules/delivery/creative/review/delivery-creative-review.dto';
@Entity({ name: 'deliveryCreativeFeedbackEvent', schema: 'core' })
@Index(['workspaceId', 'commandId'], { unique: true })
@Index(['workspaceId', 'taskId', 'feedbackId', 'revision'], { unique: true })
@Index(['workspaceId', 'taskId', 'feedbackId', 'createdAt', 'id'])
@Check('revision>0')
@Check('length(btrim(body)) BETWEEN 1 AND 6000')
@Check(`"requestHash" ~ '^[0-9a-f]{64}$'`)
@Check("action IN ('CREATED','REPLY','ADDRESSED','RESOLVED','REOPENED')")
@Check("\"afterStatus\" IN ('OPEN','ADDRESSED','RESOLVED')")
@Check(
  "\"beforeStatus\" IS NULL OR \"beforeStatus\" IN ('OPEN','ADDRESSED','RESOLVED')",
)
export class DeliveryCreativeFeedbackEventEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) taskId: string;
  @Column({ type: 'uuid' }) feedbackId: string;
  @Column({ type: 'uuid' }) commandId: string;
  @Column({ type: 'text' }) requestHash: string;
  @Column({ type: 'integer' }) revision: number;
  @Column({ type: 'text' }) action:
    | 'CREATED'
    | 'REPLY'
    | 'ADDRESSED'
    | 'RESOLVED'
    | 'REOPENED';
  @Column({ type: 'text' }) body: string;
  @Column({ type: 'uuid' }) actorId: string;
  @Column({ type: 'text' }) actorName: string;
  @Column({ type: 'timestamptz' }) createdAt: Date;
  @Column({ type: 'text', nullable: true }) beforeStatus:
    | 'OPEN'
    | 'ADDRESSED'
    | 'RESOLVED'
    | null;
  @Column({ type: 'text' }) afterStatus: 'OPEN' | 'ADDRESSED' | 'RESOLVED';
  @Column({ type: 'jsonb', nullable: true })
  correction: DeliveryCreativeReviewTargetDTO | null;
  @ManyToOne(() => DeliveryCreativeFeedbackEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'taskId', referencedColumnName: 'taskId' },
    { name: 'feedbackId', referencedColumnName: 'id' },
  ])
  feedback: Relation<DeliveryCreativeFeedbackEntity>;
}
