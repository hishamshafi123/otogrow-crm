import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import { type DeliverableMediaMeta } from 'src/modules/delivery/deliverables/entities/delivery-deliverable.entity';
import { type StagedProviderUrlMap } from 'src/modules/delivery/studio/entities/delivery-studio-reference-video.entity';

export type StudioAssetKind = 'CHARACTER_SHEET' | 'GENERATED_VIDEO';

@Entity({ name: 'deliveryStudioAsset', schema: 'core' })
@Index(['workspaceId', 'id'], { unique: true })
@Index(['workspaceId', 'companyId', 'projectId', 'kind'])
@Index(['workspaceId', 'jobId'])
export class DeliveryStudioAssetEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid' })
  companyId: string;

  @Column({ type: 'uuid', nullable: true })
  projectId: string | null;

  @Column({ type: 'text' })
  kind: StudioAssetKind;

  @Column({ type: 'uuid', nullable: true })
  productKitId: string | null;

  @Column({ type: 'uuid', nullable: true })
  referenceVideoId: string | null;

  @Column({ type: 'uuid', nullable: true })
  characterAssetId: string | null;

  @Column({ type: 'uuid', nullable: true })
  presetId: string | null;

  @Column({ type: 'uuid', nullable: true })
  jobId: string | null;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text', default: '' })
  promptUsed: string;

  @Column({ type: 'text' })
  modelKey: string;

  @Column({ type: 'text' })
  providerUsed: string; // 'wavespeed' | 'kie' | 'upload'

  @Column({ type: 'text' })
  storageKey: string;

  @Column({ type: 'text', nullable: true })
  thumbnailKey: string | null;

  @Column({ type: 'text' })
  mimeType: string;

  @Column({ type: 'bigint', default: '0' })
  sizeBytes: string;

  @Column({ type: 'text' })
  sha256: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  mediaMeta: DeliverableMediaMeta;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  stagedUrlsJson: StagedProviderUrlMap;

  @Column({ type: 'boolean', default: false })
  approved: boolean;

  @Column({ type: 'uuid', nullable: true })
  deliverableId: string | null;

  @Column({ type: 'uuid', nullable: true })
  hookProjectId: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  tagsJson: string[];

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadataJson: Record<string, unknown>;

  @Column({ type: 'boolean', default: false })
  archived: boolean;

  @Column({ type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
