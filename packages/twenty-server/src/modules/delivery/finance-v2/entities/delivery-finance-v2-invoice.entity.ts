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
  type FinanceV2InvoiceStatus,
} from 'src/modules/delivery/finance-v2/finance-v2.types';

@Entity({ name: 'deliveryFinanceV2Invoice', schema: 'core' })
@Index(['workspaceId', 'id'], { unique: true })
@Index(['workspaceId', 'invoiceNumber'], { unique: true })
@Index(['workspaceId', 'scheduleId', 'scheduleMonth'], {
  unique: true,
  where: '"scheduleId" IS NOT NULL AND "scheduleMonth" IS NOT NULL',
})
@Index(['workspaceId', 'status', 'dueDate'])
@Check("status IN ('READY','SENT','PARTIALLY_PAID','PAID','VOID')")
@Check(
  '"totalMicros" >= 0 AND "paidMicros" >= 0 AND "paidMicros" <= "totalMicros"',
)
export class DeliveryFinanceV2InvoiceEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'text' }) invoiceNumber: string;
  @Column({ type: 'uuid', nullable: true }) scheduleId: string | null;
  @Column({ type: 'text', nullable: true }) scheduleMonth: string | null;
  @Column({ type: 'uuid', nullable: true }) sourceQuoteId: string | null;
  @Column({ type: 'text' }) clientName: string;
  @Column({ type: 'text', default: '' }) clientEmail: string;
  @Column({ type: 'text', default: '' }) clientAddress: string;
  @Column({ type: 'uuid', nullable: true }) projectId: string | null;
  @Column({ type: 'text', default: 'USD' }) currency: FinanceV2Currency;
  @Column({ type: 'date' }) issueDate: string;
  @Column({ type: 'date' }) dueDate: string;
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  lineItems: FinanceV2DocumentLineItem[];
  @Column({ type: 'bigint', default: '0' }) subtotalMicros: string;
  @Column({ type: 'bigint', default: '0' }) discountTotalMicros: string;
  @Column({ type: 'bigint', default: '0' }) totalMicros: string;
  @Column({ type: 'bigint', default: '0' }) paidMicros: string;
  @Column({ type: 'text', default: 'READY' }) status: FinanceV2InvoiceStatus;
  @Column({ type: 'text', nullable: true }) pdfStoragePath: string | null;
  @Column({ type: 'timestamptz', nullable: true }) sentAt: Date | null;
  @Column({ type: 'uuid', nullable: true }) sentBy: string | null;
  @Column({ type: 'text', nullable: true }) sentVia: 'EMAIL' | 'MANUAL' | null;
  @Column({ type: 'text', default: '' }) notes: string;
  @Column({ type: 'text', nullable: true }) voidReason: string | null;
  @Column({ type: 'timestamptz', nullable: true }) voidedAt: Date | null;
  @Column({ type: 'uuid' }) createdBy: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
