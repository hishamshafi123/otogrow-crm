import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';

export type DeliverableAssetKind = 'VIDEO' | 'IMAGE' | 'DOCUMENT' | 'LINK';
export type DeliverableStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'CHANGES_REQUESTED'
  | 'ARCHIVED';
export type DeliverableClientVisibility = 'INTERNAL' | 'PUBLISHED';
export type DeliverableClientApprovalStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'CHANGES_REQUESTED';
export type DeliverableDriveSyncStatus =
  | 'NOT_SYNCED'
  | 'QUEUED'
  | 'SYNCING'
  | 'SYNCED'
  | 'FAILED';
export type DeliverableStorageState = 'LOCAL' | 'DRIVE_ONLY' | 'EXTERNAL';

export type DeliverableMediaMeta = {
  width?: number;
  height?: number;
  fps?: number;
  durationSec?: number;
  videoCodec?: string;
  audioCodec?: string | null;
  bitrate?: number;
  colorSpace?: string | null;
  colorTransfer?: string | null;
  colorPrimaries?: string | null;
  pixFmt?: string | null;
  driveTargetFolderId?: string | null;
  driveSubfolderName?: string | null;
};

@Entity({ name: 'deliveryDeliverable', schema: 'core' })
@Index(['workspaceId', 'id'], { unique: true })
@Index(['workspaceId', 'companyId', 'monthKey', 'sequenceNumber'])
export class DeliveryDeliverableEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) companyId: string;
  @Column({ type: 'uuid', nullable: true }) projectId: string | null;
  @Column({ type: 'uuid', nullable: true }) engagementId: string | null;
  @Column({ type: 'text' }) serviceKey: string;
  @Column({ type: 'text', default: 'ALL' }) serviceScope: string;
  @Column({ type: 'text' }) monthKey: string;
  @Column({ type: 'int' }) sequenceNumber: number;
  @Column({ type: 'text' }) title: string;
  @Column({ type: 'text', default: '' }) description: string;
  @Column({ type: 'text' }) assetKind: DeliverableAssetKind;
  @Column({ type: 'text', nullable: true }) originalFileName: string | null;
  @Column({ type: 'text', nullable: true }) externalUrl: string | null;
  @Column({ type: 'text', nullable: true }) storageKey: string | null;
  @Column({ type: 'text', nullable: true }) thumbnailKey: string | null;
  @Column({ type: 'text', nullable: true }) mimeType: string | null;
  @Column({ type: 'bigint', default: '0' }) sizeBytes: string;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  mediaMeta: DeliverableMediaMeta;
  @Column({ type: 'text', default: 'PENDING_REVIEW' })
  status: DeliverableStatus;
  @Column({ type: 'text', default: 'INTERNAL' })
  clientVisibility: DeliverableClientVisibility;
  @Column({ type: 'text', default: 'PENDING' })
  clientApprovalStatus: DeliverableClientApprovalStatus;
  @Column({ type: 'boolean', default: false }) hasVariations: boolean;
  @Column({ type: 'text', nullable: true }) driveFileId: string | null;
  @Column({ type: 'text', nullable: true }) driveFolderId: string | null;
  @Column({ type: 'text', nullable: true }) driveWebUrl: string | null;
  @Column({ type: 'text', default: 'NOT_SYNCED' })
  driveSyncStatus: DeliverableDriveSyncStatus;
  @Column({ type: 'timestamptz', nullable: true }) driveSyncedAt: Date | null;
  @Column({ type: 'text', nullable: true }) driveSyncError: string | null;
  @Column({ type: 'text', default: 'LOCAL' })
  storageState: DeliverableStorageState;
  @Column({ type: 'timestamptz', nullable: true })
  localFilePurgedAt: Date | null;
  @Column({ type: 'uuid', nullable: true }) linkedTaskId: string | null;
  @Column({ type: 'uuid', nullable: true })
  linkedContentVariantId: string | null;
  @Column({ type: 'uuid' }) submittedById: string;
  @Column({ type: 'uuid', nullable: true }) approvedById: string | null;
  @Column({ type: 'timestamptz', nullable: true }) publishedAt: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
