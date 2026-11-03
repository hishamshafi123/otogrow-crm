import {
  type ActivityAnalysisPreview,
  type ActivityAnalysisDetail,
  type ActivityAnalysisContext,
  type ActivityCurrentWorkSnapshot,
} from '@/otogrow-activity/analysis/activity-analysis.types';
import { type OtogrowActivityContextQuery } from '~/generated-metadata/graphql';

export const ACTIVITY_WORKSPACE_ID = '40000000-0000-4000-8000-000000000001';
export const ACTIVITY_MEMBER_ID = '40000000-0000-4000-8000-000000000002';
export const ACTIVITY_MEMBERSHIP_ID = '40000000-0000-4000-8000-000000000003';
export const ACTIVITY_AGENT_ID = '40000000-0000-4000-8000-000000000004';
export const ACTIVITY_EVENT_ID = '40000000-0000-4000-8000-000000000005';
export const ACTIVITY_RUN_ID = '40000000-0000-4000-8000-000000000006';
export const ACTIVITY_REQUEST_ID = '40000000-0000-4000-8000-000000000007';
export const ACTIVITY_CURRENT_TASK_ID = '40000000-0000-4000-8000-000000000011';

export const activityCurrentWork = (): ActivityCurrentWorkSnapshot => ({
  capturedAt: '2026-11-02T09:00:00.000111Z',
  scope: { personId: ACTIVITY_MEMBER_ID, projectId: null, clientId: null },
  totalCount: 1,
  includedCount: 1,
  omittedCount: 0,
  truncatedFieldCount: 0,
  omittedBytes: 0,
  complete: true,
  fingerprint: 'e'.repeat(64),
  nativeVisibilityFingerprint: 'f'.repeat(64),
  limitations: [
    'Task facts describe their capture time, not changes after it.',
  ],
  items: [
    {
      taskId: ACTIVITY_CURRENT_TASK_ID,
      title: 'Launch video awaiting review',
      projectId: '40000000-0000-4000-8000-000000000012',
      projectName: 'Launch client project',
      clientId: null,
      clientName: null,
      taskRevision: 4,
      state: 'IN_REVIEW',
      blocker: null,
      ownerId: '40000000-0000-4000-8000-000000000008',
      ownerName: 'Editor',
      dueAt: '2026-11-03T12:00:00.000Z',
      submissionVersion: 2,
      submittedAt: '2026-11-02T08:00:00.000Z',
      primaryReviewerId: '40000000-0000-4000-8000-000000000013',
      primaryReviewerName: 'Primary PM',
      effectiveReviewerId: ACTIVITY_MEMBER_ID,
      effectiveReviewerName: 'Amna',
      reviewerState: 'ACTIVE',
      assignmentMode: 'BACKUP',
      assignmentRevision: 3,
      warnings: [],
      detailsTruncated: false,
      href: `/delivery?view=planner&task=${ACTIVITY_CURRENT_TASK_ID}`,
    },
  ],
});
export const ACTIVITY_FILTERS = {
  personId: null,
  projectId: null,
  clientId: null,
  category: null,
  action: null,
  outcome: null,
  from: '2026-10-26T00:00:00.000Z',
  through: '2026-11-02T00:00:00.000Z',
};
export const activityIdentity = () => ({
  workspaceId: ACTIVITY_WORKSPACE_ID,
  memberId: ACTIVITY_MEMBER_ID,
  userWorkspaceId: ACTIVITY_MEMBERSHIP_ID,
  scope: 'fixture-current-admin-scope',
  observedAt: '2026-11-01T12:00:00.000Z',
  actor: {
    memberId: ACTIVITY_MEMBER_ID,
    isAdmin: true,
    isManager: true,
    roleIds: ['admin-role'],
    capabilities: ['workspace.admin'],
  },
});
export const activityPageContext =
  (): OtogrowActivityContextQuery['otogrowActivityContext'] => ({
    ...activityIdentity(),
    coverageStartedAt: '2026-10-25T00:00:00.000Z',
    canAnalyze: true,
  });
