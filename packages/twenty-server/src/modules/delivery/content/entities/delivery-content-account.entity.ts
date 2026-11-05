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
import { type ContentPlatform } from '../delivery-content.types';
@Entity({ name: 'deliveryContentAccount', schema: 'core' })
@Index(['workspaceId', 'id'], { unique: true })
@Index(['workspaceId', 'projectId', 'id'], { unique: true })
@Check('revision>0')
@Check("platform IN ('X','INSTAGRAM','FACEBOOK','TIKTOK')")
@Check(
  'length(btrim(name)) BETWEEN 1 AND 200 AND length(btrim(handle)) BETWEEN 1 AND 200',
)
export class DeliveryContentAccountEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'uuid' }) projectId: string;
  @Column({ type: 'uuid', nullable: true }) companyId: string | null;
  @Column({ type: 'integer' }) revision: number;
  @Column({ type: 'text' }) platform: ContentPlatform;
  @Column({ type: 'text' }) name: string;
  @Column({ type: 'text' }) handle: string;
  @Column({ type: 'text' }) profileUrl: string;
  @Column({ type: 'boolean', default: false }) archived: boolean;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @ManyToOne(() => DeliveryProjectEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'projectId', referencedColumnName: 'id' },
  ])
  project: Relation<DeliveryProjectEntity>;
}
