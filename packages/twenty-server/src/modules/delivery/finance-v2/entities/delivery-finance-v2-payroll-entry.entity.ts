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
  UpdateDateColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import { DeliveryFinanceV2PayrollProfileEntity } from 'src/modules/delivery/finance-v2/entities/delivery-finance-v2-payroll-profile.entity';
import { type FinanceV2PayrollEntryKind } from 'src/modules/delivery/finance-v2/finance-v2.types';

@Entity({ name: 'deliveryFinanceV2PayrollEntry', schema: 'core' })
@Index(['workspaceId', 'profileId', 'month'])
@Index(['workspaceId', 'month'])
@Check("\"entryKind\" IN ('LEAVE','SWAP_COMP_OFF','OVERTIME','BONUS')")
@Check("month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND left(month,4)<>'0000'")
export class DeliveryFinanceV2PayrollEntryEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'uuid' }) profileId: string;
  @Column({ type: 'text' }) month: string;
  @Column({ type: 'text' }) entryKind: FinanceV2PayrollEntryKind;
  @Column({ type: 'text', nullable: true }) days: string | null;
  @Column({ type: 'bigint', nullable: true }) bonusAmountMicros: string | null;
  @Column({ type: 'date' }) eventDate: string;
  @Column({ type: 'date', nullable: true }) swappedWorkDate: string | null;
  @Column({ type: 'text', default: '' }) note: string;
  @Column({ type: 'uuid' }) createdBy: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;

  @ManyToOne(() => DeliveryFinanceV2PayrollProfileEntity, {
    onDelete: 'CASCADE',
  })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'profileId', referencedColumnName: 'id' },
  ])
  profile: Relation<DeliveryFinanceV2PayrollProfileEntity>;
}
