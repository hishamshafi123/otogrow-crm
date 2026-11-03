import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import { type DeliveryAgentConfiguration } from 'src/modules/delivery/agents/delivery-agent.types';
import {
  type ActivityAnalysisAgent,
  type ActivityAnalysisBasis,
  type ActivityAnalysisContext,
  type ActivityAnalysisReceipt,
  type ActivityAnalysisResult,
  type ActivityAnalysisStatus,
  type StartActivityAnalysisInput,
} from 'src/modules/otogrow-activity/analysis/otogrow-activity-analysis.types';

@Entity({ name: 'otogrowActivityAnalysisRun', schema: 'core' })
@Index(['workspaceId', 'id'], { unique: true })
@Index(['workspaceId', 'requestId'], { unique: true })
@Index(['workspaceId', 'cancelRequestId'], {
  unique: true,
  where: '"cancelRequestId" IS NOT NULL',
})
@Index(['workspaceId', 'createdAt', 'id'])
@Index(['workspaceId', 'agentId', 'createdAt'])
@Index(['status', 'updatedAt', 'id'])
@Check('revision > 0 AND "agentVersion" > 0')
@Check("status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED')")
@Check(
  '"inputHash" ~ \'^[a-f0-9]{64}$\' AND "bodyFingerprint" ~ \'^[a-f0-9]{64}$\' AND "contextFingerprint" ~ \'^[a-f0-9]{64}$\'',
)
@Check("(status='SUCCEEDED') = (result IS NOT NULL)")
@Check(
  '(\"cancelRequestId\" IS NULL AND \"cancelInputHash\" IS NULL AND \"cancelReceipt\" IS NULL) OR (\"cancelRequestId\" IS NOT NULL AND \"cancelInputHash\" IS NOT NULL AND \"cancelInputHash\" ~ \'^[a-f0-9]{64}$\' AND \"cancelReceipt\" IS NOT NULL AND status=\'CANCELLED\')',
)
export class OtogrowActivityAnalysisRunEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'uuid' }) requestId: string;
  @Column({ type: 'uuid' }) initiatorId: string;
  @Column({ type: 'text' }) initiatorName: string;
  @Column({ type: 'uuid' }) userWorkspaceId: string;
  @Column({ type: 'uuid' }) agentId: string;
  @Column({ type: 'integer' }) agentVersion: number;
  @Column({ type: 'integer', default: 1 }) revision: number;
  @Column({ type: 'text', default: 'QUEUED' }) status: ActivityAnalysisStatus;
  @Column({ type: 'text' }) inputHash: string;
  @Column({ type: 'text' }) bodyFingerprint: string;
  @Column({ type: 'text' }) contextFingerprint: string;
  @Column({ type: 'jsonb' }) input: StartActivityAnalysisInput;
  @Column({ type: 'jsonb' }) configuration: DeliveryAgentConfiguration;
  @Column({ type: 'jsonb' }) agent: ActivityAnalysisAgent;
  @Column({ type: 'jsonb' }) basis: ActivityAnalysisBasis;
  @Column({ type: 'jsonb' }) context: ActivityAnalysisContext;
  @Column({ type: 'jsonb' }) startReceipt: ActivityAnalysisReceipt;
  @Column({ type: 'jsonb', nullable: true })
  result: ActivityAnalysisResult | null;
  @Column({ type: 'jsonb', nullable: true }) usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    costUsd: string | null;
  } | null;
  @Column({ type: 'text', nullable: true }) error: string | null;
  @Column({ type: 'uuid', nullable: true }) cancelRequestId: string | null;
  @Column({ type: 'text', nullable: true }) cancelInputHash: string | null;
  @Column({ type: 'jsonb', nullable: true })
  cancelReceipt: ActivityAnalysisReceipt | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) startedAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) finishedAt: Date | null;
}
