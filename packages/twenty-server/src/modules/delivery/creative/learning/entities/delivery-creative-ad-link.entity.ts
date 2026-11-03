import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { DeliveryTaskEntity } from 'src/modules/delivery/entities/delivery-task.entity';
import { type CreativeAdLinkStatus } from '../delivery-creative-learning.types';
@Entity({ name: 'deliveryCreativeAdLink', schema: 'core' })
@Index(['workspaceId', 'id'], { unique: true })
@Index(['workspaceId', 'projectId', 'id'])
@Index(['workspaceId', 'sourceId', 'adId', 'id'])
@Index(['workspaceId', 'correctsId'], { unique: true })
@Check(
  `state IN ('DRAFT','SUBMITTED','CHANGES_REQUESTED','REVIEWED','RETRACTED') AND revision>0 AND "currentVersion">0`,
)
@Check(`"correctsId" IS NULL OR "correctsId"<>id`)
@Check(
  `(state IN ('REVIEWED','RETRACTED') AND "reviewedVersion" IS NOT NULL AND "reviewedVersion"="currentVersion" AND "reviewedBy" IS NOT NULL AND "reviewedBy"<>"createdBy" AND "reviewedAt" IS NOT NULL) OR (state NOT IN ('REVIEWED','RETRACTED') AND "reviewedVersion" IS NULL AND "correctsId" IS NULL)`,
)
export class DeliveryCreativeAdLinkEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'uuid' }) projectId: string;
  @Column({ type: 'uuid' }) sourceProjectId: string;
  @Column({ type: 'uuid', nullable: true }) companyId: string | null;
  @Column({ type: 'uuid' }) sourceId: string;
  @Column({ type: 'text' }) adId: string;
  @Column({ type: 'uuid' }) taskId: string;
  @Column({ type: 'uuid' }) assetId: string;
  @Column({ type: 'uuid' }) createdBy: string;
  @Column({ type: 'text' }) createdByName: string;
  @Column({ type: 'integer' }) revision: number;
  @Column({ type: 'integer' }) currentVersion: number;
  @Column({ type: 'text' }) state: CreativeAdLinkStatus;
  @Column({ type: 'integer', nullable: true }) reviewedVersion: number | null;
  @Column({ type: 'uuid', nullable: true }) reviewedBy: string | null;
  @Column({ type: 'text', nullable: true }) reviewedByName: string | null;
  @Column({ type: 'timestamptz', nullable: true }) reviewedAt: Date | null;
  @Column({ type: 'uuid', nullable: true }) correctsId: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @ManyToOne(() => DeliveryTaskEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'taskId', referencedColumnName: 'taskId' },
  ])
  task: Relation<DeliveryTaskEntity>;
  @ManyToOne(() => DeliveryProjectEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'projectId', referencedColumnName: 'id' },
  ])
  project: Relation<DeliveryProjectEntity>;
  @ManyToOne(() => DeliveryProjectEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'sourceProjectId', referencedColumnName: 'id' },
  ])
  sourceProject: Relation<DeliveryProjectEntity>;
  @ManyToOne(() => DeliveryCreativeAdLinkEntity, {
    onDelete: 'RESTRICT',
    nullable: true,
  })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'correctsId', referencedColumnName: 'id' },
  ])
  correctedLink: Relation<DeliveryCreativeAdLinkEntity> | null;
}
