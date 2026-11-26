import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { type EncryptedString } from 'src/engine/core-modules/secret-encryption/branded-strings/encrypted-string.type';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';

@Entity({ name: 'deliveryClientPortalAccess', schema: 'core' })
@Index(['slug'], { unique: true })
@Index(['workspaceId', 'companyId'], { unique: true })
@Check('"encryptedCode" LIKE \'enc:v2:%\'')
export class DeliveryClientPortalAccessEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) companyId: string;
  @Column({ type: 'text' }) slug: string;
  @Column({ type: 'text' }) codeHash: string;
  @Column({ type: 'text', select: false }) encryptedCode: EncryptedString;
  @Column({ type: 'uuid', nullable: true }) codeSetBy: string | null;
  @Column({ type: 'timestamptz', default: () => 'now()' }) codeSetAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) expiresAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) revokedAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) lastAccessedAt: Date | null;
  @Column({ type: 'text', nullable: true }) brandLogoAssetId: string | null;
  @Column({ type: 'text', nullable: true }) brandAccentColor: string | null;
  @Column({ type: 'text', default: '' }) welcomeNote: string;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  visibleServiceOverrides: Record<string, boolean>;
  @Column({ type: 'boolean', default: true }) showDriveLinks: boolean;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
