import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import { type StudioCachedImageAnalysis } from 'src/modules/delivery/deliverables/entities/delivery-deliverable.entity';
import { type StagedProviderUrlMap } from 'src/modules/delivery/studio/entities/delivery-studio-reference-video.entity';

export type StudioProductAssetItem = {
  id: string;
  role: string; // Dynamic: 'FRONT', 'BACK', 'DETAIL', 'SIDE', 'TALENT', 'PACKAGING', or custom label
  label: string;
  storageKey: string;
  originalFileName: string | null;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  stagedUrls?: StagedProviderUrlMap;
  aiVisualAnalysis?: StudioCachedImageAnalysis | null;
  createdAt: string;
};

@Entity({ name: 'deliveryStudioProductKit', schema: 'core' })
@Index(['workspaceId', 'id'], { unique: true })
@Index(['workspaceId', 'companyId', 'projectId'])
export class DeliveryStudioProductKitEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid' })
  companyId: string;

  @Column({ type: 'uuid', nullable: true })
  projectId: string | null;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', default: '' })
  sku: string;

  @Column({ type: 'text', default: '' })
  category: string;

  @Column({ type: 'text', default: '' })
  notes: string;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  assetsJson: StudioProductAssetItem[];

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  tagsJson: string[];

  @Column({ type: 'boolean', default: false })
  archived: boolean;

  @Column({ type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
