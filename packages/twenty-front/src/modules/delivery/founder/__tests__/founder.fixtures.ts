import {
  type FounderException,
  type FounderSnapshot,
} from '@/delivery/founder/founder.types';

export const FOUNDER_TASK_ID = 'aec83cc5-799f-43a2-a50b-9462efe5ee66';
export const FOUNDER_PROJECT_ID = '22cb9daf-4cdd-461d-bc1d-1a81f8b502b6';
export const FOUNDER_OWNER_ID = 'a3d6cbb0-95ad-4f2a-85cd-f342ff471c81';
export const FOUNDER_ENGAGEMENT_ID = 'c34409de-ab3d-4a13-85f1-2bba40cf5e20';
export const FOUNDER_PERIOD_ID = '4a74e983-498f-46e6-a219-121252321ee5';
export const founderExceptionFixture = (): FounderException => ({
  key: `DELIVERY:TASK:${FOUNDER_TASK_ID}`,
  domain: 'DELIVERY',
  reasonCode: 'TASK_BLOCKED',
  sourceType: 'TASK',
  sourceId: FOUNDER_TASK_ID,
  sourceRevision: '4',
  projectId: FOUNDER_PROJECT_ID,
  projectName: 'Client Alpha',
  title: 'Launch campaign assets',
  occurredAt: '2026-10-27T10:00:00Z',
  dueAt: '2026-10-28T09:00:00Z',
  ownerId: FOUNDER_OWNER_ID,
  ownerName: 'Amna',
  ownerState: 'ACTIVE',
  evidence: {
    state: 'BLOCKED',
    date: '2026-10-28T09:00:00Z',
    timezone: null,
    currency: null,
    amountMicros: null,
    revenueMicros: null,
    costMicros: null,
    resultMicros: null,
    promisedQuantity: null,
    fulfilledQuantity: null,
    remainingQuantity: null,
    reviewSubmittedAt: null,
    reviewSubmissionVersion: null,
    reviewAssignmentRevision: null,
    warnings: ['TASK_OVERDUE'],
  },
  nextAction: {
    code: 'OPEN_TASK',
    targetType: 'TASK',
    targetId: FOUNDER_TASK_ID,
    engagementId: null,
    periodId: null,
    currency: null,
    serviceMonth: null,
    sourceKind: null,
    submissionVersion: null,
  },
});
export const founderSnapshotFixture = (): FounderSnapshot => ({
  workspaceId: 'workspace',
  memberId: 'member',
  userWorkspaceId: 'membership',
  observedAt: '2026-10-28T12:00:00Z',
  canReadFinance: true,
  projects: [{ id: FOUNDER_PROJECT_ID, name: 'Client Alpha' }],
  owners: [{ id: FOUNDER_OWNER_ID, name: 'Amna' }],
  coverage: [
    { domain: 'DELIVERY', status: 'INCLUDED', codes: [] },
    { domain: 'COMMITMENTS', status: 'INCLUDED', codes: [] },
    { domain: 'FINANCE', status: 'PARTIAL', codes: [] },
    { domain: 'CAMPAIGNS', status: 'PARTIAL', codes: [] },
  ],
  counts: [
    { domain: 'DELIVERY', count: 1 },
    { domain: 'COMMITMENTS', count: 0 },
    { domain: 'FINANCE', count: 0 },
    { domain: 'CAMPAIGNS', count: 0 },
  ],
  totalCount: 1,
  items: [founderExceptionFixture()],
  nextCursor: null,
});
