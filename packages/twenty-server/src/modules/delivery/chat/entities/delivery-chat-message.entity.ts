import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';

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
  @Column({ type: 'timestamptz' }) createdAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) viewedAt: Date | null;
}
