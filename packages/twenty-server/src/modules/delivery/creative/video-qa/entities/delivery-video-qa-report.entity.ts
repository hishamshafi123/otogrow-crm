import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import { DeliveryTaskEntity } from 'src/modules/delivery/entities/delivery-task.entity';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import {
  type VideoQaCancellation,
  type VideoQaInputSnapshot,
  type VideoQaOutput,
} from '../delivery-video-qa.types';

@Entity({ name: 'deliveryVideoQaReport', schema: 'core' })
@Index(['workspaceId', 'id'], { unique: true })
@Index(['workspaceId', 'requestId'], { unique: true })
@Index(['workspaceId', 'cancelRequestId'], { unique: true })
@Index(['workspaceId', 'taskId', 'createdAt', 'id'])
@Check(`"inputHash" ~ '^[a-f0-9]{64}$' AND "pricingRevision">0`)
@Check(
  `jsonb_typeof(input)='object' AND (result IS NULL OR jsonb_typeof(result)='object')`,
)
@Check(
  `(result IS NULL AND "completedAt" IS NULL) OR (result IS NOT NULL AND "completedAt" IS NOT NULL)`,
)
export class DeliveryVideoQaReportEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'uuid' }) taskId: string;
  @Column({ type: 'uuid' }) projectId: string;
  @Column({ type: 'uuid', nullable: true }) companyId: string | null;
  @Column({ type: 'uuid' }) initiatorId: string;
  @Column({ type: 'uuid' }) userWorkspaceId: string;
  @Column({ type: 'uuid' }) requestId: string;
  @Column({ type: 'uuid', nullable: true }) cancelRequestId: string | null;
  @Column({ type: 'text' }) inputHash: string;
  @Column({ type: 'integer' }) pricingRevision: number;
  @Column({ type: 'boolean', default: false }) artifactsReady: boolean;
  @Column({ type: 'jsonb' }) input: VideoQaInputSnapshot;
  @Column({ type: 'jsonb', nullable: true }) result: VideoQaOutput | null;
  @Column({ type: 'jsonb', nullable: true })
  cancellation: VideoQaCancellation | null;
  @Column({ type: 'timestamptz', nullable: true }) completedAt: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @ManyToOne(() => DeliveryTaskEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'taskId', referencedColumnName: 'taskId' },
  ])
  task: Relation<DeliveryTaskEntity>;
  @ManyToOne(() => DeliveryProjectEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'projectId', referencedColumnName: 'id' },
  ])
  project: Relation<DeliveryProjectEntity>;
}
