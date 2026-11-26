import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';

export type SocialMetricPlatform =
  | 'INSTAGRAM'
  | 'TIKTOK'
  | 'FACEBOOK'
  | 'X'
  | 'YOUTUBE'
  | 'LINKEDIN'
  | 'ALL';

export type SocialMetricSource = 'MANUAL' | 'CSV' | 'API';

@Entity({ name: 'deliveryContentMetricSnapshot', schema: 'core' })
@Index(['workspaceId', 'companyId', 'monthKey', 'platform'])
export class DeliveryContentMetricSnapshotEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) companyId: string;
  @Column({ type: 'uuid', nullable: true }) projectId: string | null;
  @Column({ type: 'uuid', nullable: true }) contentVariantId: string | null;
  @Column({ type: 'text' }) monthKey: string;
  @Column({ type: 'text' }) platform: SocialMetricPlatform;
  @Column({ type: 'text', nullable: true }) postTitle: string | null;
  @Column({ type: 'text', nullable: true }) postUrl: string | null;
  @Column({ type: 'int', default: 0 }) views: number;
  @Column({ type: 'int', default: 0 }) impressions: number;
  @Column({ type: 'int', default: 0 }) reach: number;
  @Column({ type: 'int', default: 0 }) likes: number;
  @Column({ type: 'int', default: 0 }) comments: number;
  @Column({ type: 'int', default: 0 }) shares: number;
  @Column({ type: 'int', default: 0 }) saves: number;
  @Column({ type: 'int', default: 0 }) clicks: number;
  @Column({ type: 'int', default: 0 }) followerDelta: number;
  @Column({ type: 'text', default: 'MANUAL' }) source: SocialMetricSource;
  @Column({ type: 'uuid', nullable: true }) recordedById: string | null;
  @Column({ type: 'timestamptz', default: () => 'now()' }) observedAt: Date;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
