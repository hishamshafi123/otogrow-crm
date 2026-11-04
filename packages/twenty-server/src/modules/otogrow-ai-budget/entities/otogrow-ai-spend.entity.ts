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
  type OtogrowAiSpendState,
  type OtogrowAiSpendSource,
  type OtogrowAiPriceSnapshot,
  type OtogrowAiUsage,
} from 'src/modules/otogrow-ai-budget/otogrow-ai-budget.types';
@Entity({ name: 'otogrowAiSpend', schema: 'core' })
@Index(['workspaceId', 'sourceKind', 'sourceRunId'], { unique: true })
@Index(['workspaceId', 'id'], { unique: true })
@Index(['workspaceId', 'createdAt', 'id'])
@Index(['workspaceId', 'clientId'])
@Index(['workspaceId', 'taskId'])
@Index('IDX_otogrow_native_ai_recovery', ['state', 'createdAt', 'id'], {
  where: "\"sourceKind\" = 'NATIVE_CRM' AND state IN ('RESERVED','DISPATCHED')",
})
export class OtogrowAiSpendEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'integer', default: 1 }) revision: number;
  @Column({ type: 'text' }) sourceKind: OtogrowAiSpendSource;
  @Column({ type: 'uuid' }) sourceRunId: string;
  @Column({ type: 'uuid' }) actorId: string;
  @Column({ type: 'uuid', nullable: true }) projectId: string | null;
  @Column({ type: 'uuid', nullable: true }) clientId: string | null;
  @Column({ type: 'text', nullable: true }) clientName: string | null;
  @Column({ type: 'uuid', nullable: true }) taskId: string | null;
  @Column({ type: 'text', nullable: true }) taskName: string | null;
  @Column({ type: 'text' }) state: OtogrowAiSpendState;
  @Column({ type: 'bigint' }) reservedMicroUsd: string;
  @Column({ type: 'bigint', nullable: true }) actualMicroUsd: string | null;
  @Column({ type: 'jsonb' }) price: OtogrowAiPriceSnapshot;
  @Column({ type: 'jsonb', nullable: true }) usage: OtogrowAiUsage | null;
  @Column({ type: 'text', nullable: true }) attentionReason: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) dispatchedAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) settledAt: Date | null;
}
