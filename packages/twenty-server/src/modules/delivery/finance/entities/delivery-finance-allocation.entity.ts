import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Relation,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import { DeliveryFinanceEntryEntity } from 'src/modules/delivery/finance/entities/delivery-finance-entry.entity';
@Entity({ name: 'deliveryFinanceAllocation', schema: 'core' })
@Index(['workspaceId', 'entryId', 'bucket'], { unique: true })
@Check('"amountMicros" >= 0')
@Check('bucket = COALESCE("projectId"::text, \'COMPANY\')')
export class DeliveryFinanceAllocationEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) entryId: string;
  @ManyToOne(() => DeliveryFinanceEntryEntity, { onDelete: 'CASCADE' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'entryId', referencedColumnName: 'id' },
  ])
  entry: Relation<DeliveryFinanceEntryEntity>;
  @Column({ type: 'text' }) bucket: string;
  @Column({ type: 'uuid', nullable: true }) projectId: string | null;
  @Column({ type: 'text', nullable: true }) projectName: string | null;
  @Column({ type: 'bigint' }) amountMicros: string;
}
