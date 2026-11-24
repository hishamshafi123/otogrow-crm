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
  type FinanceV2JournalEntryType,
  type FinanceV2JournalStatus,
} from 'src/modules/delivery/finance-v2/finance-v2.types';

@Entity({ name: 'deliveryFinanceV2Journal', schema: 'core' })
@Index(['workspaceId', 'id'], { unique: true })
@Index(['workspaceId', 'entryDate', 'id'])
@Index(['workspaceId', 'entryType', 'entryDate'])
@Index(['workspaceId', 'sourceRefType', 'sourceRefId'], {
  unique: true,
  where:
    '"sourceRefType" IS NOT NULL AND "sourceRefId" IS NOT NULL AND status = \'POSTED\'',
})
@Check("status IN ('POSTED','VOID')")
@Check('"aedAmountMicros" >= 0')
export class DeliveryFinanceV2JournalEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'date' }) entryDate: string;
  @Column({ type: 'text' }) entryType: FinanceV2JournalEntryType;
  @Column({ type: 'text' }) category: string;
  @Column({ type: 'text' }) title: string;
  @Column({ type: 'text', default: '' }) notes: string;
  @Column({ type: 'text' }) currency: FinanceV2Currency;
  @Column({ type: 'bigint' }) amountMicros: string;
  @Column({ type: 'text' }) fxRateToAed: string;
  @Column({ type: 'bigint' }) aedAmountMicros: string;
  @Column({ type: 'uuid', nullable: true }) fundingAccountId: string | null;
  @Column({ type: 'uuid', nullable: true }) targetAccountId: string | null;
  @Column({ type: 'uuid', nullable: true }) projectId: string | null;
  @Column({ type: 'uuid', nullable: true }) employeeMemberId: string | null;
  @Column({ type: 'text', nullable: true }) receiptUrl: string | null;
  @Column({ type: 'text', nullable: true }) sourceRefType: string | null;
  @Column({ type: 'text', nullable: true }) sourceRefId: string | null;
  @Column({ type: 'text', default: 'POSTED' }) status: FinanceV2JournalStatus;
  @Column({ type: 'uuid', nullable: true }) reversalOfJournalId: string | null;
  @Column({ type: 'uuid' }) createdBy: string;
  @Column({ type: 'uuid', nullable: true }) voidedBy: string | null;
  @Column({ type: 'timestamptz', nullable: true }) voidedAt: Date | null;
  @Column({ type: 'text', nullable: true }) voidReason: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
