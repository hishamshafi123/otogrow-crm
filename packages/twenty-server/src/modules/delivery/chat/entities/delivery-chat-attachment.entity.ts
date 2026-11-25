import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';

export type DeliveryChatAttachmentKind = 'IMAGE' | 'VOICE' | 'FILE';

@Entity({ name: 'deliveryChatAttachment', schema: 'core' })
@Index('IDX_deliveryChatAttachment_workspace_message', [
  'workspaceId',
  'messageId',
])
@Index('IDX_deliveryChatAttachment_workspace_uploader', [
  'workspaceId',
  'uploaderId',
  'createdAt',
])
export class DeliveryChatAttachmentEntity extends WorkspaceRelatedEntity {
  @PrimaryColumn({ type: 'uuid' }) id: string;
  @Column({ type: 'uuid' }) uploaderId: string;
  @Column({ type: 'uuid' }) recipientId: string;
  @Column({ type: 'uuid', nullable: true }) messageId: string | null;
  @Column({ type: 'text' }) kind: DeliveryChatAttachmentKind;
  @Column({ type: 'text' }) name: string;
  @Column({ type: 'text' }) mimeType: string;
  @Column({ type: 'integer' }) size: number;
  @Column({ type: 'text' }) storagePath: string;
  @Column({ type: 'integer', nullable: true }) durationMs: number | null;
  @Column({ type: 'jsonb', nullable: true }) waveform: number[] | null;
  @Column({ type: 'timestamptz' }) createdAt: Date;
}
