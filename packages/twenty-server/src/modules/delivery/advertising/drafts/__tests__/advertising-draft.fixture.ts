import { DeliveryAgentEntity } from 'src/modules/delivery/entities/delivery-agent.entity';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { type AdvertisingSourceEnvelope } from 'src/modules/delivery/advertising/workbench/delivery-advertising-sources.types';
import { type AdvertisingGoalSnapshot } from 'src/modules/delivery/advertising/workbench/delivery-advertising-workbench.types';
import { type DeliveryKnowledgeContext } from 'src/modules/delivery/knowledge/delivery-knowledge-context';
import { type AdvertisingDraftPreviewInput } from 'src/modules/delivery/advertising/drafts/delivery-advertising-draft.types';

export const WORKSPACE_ID = 'e8d23752-09ac-4e55-b42a-b492d166f512';
export const MEMBER_ID = '30a811c6-424c-41e3-b1b6-1c5e1dfb0146';
export const USER_WORKSPACE_ID = 'caa7be8d-7a82-4b81-ac42-606779daf3aa';
export const PROJECT_ID = '9257eb03-0cd0-4c22-9d9a-e102acb8f14b';
export const REPORT_ID = '6deab3f1-5f8b-4844-b2da-f13abfc2fc23';
export const AGENT_ID = '092b4ea8-76c2-435a-ba1c-f546771c2da9';
export const RUN_ID = '8550868c-936e-4c21-a10f-67e35421ea18';
export const REQUEST_ID = '01d8eb2d-d676-4f36-a316-89aa0f2ac585';

export const advertisingDraftFixture = () => {
  const agent = Object.assign(new DeliveryAgentEntity(), {
    id: AGENT_ID,
    workspaceId: WORKSPACE_ID,
    version: 3,
    configuration: {
      name: 'Account recommendations',
      purpose: 'Prepare recommendations for review',
      kind: 'ADVERTISING' as const,
      enabled: true,
      instructions: 'Use only supplied evidence.',
      requiredInputs: ['report' as const],
      outputFormat: 'recommendations' as const,
      tools: [],
      modelId: 'mock-model',
      projectIds: [PROJECT_ID],
      roles: ['ADMIN' as const, 'MANAGER' as const],
      dailyRunLimit: 5,
      maxOutputTokens: 1024,
      humanConfirmation: true as const,
    },
  });
  const project = Object.assign(new DeliveryProjectEntity(), {
    id: PROJECT_ID,
    workspaceId: WORKSPACE_ID,
    companyId: null,
    name: 'Campaign delivery',
    memberIds: [MEMBER_ID],
    revision: 2,
  });
  const routing = {
    projectId: PROJECT_ID,
    companyId: null,
    engagementId: null,
    managerId: MEMBER_ID,
    marketerId: null,
  };
  const source: AdvertisingSourceEnvelope = {
    actor: {
      memberId: MEMBER_ID,
      isAdmin: false,
      isManager: true,
      roleIds: [],
      capabilities: ['delivery.manage'],
    },
    source: {
      kind: 'META',
      id: REPORT_ID,
      fingerprint: 'a'.repeat(64),
      evidenceFingerprint: 'b'.repeat(64),
      sourceRevision: null,
      legacyTaskId: null,
      title: 'Account report',
      projectId: PROJECT_ID,
      companyId: null,
      engagementId: null,
      clientProvenance: 'INTERNAL',
      channel: 'META',
      accountId: '123456',
      currency: 'USD',
      timezone: 'Asia/Qatar',
      fromDate: '2026-10-30',
      throughDate: '2026-10-30',
      spendMicros: '42000000',
      sourceStatus: 'REVIEW',
      routing: { ...routing, projectRevision: 2 },
    },
    fingerprint: 'a'.repeat(64),
    evidenceFingerprint: 'b'.repeat(64),
    canManageDraft: true,
    canReview: true,
    requiresSourceApproval: true,
    evidenceLoaded: true,
    recordedAt: null,
    lastCheckedAt: null,
    hasNewerVersion: false,
    reasonCodes: [],
    legacyTaskId: null,
    legacyTask: null,
    legacyAdoptedReviewId: null,
    legacyReviewNote: '',
    reportedGoalKind: null,
    reportedTargetCostMicros: null,
    metrics: [
      {
        key: 'account:actions:lead',
        label: 'Platform leads',
        unit: 'COUNT',
        goalKinds: ['LEADS'],
        value: '12.25',
        provenance: 'META_ATTRIBUTED',
        reason: null,
      },
    ],
    originalRouting: {
      ...routing,
      projectName: project.name,
      managerName: 'Manager',
      marketerName: null,
    },
    currentRouting: {
      ...routing,
      projectName: project.name,
      managerName: 'Manager',
      marketerName: null,
    },
    project,
    sourceUrl: null,
    metricAdId: null,
    ads: [],
    adTotalCount: 0,
    adOffset: 0,
    nextAdOffset: null,
    currentDraftId: null,
    latestAssignedId: null,
  };
  const goal: AdvertisingGoalSnapshot = {
    kind: 'LEADS',
    metricKey: 'account:actions:lead',
    metricAdId: null,
    provenance: 'REPORT',
    value: '12.25',
    evidence: '',
    targetCostMicros: null,
    metricLabel: 'Platform leads',
    metricProvenance: 'META_ATTRIBUTED',
    metricReason: null,
    metricUnit: 'COUNT',
    currency: 'USD',
    timezone: 'Asia/Qatar',
    fromDate: '2026-10-30',
    throughDate: '2026-10-30',
    sourceFingerprint: 'b'.repeat(64),
  };
  const input: AdvertisingDraftPreviewInput = {
    sourceKind: 'META',
    sourceId: REPORT_ID,
    sourceFingerprint: source.fingerprint,
    agentId: AGENT_ID,
    goal: {
      kind: goal.kind,
      metricKey: goal.metricKey,
      metricAdId: null,
      provenance: goal.provenance,
      value: goal.value,
      evidence: '',
      targetCostMicros: null,
    },
    instructions: 'Review lead quality before proposing tests.',
  };
  const knowledge: DeliveryKnowledgeContext = {
    fingerprint: 'c'.repeat(32),
    totalSources: 1,
    omittedSources: 0,
    sources: [
      {
        sourceId: PROJECT_ID,
        version: 4,
        title: 'Published positioning',
        category: 'BRAND',
        meetingDate: '2026-10-28',
        knowledge: 'Only approved positioning.',
        truncated: false,
      },
    ],
  };
  const output = {
    summary: 'Review the lead-quality evidence before proposing a test.',
    limitations: ['Platform leads have not been verified as qualified leads.'],
    citations: ['report:scope'],
    noChangeReason: null,
    suggestions: [
      {
        title: 'Inspect lead qualification',
        rationale: 'Platform totals do not verify qualification.',
        expectedResult: 'A human-reviewed qualification sample.',
        evidence: 'The account report records 12.25 attributed leads.',
        citations: ['metric:1'],
      },
    ],
  };
  return { agent, source, goal, input, knowledge, output };
};
