import {
  type TaskWorkspaceContext,
  type TaskListSnapshot,
  type TaskDetailSnapshot,
} from '@/delivery/tasks/task.types';
export const TASK_ID = '2e3d5e3f-46e5-45cb-87a5-120a4309653a';
export const OFF_PAGE_TASK_ID = 'ae70404b-b40d-4136-bc47-9f4c79560288';
export const PROJECT_ID = '356cd73d-f9dd-4fcf-828b-16c32f786c31';
export const MANAGER_ID = 'df5d0663-bca7-4be7-a4e2-3579d15f0206';
export const ASSIGNEE_ID = '07f8c239-a1eb-466b-b897-17caef9ff6e7';
export const taskContextFixture = (): TaskWorkspaceContext => ({
  workspaceId: 'workspace',
  memberId: MANAGER_ID,
  userWorkspaceId: 'membership',
  observedAt: '2026-10-29T08:00:00Z',
  actor: {
    memberId: MANAGER_ID,
    isAdmin: true,
    isManager: true,
    capabilities: ['workspace.admin'],
    roleIds: [],
  },
  projects: [
    {
      id: PROJECT_ID,
      revision: 1,
      name: 'Alpha client',
      companyId: null,
      memberIds: [MANAGER_ID, ASSIGNEE_ID],
    },
  ],
  members: [
    { id: MANAGER_ID, name: 'Manager', access: 'ADMIN', roleLabel: '' },
    { id: ASSIGNEE_ID, name: 'Producer', access: 'MEMBER', roleLabel: '' },
  ],
  companies: [],
});
export const taskListFixture = (): TaskListSnapshot => ({
  workspaceId: 'workspace',
  memberId: MANAGER_ID,
  userWorkspaceId: 'membership',
  observedAt: '2026-10-29T08:10:00Z',
  pageReferenceAt: '2026-10-29T08:00:00Z',
  timezone: 'Asia/Qatar',
  businessDate: '2026-10-29',
  totalCount: 58,
  byState: [
    { key: 'BLOCKED', count: 3 },
    { key: 'APPROVED', count: 12 },
    { key: 'IN_PROGRESS', count: 43 },
  ],
  byWorkGroup: [
    { key: 'blocked', count: 3 },
    { key: 'approved', count: 12 },
    { key: 'today', count: 43 },
  ],
  overview: {
    totalCount: 58,
    approvedCount: 12,
    blockedCount: 3,
    overdueCount: 8,
    reviewCount: 4,
    dueTodayCount: 20,
  },
  serviceOptions: ['Video'],
  nextCursor: 'opaque-next-page',
  items: [
    {
      id: TASK_ID,
      title: 'Current product edit',
      projectId: PROJECT_ID,
      projectName: 'Alpha client',
      revision: 4,
      assigneeId: ASSIGNEE_ID,
      assigneeName: 'Producer',
      service: 'Video',
      state: 'BLOCKED',
      priority: 'HIGH',
      scheduledDate: '2026-10-29',
      dueAt: '2026-10-29T20:00:00Z',
      workGroup: 'blocked',
      checklistDone: 1,
      checklistTotal: 2,
      hasCreative: false,
      blockerPreview: 'Waiting for approved logo',
      blockerTruncated: false,
      warnings: [],
      review: {
        submissionVersion: 1,
        primaryReviewerId: MANAGER_ID,
        effectiveReviewerId: MANAGER_ID,
        assignmentRevision: 0,
        assignmentMode: 'PRIMARY',
        reviewerState: 'ACTIVE',
        canReview: false,
      },
      delivery: {
        status: 'NOT_DELIVERED',
        cycle: 0,
        deliveredAt: null,
        nextCheckAt: null,
        deliveredSubmissionVersion: null,
        timezone: 'Asia/Qatar',
      },
    },
  ],
});
export const taskDetailFixture = (id = TASK_ID): TaskDetailSnapshot => ({
  workspaceId: 'workspace',
  memberId: MANAGER_ID,
  userWorkspaceId: 'membership',
  observedAt: '2026-10-29T08:10:00Z',
  task: {
    id,
    title: id === TASK_ID ? 'Current product edit' : 'Off-page task',
    projectId: PROJECT_ID,
    assigneeId: ASSIGNEE_ID,
    dueAt: null,
    revision: 4,
    details: {
      service: 'Video',
      brief: 'PRIVATE_EXACT_DETAIL_ONLY',
      priority: 'HIGH',
      scheduledDate: '2026-10-29',
      reviewerId: MANAGER_ID,
      state: 'BLOCKED',
      blocker: 'Waiting for approved logo',
      checklist: [],
      evidence: ['https://example.com/exact-evidence'],
      events: [],
      submissions: [
        {
          version: 1,
          description: 'HISTORICAL_DETAIL_SENTINEL',
          evidence: [],
          submittedBy: ASSIGNEE_ID,
          submittedAt: '2026-10-28T08:00:00Z',
        },
      ],
    },
  },
});
