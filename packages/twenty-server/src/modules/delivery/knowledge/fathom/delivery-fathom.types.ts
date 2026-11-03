export type FathomMeeting = {
  recordingId: string;
  title: string | null;
  recordedAt: string | null;
  sourceUrl: string | null;
};
export type FathomProvenance = FathomMeeting & {
  provider: 'FATHOM';
  importedAt: string;
  importedBy: string;
  companyId: string | null;
  transcriptHash: string;
  proofHash: string;
  segmentCount: number;
  humanEdited: boolean;
};
export type FathomProof = {
  version: 1;
  purpose: 'FATHOM_MEETING' | 'FATHOM_TRANSCRIPT';
  workspaceId: string;
  memberId: string;
  userWorkspaceId: string;
  projectId: string;
  projectRevision: number;
  companyId: string | null;
  sourceId: string;
  connectionRevision: number;
  meeting: FathomMeeting;
  capturedAt: string;
  expiresAt: string;
  transcriptHash: string | null;
  segmentCount: number | null;
};