export const activityAnalysisContext = (): ActivityAnalysisContext => ({
  capturedAt: '2026-11-01T12:00:00.123456Z',
  from: ACTIVITY_FILTERS.from,
  through: ACTIVITY_FILTERS.through,
  filters: { ...ACTIVITY_FILTERS },
  coverageStartedAt: '2026-10-25T00:00:00.000Z',
  totalCount: 1,
  includedCount: 1,
  omittedCount: 0,
  truncatedFieldCount: 0,
  omittedBytes: 0,
  containsFinance: false,
  question: 'What recorded decisions affected delivery?',
  assistantInstructions: 'Use only the cited structural events.',
  promptVersion: 'recorded-activity-1',
  outputContractVersion: 'evidence-analysis-1',
  limitations: ['Current task status is unknown; verify its source.'],
  events: [
    {
      id: ACTIVITY_EVENT_ID,
      occurredAt: '2026-10-31T10:00:00.123456Z',
      actorId: ACTIVITY_MEMBER_ID,
      actorName: 'Amna',
      actorType: 'HUMAN',
      subjectMemberId: '40000000-0000-4000-8000-000000000008',
      subjectName: 'Editor',
      action: 'TASK_REVIEWED',
      category: 'DELIVERY',
      outcome: 'CHANGES_REQUESTED',
      summary: 'Requested changes to a submitted video.',
      projectId: null,
      projectName: null,
      clientId: null,
      clientName: null,
      taskId: null,
      taskName: 'Launch video',
      agentName: null,
      sourceType: 'task',
      sourceId: '40000000-0000-4000-8000-000000000009',
      changes: [
        { field: 'state', before: 'IN_REVIEW', after: 'CHANGES_REQUESTED' },
      ],
    },
  ],
  citations: [
    {
      id: 'event-1',
      kind: 'EVENT',
      label: 'Review decision by Amna',
      eventId: ACTIVITY_EVENT_ID,
      occurredAt: '2026-10-31T10:00:00.123456Z',
      href: `/delivery?view=activity&activityEvent=${ACTIVITY_EVENT_ID}`,
    },
  ],
});
export const activityAnalysisPreview = (): ActivityAnalysisPreview => ({
  ...activityIdentity(),
  bodyFingerprint: 'a'.repeat(64),
  contextFingerprint: 'b'.repeat(64),
  evidenceFingerprint: 'c'.repeat(64),
  agent: {
    id: ACTIVITY_AGENT_ID,
    name: 'Recorded-work assistant',
    version: 2,
    modelId: 'fixture-only-unregistered-model',
    maxOutputTokens: 1000,
  },
  context: activityAnalysisContext(),
  budget: {
    maximumCostUsd: '0.02',
    pricingRevision: 2,
    budgetReady: true,
    blockedReason: null,
    boundSource: 'EXACT',
  },
  canStart: true,
  blockedReasons: [],
});
export const activityAnalysisDetail = (): ActivityAnalysisDetail => ({
  ...activityIdentity(),
  canCancel: false,
  run: {
    id: ACTIVITY_RUN_ID,
    requestId: ACTIVITY_REQUEST_ID,
    initiatorId: ACTIVITY_MEMBER_ID,
    initiatorName: 'Amna',
    status: 'SUCCEEDED',
    revision: 3,
    agent: activityAnalysisPreview().agent,
    bodyFingerprint: 'a'.repeat(64),
    contextFingerprint: 'b'.repeat(64),
    createdAt: '2026-11-01T12:01:00.000Z',
    updatedAt: '2026-11-01T12:02:00.000Z',
    startedAt: '2026-11-01T12:01:01.000Z',
    finishedAt: '2026-11-01T12:02:00.000Z',
    error: null,
    resultAvailable: true,
    includedCount: 1,
    omittedCount: 0,
  },
  context: activityAnalysisContext(),
  result: {
    summary: 'Amna recorded a changes request for the editor.',
    summaryCitationIds: ['event-1'],
    findings: [
      {
        id: '40000000-0000-4000-8000-000000000010',
        kind: 'RECORDED',
        text: 'A submitted video required another revision.',
        citationIds: ['event-1'],
      },
    ],
    unknowns: [
      'Whether the editor has completed the revision is not established.',
    ],
    limitations: ['This evidence does not measure hours or productivity.'],
  },
  usage: { inputTokens: 100, outputTokens: 80, costUsd: null },
});

export const activityCurrentAnalysisDetail = (): ActivityAnalysisDetail => {
  const detail = activityAnalysisDetail();
  const currentWork = activityCurrentWork();
  detail.context.currentWork = currentWork;
  detail.context.capturedAt = currentWork.capturedAt;
  detail.context.filters.personId = currentWork.scope.personId;
  detail.context.promptVersion = 'recorded-activity-2';
  detail.context.outputContractVersion = 'evidence-analysis-2';
  detail.context.citations.push({
    id: 'current-task-1',
    kind: 'CURRENT_TASK',
    label: 'CURRENT_TASK internal reference',
    eventId: null,
    occurredAt: null,
    taskId: ACTIVITY_CURRENT_TASK_ID,
    capturedAt: currentWork.capturedAt,
    href: `/delivery?view=activity&activityCurrentTask=${ACTIVITY_CURRENT_TASK_ID}`,
  });
  if (!detail.result) throw new Error('Expected fixture result');
  detail.result.summary =
    'The captured task is in review with Amna as its independent backup reviewer.';
  detail.result.summaryCitationIds = ['current-task-1'];
  detail.result.findings = [
    {
      id: '40000000-0000-4000-8000-000000000014',
      kind: 'RECORDED',
      text: 'The latest submission had an eligible backup reviewer at capture time.',
      citationIds: ['current-task-1'],
    },
  ];
  detail.result.unknowns = ['Changes after the capture have not been checked.'];
  return detail;
};
