import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import { DeliveryCreativeAdLinkEntity } from './delivery-creative-ad-link.entity';
import { type CreativeAdLinkBody } from '../delivery-creative-learning.types';
@Entity({ name: 'deliveryCreativeAdVersion', schema: 'core' })
@Index(['workspaceId', 'linkId', 'version'], { unique: true })
@Check(`version>0 AND jsonb_typeof(body)='object'`)
export class DeliveryCreativeAdVersionEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) linkId: string;
  @Column({ type: 'integer' }) version: number;
  @Column({ type: 'jsonb' }) body: CreativeAdLinkBody;
  @Column({ type: 'uuid' }) createdBy: string;
  @Column({ type: 'text' }) createdByName: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @ManyToOne(() => DeliveryCreativeAdLinkEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'linkId', referencedColumnName: 'id' },
  ])
  link: Relation<DeliveryCreativeAdLinkEntity>;
}
