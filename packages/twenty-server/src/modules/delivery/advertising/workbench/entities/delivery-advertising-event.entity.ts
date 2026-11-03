import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Relation,
} from 'typeorm';
import { DeliveryAdvertisingReviewEntity } from 'src/modules/delivery/advertising/workbench/entities/delivery-advertising-review.entity';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import {
  type AdvertisingActionDefinition,
  type AdvertisingEventResult,
  type AdvertisingGoalSnapshot,
  type AdvertisingLegacyHandling,
  type AdvertisingSourceSnapshot,
} from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.types';

@Entity({ name: 'deliveryAdvertisingEvent', schema: 'core' })
@Check('"inputHash" ~ \'^[a-f0-9]{64}$\'')
@Check("action IN ('SAVED','ASSIGNED','OBSERVED')")
@Index(['workspaceId', 'reviewId', 'createdAt', 'id'])
export class DeliveryAdvertisingEventEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'uuid' }) reviewId: string;
  @Column({ type: 'uuid' }) actorId: string;
  @Column({ type: 'text' }) action: 'SAVED' | 'ASSIGNED' | 'OBSERVED';
  @Column({ type: 'text' }) inputHash: string;
  @Column({ type: 'jsonb' }) result: AdvertisingEventResult;
  @Column({ type: 'jsonb', nullable: true }) definition: {
    source: AdvertisingSourceSnapshot;
    goal: AdvertisingGoalSnapshot;
    note: string;
    noChangeReason: string;
    legacyHandling: AdvertisingLegacyHandling;
    actions: AdvertisingActionDefinition[];
  } | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @ManyToOne(() => DeliveryAdvertisingReviewEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'reviewId', referencedColumnName: 'id' },
  ])
  review: Relation<DeliveryAdvertisingReviewEntity>;
}
