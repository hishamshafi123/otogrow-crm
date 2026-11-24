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
  UpdateDateColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import { DeliveryFinanceV2AccountEntity } from 'src/modules/delivery/finance-v2/entities/delivery-finance-v2-account.entity';
import {
  type FinanceV2Currency,
  type FinanceV2ScheduleStatus,
} from 'src/modules/delivery/finance-v2/finance-v2.types';

@Entity({ name: 'deliveryFinanceV2RecurringExpense', schema: 'core' })
@Index(['workspaceId', 'id'], { unique: true })
@Index(['workspaceId', 'status', 'dayOfMonth'])
@Check('"amountMicros" > 0')
@Check('"dayOfMonth" >= 1 AND "dayOfMonth" <= 31')
@Check("\"expenseType\" IN ('DIRECT_EXPENSE','INDIRECT_EXPENSE')")
@Check("status IN ('ACTIVE','PAUSED','STOPPED')")
export class DeliveryFinanceV2RecurringExpenseEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'text' }) title: string;
  @Column({ type: 'text', default: 'DIRECT_EXPENSE' })
  expenseType: 'DIRECT_EXPENSE' | 'INDIRECT_EXPENSE';
  @Column({ type: 'text' }) category: string;
  @Column({ type: 'text' }) currency: FinanceV2Currency;
  @Column({ type: 'bigint' }) amountMicros: string;
  @Column({ type: 'integer' }) dayOfMonth: number;
  @Column({ type: 'uuid' }) fundingAccountId: string;
  @Column({ type: 'uuid', nullable: true }) employeeMemberId: string | null;
  @Column({ type: 'text', nullable: true }) employeeName: string | null;
  @Column({ type: 'text', default: '' }) notes: string;
  @Column({ type: 'text' }) startMonth: string;
  @Column({ type: 'text', nullable: true }) endMonth: string | null;
  @Column({ type: 'text', default: 'ACTIVE' }) status: FinanceV2ScheduleStatus;
  @Column({ type: 'uuid' }) createdBy: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;

  @ManyToOne(() => DeliveryFinanceV2AccountEntity, { onDelete: 'NO ACTION' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'fundingAccountId', referencedColumnName: 'id' },
  ])
  fundingAccount: Relation<DeliveryFinanceV2AccountEntity>;
}
