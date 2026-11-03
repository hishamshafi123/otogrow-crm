export type AtlasKind = 'IMAGE' | 'CLIP';
export type AtlasOperation = 'TEXT_TO_IMAGE' | 'IMAGE_EDIT' | 'IMAGE_TO_VIDEO';
export type AtlasParameters = {
  resolution?: string;
  size?: string;
  aspectRatio?: string;
  duration?: number;
  generateAudio?: boolean;
  quality?: string;
  seed?: number;
};
export type AtlasReservationLimit = {
  profileId: string;
  maximumCostUsd: string;
  source: string;
  verifiedAt: string;
  id?: string;
  revision?: number;
};
export type AtlasFrozenRequest = {
  profileId: string;
  familyId: string;
  modelLabel: string;
  kind: AtlasKind;
  operation: AtlasOperation;
  schemaRevision: string;
  taskRevision: number;
  briefVersion: number;
  productionVersion: number;
  assemblyVersion: number;
  settingsVersion: number;
  target: 'BRIEF' | 'SHOT';
  shotId: string | null;
  shotVersion: number | null;
  prompt: string;
  referenceAssetIds: string[];
  parameters: AtlasParameters;
};
export type AtlasJobStatus =
  | 'QUOTED'
  | 'QUEUED'
  | 'SUBMITTING'
  | 'POLLING'
  | 'DOWNLOADING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'UNCERTAIN'
  | 'CANCELLED';
