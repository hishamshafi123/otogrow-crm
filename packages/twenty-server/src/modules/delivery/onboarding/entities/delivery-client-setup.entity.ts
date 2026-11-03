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
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import { DeliveryTaskEntity } from 'src/modules/delivery/entities/delivery-task.entity';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';

@Entity({ name: 'deliveryClientSetup', schema: 'core' })
@Index(['workspaceId', 'requestId'], { unique: true })
@Index(['workspaceId', 'actorId', 'createdAt', 'id'])
@Check('length("requestHash")=64')
export class DeliveryClientSetupEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) requestId: string;
  @Column({ type: 'text' }) requestHash: string;
  @Column({ type: 'uuid' }) actorId: string;
  @Column({ type: 'uuid' }) userWorkspaceId: string;
  @Column({ type: 'uuid' }) companyId: string;
  @Column({ type: 'uuid' }) projectId: string;
  @Column({ type: 'uuid' }) engagementId: string;
  @Column({ type: 'uuid', nullable: true }) taskId: string | null;
  @Column({ type: 'boolean' }) reusedProject: boolean;
  @Column({ type: 'boolean' }) reusedEngagement: boolean;
  @Column({ type: 'jsonb' }) source: {
    companyName: string;
    companySourceToken: string;
    projectRevision: number | null;
    engagementRevision: number | null;
  };
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @ManyToOne(() => DeliveryTaskEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'taskId', referencedColumnName: 'taskId' },
  ])
  task: Relation<DeliveryTaskEntity> | null;
  @ManyToOne(() => DeliveryProjectEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'projectId', referencedColumnName: 'id' },
  ])
  project: Relation<DeliveryProjectEntity>;
}
