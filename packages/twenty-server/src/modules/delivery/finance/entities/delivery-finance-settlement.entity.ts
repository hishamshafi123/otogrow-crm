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
@Entity({ name: 'deliveryFinanceSettlement', schema: 'core' })
@Index(['workspaceId', 'cashId', 'id'])
@Index(['workspaceId', 'receivableId', 'id'])
@Check('"amountMicros" > 0 AND "amountMicros" % 10000 = 0')
@Check('"revision" > 0')
@Check("status IN ('ACTIVE','REVERSED')")
@Check(
  'status<>\'REVERSED\' OR ("reversedAt" IS NOT NULL AND "reversedBy" IS NOT NULL AND "reversalReason" IS NOT NULL AND length(btrim("reversalReason"))>0)',
)
@Check('"cashId" <> "receivableId"')
export class DeliveryFinanceSettlementEntity extends DeliveryFinanceRelationEntity {
  @Column({ type: 'uuid' }) receivableId: string;
  @ManyToOne(() => DeliveryFinanceSourceEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'cashId', referencedColumnName: 'id' },
  ])
  cash: Relation<DeliveryFinanceSourceEntity>;
  @ManyToOne(() => DeliveryFinanceSourceEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'receivableId', referencedColumnName: 'id' },
  ])
  receivable: Relation<DeliveryFinanceSourceEntity>;
}
