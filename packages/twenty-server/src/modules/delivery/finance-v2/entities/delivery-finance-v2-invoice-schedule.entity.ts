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
  type FinanceV2Currency,
  type FinanceV2DocumentLineItem,
  type FinanceV2ScheduleStatus,
} from 'src/modules/delivery/finance-v2/finance-v2.types';

@Entity({ name: 'deliveryFinanceV2InvoiceSchedule', schema: 'core' })
@Index(['workspaceId', 'id'], { unique: true })
@Index(['workspaceId', 'status', 'billingDayOfMonth'])
@Check('"billingDayOfMonth" >= 1 AND "billingDayOfMonth" <= 31')
@Check('"dueDayOfMonth" >= 1 AND "dueDayOfMonth" <= 31')
@Check("status IN ('ACTIVE','PAUSED','STOPPED')")
@Check('"totalMicros" >= 0')
export class DeliveryFinanceV2InvoiceScheduleEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'text' }) clientName: string;
  @Column({ type: 'text', default: '' }) clientEmail: string;
  @Column({ type: 'text', default: '' }) clientAddress: string;
  @Column({ type: 'uuid', nullable: true }) projectId: string | null;
  @Column({ type: 'text', default: 'USD' }) currency: FinanceV2Currency;
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  lineItems: FinanceV2DocumentLineItem[];
  @Column({ type: 'bigint', default: '0' }) subtotalMicros: string;
  @Column({ type: 'bigint', default: '0' }) discountTotalMicros: string;
  @Column({ type: 'bigint', default: '0' }) totalMicros: string;
  @Column({ type: 'integer' }) billingDayOfMonth: number;
  @Column({ type: 'integer' }) dueDayOfMonth: number;
  @Column({ type: 'text', default: '' }) notes: string;
  @Column({ type: 'text' }) startMonth: string;
  @Column({ type: 'text', nullable: true }) endMonth: string | null;
  @Column({ type: 'text', default: 'ACTIVE' }) status: FinanceV2ScheduleStatus;
  @Column({ type: 'uuid', nullable: true }) sourceQuoteId: string | null;
  @Column({ type: 'uuid' }) createdBy: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
