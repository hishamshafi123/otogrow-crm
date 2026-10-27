import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Relation,
  UpdateDateColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import { DeliveryFinanceSourceEntity } from 'src/modules/delivery/finance/entities/delivery-finance-source.entity';
import { DeliveryFinancePlanEntity } from 'src/modules/delivery/finance/entities/delivery-finance-plan.entity';

@Entity({ name: 'deliveryFinanceForecastItem', schema: 'core' })
@Index(['workspaceId', 'id'], { unique: true })
@Index(['workspaceId', 'currency', 'id'])
@Index(['workspaceId', 'receivableId'], { unique: true })
@Index(['workspaceId', 'planId', 'planMonth'], { unique: true })
@Check('revision > 0')
@Check('"amountMicros" >= 0')
@Check("status IN ('ACTIVE','CANCELLED')")
@Check(
  '(kind=\'COLLECTION\' AND "sourceType"=\'RECEIVABLE\' AND "receivableId" IS NOT NULL AND "planId" IS NULL AND "planMonth" IS NULL) OR (kind=\'OUTFLOW\' AND "receivableId" IS NULL AND (("sourceType"=\'PLAN\' AND "planId" IS NOT NULL AND "planMonth" IS NOT NULL) OR ("sourceType"=\'MANUAL\' AND "planId" IS NULL AND "planMonth" IS NULL)))',
)
@Check(
  '"planMonth" IS NULL OR ("planMonth" ~ \'^[0-9]{4}-(0[1-9]|1[0-2])$\' AND left("planMonth",4)<>\'0000\')',
)
export class DeliveryFinanceForecastItemEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'integer', default: 1 }) revision: number;
  @Column({ type: 'text' }) status: 'ACTIVE' | 'CANCELLED';
  @Column({ type: 'text' }) kind: 'COLLECTION' | 'OUTFLOW';
  @Column({ type: 'text' }) sourceType: 'RECEIVABLE' | 'PLAN' | 'MANUAL';
  @Column({ type: 'uuid', nullable: true }) receivableId: string | null;
  @Column({ type: 'uuid', nullable: true }) planId: string | null;
  @Column({ type: 'text', nullable: true }) planMonth: string | null;
  @Column({ type: 'text' }) currency: string;
  @Column({ type: 'text' }) title: string;
  @Column({ type: 'bigint' }) amountMicros: string;
  @Column({ type: 'date', nullable: true }) expectedDate: string | null;
  @Column({ type: 'uuid' }) ownerId: string;
  @Column({ type: 'text' }) ownerName: string;
  @Column({ type: 'date' }) nextActionDate: string;
  @Column({ type: 'text' }) note: string;
  @Column({ type: 'text', nullable: true }) sourceToken: string | null;
  @Column({ type: 'jsonb', nullable: true }) sourceSnapshot: Record<
    string,
    unknown
  > | null;
  @Column({ type: 'uuid' }) createdBy: string;
  @Column({ type: 'uuid' }) changedBy: string;
  @Column({ type: 'text' }) changedByName: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) changedAt: Date;
  @ManyToOne(() => DeliveryFinanceSourceEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'receivableId', referencedColumnName: 'id' },
  ])
  receivable: Relation<DeliveryFinanceSourceEntity>;
  @ManyToOne(() => DeliveryFinancePlanEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'planId', referencedColumnName: 'id' },
  ])
  plan: Relation<DeliveryFinancePlanEntity>;
}
