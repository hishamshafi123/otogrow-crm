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
import { DeliveryCreativeAdLinkEntity } from './delivery-creative-ad-link.entity';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { type CreativeLessonBody } from '../delivery-creative-learning.types';
@Entity({ name: 'deliveryCreativeLesson', schema: 'core' })
@Index(['workspaceId', 'id'], { unique: true })
@Index(['workspaceId', 'projectId', 'id'])
@Index(['workspaceId', 'correctsId'], { unique: true })
@Check(
  `jsonb_typeof(body)='object' AND cardinality("linkIds") BETWEEN 1 AND 5 AND "linkIds"[1]="anchorLinkId"`,
)
@Check(`"correctsId" IS NULL OR "correctsId"<>id`)
export class DeliveryCreativeLessonEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'uuid' }) projectId: string;
  @Column({ type: 'uuid', nullable: true }) companyId: string | null;
  @Column({ type: 'uuid' }) anchorLinkId: string;
  @Column({ type: 'uuid', array: true }) linkIds: string[];
  @Column({ type: 'jsonb' }) body: CreativeLessonBody;
  @Column({ type: 'uuid' }) createdBy: string;
  @Column({ type: 'text' }) createdByName: string;
  @Column({ type: 'uuid', nullable: true }) correctsId: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @ManyToOne(() => DeliveryProjectEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'projectId', referencedColumnName: 'id' },
  ])
  project: Relation<DeliveryProjectEntity>;
  @ManyToOne(() => DeliveryCreativeAdLinkEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'anchorLinkId', referencedColumnName: 'id' },
  ])
  anchorLink: Relation<DeliveryCreativeAdLinkEntity>;
  @ManyToOne(() => DeliveryCreativeLessonEntity, {
    onDelete: 'RESTRICT',
    nullable: true,
  })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'correctsId', referencedColumnName: 'id' },
  ])
  correctedLesson: Relation<DeliveryCreativeLessonEntity> | null;
}
