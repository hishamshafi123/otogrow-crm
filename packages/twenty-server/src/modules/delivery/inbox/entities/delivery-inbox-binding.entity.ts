import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import { type InboxConsentSnapshot } from '../delivery-inbox.types';

@Entity({ name: 'deliveryInboxBinding', schema: 'core' })
@Index(['workspaceId', 'id'], { unique: true })
@Index(['workspaceId', 'conversationId'], { unique: true })
@Index(['workspaceId', 'accountId', 'channelId', 'threadExternalId'], {
  unique: true,
})
@Check('CHK_deliveryInboxBinding_revision', 'revision > 0')
@Check(
  'CHK_deliveryInboxBinding_consent',
  "CASE WHEN jsonb_typeof(consent)='object' AND jsonb_typeof(consent->'grants')='array' THEN jsonb_array_length(consent->'grants')<=100 ELSE false END",
)
export class DeliveryInboxBindingEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn('uuid') id: string;
  @Column('uuid') conversationId: string;
  @Column('uuid') accountId: string;
  @Column('uuid') channelId: string;
  @Column('varchar', { length: 300 }) threadExternalId: string;
  @Column('uuid') ownerMemberId: string;
  @Column('uuid') ownerUserWorkspaceId: string;
  @Column('uuid') projectId: string;
  @ManyToOne(() => DeliveryProjectEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'projectId', referencedColumnName: 'id' },
  ])
  project: Relation<DeliveryProjectEntity>;
  @Column('uuid', { nullable: true }) companyId: string | null;
  @Column('integer') revision: number;
  @Column('boolean', { default: true }) enabled: boolean;
  @Column('jsonb') consent: InboxConsentSnapshot;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
