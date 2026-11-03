import {
  Check,
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { type EncryptedString } from 'src/engine/core-modules/secret-encryption/branded-strings/encrypted-string.type';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';

@Entity({ name: 'deliveryFathomConnection', schema: 'core' })
@Index(['workspaceId'], { unique: true })
@Check('revision > 0')
@Check('NOT enabled OR "apiKey" IS NOT NULL')
export class DeliveryFathomConnectionEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'integer' }) revision: number;
  @Column({ type: 'boolean', default: false }) enabled: boolean;
  @Column({ type: 'text', nullable: true, select: false })
  apiKey: EncryptedString | null;
  @Column({ type: 'uuid' }) updatedBy: string;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
