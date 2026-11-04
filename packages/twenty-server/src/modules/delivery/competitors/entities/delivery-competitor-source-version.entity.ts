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
import { type CompetitorSavedSourceBody } from '../delivery-competitor.types';

@Entity({ name: 'deliveryCompetitorSourceVersion', schema: 'core' })
@Index(['workspaceId', 'sourceId', 'version'], { unique: true })
@Check('version>0')
@Check("jsonb_typeof(body)='object'")
@Check(`COALESCE(body->>'canonicalKey' ~ '^[a-f0-9]{64}$', false)`)
@Check('octet_length(body::text)<=40000')
export class DeliveryCompetitorSourceVersionEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) sourceId: string;
  @Column({ type: 'integer' }) version: number;
  @Column({ type: 'uuid', nullable: true }) companyId: string | null;
  @Column({ type: 'jsonb' }) body: CompetitorSavedSourceBody;
  @Column({ type: 'uuid' }) createdBy: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @ManyToOne(() => DeliveryCompetitorSourceEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'sourceId', referencedColumnName: 'id' },
  ])
  source: Relation<DeliveryCompetitorSourceEntity>;
}
