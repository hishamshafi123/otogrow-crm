import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import { type DeliveryFinanceCurrency } from 'src/modules/delivery/finance/delivery-finance.policy';

@Entity({ name: 'deliveryFounderEscalationRule', schema: 'core' })
@Index(['workspaceId', 'id'], { unique: true })
@Index(['workspaceId', 'enabled', 'id'])
@Check('revision > 0')
@Check(`priority IN ('NORMAL','URGENT')`)
@Check(`"projectScope" IN ('ALL','SELECTED')`)
@Check(
  `(condition='TASK_REVIEW_WAIT' AND "minimumReviewWaitHours" IS NOT NULL AND "minimumReviewWaitHours" BETWEEN 1 AND 720) OR (condition<>'TASK_REVIEW_WAIT' AND "minimumReviewWaitHours" IS NULL)`,
)
@Check(
  `("projectScope"='ALL' AND cardinality("projectIds")=0) OR ("projectScope"='SELECTED' AND (cardinality("projectIds")>0 OR "includeCompany"))`,
)
@Check(
  `("repeatMode"='ONCE' AND "repeatHours" IS NULL AND "maxSends"=1) OR ("repeatMode"='INTERVAL' AND "repeatHours" BETWEEN 1 AND 720 AND "maxSends" BETWEEN 2 AND 20)`,
)
export class DeliveryFounderEscalationRuleEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'integer', default: 1 }) revision: number;
  @Column({ type: 'boolean', default: false }) enabled: boolean;
  @Column({ type: 'text' }) name: string;
  @Column({ type: 'text' }) condition: string;
  @Column({ type: 'integer', nullable: true }) minimumReviewWaitHours:
    | number
    | null;
  @Column({ type: 'uuid' }) recipientId: string;
  @Column({ type: 'text' }) recipientName: string;
  @Column({ type: 'text' }) priority: 'NORMAL' | 'URGENT';
  @Column({ type: 'text' }) projectScope: 'ALL' | 'SELECTED';
  @Column({ type: 'uuid', array: true }) projectIds: string[];
  @Column({ type: 'boolean' }) includeCompany: boolean;
  @Column({ type: 'text', nullable: true })
  currency: DeliveryFinanceCurrency | null;
  @Column({ type: 'text', nullable: true }) serviceMonth: string | null;
  @Column({ type: 'text' }) repeatMode: 'ONCE' | 'INTERVAL';
  @Column({ type: 'integer', nullable: true }) repeatHours: number | null;
  @Column({ type: 'integer' }) maxSends: number;
  @Column({ type: 'uuid', nullable: true }) grantedBy: string | null;
  @Column({ type: 'uuid', nullable: true }) grantUserWorkspaceId: string | null;
  @Column({ type: 'uuid' }) changedBy: string;
  @Column({ type: 'text' }) changedByName: string;
  @Column({ type: 'timestamptz' }) changedAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) lastEvaluatedAt: Date | null;
  @Column({ type: 'text', nullable: true }) evaluationError: string | null;
}
