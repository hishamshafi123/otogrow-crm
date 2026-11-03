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
import { DeliveryReleaseEntity } from './delivery-release.entity';
import { DeliveryReleaseVersionEntity } from './delivery-release-version.entity';
@Entity({ name: 'deliveryReleaseEvent', schema: 'core' })
@Index(['workspaceId', 'requestId'], { unique: true })
@Index(['workspaceId', 'releaseId', 'revision'], { unique: true })
@Check('revision>0 AND version>0')
@Check('"inputHash" ~ \'^[a-f0-9]{64}$\'')
@Check(
  "action IN ('SAVE','SUBMIT','APPROVE','REQUEST_CHANGES','RECORD_DEPLOYMENT','RECORD_DEPLOYMENT_FAILED','RECORD_HANDOVER','RECORD_ACCEPTANCE')",
)
@Check(
  "status IN ('DRAFT','SUBMITTED','APPROVED','CHANGES_REQUESTED','DEPLOYED','HANDED_OVER','ACCEPTED')",
)
export class DeliveryReleaseEventEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) releaseId: string;
  @Column({ type: 'uuid' }) requestId: string;
  @Column({ type: 'uuid' }) actorId: string;
  @Column({ type: 'uuid' }) userWorkspaceId: string;
  @Column({ type: 'text' }) actorName: string;
  @Column({ type: 'text' }) inputHash: string;
  @Column({ type: 'text' }) action: string;
  @Column({ type: 'text' }) note: string;
  @Column({ type: 'text' }) evidenceUrl: string;
  @Column({ type: 'text' }) commitSha: string;
  @Column({ type: 'text' }) environment: string;
  @Column({ type: 'integer' }) revision: number;
  @Column({ type: 'integer' }) version: number;
  @Column({ type: 'text' }) status: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @ManyToOne(() => DeliveryReleaseEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'releaseId', referencedColumnName: 'id' },
  ])
  release: Relation<DeliveryReleaseEntity>;
  @ManyToOne(() => DeliveryReleaseVersionEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'releaseId', referencedColumnName: 'releaseId' },
    { name: 'version', referencedColumnName: 'version' },
  ])
  savedVersion: Relation<DeliveryReleaseVersionEntity>;
}
