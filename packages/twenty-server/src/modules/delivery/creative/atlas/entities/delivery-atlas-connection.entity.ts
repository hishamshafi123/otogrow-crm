import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';
import { DeliveryAtlasCredentialEntity } from 'src/modules/delivery/creative/atlas/entities/delivery-atlas-credential.entity';
import { type AtlasReservationLimit } from 'src/modules/delivery/creative/atlas/delivery-atlas.types';

@Entity({ name: 'deliveryAtlasConnection', schema: 'core' })
@Index(['workspaceId'], { unique: true })
@Check('revision>0')
export class DeliveryAtlasConnectionEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'integer' }) revision: number;
  @Column({ type: 'boolean', default: false }) enabled: boolean;
  @Column({ type: 'uuid', nullable: true }) credentialId: string | null;
  @Column({ type: 'text', array: true, default: [] })
  enabledProfileIds: string[];
  @Column({ type: 'text', nullable: true }) defaultImageFamilyId: string | null;
  @Column({ type: 'text', nullable: true }) defaultClipProfileId: string | null;
  @Column({ type: 'jsonb', default: [] })
  reservationLimits: AtlasReservationLimit[];
  @Column({ type: 'timestamptz', nullable: true }) verifiedAt: Date | null;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
  @ManyToOne(() => DeliveryAtlasCredentialEntity, { onDelete: 'RESTRICT' })
  @JoinColumn([
    { name: 'workspaceId', referencedColumnName: 'workspaceId' },
    { name: 'credentialId', referencedColumnName: 'id' },
  ])
  credential: Relation<DeliveryAtlasCredentialEntity> | null;
}
