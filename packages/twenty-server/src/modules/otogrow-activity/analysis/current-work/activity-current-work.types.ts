export type ActivityCurrentWorkScope = {
  personId: string | null;
  projectId: string | null;
  clientId: string | null;
};
export type ActivityCurrentTask = {
  taskId: string;
  title: string;
  projectId: string;
  projectName: string;
  clientId: string | null;
  clientName: string | null;
  taskRevision: number;
  state: string;
  blocker: string | null;
  ownerId: string | null;
  ownerName: string | null;
  dueAt: string | null;
  submissionVersion: number | null;
  submittedAt: string | null;
  primaryReviewerId: string | null;
  primaryReviewerName: string | null;
  effectiveReviewerId: string | null;
  effectiveReviewerName: string | null;
  reviewerState:
    | 'ACTIVE'
    | 'UNASSIGNED'
    | 'SELF_REVIEW'
    | 'UNAVAILABLE'
    | 'UNKNOWN';
  assignmentMode: 'PRIMARY' | 'BACKUP';
  assignmentRevision: number;
  warnings: string[];
  detailsTruncated: boolean;
  href: string;
};
export type ActivityCurrentWorkSnapshot = {
  capturedAt: string;
  scope: ActivityCurrentWorkScope;
  totalCount: number;
  includedCount: number;
  omittedCount: number;
  truncatedFieldCount: number;
  omittedBytes: number;
  complete: boolean;
  items: ActivityCurrentTask[];
  limitations: string[];
  fingerprint: string;
  nativeVisibilityFingerprint: string;
};
export type ActivityCurrentTaskRead = {
  capturedAt: string;
  scope: ActivityCurrentWorkScope;
  task: ActivityCurrentTask | null;
  unavailableReason: 'NOT_AVAILABLE_IN_SCOPE' | null;
};
