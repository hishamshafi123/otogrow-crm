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

export type StagedProviderUrlEntry = {
  url: string;
  uploadedAt: string;
  expiresAt: string;
};

export type StagedProviderUrlMap = {
  wavespeed?: StagedProviderUrlEntry;
  kie?: StagedProviderUrlEntry;
};

@Entity({ name: 'deliveryStudioReferenceVideo', schema: 'core' })
@Index(['workspaceId', 'id'], { unique: true })
@Index(['workspaceId', 'companyId', 'projectId'])
export class DeliveryStudioReferenceVideoEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid', nullable: true })
  companyId: string | null;

  @Column({ type: 'uuid', nullable: true })
  projectId: string | null;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text', default: '' })
  notes: string;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  tagsJson: string[];

  @Column({ type: 'text' })
  storageKey: string;

  @Column({ type: 'text', nullable: true })
  thumbnailKey: string | null;

  @Column({ type: 'text', nullable: true })
  originalFileName: string | null;

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
  archived: boolean;

  @Column({ type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
