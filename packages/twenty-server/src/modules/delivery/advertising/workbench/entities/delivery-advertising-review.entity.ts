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
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import {
  type AdvertisingGoalSnapshot,
  type AdvertisingLegacyHandling,
  type AdvertisingSourceKind,
  type AdvertisingSourceSnapshot,
} from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.types';

@Entity({ name: 'deliveryAdvertisingReview', schema: 'core' })
@Index(['workspaceId', 'id'], { unique: true })
@Check('revision > 0')
@Check("state IN ('DRAFT','ASSIGNED') AND \"sourceKind\" IN ('META','MANUAL')")
@Index(['workspaceId', 'sourceKind', 'sourceId'], {
  unique: true,
  where: '"state" = \'DRAFT\'',
})
@Index(['workspaceId', 'sourceKind', 'sourceId', 'createdAt', 'id'])
@Index(['workspaceId', 'projectId', 'createdAt', 'id'])
export class DeliveryAdvertisingReviewEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'text' }) sourceKind: AdvertisingSourceKind;
  @Column({ type: 'uuid' }) sourceId: string;
  @Column({ type: 'uuid' }) projectId: string;
  @Column({ type: 'integer' }) revision: number;
  @Column({ type: 'text' }) state: 'DRAFT' | 'ASSIGNED';
  @Column({ type: 'jsonb' }) source: AdvertisingSourceSnapshot;
  @Column({ type: 'jsonb' }) goal: AdvertisingGoalSnapshot;
  @Column({ type: 'text' }) note: string;
  @Column({ type: 'text' }) noChangeReason: string;
  @Column({ type: 'jsonb' }) legacyHandling: AdvertisingLegacyHandling;
  @Column({ type: 'uuid' }) createdBy: string;
  @Column({ type: 'uuid', nullable: true }) assignedBy: string | null;
  @Column({ type: 'timestamptz', nullable: true }) assignedAt: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @ManyToOne(() => DeliveryProjectEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'projectId', referencedColumnName: 'id' },
  ])
  project: Relation<DeliveryProjectEntity>;
}
