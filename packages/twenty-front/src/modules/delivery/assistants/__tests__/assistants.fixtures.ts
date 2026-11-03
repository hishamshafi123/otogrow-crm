import {
  type AssistantContext,
  type AssistantCatalog,
  type AssistantConfigurationDetail,
  type AssistantRunDetail,
  type AssistantRuns,
} from '@/delivery/assistants/assistant.types';

export const ASSISTANT_ID = '11111111-1111-4111-8111-111111111111';
export const TASK_ID = '22222222-2222-4222-8222-222222222222';
export const PROJECT_ID = '33333333-3333-4333-8333-333333333333';
export const RUN_ID = '44444444-4444-4444-8444-444444444444';
export const REQUEST_ID = '55555555-5555-4555-8555-555555555555';
export const IDENTITY = {
  workspaceId: 'workspace',
  memberId: 'admin',
  userWorkspaceId: 'membership',
};
export const assistantContext = (): AssistantContext => ({
  ...IDENTITY,
  observedAt: '2026-10-30T08:00:00Z',
  canConfigure: true,
  actor: {
    memberId: 'admin',
    isAdmin: true,
    isManager: true,
    capabilities: ['workspace.admin'],
    roleIds: ['admin-role'],
  },
  projects: [{ id: PROJECT_ID, name: 'Launch project', revision: 1 }],
  models: [{ id: 'test-model', provider: 'Test provider' }],
  selectedTask: null,
});
export const assistantTask = () => ({
  id: TASK_ID,
  title: 'Check launch copy',
  projectId: PROJECT_ID,
  revision: 3,
  state: 'IN_PROGRESS',
  assigneeId: 'admin',
  brief: 'Exact task brief',
  draftCopy: 'Current task draft copy',
});
export const assistantCatalog = (): AssistantCatalog => ({
  ...IDENTITY,
  observedAt: '2026-10-30T08:00:00Z',
  totalCount: 57,
  nextCursor: 'catalog-next',
  items: [
    {
      id: ASSISTANT_ID,
      name: 'Copy checker',
      purpose: 'Check current copy against the approved brief.',
      kind: 'COPY',
      enabled: true,
      version: 2,
      createdAt: '2026-10-29T08:00:00Z',
      updatedAt: '2026-10-30T08:00:00Z',
      canRun: true,
      requiredInputs: ['brief', 'copy'],
    },
  ],
});
export const assistantConfiguration = (): AssistantConfigurationDetail => ({
  ...IDENTITY,
  observedAt: '2026-10-30T08:00:00Z',
  id: ASSISTANT_ID,
  version: 2,
  createdAt: '2026-10-29T08:00:00Z',
  updatedAt: '2026-10-30T08:00:00Z',
  configuration: {
    name: 'Copy checker',
    purpose: 'Check copy',
    kind: 'COPY',
    enabled: true,
    instructions: 'PRIVATE_INSTRUCTIONS_EXACT_DETAIL',
    requiredInputs: ['brief', 'copy'],
    outputFormat: 'findings_and_edits',
    tools: [],
    modelId: 'test-model',
    projectIds: [PROJECT_ID],
    roles: ['ADMIN', 'MANAGER', 'MEMBER'],
    roleIds: null,
    dailyRunLimit: 20,
    maxOutputTokens: 2048,
    humanConfirmation: true,
  },
});
export const assistantRun = (): AssistantRunDetail => ({
  ...IDENTITY,
  observedAt: '2026-10-30T08:00:00Z',
  requestId: REQUEST_ID,
  run: {
    id: RUN_ID,
    taskId: TASK_ID,
    taskTitle: 'Check launch copy',
    projectId: PROJECT_ID,
    projectName: 'Launch project',
    agentId: ASSISTANT_ID,
    agentName: 'Disabled original checker',
    kind: 'COPY',
    initiatorId: 'admin',
    taskRevision: 3,
    agentVersion: 1,
    status: 'WAITING_REVIEW',
    createdAt: '2026-09-01T08:00:00Z',
    updatedAt: '2026-09-01T08:01:00Z',
    decisionAt: null,
    decisionAction: null,
    hasFindings: true,
    hasSuggestedBrief: true,
    hasSuggestedCopy: true,
  },
  configuration: { ...assistantConfiguration().configuration, enabled: false },
  context: { brief: 'PRIVATE_ORIGINAL_CONTEXT' },
  result: {
    summary: 'PRIVATE_SAVED_FINDING',
    findings: [
      {
        severity: 'WARNING',
        evidence: 'Original evidence',
        correction: 'Confirm the service scope.',
      },
    ],
    suggestedBrief: 'Proposed brief',
    suggestedCopy: 'Proposed copy',
  },
  activity: [{ at: '2026-09-01T08:01:00Z', message: 'Run completed' }],
  usage: { inputTokens: 0, outputTokens: null, cost: null },
  error: null,
  decision: null,
  canCancel: false,
  canReject: true,
  canAcceptFindings: false,
  canAcceptBrief: false,
  canAcceptCopy: false,
  acceptanceBlockedReason:
    'Current assistant access does not permit acceptance.',
});
export const assistantRuns = (): AssistantRuns => ({
  ...IDENTITY,
  observedAt: '2026-10-30T08:00:00Z',
  totalCount: 601,
  nextCursor: 'runs-next',
  byStatus: [
    { status: 'WAITING_REVIEW', count: 12 },
    { status: 'SUCCEEDED', count: 589 },
  ],
  items: [assistantRun().run],
});
