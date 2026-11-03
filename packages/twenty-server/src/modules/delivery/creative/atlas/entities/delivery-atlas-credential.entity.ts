import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import { type EncryptedString } from 'src/engine/core-modules/secret-encryption/branded-strings/encrypted-string.type';

@Entity({ name: 'deliveryAtlasCredential', schema: 'core' })
@Index(['workspaceId', 'id'], { unique: true })
@Check('"apiKey" LIKE \'enc:v2:%\'')
export class DeliveryAtlasCredentialEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'text', select: false }) apiKey: EncryptedString;
  @Column({ type: 'uuid' }) createdBy: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) revokedAt: Date | null;
}
