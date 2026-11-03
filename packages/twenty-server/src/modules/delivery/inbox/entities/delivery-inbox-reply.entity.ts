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
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import {
  type InboxPrepareInput,
  type InboxReceipt,
  type InboxReplyBody,
  type InboxReplyStatus,
} from '../delivery-inbox.types';
import { DeliveryInboxBindingEntity } from './delivery-inbox-binding.entity';

@Entity({ name: 'deliveryInboxReply', schema: 'core' })
@Index(['workspaceId', 'id'], { unique: true })
@Index(['workspaceId', 'requestId'], { unique: true })
@Index(['workspaceId', 'sendRequestId'], {
  unique: true,
  where: '"sendRequestId" IS NOT NULL',
})
@Index(['workspaceId', 'cancelRequestId'], {
  unique: true,
  where: '"cancelRequestId" IS NOT NULL',
})
@Index(['workspaceId', 'bindingId', 'createdAt', 'id'])
@Index(['status', 'updatedAt'])
@Check(
  'CHK_deliveryInboxReply_status',
  "status IN ('GENERATING','DRAFT','QUEUED','SENDING','SENT','FAILED','UNCERTAIN','CANCELLED')",
)
@Check(
  'CHK_deliveryInboxReply_hashes',
  '"inputHash" ~ \'^[a-f0-9]{64}$\' AND ("bodyFingerprint" IS NULL OR "bodyFingerprint" ~ \'^[a-f0-9]{64}$\')',
)
@Check(
  'CHK_deliveryInboxReply_body',
  `(body IS NULL AND "bodyFingerprint" IS NULL) OR COALESCE(body IS NOT NULL AND "bodyFingerprint" IS NOT NULL AND jsonb_typeof(body->'text')='string' AND length(body->>'text') BETWEEN 1 AND 12000,false)`,
)
@Check(
  'CHK_deliveryInboxReply_send_receipt',
  '("sendRequestId" IS NULL AND "sendReceipt" IS NULL AND "sendInputHash" IS NULL) OR ("sendRequestId" IS NOT NULL AND "sendReceipt" IS NOT NULL AND "sendInputHash" IS NOT NULL AND "sendInputHash" ~ \'^[a-f0-9]{64}$\')',
)
@Check(
  'CHK_deliveryInboxReply_cancel_receipt',
  '("cancelRequestId" IS NULL)=("cancelReceipt" IS NULL)',
)
@Check(
  'CHK_deliveryInboxReply_dispatch',
  "status NOT IN ('QUEUED','SENDING','SENT','UNCERTAIN') OR (body IS NOT NULL AND \"sendRequestId\" IS NOT NULL)",
)
export class DeliveryInboxReplyEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn('uuid') id: string;
  @Column('uuid') requestId: string;
  @Column('uuid') bindingId: string;
  @ManyToOne(() => DeliveryInboxBindingEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'bindingId', referencedColumnName: 'id' },
  ])
  binding: Relation<DeliveryInboxBindingEntity>;
  @Column('uuid') conversationId: string;
  @Column('uuid') actorId: string;
  @Column('uuid') userWorkspaceId: string;
  @Column('varchar', { length: 64 }) inputHash: string;
  @Column('jsonb') input: InboxPrepareInput;
  @Column('jsonb', { nullable: true }) body: InboxReplyBody | null;
  @Column('varchar', { length: 64, nullable: true }) bodyFingerprint:
    | string
    | null;
  @Column('varchar') status: InboxReplyStatus;
  @Column('varchar') headerMessageId: string;
  @Column('jsonb') preparationReceipt: InboxReceipt;
  @Column('uuid', { nullable: true }) sendRequestId: string | null;
  @Column('varchar', { length: 64, nullable: true }) sendInputHash:
    | string
    | null;
  @Column('jsonb', { nullable: true }) sendReceipt: InboxReceipt | null;
  @Column('uuid', { nullable: true }) cancelRequestId: string | null;
  @Column('jsonb', { nullable: true }) cancelReceipt: InboxReceipt | null;
  @Column('varchar', { nullable: true }) providerMessageId: string | null;
  @Column('varchar', { nullable: true }) problem: string | null;
  @Column('timestamptz', { nullable: true }) attemptedAt: Date | null;
  @Column('timestamptz', { nullable: true }) finishedAt: Date | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
