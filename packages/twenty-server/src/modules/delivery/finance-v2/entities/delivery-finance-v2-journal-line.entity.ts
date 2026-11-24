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
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import { DeliveryFinanceV2AccountEntity } from 'src/modules/delivery/finance-v2/entities/delivery-finance-v2-account.entity';
import { DeliveryFinanceV2JournalEntity } from 'src/modules/delivery/finance-v2/entities/delivery-finance-v2-journal.entity';
import { type FinanceV2Currency } from 'src/modules/delivery/finance-v2/finance-v2.types';

@Entity({ name: 'deliveryFinanceV2JournalLine', schema: 'core' })
@Index(['workspaceId', 'journalId'])
@Index(['workspaceId', 'accountId'])
@Check('"debitAedMicros" >= 0 AND "creditAedMicros" >= 0')
@Check(
  '("debitAedMicros" = 0 OR "creditAedMicros" = 0) AND ("debitAedMicros" > 0 OR "creditAedMicros" > 0)',
)
export class DeliveryFinanceV2JournalLineEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'uuid' }) journalId: string;
  @Column({ type: 'uuid' }) accountId: string;
  @Column({ type: 'bigint', default: '0' }) debitAedMicros: string;
  @Column({ type: 'bigint', default: '0' }) creditAedMicros: string;
  @Column({ type: 'text' }) currency: FinanceV2Currency;
  @Column({ type: 'bigint' }) originalSignedMicros: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;

  @ManyToOne(() => DeliveryFinanceV2JournalEntity, { onDelete: 'CASCADE' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'journalId', referencedColumnName: 'id' },
  ])
  journal: Relation<DeliveryFinanceV2JournalEntity>;

  @ManyToOne(() => DeliveryFinanceV2AccountEntity, { onDelete: 'NO ACTION' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'accountId', referencedColumnName: 'id' },
  ])
  account: Relation<DeliveryFinanceV2AccountEntity>;
}
