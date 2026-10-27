import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';

export type DeliveryReminderState =
  | 'QUEUED'
  | 'SENDING'
  | 'SENT'
  | 'FAILED'
  | 'UNCERTAIN'
  | 'SUPPRESSED'
  | 'UNCONFIGURED';

@Entity({ name: 'deliveryReminderOutbox', schema: 'core' })
@Index(['workspaceId', 'noticeId'], { unique: true })
@Index(['status', 'createdAt'])
export class DeliveryReminderOutboxEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  noticeId: string;

  @Column({ type: 'varchar', default: 'QUEUED' })
  status: DeliveryReminderState;

  @Column({ type: 'timestamptz', nullable: true })
  attemptedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  finishedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  error: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
