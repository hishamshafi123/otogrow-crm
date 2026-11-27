import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';

export type StudioRoutingMode =
  | 'AUTO_FAILOVER'
  | 'WAVESPEED_ONLY'
  | 'KIE_ONLY';

@Entity({ name: 'deliveryStudioProviderConfig', schema: 'core' })
@Index(['workspaceId'], { unique: true })
export class DeliveryStudioProviderConfigEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'text', nullable: true, select: false })
  encryptedWavespeedKey: string | null;

  @Column({ type: 'text', nullable: true })
  wavespeedKeyLast4: string | null;

  @Column({ type: 'boolean', default: true })
  wavespeedEnabled: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  wavespeedVerifiedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  wavespeedLastError: string | null;

  @Column({ type: 'text', nullable: true, select: false })
  encryptedKieKey: string | null;

  @Column({ type: 'text', nullable: true })
  kieKeyLast4: string | null;

  @Column({ type: 'boolean', default: true })
  kieEnabled: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  kieVerifiedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  kieLastError: string | null;

  @Column({ type: 'text', default: 'AUTO_FAILOVER' })
  defaultRoutingMode: StudioRoutingMode;

  @Column({ type: 'text', default: 'nano-banana-2.1' })
  defaultImageModel: string;

  @Column({ type: 'text', default: 'seedance-2.5' })
  defaultVideoModel: string;

  @Column({ type: 'integer', default: 4 })
  maxConcurrentJobs: number;

  @Column({ type: 'uuid', nullable: true })
  updatedById: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
