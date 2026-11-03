import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import { DeliveryTaskEntity } from 'src/modules/delivery/entities/delivery-task.entity';
import { DeliveryAtlasCredentialEntity } from 'src/modules/delivery/creative/atlas/entities/delivery-atlas-credential.entity';
import {
  type AtlasFrozenRequest,
  type AtlasJobStatus,
  type AtlasReservationLimit,
} from 'src/modules/delivery/creative/atlas/delivery-atlas.types';

@Entity({ name: 'deliveryAtlasJob', schema: 'core' })
@Index(['workspaceId', 'requestId'], { unique: true })
@Index(['workspaceId', 'taskId', 'createdAt', 'id'])
@Index(['status', 'nextAttemptAt'])
@Check('revision>0 AND attempts>=0 AND "configurationRevision">0')
@Check(
  `status IN ('QUOTED','QUEUED','SUBMITTING','POLLING','DOWNLOADING','SUCCEEDED','FAILED','UNCERTAIN','CANCELLED')`,
)
@Check('length("requestHash")=64 AND length("quoteToken")=64')
export class DeliveryAtlasJobEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) requestId: string;
  @Column({ type: 'uuid' }) taskId: string;
  @Column({ type: 'uuid' }) projectId: string;
  @Column({ type: 'uuid' }) actorId: string;
  @Column({ type: 'uuid' }) userWorkspaceId: string;
  @Column({ type: 'uuid' }) credentialId: string;
  @Column({ type: 'integer' }) configurationRevision: number;
  @Column({ type: 'integer', default: 1 }) revision: number;
  @Column({ type: 'text' }) requestHash: string;
  @Column({ type: 'text' }) quoteToken: string;
  @Column({ type: 'text' }) status: AtlasJobStatus;
  @Column({ type: 'jsonb' }) request: AtlasFrozenRequest;
  @Column({ type: 'text', array: true, default: [] }) referenceUrls: string[];
  @Column({ type: 'jsonb' }) reservationLimit: AtlasReservationLimit & {
    id: string;
    revision: number;
  };
  @Column({ type: 'text' }) quotedCostUsd: string;
  @Column({ type: 'boolean' }) quoteEstimated: boolean;
  @Column({ type: 'timestamptz' }) quotedAt: Date;
  @Column({ type: 'text', nullable: true }) providerPredictionId: string | null;
  @Column({ type: 'text', nullable: true }) providerStatus: string | null;
  @Column({ type: 'text', nullable: true, select: false }) outputUrl:
    | string
    | null;
  @Column({ type: 'boolean', default: false }) publicationCancelled: boolean;
  @Column({ type: 'uuid', nullable: true }) assetId: string | null;
  @Column({ type: 'text', default: 'UNRESERVED' }) costState: string;
  @Column({ type: 'text', nullable: true }) error: string | null;
  @Column({ type: 'uuid', nullable: true }) leaseToken: string | null;
  @Column({ type: 'timestamptz', nullable: true }) leaseUntil: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) nextAttemptAt: Date | null;
  @Column({ type: 'integer', default: 0 }) attempts: number;
  @Column({ type: 'timestamptz', nullable: true }) submittedAt: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
  @ManyToOne(() => DeliveryAtlasCredentialEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'credentialId', referencedColumnName: 'id' },
  ])
  credential: Relation<DeliveryAtlasCredentialEntity>;
  @ManyToOne(() => DeliveryTaskEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'taskId', referencedColumnName: 'taskId' },
  ])
  task: Relation<DeliveryTaskEntity>;
}
