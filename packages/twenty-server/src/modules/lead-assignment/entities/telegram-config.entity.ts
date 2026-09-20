import {
  Check,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { type EncryptedString } from 'src/engine/core-modules/secret-encryption/branded-strings/encrypted-string.type';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';

// One Telegram bot per workspace: assignment pings for every setter go through
// this single bot.
@Index('IDX_TELEGRAM_CONFIG_WORKSPACE_ID', ['workspaceId'], { unique: true })
@Check('CHK_telegramConfig_botToken_encrypted', `"botToken" LIKE 'enc:v2:%'`)
@Entity({ name: 'telegramConfig', schema: 'core' })
export class TelegramConfigEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', nullable: false })
  botToken: EncryptedString;

  // Filled from getMe when the connection is tested; needed to build the
  // t.me deep links setters use to link their chat
  @Column({ type: 'text', nullable: true })
  botUsername: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamptz' })
  deletedAt: Date | null;
}
