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
import { type CreativeAdLinkStatus } from '../delivery-creative-learning.types';
@Entity({ name: 'deliveryCreativeLearningEvent', schema: 'core' })
@Index(['workspaceId', 'requestId'], { unique: true })
@Index(['workspaceId', 'linkId', 'createdAt', 'id'])
@Check(`"inputHash" ~ '^[a-f0-9]{64}$' AND revision>0 AND version>0`)
@Check(
  `action IN ('SAVE','SUBMIT','REVIEW','REQUEST_CHANGES','RETRACT','LESSON')`,
)
@Check(
  `state IN ('DRAFT','SUBMITTED','CHANGES_REQUESTED','REVIEWED','RETRACTED')`,
)
export class DeliveryCreativeLearningEventEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'uuid' }) linkId: string;
  @Column({ type: 'uuid' }) requestId: string;
  @Column({ type: 'text' }) inputHash: string;
  @Column({ type: 'uuid' }) actorId: string;
  @Column({ type: 'uuid' }) userWorkspaceId: string;
  @Column({ type: 'text' }) actorName: string;
  @Column({ type: 'text' }) action:
    | 'SAVE'
    | 'SUBMIT'
    | 'REVIEW'
    | 'REQUEST_CHANGES'
    | 'RETRACT'
    | 'LESSON';
  @Column({ type: 'integer' }) revision: number;
  @Column({ type: 'integer' }) version: number;
  @Column({ type: 'text' }) state: CreativeAdLinkStatus;
  @Column({ type: 'text' }) note: string;
  @Column({ type: 'uuid', nullable: true }) lessonId: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @ManyToOne(() => DeliveryCreativeAdLinkEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'linkId', referencedColumnName: 'id' },
  ])
  link: Relation<DeliveryCreativeAdLinkEntity>;
}
