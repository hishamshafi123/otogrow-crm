import {
  Check,
  Column,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import { type FinanceExportConfiguration } from 'src/modules/delivery/finance/export/delivery-finance-export.policy';

@Entity({ name: 'deliveryFinanceExportProfile', schema: 'core' })
@Index(['workspaceId', 'id'], { unique: true })
@Check('revision > 0')
@Check("basis IN ('CASH','RECOGNITION')")
@Check('length(btrim(name)) > 0')
export class DeliveryFinanceExportProfileEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'integer', default: 1 }) revision: number;
  @Column({ type: 'text' }) name: string;
  @Column({ type: 'text' }) basis: 'CASH' | 'RECOGNITION';
  @Column({ type: 'boolean' }) active: boolean;
  @Column({ type: 'jsonb' }) configuration: FinanceExportConfiguration;
  @Column({ type: 'uuid' }) changedBy: string;
  @Column({ type: 'text' }) changedByName: string;
  @UpdateDateColumn({ type: 'timestamptz' }) changedAt: Date;
}
