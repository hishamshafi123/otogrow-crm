import {
  type DeliveryMediaSettings,
  type DeliveryMediaRun,
} from '@/delivery/delivery-media.types';
export type CreativeBrief = {
  outputKind?: 'IMAGE' | 'VIDEO';
  objective: 'ADS' | 'ORGANIC';
  audience: string;
  painPoint: string;
  angle: string;
  concept: string;
  productFacts: string;
  mandatoryClaims: string;
  visualDirection: string;
  format: string;
  duration: number;
  hook: string;
  cta: string;
  music: string;
  brandAssets: string[];
};
export type CreativeShotFields = {
  title: string;
  imagePrompt: string;
  animationPrompt: string;
  duration: number;
  subject: string;
  product: string;
  location: string;
  notes: string;
  referenceId: string | null;
};
export type CreativeReview = {
  memberId: string;
  at: string;
  decision: 'APPROVED' | 'REJECTED' | 'ESCALATED';
  notes: string;
};
export type CreativeReference = {
  title: string;
  url: string | null;
  assetId: string | null;
  summary: string;
  angle: string;
  tags: string[];
} & {
  id: string;
  version: number;
  reviews: CreativeReview[];
  sourceReferenceId?: string;
};
export type CreativeAsset = {
  storageState: 'PENDING' | 'READY' | 'FAILED';
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
  uploadedBy: string;
  briefVersion: number;
  productionVersion: number;
  assemblyVersion: number;
  shotId: string | null;
  shotVersion: number | null;
  kind:
    | 'REFERENCE'
    | 'IMAGE'
    | 'CLIP'
    | 'BASE'
    | 'HOOK'
    | 'CTA'
    | 'FINAL'
    | 'AUDIO';
  parentAssetId: string | null;
  reviews: CreativeReview[];
};
export type CreativeShot = CreativeShotFields & {
  id: string;
  version: number;
  history: (CreativeShotFields & { version: number })[];
  imageId: string | null;
  clipId: string | null;
};
export type CreativeDocument = {
  mediaSettings?: DeliveryMediaSettings;
  mediaRuns?: DeliveryMediaRun[];
  version: number;
  productionVersion: number;
  assemblyVersion: number;
  brief: CreativeBrief;
  briefVersion: number;
  approvedBriefVersion: number | null;
  briefHistory: { version: number; brief: CreativeBrief; approved: boolean }[];
  references: CreativeReference[];
  shots: CreativeShot[];
  assets: CreativeAsset[];
  finalAssetId: string | null;
  assembly: {
    assetIds: string[];
    overlayText: string;
    audioId: string | null;
    notes: string;
  };
  variants: {
    id: string;
    baseId: string;
    hookId: string;
    ctaId: string;
    selected: boolean;
  }[];
  revisionCharge: number;
};
