import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Relation,
  UpdateDateColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { type DeliveryAgentConfiguration } from 'src/modules/delivery/agents/delivery-agent.types';
import { type AdvertisingSourceKind } from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.types';
import {
  type AdvertisingDraftAgent,
  type AdvertisingDraftBasis,
  type AdvertisingDraftContext,
  type AdvertisingDraftReceipt,
  type AdvertisingDraftResult,
  type AdvertisingDraftStatus,
  type StartAdvertisingDraftInput,
} from 'src/modules/delivery/advertising/drafts/delivery-advertising-draft.types';

@Entity({ name: 'deliveryAdvertisingDraftRun', schema: 'core' })
@Index(['workspaceId', 'id'], { unique: true })
@Index(['workspaceId', 'requestId'], { unique: true })
@Index(['workspaceId', 'cancelRequestId'], {
  unique: true,
  where: '"cancelRequestId" IS NOT NULL',
})
@Index(['workspaceId', 'sourceKind', 'sourceId', 'createdAt', 'id'])
@Index(['workspaceId', 'agentId', 'createdAt'])
@Index(['status', 'updatedAt', 'id'])
@Check('revision > 0 AND "agentVersion" > 0')
@Check(
  "status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED') AND \"sourceKind\" IN ('META','MANUAL')",
)
@Check(
  '"inputHash" ~ \'^[a-f0-9]{64}$\' AND "bodyFingerprint" ~ \'^[a-f0-9]{64}$\' AND "contextFingerprint" ~ \'^[a-f0-9]{64}$\'',
)
@Check("(status='SUCCEEDED') = (result IS NOT NULL)")
@Check(
  '(\"cancelRequestId\" IS NULL AND \"cancelInputHash\" IS NULL AND \"cancelReceipt\" IS NULL) OR (\"cancelRequestId\" IS NOT NULL AND \"cancelInputHash\" IS NOT NULL AND \"cancelInputHash\" ~ \'^[a-f0-9]{64}$\' AND \"cancelReceipt\" IS NOT NULL AND status=\'CANCELLED\')',
)
export class DeliveryAdvertisingDraftRunEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'uuid' }) requestId: string;
  @Column({ type: 'uuid' }) projectId: string;
  @Column({ type: 'uuid', nullable: true }) companyId: string | null;
  @Column({ type: 'text' }) sourceKind: AdvertisingSourceKind;
  @Column({ type: 'uuid' }) sourceId: string;
  @Column({ type: 'uuid' }) initiatorId: string;
  @Column({ type: 'text' }) initiatorName: string;
  @Column({ type: 'uuid' }) userWorkspaceId: string;
  @Column({ type: 'uuid' }) agentId: string;
  @Column({ type: 'integer' }) agentVersion: number;
  @Column({ type: 'integer', default: 1 }) revision: number;
  @Column({ type: 'text', default: 'QUEUED' }) status: AdvertisingDraftStatus;
  @Column({ type: 'text' }) inputHash: string;
  @Column({ type: 'text' }) bodyFingerprint: string;
  @Column({ type: 'text' }) contextFingerprint: string;
  @Column({ type: 'jsonb' }) input: StartAdvertisingDraftInput;
  @Column({ type: 'jsonb' }) configuration: DeliveryAgentConfiguration;
  @Column({ type: 'jsonb' }) agent: AdvertisingDraftAgent;
  @Column({ type: 'jsonb' }) basis: AdvertisingDraftBasis;
  @Column({ type: 'jsonb' }) context: AdvertisingDraftContext;
  @Column({ type: 'jsonb' }) startReceipt: AdvertisingDraftReceipt;
  @Column({ type: 'jsonb', nullable: true })
  result: AdvertisingDraftResult | null;
  @Column({ type: 'jsonb', nullable: true }) usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    costUsd: string | null;
  } | null;
  @Column({ type: 'text', nullable: true }) error: string | null;
  @Column({ type: 'uuid', nullable: true }) cancelRequestId: string | null;
  @Column({ type: 'text', nullable: true }) cancelInputHash: string | null;
  @Column({ type: 'jsonb', nullable: true })
  cancelReceipt: AdvertisingDraftReceipt | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) startedAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) finishedAt: Date | null;
  @ManyToOne(() => DeliveryProjectEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'projectId', referencedColumnName: 'id' },
  ])
  project: Relation<DeliveryProjectEntity>;
}
