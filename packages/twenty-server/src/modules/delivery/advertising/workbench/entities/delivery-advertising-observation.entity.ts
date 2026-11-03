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
import { DeliveryAdvertisingActionEntity } from 'src/modules/delivery/advertising/workbench/entities/delivery-advertising-action.entity';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import {
  type AdvertisingMetric,
  type AdvertisingObservationInput,
  type AdvertisingSourceSnapshot,
  type AdvertisingTaskEvidence,
} from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.types';

@Entity({ name: 'deliveryAdvertisingObservation', schema: 'core' })
@Index(['workspaceId', 'reviewId', 'actionId', 'id'], { unique: true })
@Check('"correctsId" IS NULL OR "correctsId" <> id')
@Index(['workspaceId', 'reviewId', 'createdAt', 'id'])
@Index(['workspaceId', 'correctsId'], { unique: true })
export class DeliveryAdvertisingObservationEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'uuid' }) reviewId: string;
  @Column({ type: 'uuid' }) actionId: string;
  @Column({ type: 'uuid', nullable: true }) correctsId: string | null;
  @Column({ type: 'uuid' }) actorId: string;
  @Column({ type: 'jsonb' }) observation: AdvertisingObservationInput;
  @Column({ type: 'jsonb', nullable: true })
  source: AdvertisingSourceSnapshot | null;
  @Column({ type: 'jsonb', nullable: true }) metric: AdvertisingMetric | null;
  @Column({ type: 'jsonb' }) task: AdvertisingTaskEvidence;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @ManyToOne(() => DeliveryAdvertisingActionEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'reviewId', referencedColumnName: 'reviewId' },
    { name: 'actionId', referencedColumnName: 'id' },
  ])
  action: Relation<DeliveryAdvertisingActionEntity>;
  @ManyToOne(() => DeliveryAdvertisingObservationEntity, {
    onDelete: 'RESTRICT',
    nullable: true,
  })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'reviewId', referencedColumnName: 'reviewId' },
    { name: 'actionId', referencedColumnName: 'actionId' },
    { name: 'correctsId', referencedColumnName: 'id' },
  ])
  correctedObservation: Relation<DeliveryAdvertisingObservationEntity> | null;
}
