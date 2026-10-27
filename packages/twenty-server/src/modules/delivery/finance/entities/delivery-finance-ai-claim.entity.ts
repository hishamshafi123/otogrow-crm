import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Relation,
  UpdateDateColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import { OtogrowAiSpendEntity } from 'src/modules/otogrow-ai-budget/entities/otogrow-ai-spend.entity';
import { DeliveryFinanceEntryEntity } from 'src/modules/delivery/finance/entities/delivery-finance-entry.entity';

@Entity({ name: 'deliveryFinanceAiClaim', schema: 'core' })
@Index(['workspaceId', 'spendId'], { unique: true })
@Check('revision > 0')
@Check('"reviewedSpendRevision" IS NULL OR "reviewedSpendRevision" > 0')
@Check(
  '"replacementEntryId" IS NULL OR ("currentEntryId" IS NOT NULL AND "replacementEntryId" <> "currentEntryId")',
)
export class DeliveryFinanceAiClaimEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) spendId: string;
  @Column({ type: 'integer', default: 1 }) revision: number;
  @Column({ type: 'integer', nullable: true }) reviewedSpendRevision:
    | number
    | null;
  @Column({ type: 'uuid', nullable: true }) currentEntryId: string | null;
  @Column({ type: 'uuid', nullable: true }) replacementEntryId: string | null;
  @Column({ type: 'uuid' }) createdBy: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
  @ManyToOne(() => OtogrowAiSpendEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'spendId', referencedColumnName: 'id' },
  ])
  spend: Relation<OtogrowAiSpendEntity>;
  @ManyToOne(() => DeliveryFinanceEntryEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'currentEntryId', referencedColumnName: 'id' },
  ])
  currentEntry: Relation<DeliveryFinanceEntryEntity>;
  @ManyToOne(() => DeliveryFinanceEntryEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'replacementEntryId', referencedColumnName: 'id' },
  ])
  replacementEntry: Relation<DeliveryFinanceEntryEntity>;
}
