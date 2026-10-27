import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import { type FinanceAiCostOrigin } from 'src/modules/delivery/finance/delivery-finance-ai-cost.policy';
import {
  type DeliveryFinanceCurrency,
  type DeliveryFinanceEntryKind,
  type DeliveryFinanceEntryStatus,
  type DeliveryFinancePlanSource,
} from 'src/modules/delivery/finance/delivery-finance.policy';
@Entity({ name: 'deliveryFinanceEntry', schema: 'core' })
@Index(['workspaceId', 'id'], { unique: true })
@Index(['workspaceId', 'month', 'id'])
@Index(['workspaceId', 'month', 'currency'])
@Index(['workspaceId', 'planId', 'month'], { unique: true })
@Check('"amountMicros" >= 0')
@Check('"revision" > 0')
@Check("kind IN ('REVENUE', 'COST')")
@Check("status IN ('DRAFT', 'POSTED', 'VOID')")
@Check("\"sourceType\" IN ('MANUAL', 'PLAN', 'AI_SPEND')")
@Check(
  '("sourceType"=\'MANUAL\' AND "planId" IS NULL AND "sourcePlan" IS NULL AND "sourceAiSpend" IS NULL) OR ("sourceType"=\'PLAN\' AND "planId" IS NOT NULL AND "sourcePlan" IS NOT NULL AND "sourceAiSpend" IS NULL) OR ("sourceType"=\'AI_SPEND\' AND "planId" IS NULL AND "sourcePlan" IS NULL AND "sourceAiSpend" IS NOT NULL AND kind=\'COST\' AND currency=\'USD\')',
)
@Check("month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND left(month,4)<>'0000'")
@Check(
  'status<>\'POSTED\' OR ("postedAt" IS NOT NULL AND "postedBy" IS NOT NULL)',
)
@Check(
  'status<>\'VOID\' OR ("voidedAt" IS NOT NULL AND "voidedBy" IS NOT NULL AND "voidReason" IS NOT NULL AND length(btrim("voidReason"))>0)',
)
export class DeliveryFinanceEntryEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'integer', default: 1 }) revision: number;
  @Column({ type: 'text' }) month: string;
  @Column({ type: 'text' }) kind: DeliveryFinanceEntryKind;
  @Column({ type: 'text' }) category: string;
  @Column({ type: 'text' }) title: string;
  @Column({ type: 'text' }) currency: DeliveryFinanceCurrency;
  @Column({ type: 'bigint' }) amountMicros: string;
  @Column({ type: 'text' }) note: string;
  @Column({ type: 'text', nullable: true }) evidenceUrl: string | null;
  @Column({ type: 'text', default: 'DRAFT' })
  status: DeliveryFinanceEntryStatus;
  @Column({ type: 'text' }) sourceType: 'MANUAL' | 'PLAN' | 'AI_SPEND';
  @Column({ type: 'uuid', nullable: true }) planId: string | null;
  @Column({ type: 'jsonb', nullable: true })
  sourcePlan: DeliveryFinancePlanSource | null;
  @Column({ type: 'jsonb', nullable: true })
  sourceAiSpend: FinanceAiCostOrigin | null;
  @Column({ type: 'date', nullable: true }) dueDate: string | null;
  @Column({ type: 'uuid' }) createdBy: string;
  @Column({ type: 'uuid', nullable: true }) postedBy: string | null;
  @Column({ type: 'timestamptz', nullable: true }) postedAt: Date | null;
  @Column({ type: 'uuid', nullable: true }) voidedBy: string | null;
  @Column({ type: 'timestamptz', nullable: true }) voidedAt: Date | null;
  @Column({ type: 'text', nullable: true }) voidReason: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
