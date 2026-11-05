import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import { type DeliveryKnowledgeCategory } from 'src/modules/delivery/knowledge/delivery-knowledge-category';
import { type KnowledgeAssetBinding } from 'src/modules/delivery/knowledge/assets/delivery-knowledge-assets.policy';
import { type FathomProvenance } from 'src/modules/delivery/knowledge/fathom/delivery-fathom.types';

@Entity({ name: 'deliveryKnowledgeVersion', schema: 'core' })
@Index(['workspaceId', 'sourceId', 'version'], { unique: true })
@Check(
  "jsonb_typeof(attachments)='array' AND jsonb_array_length(attachments)<=10",
)
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
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  attachments: KnowledgeAssetBinding[];
  @Column({ type: 'uuid' }) createdBy: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
