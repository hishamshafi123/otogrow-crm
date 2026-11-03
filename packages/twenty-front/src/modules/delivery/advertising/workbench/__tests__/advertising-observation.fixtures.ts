import { type AdvertisingReview } from '@/delivery/advertising/workbench/advertising-draft';
import { type AdvertisingObservationDraft } from '@/delivery/advertising/workbench/advertising-observation';
import { type AdvertisingObservation } from '@/delivery/advertising/workbench/AdvertisingObservationHistory';
import { type useAdvertisingContext } from '@/delivery/advertising/workbench/useAdvertisingContext';

export const OBSERVATION_IDENTITY = {
  workspaceId: '10000000-0000-4000-8000-000000000001',
  memberId: '10000000-0000-4000-8000-000000000002',
  userWorkspaceId: '10000000-0000-4000-8000-000000000003',
};
export const OBSERVATION_ACTOR = {
  memberId: OBSERVATION_IDENTITY.memberId,
  isAdmin: true,
  isManager: true,
  roleIds: [],
  capabilities: ['workspace.admin'],
};
export const OBSERVATION_REQUEST = '10000000-0000-4000-8000-000000000009';
export const observationReview = (): AdvertisingReview => ({
  id: '10000000-0000-4000-8000-000000000004',
  revision: 2,
  state: 'ASSIGNED',
  note: 'Reviewed launch',
  noChangeReason: '',
  createdBy: OBSERVATION_IDENTITY.memberId,
  assignedBy: OBSERVATION_IDENTITY.memberId,
  assignedAt: '2020-02-21T00:00:00.000Z',
  createdAt: '2020-02-21T00:00:00.000Z',
  legacyHandling: { mode: 'NONE', reason: '' },
  source: {
    kind: 'META',
    id: '10000000-0000-4000-8000-000000000005',
    fingerprint: 'a'.repeat(64),
    evidenceFingerprint: 'b'.repeat(64),
    sourceRevision: null,
    legacyTaskId: null,
    title: 'Original launch report',
    projectId: '10000000-0000-4000-8000-000000000006',
    companyId: '10000000-0000-4000-8000-000000000007',
    engagementId: null,
    clientProvenance: 'CURRENT_PROJECT_AT_REVIEW',
    channel: 'META',
    accountId: '1234567890',
    currency: 'USD',
    fromDate: '2020-02-20',
    throughDate: '2020-02-20',
    timezone: 'Asia/Qatar',
    spendMicros: '100000000',
    sourceStatus: 'APPROVED',
    routing: {
      projectId: '10000000-0000-4000-8000-000000000006',
      projectRevision: 1,
      companyId: '10000000-0000-4000-8000-000000000007',
      engagementId: null,
      managerId: OBSERVATION_IDENTITY.memberId,
      marketerId: 'writer',
    },
  },
  goal: {
    kind: 'PURCHASES',
    metricKey: 'account:actions:purchase',
    metricAdId: null,
    provenance: 'REPORT',
    value: '0',
    evidence: '',
    targetCostMicros: '25000000',
    metricLabel: 'Purchases',
    metricProvenance: 'PLATFORM_REPORTED',
    metricReason: null,
    metricUnit: 'COUNT',
    currency: 'USD',
    fromDate: '2020-02-20',
    throughDate: '2020-02-20',
    timezone: 'Asia/Qatar',
    sourceFingerprint: 'b'.repeat(64),
  },
  actions: [
    {
      id: '10000000-0000-4000-8000-000000000008',
      title: 'Improve the product demonstration',
      rationale: 'A deliberate creative test',
      expectedResult: 'Compare later purchases',
      evidence: 'Approved brief',
      ownerId: 'writer',
      ownerName: 'Editor',
      reviewerId: OBSERVATION_IDENTITY.memberId,
      reviewerName: 'Manager',
      dueDate: '2020-02-22',
      assistantId: null,
      adoptTaskId: null,
      origin: null,
      taskId: 'task',
      assistantVersion: null,
      assistantName: null,
      task: {
        id: 'task',
        title: 'Improve the product demonstration',
        revision: 3,
        state: 'APPROVED',
        ownerId: 'writer',
        ownerName: 'Editor',
        reviewerId: OBSERVATION_IDENTITY.memberId,
        reviewerName: 'Manager',
        dueAt: '2020-02-22T00:00:00.000Z',
        submissionVersion: 1,
        submissionState: 'APPROVED',
        evidence: [],
      },
    },
  ],
});
export const observationDraft = (): AdvertisingObservationDraft => {
  const review = observationReview();
  return {
    requestId: OBSERVATION_REQUEST,
    id: '10000000-0000-4000-8000-000000000010',
    reviewId: review.id,
    actionId: review.actions[0].id,
    correctsId: null,
    assessment: 'INCONCLUSIVE',
    mode: 'HUMAN',
    sourceKind: null,
    sourceId: null,
    sourceFingerprint: null,
    metricKey: null,
    metricAdId: null,
    value: null,
    fromDate: '2020-02-21',
    throughDate: '2020-02-22',
    evidence: 'Human verification record',
    note: 'Limited observation window',
    reportTitle: null,
    metricLabel: null,
    metricProvenance: null,
    metricUnit: null,
    sourceAccountId: null,
    sourceTimezone: null,
  };
};
export const observationState = () =>
  ({
    source: 'observation-identity',
    denied: false,
    administrator: true,
    data: {
      ...OBSERVATION_IDENTITY,
      observedAt: '2020-02-23T00:00:00.000Z',
      canManage: true,
      actor: OBSERVATION_ACTOR,
    },
    permission: {
      matches: (value: typeof OBSERVATION_IDENTITY) =>
        value.workspaceId === OBSERVATION_IDENTITY.workspaceId &&
        value.memberId === OBSERVATION_IDENTITY.memberId &&
        value.userWorkspaceId === OBSERVATION_IDENTITY.userWorkspaceId,
    },
  }) as unknown as ReturnType<typeof useAdvertisingContext>;
export const observationHistoryItem = (): AdvertisingObservation => {
  const review = observationReview();
  return {
    ...observationDraft(),
    actorId: OBSERVATION_IDENTITY.memberId,
    createdAt: '2020-02-23T00:00:00.000Z',
    correctedById: null,
    source: null,
    metric: null,
    task: review.actions[0].task!,
  };
};
