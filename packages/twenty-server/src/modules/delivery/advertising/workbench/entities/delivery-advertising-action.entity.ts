import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Relation,
} from 'typeorm';
import { DeliveryAdvertisingReviewEntity } from 'src/modules/delivery/advertising/workbench/entities/delivery-advertising-review.entity';
import { DeliveryTaskEntity } from 'src/modules/delivery/entities/delivery-task.entity';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import { type AdvertisingActionDefinition } from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.types';

@Entity({ name: 'deliveryAdvertisingAction', schema: 'core' })
@Index(['workspaceId', 'reviewId', 'id'], { unique: true })
@Check('position >= 0 AND position < 20')
@Index(['workspaceId', 'reviewId', 'position'])
@Index(['workspaceId', 'taskId'], { unique: true })
export class DeliveryAdvertisingActionEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'uuid' }) reviewId: string;
  @Column({ type: 'integer' }) position: number;
  @Column({ type: 'jsonb' }) definition: AdvertisingActionDefinition;
  @Column({ type: 'text' }) ownerName: string;
  @Column({ type: 'text' }) reviewerName: string;
  @Column({ type: 'uuid', nullable: true }) taskId: string | null;
  @Column({ type: 'integer', nullable: true }) assistantVersion: number | null;
  @Column({ type: 'text', nullable: true }) assistantName: string | null;
  @ManyToOne(() => DeliveryAdvertisingReviewEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'reviewId', referencedColumnName: 'id' },
  ])
  review: Relation<DeliveryAdvertisingReviewEntity>;
  @ManyToOne(() => DeliveryTaskEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'taskId', referencedColumnName: 'taskId' },
  ])
  task: Relation<DeliveryTaskEntity> | null;
}
