import { DeliveryAgentEntity } from 'src/modules/delivery/entities/delivery-agent.entity';
import { deliveryAgentConfigurationSchema } from 'src/modules/delivery/agents/delivery-agent.types';
import { type OtogrowActivityEventDTO } from 'src/modules/otogrow-activity/otogrow-activity.dto';
import { type ActivityIdentity } from 'src/modules/otogrow-activity/otogrow-activity.reads';
import { activityAnalysisPreviewSchema } from 'src/modules/otogrow-activity/analysis/otogrow-activity-analysis.types';
export const WORKSPACE_ID = '10000000-0000-4000-8000-000000000001';
export const MEMBER_ID = '10000000-0000-4000-8000-000000000002';
export const USER_WORKSPACE_ID = '10000000-0000-4000-8000-000000000003';
export const AGENT_ID = '10000000-0000-4000-8000-000000000004';
export const EVENT_ID = '10000000-0000-4000-8000-000000000005';
export const RUN_ID = '10000000-0000-4000-8000-000000000006';
export const REQUEST_ID = '10000000-0000-4000-8000-000000000007';
export const OTHER_MEMBER_ID = '10000000-0000-4000-8000-000000000008';
export const activityAnalysisFixture = () => {
  const agent = Object.assign(new DeliveryAgentEntity(), {
    id: AGENT_ID,
    workspaceId: WORKSPACE_ID,
    version: 1,
    configuration: deliveryAgentConfigurationSchema.parse({
      name: 'Recorded work analyst',
      purpose: 'Summarize recorded evidence',
      kind: 'ACTIVITY',
      enabled: true,
      instructions: 'Look for recorded patterns and explicit unknowns.',
      requiredInputs: ['activity', 'question'],
      outputFormat: 'analysis',
      tools: [],
      modelId: 'mock-model',
      projectIds: [],
      roles: ['ADMIN'],
      dailyRunLimit: 10,
      maxOutputTokens: 1024,
      humanConfirmation: true,
    }),
  });
  const input = activityAnalysisPreviewSchema.parse({
    filters: {
      from: '2026-10-01T00:00:00.000Z',
      through: '2026-11-01T00:00:00.000Z',
    },
    question: 'What review decisions were recorded?',
    agentId: AGENT_ID,
  });
  const event: OtogrowActivityEventDTO = {
    id: EVENT_ID,
    occurredAt: '2026-10-31T06:00:00.123456Z',
    actorId: MEMBER_ID,
    actorName: 'Amna',
    actorType: 'HUMAN',
    subjectMemberId: OTHER_MEMBER_ID,
    subjectName: 'Editor',
    action: 'TASK_REVIEWED',
    category: 'DELIVERY',
    outcome: 'APPROVED',
    summary: 'Reviewed a task submission.',
    projectId: null,
    projectName: null,
    clientId: null,
    clientName: null,
    taskId: null,
    taskName: null,
    agentName: null,
    sourceType: 'delivery',
    sourceId: WORKSPACE_ID,
    changes: [{ field: 'state', before: 'IN_REVIEW', after: 'APPROVED' }],
  };
  const identity: ActivityIdentity = {
    workspaceId: WORKSPACE_ID,
    memberId: MEMBER_ID,
    userWorkspaceId: USER_WORKSPACE_ID,
    actor: {
      memberId: MEMBER_ID,
      isAdmin: true,
      isManager: true,
      roleIds: [],
      capabilities: ['workspace.admin', 'finance.read'],
    },
    scope: 'a'.repeat(64),
    observedAt: '2026-11-01T06:00:00.000Z',
  };
  const evidence = {
    identity,
    capturedAt: '2026-11-01T06:00:00.123456Z',
    coverageStartedAt: '2026-10-01T00:00:00.000000Z',
    totalCount: 1,
    events: [event],
    containsFinance: false,
  };
  return { agent, input, event, identity, evidence };
};
