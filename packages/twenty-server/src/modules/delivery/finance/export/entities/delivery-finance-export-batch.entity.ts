import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Relation,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import { DeliveryFinanceExportProfileEntity } from 'src/modules/delivery/finance/export/entities/delivery-finance-export-profile.entity';
import {
  type FinanceExportSelection,
  type FinanceExportSnapshotRow,
} from 'src/modules/delivery/finance/export/delivery-finance-export.policy';
import {
  type DeliveryFinanceExportExclusionDTO,
  type DeliveryFinanceExportProfileDTO,
  type DeliveryFinanceExportTotalsDTO,
} from 'src/modules/delivery/finance/export/delivery-finance-export.dto';

@Entity({ name: 'deliveryFinanceExportBatch', schema: 'core' })
@Index(['workspaceId', 'id'], { unique: true })
@Index(['workspaceId', 'basis', 'currency', 'id'])
@Check("basis IN ('CASH','RECOGNITION')")
@Check('"profileRevision" > 0')
@Check('"rowCount" > 0 AND "rowCount" <= 2000')
@Check('"byteLength" > 0 AND "byteLength" <= 5000000')
@Check("checksum ~ '^[a-f0-9]{64}$'")
export class DeliveryFinanceExportBatchEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'uuid' }) profileId: string;
  @Column({ type: 'integer' }) profileRevision: number;
  @Column({ type: 'text' }) basis: 'CASH' | 'RECOGNITION';
  @Column({ type: 'text' }) currency: string;
  @Column({ type: 'jsonb' }) selection: FinanceExportSelection;
  @Column({ type: 'jsonb' }) profileSnapshot: DeliveryFinanceExportProfileDTO;
  @Column({ type: 'jsonb' }) rows: FinanceExportSnapshotRow[];
  @Column({ type: 'uuid', array: true }) sourceIds: string[];
  @Column({ type: 'text', array: true }) identityKeys: string[];
  @Column({ type: 'jsonb' }) exclusions: DeliveryFinanceExportExclusionDTO[];
  @Column({ type: 'jsonb' }) totals: DeliveryFinanceExportTotalsDTO;
  @Column({ type: 'integer' }) rowCount: number;
  @Column({ type: 'text' }) csv: string;
  @Column({ type: 'text' }) checksum: string;
  @Column({ type: 'integer' }) byteLength: number;
  @Column({ type: 'text' }) previewToken: string;
  @Column({ type: 'text' }) requestHash: string;
  @Column({ type: 'text', nullable: true }) reexportReason: string | null;
  @Column({ type: 'uuid' }) createdBy: string;
  @Column({ type: 'text' }) createdByName: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @ManyToOne(() => DeliveryFinanceExportProfileEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'profileId', referencedColumnName: 'id' },
  ])
  profile: Relation<DeliveryFinanceExportProfileEntity>;
}
