import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';

@Index('IDX_PORTAL_ACCESS_WORKSPACE_ID_COMPANY_ID', [
  'workspaceId',
  'companyId',
])
@Entity({ name: 'portalAccess', schema: 'core' })
export class PortalAccessEntity
  extends WorkspaceRelatedEntity
  implements Required<PortalAccessEntity>
{
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: false })
  companyId: string;

  // Only the sha256 of the raw token is stored; the raw token is returned once
  // by the generate/regenerate mutations and is never recoverable afterwards.
  @Column({ nullable: false })
  @Index('IDX_PORTAL_ACCESS_TOKEN_HASH', { unique: true })
  tokenHash: string;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamptz' })
  deletedAt: Date | null;
}
