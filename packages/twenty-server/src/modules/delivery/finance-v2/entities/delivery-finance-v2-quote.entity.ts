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
  type FinanceV2QuoteStatus,
} from 'src/modules/delivery/finance-v2/finance-v2.types';

@Entity({ name: 'deliveryFinanceV2Quote', schema: 'core' })
@Index(['workspaceId', 'id'], { unique: true })
@Index(['workspaceId', 'quoteNumber'], { unique: true })
@Index(['workspaceId', 'status', 'issueDate'])
@Check("status IN ('DRAFT','SENT','CONVERTED','VOID')")
@Check('"totalMicros" >= 0')
export class DeliveryFinanceV2QuoteEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'text' }) quoteNumber: string;
  @Column({ type: 'text' }) clientName: string;
  @Column({ type: 'text', default: '' }) clientEmail: string;
  @Column({ type: 'text', default: '' }) clientAddress: string;
  @Column({ type: 'uuid', nullable: true }) projectId: string | null;
  @Column({ type: 'text', default: 'USD' }) currency: FinanceV2Currency;
  @Column({ type: 'date' }) issueDate: string;
  @Column({ type: 'date', nullable: true }) validUntil: string | null;
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  lineItems: FinanceV2DocumentLineItem[];
  @Column({ type: 'bigint', default: '0' }) subtotalMicros: string;
  @Column({ type: 'bigint', default: '0' }) discountTotalMicros: string;
  @Column({ type: 'bigint', default: '0' }) totalMicros: string;
  @Column({ type: 'text', default: '' }) notes: string;
  @Column({ type: 'text', default: '' }) terms: string;
  @Column({ type: 'text', default: 'DRAFT' }) status: FinanceV2QuoteStatus;
  @Column({ type: 'timestamptz', nullable: true }) sentAt: Date | null;
  @Column({ type: 'uuid', nullable: true }) convertedInvoiceId: string | null;
  @Column({ type: 'uuid', nullable: true }) convertedScheduleId: string | null;
  @Column({ type: 'text', nullable: true }) voidReason: string | null;
  @Column({ type: 'timestamptz', nullable: true }) voidedAt: Date | null;
  @Column({ type: 'uuid' }) createdBy: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
