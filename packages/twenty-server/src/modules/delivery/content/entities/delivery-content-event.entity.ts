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
import { DeliveryContentAccountEntity } from './delivery-content-account.entity';
import { DeliveryContentPlanEntity } from './delivery-content-plan.entity';
import { DeliveryContentVersionEntity } from './delivery-content-version.entity';
@Entity({ name: 'deliveryContentEvent', schema: 'core' })
@Index(['workspaceId', 'requestId'], { unique: true })
@Index(['workspaceId', 'variantId', 'version', 'id'], { unique: true })
@Index(['workspaceId', 'targetKind', 'targetId', 'revision'], { unique: true })
@Check('revision>0')
@Check(`"inputHash" ~ '^[a-f0-9]{64}$'`)
@Check(
  `("targetKind"='ACCOUNT' AND "accountId"="targetId" AND "accountId" IS NOT NULL AND "planId" IS NULL AND "variantId" IS NULL AND version IS NULL) OR ("targetKind"='PLAN' AND "planId"="targetId" AND "planId" IS NOT NULL AND "accountId" IS NULL AND "variantId" IS NULL AND version IS NULL) OR ("targetKind"='VARIANT' AND "variantId"="targetId" AND "variantId" IS NOT NULL AND "planId" IS NOT NULL AND "accountId" IS NULL AND version IS NOT NULL AND version>0)`,
)
@Check(`(action='CORRECT_PUBLICATION')=("correctsEventId" IS NOT NULL)`)
@Check(
  `(action IN ('RECORD_PUBLICATION','CORRECT_PUBLICATION'))=("publishedAt" IS NOT NULL AND length("evidenceUrl")>0)`,
)
@Check(
  "action IN ('SAVE_ACCOUNT','SAVE_PLAN','SAVE','SUBMIT','APPROVE','REQUEST_CHANGES','RECORD_PUBLICATION','RECORD_FAILED','RECORD_UNCERTAIN','CORRECT_PUBLICATION','CANCEL')",
)
export class DeliveryContentEventEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'uuid' }) requestId: string;
  @Column({ type: 'uuid' }) actorId: string;
  @Column({ type: 'uuid' }) userWorkspaceId: string;
  @Column({ type: 'text' }) actorName: string;
  @Column({ type: 'text' }) inputHash: string;
  @Column({ type: 'text' }) targetKind: 'ACCOUNT' | 'PLAN' | 'VARIANT';
  @Column({ type: 'uuid' }) targetId: string;
  @Column({ type: 'uuid', nullable: true }) accountId: string | null;
  @Column({ type: 'uuid', nullable: true }) planId: string | null;
  @Column({ type: 'uuid', nullable: true }) variantId: string | null;
  @Column({ type: 'integer', nullable: true }) version: number | null;
  @Column({ type: 'integer' }) revision: number;
  @Column({ type: 'text' }) action: string;
  @Column({ type: 'text' }) status: string;
  @Column({ type: 'text' }) note: string;
  @Column({ type: 'text' }) evidenceUrl: string;
  @Column({ type: 'timestamptz', nullable: true }) publishedAt: Date | null;
  @Column({ type: 'uuid', nullable: true }) correctsEventId: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @ManyToOne(() => DeliveryContentAccountEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'accountId', referencedColumnName: 'id' },
  ])
  account: Relation<DeliveryContentAccountEntity>;
  @ManyToOne(() => DeliveryContentPlanEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'planId', referencedColumnName: 'id' },
  ])
  plan: Relation<DeliveryContentPlanEntity>;
  @ManyToOne(() => DeliveryContentVersionEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'variantId', referencedColumnName: 'variantId' },
    { name: 'version', referencedColumnName: 'version' },
  ])
  savedVersion: Relation<DeliveryContentVersionEntity>;
  @ManyToOne(() => DeliveryContentEventEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'variantId', referencedColumnName: 'variantId' },
    { name: 'version', referencedColumnName: 'version' },
    { name: 'correctsEventId', referencedColumnName: 'id' },
  ])
  correctsEvent: Relation<DeliveryContentEventEntity>;
}
