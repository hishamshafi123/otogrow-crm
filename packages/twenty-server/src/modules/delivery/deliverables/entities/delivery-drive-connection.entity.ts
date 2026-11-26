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

export type DriveFolderMode = 'FLAT' | 'SERVICE_SPLIT';

@Entity({ name: 'deliveryDriveConnection', schema: 'core' })
@Index(['workspaceId'], { unique: true })
@Check('"encryptedAccessToken" LIKE \'enc:v2:%\'')
@Check('"encryptedRefreshToken" LIKE \'enc:v2:%\'')
export class DeliveryDriveConnectionEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'text' }) googleEmail: string;
  @Column({ type: 'text', select: false })
  encryptedAccessToken: EncryptedString;
  @Column({ type: 'text', select: false })
  encryptedRefreshToken: EncryptedString;
  @Column({ type: 'timestamptz', nullable: true }) tokenExpiresAt: Date | null;
  @Column({ type: 'text', nullable: true }) rootFolderId: string | null;
  @Column({ type: 'text', nullable: true }) rootFolderName: string | null;
  @Column({ type: 'text', default: '{Month} {YYYY}' })
  monthFolderPattern: string;
  @Column({ type: 'text', default: 'FLAT' }) folderMode: DriveFolderMode;
  @Column({ type: 'boolean', default: false })
  includeOriginalInVariationFolder: boolean;
  @Column({ type: 'boolean', default: true }) autoPurgeVpsEnabled: boolean;
  @Column({ type: 'int', default: 24 }) autoPurgeVpsAfterHours: number;
  @Column({ type: 'uuid' }) connectedBy: string;
  @Column({ type: 'timestamptz', nullable: true }) revokedAt: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
