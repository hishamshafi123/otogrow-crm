export type ClientBrandAsset = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
};
export type ClientEngagement = {
  id: string;
  projectId: string;
  companyId: string;
  assets: ClientBrandAsset[];
  revision: number;
  name: string;
  services: string[];
  advertising?: {
    managerId: string;
    marketerId: string;
    currency: string;
    channel: string;
    period: string;
  } | null;
  billing: 'ONE_TIME' | 'RETAINER';
  scope: string;
  allowance: string;
  contact: string;
  fields: { id: string; label: string; required: boolean }[];
  submissions: {
    id: string;
    at: string;
    answers: { label: string; value: string }[];
    acceptedBy: string | null;
  }[];
};
export type ClientShare = {
  id: string;
  engagementId: string;
  taskId: string;
  title: string;
  kind: 'BRIEF' | 'SUBMISSION';
  version: number;
  content: string;
  links: string[];
  hasAsset?: boolean;
  withdrawnAt: string | null;
  reviews: { id: string; at: string; decision: string; comment: string }[];
};
export type ClientsSnapshot = {
  engagements: ClientEngagement[];
  shares: ClientShare[];
  links: {
    id: string;
    engagementId: string;
    expiresAt: string;
    revokedAt: string | null;
  }[];
  token?: string | null;
  accessCode?: string | null;
};
export type ClientPortalData = {
  advertising?: {
    currency: string;
    channel: string;
    period: string;
    requests: {
      id: string;
      amount: number;
      currency: string;
      channel: string;
      period: string;
      status: string;
      createdAt: string;
    }[];
  } | null;
  assets: ClientBrandAsset[];
  engagement: Pick<
    ClientEngagement,
    | 'name'
    | 'services'
    | 'billing'
    | 'scope'
    | 'allowance'
    | 'contact'
    | 'revision'
    | 'fields'
  >;
  submissions: {
    id: string;
    at: string;
    accepted: boolean;
    answers: { label: string; value: string }[];
  }[];
  shares: ClientShare[];
};
