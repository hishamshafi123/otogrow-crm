export type DeliveryMediaSettings = {
  version: number;
  enabled: boolean;
  modelIds: string[];
  roles: ('ADMIN' | 'MANAGER' | 'MEMBER')[];
  dailyRunLimit: number;
  allowUnknownCost: boolean;
};
export type DeliveryMediaRun = {
  inspection?: {
    summary: string;
    findings: { assetId: string; evidence: string; correction: string }[];
    limitations: string;
  };
  id: string;
  requestId: string;
  modelId: string;
  kind: 'IMAGE' | 'CLIP' | 'ASSEMBLY' | 'INSPECTION' | 'VIDEO_QA';
  shotId: string;
  shotVersion: number;
  briefVersion: number;
  settingsVersion: number;
  prompt: string;
  referenceAssetIds: string[];
  initiatorId: string;
  userWorkspaceId: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  createdAt: string;
  updatedAt: string;
  error: string | null;
  providerJobId: string | null;
  assetId: string | null;
  cost: number | null;
};
