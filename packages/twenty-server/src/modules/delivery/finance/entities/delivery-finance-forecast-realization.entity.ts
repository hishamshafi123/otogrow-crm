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
import { DeliveryFinanceForecastItemEntity } from 'src/modules/delivery/finance/entities/delivery-finance-forecast-item.entity';

@Entity({ name: 'deliveryFinanceForecastRealization', schema: 'core' })
@Index(['workspaceId', 'cashId', 'id'])
@Index(['workspaceId', 'itemId', 'id'])
@Check('"amountMicros" > 0')
@Check('revision > 0')
@Check("status IN ('ACTIVE','REVERSED')")
@Check(
  'status<>\'REVERSED\' OR ("reversedAt" IS NOT NULL AND "reversedBy" IS NOT NULL AND "reversalReason" IS NOT NULL AND length(btrim("reversalReason"))>0)',
)
export class DeliveryFinanceForecastRealizationEntity extends DeliveryFinanceRelationEntity {
  @Column({ type: 'uuid' }) itemId: string;
  @Column({ type: 'text' }) note: string;
  @ManyToOne(() => DeliveryFinanceSourceEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'cashId', referencedColumnName: 'id' },
  ])
  cash: Relation<DeliveryFinanceSourceEntity>;
  @ManyToOne(() => DeliveryFinanceForecastItemEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'itemId', referencedColumnName: 'id' },
  ])
  item: Relation<DeliveryFinanceForecastItemEntity>;
}
