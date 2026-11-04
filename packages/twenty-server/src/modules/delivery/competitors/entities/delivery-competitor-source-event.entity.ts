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
import { DeliveryCompetitorSourceEntity } from './delivery-competitor-source.entity';
import { DeliveryCompetitorSourceVersionEntity } from './delivery-competitor-source-version.entity';
import {
  type CompetitorSourceAction,
  type CompetitorSourceStatus,
} from '../delivery-competitor.types';

@Entity({ name: 'deliveryCompetitorSourceEvent', schema: 'core' })
@Index(['workspaceId', 'requestId'], { unique: true })
@Index(['workspaceId', 'sourceId', 'revision'], { unique: true })
@Check('revision>0 AND version>0')
@Check('"inputHash" ~ \'^[a-f0-9]{64}$\'')
@Check("action IN ('SAVE','PAUSE','RESTORE','ARCHIVE')")
@Check("status IN ('ACTIVE','PAUSED','ARCHIVED')")
@Check('length(note)<=2000')
export class DeliveryCompetitorSourceEventEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) sourceId: string;
  @Column({ type: 'uuid' }) requestId: string;
  @Column({ type: 'uuid' }) actorId: string;
  @Column({ type: 'uuid' }) userWorkspaceId: string;
  @Column({ type: 'text' }) actorName: string;
  @Column({ type: 'text' }) inputHash: string;
  @Column({ type: 'text' }) action: CompetitorSourceAction;
  @Column({ type: 'text' }) note: string;
  @Column({ type: 'integer' }) revision: number;
  @Column({ type: 'integer' }) version: number;
  @Column({ type: 'text' }) status: CompetitorSourceStatus;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @ManyToOne(() => DeliveryCompetitorSourceEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'sourceId', referencedColumnName: 'id' },
  ])
  source: Relation<DeliveryCompetitorSourceEntity>;
  @ManyToOne(() => DeliveryCompetitorSourceVersionEntity, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'sourceId', referencedColumnName: 'sourceId' },
    { name: 'version', referencedColumnName: 'version' },
  ])
  savedVersion: Relation<DeliveryCompetitorSourceVersionEntity>;
}
