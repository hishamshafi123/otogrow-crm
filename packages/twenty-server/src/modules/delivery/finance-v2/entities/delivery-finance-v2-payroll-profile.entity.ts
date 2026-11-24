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
import { DeliveryFinanceV2RecurringExpenseEntity } from 'src/modules/delivery/finance-v2/entities/delivery-finance-v2-recurring-expense.entity';
import { type FinanceV2Currency } from 'src/modules/delivery/finance-v2/finance-v2.types';

@Entity({ name: 'deliveryFinanceV2PayrollProfile', schema: 'core' })
@Index(['workspaceId', 'id'], { unique: true })
@Index(['workspaceId', 'active'])
@Check('"baseSalaryMicros" > 0')
@Check('"workingDaysPerMonth" >= 1 AND "workingDaysPerMonth" <= 31')
@Check('"paidLeavesPerMonth" >= 0 AND "paidLeavesPerMonth" <= 31')
@Check('"payDayOfMonth" >= 1 AND "payDayOfMonth" <= 31')
export class DeliveryFinanceV2PayrollProfileEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'uuid', nullable: true }) employeeMemberId: string | null;
  @Column({ type: 'text' }) employeeName: string;
  @Column({ type: 'text', default: '' }) roleLabel: string;
  @Column({ type: 'text', default: 'INR' }) currency: FinanceV2Currency;
  @Column({ type: 'bigint' }) baseSalaryMicros: string;
  @Column({ type: 'integer', default: 26 }) workingDaysPerMonth: number;
  @Column({ type: 'integer', default: 2 }) paidLeavesPerMonth: number;
  @Column({ type: 'integer', default: 28 }) payDayOfMonth: number;
  @Column({ type: 'uuid' }) fundingAccountId: string;
  @Column({ type: 'uuid', nullable: true }) recurringExpenseId: string | null;
  @Column({ type: 'boolean', default: true }) active: boolean;
  @Column({ type: 'uuid' }) createdBy: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;

  @ManyToOne(() => DeliveryFinanceV2AccountEntity, { onDelete: 'NO ACTION' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'fundingAccountId', referencedColumnName: 'id' },
  ])
  fundingAccount: Relation<DeliveryFinanceV2AccountEntity>;

  @ManyToOne(() => DeliveryFinanceV2RecurringExpenseEntity, {
    onDelete: 'NO ACTION',
    nullable: true,
  })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'recurringExpenseId', referencedColumnName: 'id' },
  ])
  recurringExpense: Relation<DeliveryFinanceV2RecurringExpenseEntity> | null;
}
