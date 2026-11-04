export type CompetitorIdentity = {
  workspaceId: string;
  memberId: string;
  userWorkspaceId: string;
  isManager: boolean;
  scope: string;
  observedAt: string;
};
export type CompetitorProject = {
  id: string;
  name: string;
  revision: number;
  companyId: string | null;
};
export type CompetitorPlatform =
  | 'X'
  | 'INSTAGRAM'
  | 'META_AD_LIBRARY'
  | 'MANUAL';
export type CompetitorStatus = 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
export type CompetitorStateAction = 'PAUSE' | 'RESTORE' | 'ARCHIVE';
export type CompetitorBody = {
  projectId: string;
  label: string;
  platform: CompetitorPlatform;
  accountReference: string;
  ownerId: string;
  reviewerId: string;
  cadenceHours: number;
  lookbackDays: number;
  purpose: string;
};
export type CompetitorSavedBody = CompetitorBody & {
  canonicalReference: string;
  canonicalKey: string;
  ownerName: string;
  reviewerName: string;
};
export type CompetitorSummary = {
  id: string;
  projectId: string;
  companyId: string | null;
  label: string;
  platform: CompetitorPlatform;
  canonicalReference: string;
  ownerId: string;
  ownerName: string;
  reviewerId: string;
  reviewerName: string;
  revision: number;
  currentVersion: number;
  status: CompetitorStatus;
  cadenceHours: number;
  lookbackDays: number;
};
export type CompetitorReceipt = {
  workspaceId: string;
  actorId: string;
  userWorkspaceId: string;
  requestId: string;
  sourceId: string;
  inputHash: string;
  action: 'SAVE' | CompetitorStateAction;
  revision: number;
  version: number;
  status: CompetitorStatus;
  note: string;
  actorName: string;
  createdAt: string;
};
export type CompetitorCollection = {
  collectionEnabled: boolean;
  collectionState: 'MANUAL_ONLY' | 'NOT_CONNECTED';
};
export type CompetitorProjects = CompetitorIdentity & {
  items: CompetitorProject[];
  totalCount: number;
  nextCursor: string | null;
};
export type CompetitorSources = CompetitorIdentity & {
  project: CompetitorProject;
  items: CompetitorSummary[];
  totalCount: number;
  nextCursor: string | null;
};
export type CompetitorChoices = CompetitorIdentity & {
  project: CompetitorProject;
  owners: { id: string; name: string }[];
  reviewers: { id: string; name: string }[];
};
export type CompetitorDetail = CompetitorIdentity &
  CompetitorCollection & {
    project: CompetitorProject;
    source: CompetitorSummary;
    selectedVersion: number;
    body: CompetitorSavedBody;
    history: CompetitorReceipt[];
    nextCursor: string | null;
    canEdit: boolean;
    canPause: boolean;
    canArchive: boolean;
    canRestore: boolean;
  };
export type CompetitorCommandAnchor = {
  id: string;
  requestId: string;
  revision: number;
  projectId: string;
  projectRevision: number;
  expectedCompanyId: string | null;
};
export type CompetitorSaveInput = CompetitorCommandAnchor & {
  body: CompetitorBody;
};
export type CompetitorChangeInput = CompetitorCommandAnchor & {
  action: CompetitorStateAction;
  note: string;
};
export type CompetitorCommand = (
  | { kind: 'SAVE'; input: CompetitorSaveInput }
  | { kind: 'CHANGE'; input: CompetitorChangeInput }
) & { hash: string };
export type CompetitorPreview = CompetitorIdentity &
  CompetitorCollection & {
    project: CompetitorProject;
    sourceId: string;
    requestId: string;
    inputHash: string;
    body: CompetitorSavedBody;
  };
export type CompetitorIntent = CompetitorCommandAnchor & {
  mode: 'new' | 'edit' | CompetitorStateAction;
  scope: string;
  body: CompetitorBody;
  note: string;
};
