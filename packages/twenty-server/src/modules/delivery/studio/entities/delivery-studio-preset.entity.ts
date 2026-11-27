import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';

export type StudioPresetKind =
  | 'CHARACTER_SHEET'
  | 'VIDEO_GENERATION'
  | 'TEXT_HOOK'
  | 'CASTING_PERSONA';

export type StudioPresetConfig = {
  // Character Sheet dynamic options
  angleCount?: number;
  angleLayout?: 'GRID_SHEET' | 'SEPARATE_FRAMES' | 'SINGLE_HERO' | 'CUSTOM';
  angles?: string[];
  aspectRatio?: string;
  resolution?: string;
  quality?: string;
  candidateCount?: number;
  // Video Generation dynamic options
  modelKey?: string;
  durationSec?: number;
  generateAudio?: boolean;
  preserveReferenceSetting?: boolean;
  defaultEnvironment?: string;
  // Text Hook dynamic options
  defaultVariationCount?: number;
  platform?: 'TIKTOK' | 'INSTAGRAM_REELS' | 'META_ADS' | 'YOUTUBE_SHORTS' | 'ALL';
  funnelStage?: 'COLD' | 'WARM' | 'RETARGETING' | 'ORGANIC';
  hookStylePreset?: 'TIKTOK_PILL' | 'IG_SHADOW' | 'AD_BOX' | 'EDITORIAL' | 'BRAND_KIT';
  // Arbitrary future extension keys (fully dynamic)
  [key: string]: unknown;
};

@Entity({ name: 'deliveryStudioPreset', schema: 'core' })
@Index(['workspaceId', 'id'], { unique: true })
@Index(['workspaceId', 'kind'])
@Index(['workspaceId', 'companyId', 'projectId'])
export class DeliveryStudioPresetEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid', nullable: true })
  companyId: string | null;

  @Column({ type: 'uuid', nullable: true })
  projectId: string | null;

  @Column({ type: 'text' })
  kind: StudioPresetKind;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({ type: 'text', default: '' })
  masterPrompt: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  configJson: StudioPresetConfig;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  examplesJson: string[];

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  tagsJson: string[];

  @Column({ type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ type: 'boolean', default: false })
  archived: boolean;

  @Column({ type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
