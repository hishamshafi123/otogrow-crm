import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import { type DeliveryKnowledgeCategory } from 'src/modules/delivery/knowledge/delivery-knowledge-category';
import { type FathomProvenance } from 'src/modules/delivery/knowledge/fathom/delivery-fathom.types';

@Entity({ name: 'deliveryKnowledgeVersion', schema: 'core' })
@Index(['workspaceId', 'sourceId', 'version'], { unique: true })
export class DeliveryKnowledgeVersionEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) sourceId: string;
  @Column({ type: 'integer' }) version: number;
  @Column({ type: 'text' }) title: string;
  @Column({ type: 'text', default: 'MEETING' })
  category: DeliveryKnowledgeCategory;
  @Column({ type: 'date' }) meetingDate: string;
  @Column({ type: 'text' }) sourceUrl: string;
  @Column({ type: 'text' }) transcript: string;
  @Column({ type: 'text' }) knowledge: string;
  @Column({ type: 'jsonb', nullable: true })
  fathomProvenance: FathomProvenance | null;
  @Column({ type: 'uuid' }) createdBy: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
