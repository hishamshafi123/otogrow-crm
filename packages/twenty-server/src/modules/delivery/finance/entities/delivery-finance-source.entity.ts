import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import { type FinanceCashSnapshot } from 'src/modules/delivery/finance/delivery-finance-reconciliation.policy';
@Entity({ name: 'deliveryFinanceSource', schema: 'core' })
@Index(['workspaceId', 'id'], { unique: true })
@Check("kind IN ('CASH','RECEIVABLE')")
@Check('"amountMicros" > 0 AND "amountMicros" % 10000 = 0')
export class DeliveryFinanceSourceEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'text' }) kind: 'CASH' | 'RECEIVABLE';
  @Column({ type: 'text' }) currency: string;
  @Column({ type: 'bigint' }) amountMicros: string;
  @Column({ type: 'jsonb' }) snapshot: FinanceCashSnapshot;
  @Column({ type: 'text', nullable: true }) requestHash: string | null;
  @Column({ type: 'uuid' }) createdBy: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
