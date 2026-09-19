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

// One Twilio account per workspace: the sender configuration is shared by
// every channel message the workspace sends.
@Index('IDX_TWILIO_CONFIG_WORKSPACE_ID', ['workspaceId'], { unique: true })
@Check('CHK_twilioConfig_authToken_encrypted', `"authToken" LIKE 'enc:v2:%'`)
@Check(
  'CHK_twilioConfig_apiKeySecret_encrypted',
  `"apiKeySecret" IS NULL OR "apiKeySecret" LIKE 'enc:v2:%'`,
)
@Entity({ name: 'twilioConfig', schema: 'core' })
export class TwilioConfigEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', nullable: false })
  accountSid: string;

  @Column({ type: 'text', nullable: false })
  authToken: EncryptedString;

  @Column({ type: 'text', nullable: true })
  whatsappSenderNumber: string | null;

  @Column({ type: 'text', nullable: true })
  smsNumber: string | null;

  // E.164 number used as caller id for browser calls; picked during calling
  // provisioning from the account's voice-capable numbers.
  @Column({ type: 'text', nullable: true })
  voiceNumber: string | null;

  @Column({ type: 'text', nullable: true })
  apiKeySid: string | null;

  @Column({ type: 'text', nullable: true })
  apiKeySecret: EncryptedString | null;

  @Column({ type: 'text', nullable: true })
  twimlAppSid: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamptz' })
  deletedAt: Date | null;
}
