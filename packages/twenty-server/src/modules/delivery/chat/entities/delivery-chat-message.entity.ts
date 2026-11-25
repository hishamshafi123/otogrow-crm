import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import { type DeliveryChatAttachmentKind } from 'src/modules/delivery/chat/entities/delivery-chat-attachment.entity';

export type DeliveryChatMessageAttachmentMeta = {
  id: string;
  kind: DeliveryChatAttachmentKind;
  name: string;
  mimeType: string;
  size: number;
  durationMs: number | null;
  waveform: number[] | null;
};

export type DeliveryChatMessageReactionMeta = {
  emoji: string;
  memberId: string;
  memberName: string;
  createdAt: string;
};

@Entity({ name: 'deliveryChatMessage', schema: 'core' })
@Index(['workspaceId', 'senderId', 'requestId'], { unique: true })
@Index('IDX_deliveryChatMessage_sender_history', [
  'workspaceId',
  'senderId',
  'recipientId',
  'position',
])
@Index('IDX_deliveryChatMessage_recipient_history', [
  'workspaceId',
  'recipientId',
  'senderId',
  'position',
])
@Index('IDX_deliveryChatMessage_project_history', [
  'workspaceId',
  'projectId',
  'position',
])
@Index(['viewedAt', 'createdAt'])
export class DeliveryChatMessageEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'bigint', generated: 'increment' }) position: string;
  @Column({ type: 'uuid' }) senderId: string;
  @Column({ type: 'uuid' }) recipientId: string;
  @Column({ type: 'uuid' }) requestId: string;
  @Column({ type: 'text' }) senderName: string;
  @Column({ type: 'text' }) recipientName: string;
  @Column({ type: 'text' }) text: string;
  @Column({ type: 'uuid', nullable: true }) projectId: string | null;
  @Column({ type: 'text', nullable: true }) projectName: string | null;
  @Column({ type: 'uuid', nullable: true }) replyToMessageId: string | null;
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  attachments: DeliveryChatMessageAttachmentMeta[];
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  reactions: DeliveryChatMessageReactionMeta[];
  @Column({ type: 'timestamptz' }) createdAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) viewedAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) editedAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) deletedAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) pinnedAt: Date | null;
  @Column({ type: 'uuid', nullable: true }) pinnedById: string | null;
}
