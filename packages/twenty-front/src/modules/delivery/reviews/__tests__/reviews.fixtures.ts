import {
  type ReviewQueueItem,
  type ReviewQueueSnapshot,
  type TaskReviewSnapshot,
} from '@/delivery/reviews/review.types';
export const REVIEW_TASK_ID = '5a5adf3e-cbb0-4235-8de7-25d5b5072943';
export const NEXT_REVIEW_TASK_ID = '671c02a5-fc5c-4c2d-82f8-c5f5db008ca5';
export const REVIEW_PROJECT_ID = 'c87abbd5-cdc4-492e-a76c-de274c7d876d';
export const PRIMARY_REVIEWER_ID = 'a50bf061-063c-4eb7-93d2-152d64a41fd7';
export const BACKUP_REVIEWER_ID = '31b62ba0-7d0f-4401-a59c-e51d2d30c291';
export const reviewItemFixture = (): ReviewQueueItem => ({
  taskId: REVIEW_TASK_ID,
  title: 'Oldest product edit',
  projectId: REVIEW_PROJECT_ID,
  projectName: 'Alpha client',
  service: 'Video',
  taskRevision: 4,
  submissionVersion: 3,
  submittedAt: '2026-10-28T08:00:00Z',
  ageSeconds: 90000,
  ageState: 'VALID',
  primaryReviewerId: PRIMARY_REVIEWER_ID,
  primaryReviewerName: 'Amna',
  effectiveReviewerId: BACKUP_REVIEWER_ID,
  effectiveReviewerName: 'Scoped reviewer',
  reviewerState: 'ACTIVE',
  assignmentMode: 'BACKUP',
  assignmentRevision: 2,
  creativeVersion: null,
  finalAssetId: null,
  requiredCheckCount: 2,
  canReviewSubmission: true,
  warnings: [],
});
export const reviewQueueFixture = (): ReviewQueueSnapshot => ({
  workspaceId: 'workspace',
  memberId: 'member',
  userWorkspaceId: 'membership',
  observedAt: '2026-10-29T09:00:00Z',
  canManage: false,
  canReviewAssigned: true,
  projects: [{ id: REVIEW_PROJECT_ID, name: 'Alpha client' }],
  reviewers: [
    { id: PRIMARY_REVIEWER_ID, name: 'Amna' },
    { id: BACKUP_REVIEWER_ID, name: 'Scoped reviewer' },
  ],
  totalCount: 54,
  unknownAgeCount: 2,
  unavailableReviewerCount: 1,
  items: [
    reviewItemFixture(),
    {
      ...reviewItemFixture(),
      taskId: NEXT_REVIEW_TASK_ID,
      title: 'Newer image',
      submissionVersion: 1,
      ageSeconds: 3600,
      submittedAt: '2026-10-29T08:00:00Z',
    },
  ],
  nextCursor: 'opaque-next-page',
});
export const taskReviewFixture = (): TaskReviewSnapshot => ({
  workspaceId: 'workspace',
  memberId: 'member',
  userWorkspaceId: 'membership',
  observedAt: '2026-10-29T09:00:00Z',
  taskId: REVIEW_TASK_ID,
  taskRevision: 4,
  state: 'IN_REVIEW',
  pending: reviewItemFixture(),
  assignment: {
    id: 'aff8ec4c-566d-4235-8af6-aad3a8007473',
    taskId: REVIEW_TASK_ID,
    submissionVersion: 3,
    revision: 2,
    mode: 'BACKUP',
    reviewerId: BACKUP_REVIEWER_ID,
    reviewerName: 'Scoped reviewer',
    reason: 'Primary reviewer unavailable today',
    changedByName: 'Founder',
    changedAt: '2026-10-29T08:00:00Z',
  },
  canManageAssignment: true,
  canReviewSubmission: true,
  canApprove: true,
  assignmentNotice: null,
  eligibleReviewers: [{ id: BACKUP_REVIEWER_ID, name: 'Scoped reviewer' }],
});
