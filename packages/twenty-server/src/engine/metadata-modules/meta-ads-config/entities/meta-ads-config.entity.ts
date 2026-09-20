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

// One Meta app/page connection per workspace: leadgen webhooks for every lead
// ad form of the page land on a single endpoint per workspace.
@Index('IDX_META_ADS_CONFIG_WORKSPACE_ID', ['workspaceId'], { unique: true })
@Check('CHK_metaAdsConfig_appSecret_encrypted', `"appSecret" LIKE 'enc:v2:%'`)
@Check(
  'CHK_metaAdsConfig_pageAccessToken_encrypted',
  `"pageAccessToken" LIKE 'enc:v2:%'`,
)
@Entity({ name: 'metaAdsConfig', schema: 'core' })
export class MetaAdsConfigEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', nullable: false })
  appId: string;

  @Column({ type: 'text', nullable: false })
  appSecret: EncryptedString;

  @Column({ type: 'text', nullable: false })
  pageId: string;

  @Column({ type: 'text', nullable: false })
  pageAccessToken: EncryptedString;

  @Column({ type: 'text', nullable: false })
  verifyToken: string;

  // Restricts intake to a single lead ad form; null accepts every form of the
  // page.
  @Column({ type: 'text', nullable: true })
  formId: string | null;

  // Meta retries leadgen notifications, so processed leadgen ids are kept to
  // make intake idempotent.
  @Column({ type: 'jsonb', nullable: false, default: () => "'[]'" })
  processedLeadgenIds: string[];

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamptz' })
  deletedAt: Date | null;
}
