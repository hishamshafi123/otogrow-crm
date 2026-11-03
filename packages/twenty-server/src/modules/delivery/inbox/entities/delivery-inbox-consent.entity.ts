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
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import {
  type InboxConsentSnapshot,
  type InboxReceipt,
} from '../delivery-inbox.types';
import { DeliveryInboxBindingEntity } from './delivery-inbox-binding.entity';

@Entity({ name: 'deliveryInboxConsent', schema: 'core' })
@Index(['workspaceId', 'bindingId', 'revision'], { unique: true })
@Check('CHK_deliveryInboxConsent_revision', 'revision > 0')
@Check('CHK_deliveryInboxConsent_hash', '"inputHash" ~ \'^[a-f0-9]{64}$\'')
export class DeliveryInboxConsentEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn('uuid') id: string;
  @Column('uuid') bindingId: string;
  @ManyToOne(() => DeliveryInboxBindingEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'bindingId', referencedColumnName: 'id' },
  ])
  binding: Relation<DeliveryInboxBindingEntity>;
  @Column('integer') revision: number;
  @Column('varchar', { length: 64 }) inputHash: string;
  @Column('jsonb') snapshot: InboxConsentSnapshot;
  @Column('jsonb') receipt: InboxReceipt;
  @CreateDateColumn() createdAt: Date;
}
