import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  Relation,
} from 'typeorm';
import { DeliveryFinanceRelationEntity } from 'src/modules/delivery/finance/entities/delivery-finance-relation.entity';
import { DeliveryFinanceSourceEntity } from 'src/modules/delivery/finance/entities/delivery-finance-source.entity';
import { DeliveryFinanceEntryEntity } from 'src/modules/delivery/finance/entities/delivery-finance-entry.entity';
import { DeliveryFinanceAllocationEntity } from 'src/modules/delivery/finance/entities/delivery-finance-allocation.entity';
@Entity({ name: 'deliveryFinanceCashMatch', schema: 'core' })
@Index(['workspaceId', 'cashId', 'id'])
@Index(['workspaceId', 'entryId', 'bucket', 'id'])
@Check('"amountMicros" > 0')
@Check('"revision" > 0')
@Check("status IN ('ACTIVE','REVERSED')")
@Check('bucket = COALESCE("projectId"::text, \'COMPANY\')')
@Check(
  'status<>\'REVERSED\' OR ("reversedAt" IS NOT NULL AND "reversedBy" IS NOT NULL AND "reversalReason" IS NOT NULL AND length(btrim("reversalReason"))>0)',
)
@Check("month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND left(month,4)<>'0000'")
export class DeliveryFinanceCashMatchEntity extends DeliveryFinanceRelationEntity {
  @Column({ type: 'uuid' }) entryId: string;
  @Column({ type: 'text' }) month: string;
  @Column({ type: 'text' }) bucket: string;
  @ManyToOne(() => DeliveryFinanceSourceEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'cashId', referencedColumnName: 'id' },
  ])
  cash: Relation<DeliveryFinanceSourceEntity>;
  @ManyToOne(() => DeliveryFinanceEntryEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'entryId', referencedColumnName: 'id' },
  ])
  entry: Relation<DeliveryFinanceEntryEntity>;
  @ManyToOne(() => DeliveryFinanceAllocationEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'entryId', referencedColumnName: 'entryId' },
    { name: 'bucket', referencedColumnName: 'bucket' },
  ])
  allocation: Relation<DeliveryFinanceAllocationEntity>;
}
