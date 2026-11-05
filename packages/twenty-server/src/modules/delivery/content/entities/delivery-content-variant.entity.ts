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
import { DeliveryContentPlanEntity } from './delivery-content-plan.entity';
import { DeliveryContentAccountEntity } from './delivery-content-account.entity';
import { type ContentStatus } from '../delivery-content.types';
@Entity({ name: 'deliveryContentVariant', schema: 'core' })
@Index(['workspaceId', 'id'], { unique: true })
@Index(['workspaceId', 'projectId', 'planId', 'id'], { unique: true })
@Index(['workspaceId', 'projectId', 'plannedAt', 'id'])
@Check('revision>0 AND "currentVersion">0')
@Check(
  "status IN ('DRAFT','REVIEW','APPROVED','CHANGES_REQUESTED','PUBLISHED','CANCELLED')",
)
@Check(
  `(status IN ('APPROVED','PUBLISHED') AND "approvedVersion"="currentVersion" AND "approvedVersion" IS NOT NULL AND "reviewedBy" IS NOT NULL AND "reviewedAt" IS NOT NULL) OR (status NOT IN ('APPROVED','PUBLISHED') AND "approvedVersion" IS NULL)`,
)
@Check('"ownerId"<>"reviewerId"')
export class DeliveryContentVariantEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'uuid' }) projectId: string;
  @Column({ type: 'uuid', nullable: true }) companyId: string | null;
  @Column({ type: 'uuid' }) planId: string;
  @Column({ type: 'uuid' }) accountId: string;
  @Column({ type: 'uuid', nullable: true }) assetTaskId: string | null;
  @Column({ type: 'uuid' }) ownerId: string;
  @Column({ type: 'uuid' }) reviewerId: string;
  @Column({ type: 'uuid' }) createdBy: string;
  @Column({ type: 'uuid', nullable: true }) submittedBy: string | null;
  @Column({ type: 'integer' }) revision: number;
  @Column({ type: 'integer' }) currentVersion: number;
  @Column({ type: 'text' }) status: ContentStatus;
  @Column({ type: 'timestamptz' }) plannedAt: Date;
  @Column({ type: 'integer', nullable: true }) approvedVersion: number | null;
  @Column({ type: 'uuid', nullable: true }) reviewedBy: string | null;
  @Column({ type: 'timestamptz', nullable: true }) reviewedAt: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @ManyToOne(() => DeliveryContentPlanEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'projectId', referencedColumnName: 'projectId' },
    { name: 'planId', referencedColumnName: 'id' },
  ])
  plan: Relation<DeliveryContentPlanEntity>;
  @ManyToOne(() => DeliveryContentAccountEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'projectId', referencedColumnName: 'projectId' },
    { name: 'accountId', referencedColumnName: 'id' },
  ])
  account: Relation<DeliveryContentAccountEntity>;
}
