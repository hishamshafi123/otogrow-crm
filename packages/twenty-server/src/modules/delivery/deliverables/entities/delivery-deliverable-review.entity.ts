import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';

export type DeliverableReviewAuthorType = 'CLIENT' | 'STAFF';
export type DeliverableReviewDecision =
  | 'COMMENT'
  | 'APPROVED'
  | 'CHANGES_REQUESTED';

@Entity({ name: 'deliveryDeliverableReview', schema: 'core' })
@Index(['workspaceId', 'deliverableId', 'createdAt'])
export class DeliveryDeliverableReviewEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) deliverableId: string;
  @Column({ type: 'uuid', nullable: true }) variationId: string | null;
  @Column({ type: 'text' }) authorType: DeliverableReviewAuthorType;
  @Column({ type: 'uuid', nullable: true }) authorId: string | null;
  @Column({ type: 'text' }) authorName: string;
  @Column({ type: 'text' }) decision: DeliverableReviewDecision;
  @Column({ type: 'text', default: '' }) comment: string;
  @Column({ type: 'double precision', nullable: true })
  timestampSec: number | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
