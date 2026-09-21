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

@Entity({ name: 'metaLeadForm', schema: 'core' })
@Index(
  'IDX_META_LEAD_FORM_SHEET',
  ['workspaceId', 'spreadsheetId', 'sheetId'],
  { unique: true, where: '"deletedAt" IS NULL' },
)
@Check(
  'CHK_metaLeadForm_credentials_encrypted',
  `"credentials" LIKE 'enc:v2:%'`,
)
export class MetaLeadFormEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  spreadsheetId: string;

  @Column({ type: 'int' })
  sheetId: number;

  @Column({ type: 'text', select: false })
  credentials: EncryptedString;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  lastSyncedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamptz' })
  deletedAt: Date | null;
}
