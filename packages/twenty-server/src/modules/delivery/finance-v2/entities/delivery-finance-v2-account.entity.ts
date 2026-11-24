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
  type FinanceV2AccountSubType,
  type FinanceV2AccountType,
  type FinanceV2Currency,
} from 'src/modules/delivery/finance-v2/finance-v2.types';

@Entity({ name: 'deliveryFinanceV2Account', schema: 'core' })
@Index(['workspaceId', 'id'], { unique: true })
@Index(['workspaceId', 'code'], { unique: true })
@Index(['workspaceId', 'accountType', 'subType'])
@Check(
  "\"accountType\" IN ('ASSET','LIABILITY','EQUITY','REVENUE','DIRECT_EXPENSE','INDIRECT_EXPENSE')",
)
@Check(
  "\"subType\" IN ('CASH_CURRENCY','FIXED_ASSET','PERSON_LIABILITY','OPENING_EQUITY','SERVICE_REVENUE','DIRECT_COST','INDIRECT_COST','FX_GAIN_LOSS')",
)
export class DeliveryFinanceV2AccountEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'text' }) code: string;
  @Column({ type: 'text' }) name: string;
  @Column({ type: 'text' }) accountType: FinanceV2AccountType;
  @Column({ type: 'text' }) subType: FinanceV2AccountSubType;
  @Column({ type: 'text', nullable: true }) currency: FinanceV2Currency | null;
  @Column({ type: 'text', nullable: true }) personName: string | null;
  @Column({ type: 'text', nullable: true }) personEmail: string | null;
  @Column({ type: 'boolean', default: true }) active: boolean;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
