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
  type DeliveryAgentActivity,
  type DeliveryAgentConfiguration,
  type DeliveryAgentContext,
  type DeliveryAgentResult,
  type DeliveryAgentStatus,
} from 'src/modules/delivery/agents/delivery-agent.types';

@Entity({ name: 'deliveryAgentRun', schema: 'core' })
@Index(['workspaceId', 'initiatorId', 'requestId'], { unique: true })
@Index(['status', 'createdAt'])
export class DeliveryAgentRunEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  requestId: string;

  @Column({ type: 'uuid' })
  taskId: string;

  @Column({ type: 'uuid' })
  agentId: string;

  @Column({ type: 'uuid' })
  initiatorId: string;

  @Column({ type: 'uuid' })
  userWorkspaceId: string;

  @Column({ type: 'integer' })
  taskRevision: number;

  @Column({ type: 'integer' })
  agentVersion: number;

  @Column({ type: 'jsonb' })
  configuration: DeliveryAgentConfiguration;

  @Column({ type: 'jsonb' })
  context: DeliveryAgentContext;

  @Column({ type: 'varchar', default: 'QUEUED' })
  status: DeliveryAgentStatus;

  @Column({ type: 'jsonb', nullable: true })
  result: DeliveryAgentResult | null;

  @Column({ type: 'jsonb', default: [] })
  activity: DeliveryAgentActivity[];

  @Column({ type: 'jsonb', nullable: true })
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    cost: number | null;
  } | null;

  @Column({ type: 'varchar', nullable: true })
  error: string | null;

  @Column({ type: 'jsonb', nullable: true })
  decision: {
    memberId: string;
    at: string;
    action: 'ACCEPT' | 'REJECT';
    field: 'brief' | 'copy' | null;
  } | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
