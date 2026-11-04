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
import {
  type CompetitorPlatform,
  type CompetitorSourceStatus,
} from '../delivery-competitor.types';

@Entity({ name: 'deliveryCompetitorSource', schema: 'core' })
@Index(['workspaceId', 'id'], { unique: true })
@Index(['workspaceId', 'projectId', 'platform', 'canonicalKey'], {
  unique: true,
})
@Index(['workspaceId', 'projectId', 'status', 'id'])
@Check('revision>0 AND "currentVersion">0')
@Check("status IN ('ACTIVE','PAUSED','ARCHIVED')")
@Check("platform IN ('X','INSTAGRAM','META_AD_LIBRARY','MANUAL')")
@Check('"canonicalKey" ~ \'^[a-f0-9]{64}$\'')
@Check('length(btrim(label)) BETWEEN 1 AND 160')
@Check('length("canonicalReference") BETWEEN 1 AND 2000')
@Check('"ownerId"<>"reviewerId"')
@Check('"cadenceHours" BETWEEN 1 AND 720 AND "lookbackDays" BETWEEN 1 AND 90')
export class DeliveryCompetitorSourceEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'uuid' }) projectId: string;
  @Column({ type: 'uuid', nullable: true }) companyId: string | null;
  @Column({ type: 'uuid' }) createdBy: string;
  @Column({ type: 'text' }) label: string;
  @Column({ type: 'text' }) platform: CompetitorPlatform;
  @Column({ type: 'text' }) canonicalReference: string;
  @Column({ type: 'text' }) canonicalKey: string;
  @Column({ type: 'uuid' }) ownerId: string;
  @Column({ type: 'text' }) ownerName: string;
  @Column({ type: 'uuid' }) reviewerId: string;
  @Column({ type: 'text' }) reviewerName: string;
  @Column({ type: 'integer' }) revision: number;
  @Column({ type: 'integer' }) currentVersion: number;
  @Column({ type: 'text' }) status: CompetitorSourceStatus;
  @Column({ type: 'integer' }) cadenceHours: number;
  @Column({ type: 'integer' }) lookbackDays: number;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @ManyToOne(() => DeliveryProjectEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'projectId', referencedColumnName: 'id' },
  ])
  project: Relation<DeliveryProjectEntity>;
}
