import {
  type DeliveryAdvertisingContextQuery,
  type DeliveryAdvertisingSourceQuery,
} from '~/generated-metadata/graphql';

export const ADVERTISING_PROJECT_ID = '30000000-0000-4000-8000-000000000010';
export const ADVERTISING_REPORT_ID = '30000000-0000-4000-8000-000000000011';
export const ADVERTISING_REVIEW_ID = '30000000-0000-4000-8000-000000000012';
export const ADVERTISING_REQUEST_ID = '30000000-0000-4000-8000-000000000013';
export const ADVERTISING_OWNER_ID = '30000000-0000-4000-8000-000000000014';
export const ADVERTISING_TASK_ID = '30000000-0000-4000-8000-000000000015';
export const ADVERTISING_IDENTITY = {
  workspaceId: '30000000-0000-4000-8000-000000000016',
  memberId: '30000000-0000-4000-8000-000000000017',
  userWorkspaceId: '30000000-0000-4000-8000-000000000018',
};
export const advertisingContext =
  (): DeliveryAdvertisingContextQuery['deliveryAdvertisingContext'] => ({
    ...ADVERTISING_IDENTITY,
    observedAt: '2026-10-31T06:00:00.000Z',
    canManage: true,
    actor: {
      memberId: ADVERTISING_IDENTITY.memberId,
      isAdmin: true,
      isManager: true,
      roleIds: ['admin-role'],
      capabilities: ['workspace.admin'],
    },
  });
export const advertisingSource =
  (): DeliveryAdvertisingSourceQuery['deliveryAdvertisingSource'] => ({
    ...ADVERTISING_IDENTITY,
    observedAt: '2026-10-31T06:00:00.000Z',
    actor: advertisingContext().actor,
    fingerprint: 'a'.repeat(64),
    evidenceFingerprint: 'b'.repeat(64),
    evidenceLoaded: true,
    source: {
      kind: 'META',
      id: ADVERTISING_REPORT_ID,
      fingerprint: 'a'.repeat(64),
      evidenceFingerprint: 'b'.repeat(64),
      sourceRevision: null,
      legacyTaskId: null,
      title: 'Launch campaign report',
      projectId: ADVERTISING_PROJECT_ID,
      companyId: null,
      engagementId: null,
      accountId: '123456789',
      clientProvenance: 'CURRENT_PROJECT_AT_REVIEW',
      channel: 'META',
      currency: 'USD',
      fromDate: '2026-10-30',
      throughDate: '2026-10-30',
      timezone: 'Asia/Qatar',
      spendMicros: '100000000',
      sourceStatus: 'REVIEW',
      routing: {
        projectId: ADVERTISING_PROJECT_ID,
        projectRevision: 1,
        companyId: null,
        engagementId: null,
        managerId: ADVERTISING_IDENTITY.memberId,
        marketerId: ADVERTISING_OWNER_ID,
      },
    },
    canManageDraft: true,
    canReview: true,
    requiresSourceApproval: true,
    reasonCodes: [],
    originalRouting: {
      projectId: ADVERTISING_PROJECT_ID,
      projectName: 'Launch client',
      companyId: null,
      engagementId: null,
      managerId: ADVERTISING_IDENTITY.memberId,
      managerName: 'Amna',
      marketerId: ADVERTISING_OWNER_ID,
      marketerName: 'Assigned marketer',
    },
    currentRouting: {
      projectId: ADVERTISING_PROJECT_ID,
      projectName: 'Launch client',
      companyId: null,
      engagementId: null,
      managerId: ADVERTISING_IDENTITY.memberId,
      managerName: 'Amna',
      marketerId: ADVERTISING_OWNER_ID,
      marketerName: 'Assigned marketer',
    },
    metrics: [
      {
        key: 'account:actions:purchase',
        label: 'Reported purchases',
        unit: 'COUNT',
        goalKinds: ['PURCHASES'],
        value: '2',
        provenance: 'PLATFORM_REPORTED',
        reason: null,
      },
    ],
    legacyTaskId: null,
    legacyTask: null,
    legacyAdoptedReviewId: null,
    legacyReviewNote: '',
    sourceUrl: null,
    metricAdId: null,
    ads: [],
    adTotalCount: 0,
    adOffset: 0,
    nextAdOffset: null,
    currentDraftId: null,
    latestAssignedId: null,
    recordedAt: '2026-10-31T03:00:00.000Z',
    lastCheckedAt: '2026-10-31T03:00:00.000Z',
    hasNewerVersion: false,
    reportedGoalKind: null,
    reportedTargetCostMicros: null,
  });
