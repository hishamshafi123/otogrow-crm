import {
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
  type FinanceV2RateCardItem,
} from 'src/modules/delivery/finance-v2/finance-v2.types';

@Entity({ name: 'deliveryFinanceV2Profile', schema: 'core' })
@Index(['workspaceId'], { unique: true })
export class DeliveryFinanceV2ProfileEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'text', default: 'Otogrow' }) companyName: string;
  @Column({ type: 'text', default: '' }) legalAddress: string;
  @Column({ type: 'text', default: '' }) email: string;
  @Column({ type: 'text', default: '' }) phone: string;
  @Column({ type: 'text', default: '' }) website: string;
  @Column({ type: 'text', nullable: true }) logoDataUrl: string | null;
  @Column({ type: 'text', default: '' }) bankDetails: string;
  @Column({ type: 'text', default: '' }) defaultQuoteTerms: string;
  @Column({ type: 'text', default: '' }) defaultInvoiceNotes: string;
  @Column({ type: 'text', default: 'AED' }) baseCurrency: FinanceV2Currency;
  @Column({ type: 'text', default: 'Asia/Dubai' }) timezone: string;
  @Column({ type: 'date', nullable: true }) lockedThroughDate: string | null;
  @Column({ type: 'integer', default: 1 }) quoteSequence: number;
  @Column({ type: 'integer', default: 1 }) invoiceSequence: number;
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  rateCard: FinanceV2RateCardItem[];
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  exchangeRates: Record<string, string>;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
