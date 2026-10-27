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
import {
  type DeliveryFinancePlanType,
  type DeliveryFinanceCurrency,
} from 'src/modules/delivery/finance/delivery-finance.policy';
@Entity({ name: 'deliveryFinancePlan', schema: 'core' })
@Index(['workspaceId', 'id'], { unique: true })
@Check('"monthlyAmountMicros" >= 0')
@Check('"revision" > 0')
@Check('"dueDay" BETWEEN 1 AND 31')
@Check("type IN ('SALARY', 'OVERHEAD')")
@Check('"endMonth" IS NULL OR "endMonth" >= "startMonth"')
@Check(
  '"startMonth" ~ \'^[0-9]{4}-(0[1-9]|1[0-2])$\' AND left("startMonth",4)<>\'0000\'',
)
@Check(
  '"endMonth" IS NULL OR ("endMonth" ~ \'^[0-9]{4}-(0[1-9]|1[0-2])$\' AND left("endMonth",4)<>\'0000\')',
)
@Check('NOT (active AND type=\'SALARY\') OR "memberId" IS NOT NULL')
export class DeliveryFinancePlanEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'integer', default: 1 }) revision: number;
  @Column({ type: 'text' }) type: DeliveryFinancePlanType;
  @Column({ type: 'text' }) name: string;
  @Column({ type: 'text' }) currency: DeliveryFinanceCurrency;
  @Column({ type: 'bigint' }) monthlyAmountMicros: string;
  @Column({ type: 'uuid', nullable: true }) memberId: string | null;
  @Column({ type: 'text', nullable: true }) memberName: string | null;
  @Column({ type: 'text' }) startMonth: string;
  @Column({ type: 'text', nullable: true }) endMonth: string | null;
  @Column({ type: 'integer' }) dueDay: number;
  @Column({ type: 'boolean' }) active: boolean;
  @Column({ type: 'uuid' }) createdBy: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
