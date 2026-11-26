import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';

export type HookProjectStatus =
  | 'DRAFT'
  | 'ANALYZING'
  | 'READY'
  | 'RENDERING'
  | 'COMPLETED'
  | 'FAILED';

export type HookStyleConfig = {
  preset:
    | 'TIKTOK_PILL'
    | 'IG_SHADOW'
    | 'AD_BOX'
    | 'EDITORIAL'
    | 'BRAND_KIT';
  fontFamily: string;
  fontSizePct: number;
  fontWeight: number;
  lineHeight: number;
  textAlign: 'left' | 'center' | 'right';
  uppercase: boolean;
  textColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  backgroundRadiusPx: number;
  paddingXPx: number;
  paddingYPx: number;
  strokeColor: string;
  strokeWidthPx: number;
  shadowEnabled: boolean;
  xPct: number;
  yPct: number;
  maxWidthPct: number;
  fadeInSec: number;
  fadeOutSec: number;
  safeZoneGuide?: 'NONE' | 'TIKTOK' | 'INSTAGRAM_REELS' | 'META_ADS' | 'SHORTS';
};

export type WebsiteProfileSnapshot = {
  url: string;
  requestedUrl?: string;
  fetchedAt: string;
  brandName: string;
  summary: string;
  targetAudience: string;
  coreOffer: string;
  painPoints: string[];
  proofPoints: string[];
  toneOfVoice: string;
  keyProducts: string[];
  source?: 'AI' | 'FALLBACK';
};

export type VideoHookAnalysis = {
  analyzedAt: string;
  openingVisualSummary: string;
  spokenTranscript: string;
  moodAndPacing: string;
  recommendedPlacement: 'TOP_SAFE' | 'UPPER_CENTER' | 'LOWER_THIRD';
  placementReason: string;
  suggestedYPct: number;
  source?: 'GEMINI' | 'FALLBACK';
};

export type AiHookSuggestion = {
  id: string;
  hookText: string;
  angleTag: string;
  rationale: string;
  suggestedStartSec: number;
  suggestedEndSec: number;
  estimatedReadSec: number;
  source?: 'AI' | 'FALLBACK';
};

@Entity({ name: 'deliveryVideoHookProject', schema: 'core' })
@Index(['workspaceId', 'id'], { unique: true })
@Index(['workspaceId', 'deliverableId'], { unique: true })
export class DeliveryVideoHookProjectEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) companyId: string;
  @Column({ type: 'uuid' }) deliverableId: string;
  @Column({ type: 'text', nullable: true }) websiteUrl: string | null;
  @Column({ type: 'jsonb', nullable: true })
  websiteProfileSnapshot: WebsiteProfileSnapshot | null;
  @Column({ type: 'text', nullable: true }) knowledgeFingerprint: string | null;
  @Column({ type: 'jsonb', nullable: true })
  videoAnalysis: VideoHookAnalysis | null;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  creativeInput: Record<string, unknown>;
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  aiSuggestions: AiHookSuggestion[];
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  defaultStyleConfig: Partial<HookStyleConfig>;
  @Column({ type: 'text', default: 'DRAFT' }) status: HookProjectStatus;
  @Column({ type: 'text', nullable: true }) lastError: string | null;
  @Column({ type: 'uuid' }) createdById: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
