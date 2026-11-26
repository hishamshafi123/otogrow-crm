import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import {
  type DeliverableClientApprovalStatus,
  type DeliverableClientVisibility,
  type DeliverableDriveSyncStatus,
  type DeliverableMediaMeta,
} from 'src/modules/delivery/deliverables/entities/delivery-deliverable.entity';
import { type HookStyleConfig } from 'src/modules/delivery/deliverables/entities/delivery-video-hook-project.entity';

export type VariationRenderStatus =
  | 'PENDING'
  | 'QUEUED'
  | 'RENDERING'
  | 'READY'
  | 'FAILED';

export type VariationStorageState = 'LOCAL' | 'DRIVE_ONLY';

@Entity({ name: 'deliveryVideoHookVariation', schema: 'core' })
@Index(['workspaceId', 'id'], { unique: true })
@Index(['workspaceId', 'hookProjectId', 'variationNumber'], { unique: true })
@Index(['workspaceId', 'deliverableId', 'variationNumber'])
export class DeliveryVideoHookVariationEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) hookProjectId: string;
  @Column({ type: 'uuid' }) deliverableId: string;
  @Column({ type: 'int' }) variationNumber: number;
  @Column({ type: 'text' }) hookText: string;
  @Column({ type: 'text', default: '' }) angleTag: string;
  @Column({ type: 'text', default: '' }) rationale: string;
  @Column({ type: 'jsonb', nullable: true })
  styleOverride: Partial<HookStyleConfig> | null;
  @Column({ type: 'text', nullable: true })
  overlayPngStorageKey: string | null;
  @Column({ type: 'double precision', default: 0 }) startSec: number;
  @Column({ type: 'double precision', default: 3.5 }) endSec: number;
  @Column({ type: 'text', default: 'PENDING' })
  renderStatus: VariationRenderStatus;
  @Column({ type: 'int', default: 0 }) renderProgress: number;
  @Column({ type: 'text', nullable: true }) renderError: string | null;
  @Column({ type: 'text', nullable: true }) outputStorageKey: string | null;
  @Column({ type: 'text', nullable: true }) thumbnailKey: string | null;
  @Column({ type: 'bigint', default: '0' }) outputSizeBytes: string;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  outputMediaMeta: DeliverableMediaMeta;
  @Column({ type: 'text', nullable: true }) driveFileId: string | null;
  @Column({ type: 'text', nullable: true }) driveWebUrl: string | null;
  @Column({ type: 'text', default: 'NOT_SYNCED' })
  driveSyncStatus: DeliverableDriveSyncStatus;
  @Column({ type: 'timestamptz', nullable: true }) driveSyncedAt: Date | null;
  @Column({ type: 'text', nullable: true }) driveSyncError: string | null;
  @Column({ type: 'text', default: 'LOCAL' })
  storageState: VariationStorageState;
  @Column({ type: 'timestamptz', nullable: true })
  localFilePurgedAt: Date | null;
  @Column({ type: 'text', default: 'INTERNAL' })
  clientVisibility: DeliverableClientVisibility;
  @Column({ type: 'text', default: 'PENDING' })
  clientApprovalStatus: DeliverableClientApprovalStatus;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
