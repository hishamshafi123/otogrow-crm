import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import { type StudioRoutingMode } from 'src/modules/delivery/studio/entities/delivery-studio-provider-config.entity';

export type StudioJobKind = 'CHARACTER_SHEET' | 'VIDEO_GENERATION';

export type StudioJobStatus =
  | 'QUEUED'
  | 'STAGING'
  | 'PROCESSING'
  | 'DOWNLOADING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type StudioProviderAttemptRecord = {
  provider: 'wavespeed' | 'kie';
  endpoint: string;
  externalTaskId: string | null;
  startedAt: string;
  finishedAt: string | null;
  status: 'SUCCESS' | 'FAILED';
  retryable: boolean;
  errorCode: string | null;
  errorMessage: string | null;
};

@Entity({ name: 'deliveryStudioJob', schema: 'core' })
@Index(['workspaceId', 'id'], { unique: true })
@Index(['workspaceId', 'companyId', 'projectId', 'createdAt'])
@Index(['workspaceId', 'status'])
@Index(['workspaceId', 'batchId'])
export class DeliveryStudioJobEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid', nullable: true })
  batchId: string | null;

  @Column({ type: 'uuid' })
  companyId: string;

  @Column({ type: 'uuid', nullable: true })
  projectId: string | null;

  @Column({ type: 'text' })
  jobKind: StudioJobKind;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text' })
  modelKey: string;

  @Column({ type: 'text', default: 'AUTO_FAILOVER' })
  routingMode: StudioRoutingMode;

  @Column({ type: 'text', nullable: true })
  providerUsed: string | null;

  @Column({ type: 'boolean', default: false })
  failoverTriggered: boolean;

  @Column({ type: 'text', default: 'QUEUED' })
  status: StudioJobStatus;

  @Column({ type: 'integer', default: 0 })
  progress: number;

  @Column({ type: 'text', default: '0.0000' })
  estimatedCostUsd: string;

  @Column({ type: 'text', nullable: true })
  actualCostUsd: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  inputPayloadJson: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  attemptsJson: StudioProviderAttemptRecord[];

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  outputAssetIdsJson: string[];

  @Column({ type: 'text', nullable: true })
  externalTaskId: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'uuid', nullable: true })
  createdById: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
