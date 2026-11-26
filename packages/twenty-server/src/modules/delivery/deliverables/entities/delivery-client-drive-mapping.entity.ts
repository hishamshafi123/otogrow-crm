import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';

export type CachedDriveMonthFolder = {
  folderId: string;
  folderName: string;
  webUrl: string | null;
};

@Entity({ name: 'deliveryClientDriveMapping', schema: 'core' })
@Index(['workspaceId', 'companyId'], { unique: true })
export class DeliveryClientDriveMappingEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) companyId: string;
  @Column({ type: 'text' }) rootFolderId: string;
  @Column({ type: 'text' }) rootFolderName: string;
  @Column({ type: 'text', nullable: true }) rootFolderWebUrl: string | null;
  @Column({ type: 'text', nullable: true })
  monthFolderPatternOverride: string | null;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  monthFolderCache: Record<string, CachedDriveMonthFolder>;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
