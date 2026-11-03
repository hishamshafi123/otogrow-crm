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
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { type ReleaseStatus } from '../delivery-release.types';
@Entity({ name: 'deliveryRelease', schema: 'core' })
@Index(['workspaceId', 'id'], { unique: true })
@Index(['workspaceId', 'projectId', 'id'])
@Check('revision>0 AND "currentVersion">0')
@Check(
  "status IN ('DRAFT','SUBMITTED','APPROVED','CHANGES_REQUESTED','DEPLOYED','HANDED_OVER','ACCEPTED')",
)
@Check('length(btrim(title)) BETWEEN 1 AND 200')
@Check(
  `(status IN ('APPROVED','DEPLOYED','HANDED_OVER','ACCEPTED') AND "approvedVersion" IS NOT NULL AND "approvedVersion"="currentVersion" AND "reviewedBy" IS NOT NULL AND "reviewedAt" IS NOT NULL) OR (status NOT IN ('APPROVED','DEPLOYED','HANDED_OVER','ACCEPTED') AND "approvedVersion" IS NULL)`,
)
export class DeliveryReleaseEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'uuid' }) projectId: string;
  @Column({ type: 'uuid', nullable: true }) companyId: string | null;
  @Column({ type: 'uuid' }) createdBy: string;
  @Column({ type: 'uuid' }) ownerId: string;
  @Column({ type: 'text' }) ownerName: string;
  @Column({ type: 'text' }) createdByName: string;
  @Column({ type: 'integer' }) revision: number;
  @Column({ type: 'integer' }) currentVersion: number;
  @Column({ type: 'text' }) status: ReleaseStatus;
  @Column({ type: 'text' }) title: string;
  @Column({ type: 'date' }) targetDate: string;
  @Column({ type: 'integer', nullable: true }) approvedVersion: number | null;
  @Column({ type: 'uuid', nullable: true }) reviewedBy: string | null;
  @Column({ type: 'timestamptz', nullable: true }) reviewedAt: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @ManyToOne(() => DeliveryProjectEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'projectId', referencedColumnName: 'id' },
  ])
  project: Relation<DeliveryProjectEntity>;
}
