import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { type DataSource, type EntityManager } from 'typeorm';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type AiModelRegistryService } from 'src/engine/metadata-modules/ai/ai-models/services/ai-model-registry.service';
import { type DeliveryService } from 'src/modules/delivery/delivery.service';
import { type DeliveryAgentService } from 'src/modules/delivery/agents/delivery-agent.service';
import { DeliveryAgentEntity } from 'src/modules/delivery/entities/delivery-agent.entity';
import { DeliveryAgentRunEntity } from 'src/modules/delivery/entities/delivery-agent-run.entity';
import { DeliveryAssistantsService } from 'src/modules/delivery/agents/reads/delivery-assistants.service';

const workspaceId = '10000000-0000-4000-8000-000000000001';
const projectId = '10000000-0000-4000-8000-000000000002';
const memberId = '10000000-0000-4000-8000-000000000003';
const userWorkspaceId = '10000000-0000-4000-8000-000000000004';
const taskId = '10000000-0000-4000-8000-000000000005';
const agentId = '10000000-0000-4000-8000-000000000006';
const runId = '10000000-0000-4000-8000-000000000007';
const requestId = '10000000-0000-4000-8000-000000000008';
const setup = () => {
  const state = {
    admin: true,
    manager: true,
    active: true,
    native: true,
    projectRevision: 1,
    roleIds: [] as string[],
    count: 53,
    historyVisible: true,
  };
  const queries: { sql: string; parameters: unknown[] }[] = [];
  const configuration = {
    name: 'Disabled pinned assistant',
    purpose: 'Private purpose',
    instructions: 'PRIVATE_INSTRUCTIONS',
    kind: 'SEO' as const,
    enabled: false,
    requiredInputs: [],
    outputFormat: 'findings' as const,
    tools: [],
    modelId: null,
    projectIds: [projectId],
    roles: ['ADMIN' as const],
    roleIds: null,
    dailyRunLimit: 10,
    maxOutputTokens: 1024,
    humanConfirmation: true as const,
  };
  const agent = {
    id: agentId,
    workspaceId,
    configuration,
    version: 2,
    createdAt: new Date('2026-10-29T01:00:00Z'),
    updatedAt: new Date('2026-10-29T01:00:00Z'),
  };
  const run = {
    id: runId,
    workspaceId,
    requestId,
    taskId,
    agentId,
    initiatorId: memberId,
    userWorkspaceId,
    taskRevision: 3,
    agentVersion: 1,
    configuration,
    context: {
      title: 'Private run context',
      brief: 'PRIVATE_BRIEF',
      service: 'SEO',
      checklist: [],
      submittedCopy: '',
      evidenceLinks: [],
      inputs: { copy: '', requirements: '' },
    },
    result: {
      summary: 'PRIVATE_RESULT',
      findings: [],
      suggestedBrief: null,
      suggestedCopy: null,
    },
    activity: [{ at: '2026-10-29T01:00:00Z', message: 'PRIVATE_ACTIVITY' }],
    usage: null,
    error: null,
    decision: null,
    status: 'WAITING_REVIEW',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const summary = {
    id: runId,
    taskId,
    taskTitle: 'Exact task',
    projectId,
    projectName: 'Permitted project',
    agentId,
    agentName: configuration.name,
    kind: 'SEO',
    initiatorId: memberId,
    taskRevision: 3,
    agentVersion: 1,
    status: 'WAITING_REVIEW',
    createdAt: '2026-10-29T01:00:00.123456Z',
    updatedAt: '2026-10-29T01:00:00.123456Z',
    decisionAt: null,
    decisionAction: null,
    hasFindings: true,
    hasSuggestedBrief: false,
    hasSuggestedCopy: false,
  };
  const catalogRow = {
    id: agentId,
    name: configuration.name,
    purpose: configuration.purpose,
    kind: 'SEO',
    enabled: false,
    version: 2,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
    requiredInputs: ['brief', 'requirements'],
    canRun: false,
  };
  const repositoryReads = jest.fn((entity: unknown) => {
    if (entity === DeliveryAgentEntity) return { findOneBy: async () => agent };
    if (entity === DeliveryAgentRunEntity)
      return { findOneByOrFail: async () => run };
    throw new Error(
      'Summary reads must not load task or Operations repositories',
    );
  });
  const manager = {
    queryRunner: { isTransactionActive: true },
    getRepository: repositoryReads,
    query: async (sql: string, parameters: unknown[] = []) => {
      queries.push({ sql, parameters });
      if (sql.includes('pg_advisory')) return [];
      if (sql.includes('SELECT m.id'))
        return state.active ? [{ id: memberId }] : [];
      if (sql.includes('SELECT project.id'))
        return [
          {
            id: projectId,
            name: 'Permitted project',
            revision: state.projectRevision,
          },
        ];
      if (sql.includes('AS "draftCopy"'))
        return state.native
          ? [
              {
                id: taskId,
                title: 'Exact task',
                projectId,
                revision: 3,
                state: 'PLANNED',
                assigneeId: memberId,
                brief: 'Exact brief',
                draftCopy: 'Exact copy',
              },
            ]
          : [];
      if (sql.includes('AS "byStatus"'))
        return [
          {
            totalCount: state.count,
            byStatus: [{ status: 'WAITING_REVIEW', count: state.count }],
            items: Array.from({ length: 26 }, (_, index) => ({
              ...summary,
              id:
                index === 0
                  ? runId
                  : `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
            })),
          },
        ];
      if (sql.includes('AS "totalCount"'))
        return [{ totalCount: state.count, items: [catalogRow] }];
      if (sql.startsWith('SELECT run.id FROM'))
        return state.historyVisible ? [{ id: runId }] : [];
      if (sql.includes('run."initiatorId"'))
        return state.historyVisible ? [summary] : [];
      if (sql.includes('FROM core."deliveryAgent"')) return [catalogRow];
      throw new Error('Unexpected query');
    },
  } as unknown as EntityManager;
  const dataSource = {
    transaction: async <TResult>(
      callback: (manager: EntityManager) => Promise<TResult>,
    ) => callback(manager),
  } as DataSource;
  const delivery = {
    schema: () => 'workspace_fixture',
    snapshot: () => {
      throw new Error('Legacy snapshot forbidden');
    },
    actor: async () => ({
      memberId,
      isAdmin: state.admin,
      isManager: state.manager,
      roleIds: state.roleIds,
      capabilities: state.admin ? ['workspace.admin'] : [],
    }),
  } as unknown as DeliveryService;
  const command = jest.fn(async () => ({ runId }));
  const agents = {
    snapshot: () => {
      throw new Error('Legacy agent snapshot forbidden');
    },
    command,
    reviewAvailability: jest.fn(async () => ({
      canCancel: true,
      canReject: true,
      canAcceptFindings: false,
      canAcceptBrief: false,
      canAcceptCopy: false,
      acceptanceBlockedReason: 'CURRENT_AGENT_OR_KNOWLEDGE_UNAVAILABLE',
    })),
  } as unknown as DeliveryAgentService;
  const models = {
    getAdminFilteredModels: () => [
      { modelId: 'available', providerName: 'Provider' },
    ],
    validateModelAvailability: () => undefined,
  } as unknown as AiModelRegistryService;
  const service = new DeliveryAssistantsService(
    dataSource,
    delivery,
    agents,
    models,
  );
  const workspace = { id: workspaceId } as WorkspaceEntity;
  return {
    state,
    queries,
    repositoryReads,
    command,
    service,
    workspace,
    manager,
    run,
    summary,
  };
};
describe('focused assistant reads', () => {
  it('provides one light task and complete admin choices without task/history hydration', async () => {
    const fixture = setup();
    const result = await fixture.service.context(
      fixture.workspace,
      memberId,
      userWorkspaceId,
      { taskId },
    );
    expect(result.selectedTask).toEqual({
      id: taskId,
      title: 'Exact task',
      projectId,
      revision: 3,
      state: 'PLANNED',
      assigneeId: memberId,
      brief: 'Exact brief',
      draftCopy: 'Exact copy',
    });
    expect(result.projects).toHaveLength(1);
    expect(result.models).toEqual([{ id: 'available', provider: 'Provider' }]);
    expect(fixture.repositoryReads).not.toHaveBeenCalled();
    fixture.state.admin = false;
    fixture.state.manager = false;
    const member = await fixture.service.context(
      fixture.workspace,
      memberId,
      userWorkspaceId,
      {},
    );
    expect(member.projects).toEqual([]);
    expect(member.models).toEqual([]);
    expect(member.canConfigure).toBe(false);
  });
  it('returns complete counts with a bounded summary page and exact microsecond cursor', async () => {
    const fixture = setup();
    const page = await fixture.service.runs(
      fixture.workspace,
      memberId,
      userWorkspaceId,
      { limit: 25 },
    );
    expect(page.totalCount).toBe(53);
    expect(page.byStatus).toEqual([{ status: 'WAITING_REVIEW', count: 53 }]);
    expect(page.items).toHaveLength(25);
    const decoded = JSON.parse(
      Buffer.from(page.nextCursor ?? '', 'base64url').toString(),
    ) as { createdAt: string };
    expect(decoded.createdAt).toBe('2026-10-29T01:00:00.123456Z');
    expect(JSON.stringify(page)).not.toContain('PRIVATE_');
    const sql =
      fixture.queries.find(({ sql }) => sql.includes('AS "byStatus"'))?.sql ??
      '';
    expect(sql).toContain('native."deletedAt" IS NULL');
    expect(sql).toContain('run."initiatorId"=$4::uuid');
    expect(sql).toContain('WITH source AS MATERIALIZED');
    expect(sql).not.toContain('JOIN core."deliveryAgent"');
    expect(sql).not.toMatch(/SELECT\s+run\.\*/);
    const [allMatchingSources, boundedProjection] = sql.split(
      'page AS MATERIALIZED',
    );
    expect(allMatchingSources).not.toContain('run.result');
    expect(allMatchingSources).not.toContain('run.configuration');
    expect(allMatchingSources).not.toContain('run.decision');
    expect(allMatchingSources).not.toContain('to_char(');
    expect(allMatchingSources).toContain(
      'SELECT run.id,run.status,run."createdAt"',
    );
    expect(allMatchingSources).toContain(
      'ORDER BY source."createdAt" DESC,source.id DESC LIMIT',
    );
    expect(boundedProjection).toContain('JOIN selected ON selected.id=run.id');
    expect(boundedProjection).toContain("run.result->'findings'");

    expect(fixture.repositoryReads).not.toHaveBeenCalled();
  });
  it('requires explicit first-page recovery when project or role authority changes', async () => {
    const fixture = setup();
    const page = await fixture.service.runs(
      fixture.workspace,
      memberId,
      userWorkspaceId,
      { limit: 25 },
    );
    fixture.state.projectRevision++;
    await expect(
      fixture.service.runs(fixture.workspace, memberId, userWorkspaceId, {
        limit: 25,
        after: page.nextCursor,
      }),
    ).rejects.toThrow('Open the first page');
    fixture.state.projectRevision--;
    fixture.state.roleIds = [projectId];
    await expect(
      fixture.service.runs(fixture.workspace, memberId, userWorkspaceId, {
        limit: 25,
        after: page.nextCursor,
      }),
    ).rejects.toThrow('Open the first page');
  });
  it('retains exact off-page selection without exposing private configuration to staff', async () => {
    const fixture = setup();
    const result = await fixture.service.assistant(
      fixture.workspace,
      memberId,
      userWorkspaceId,
      { agentId },
    );
    expect(result.assistant.id).toBe(agentId);
    expect(result.assistant.canRun).toBe(false);
    expect(result.assistant.requiredInputs).toEqual(['brief', 'requirements']);
    const selectionSql =
      fixture.queries.find(({ sql }) => sql.includes('requiredInputs'))?.sql ??
      '';
    expect(selectionSql).toContain("agent.configuration->'requiredInputs'");
    expect(selectionSql).not.toMatch(/SELECT\s+agent\.configuration(?:\s|,)/);
    expect(result).not.toHaveProperty('configuration');
    fixture.state.admin = false;
    fixture.state.manager = false;
    await expect(
      fixture.service.configuration(
        fixture.workspace,
        memberId,
        userWorkspaceId,
        { agentId },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(fixture.repositoryReads).not.toHaveBeenCalled();
  });
  it('loads private evidence only for the deliberately selected run and preserves disabled-agent rejection', async () => {
    const fixture = setup();
    const result = await fixture.service.run(
      fixture.workspace,
      memberId,
      userWorkspaceId,
      { runId },
    );
    expect(result.result?.summary).toBe('PRIVATE_RESULT');
    expect(result.context.brief).toBe('PRIVATE_BRIEF');
    expect(result.canReject).toBe(true);
    expect(result.canAcceptFindings).toBe(false);
    expect(result.run.agentName).toBe('Disabled pinned assistant');
    fixture.state.native = false;
    await expect(
      fixture.service.context(fixture.workspace, memberId, userWorkspaceId, {
        taskId,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it('never interprets revoked accounts as an empty catalog', async () => {
    const fixture = setup();
    fixture.state.active = false;
    await expect(
      fixture.service.catalog(fixture.workspace, memberId, userWorkspaceId, {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('recovers only an exact current-initiator visible request using a thin receipt', async () => {
    const fixture = setup();
    const result = await fixture.service.request(
      fixture.workspace,
      memberId,
      userWorkspaceId,
      { requestId },
    );
    expect(result.receipt).toEqual({
      workspaceId,
      memberId,
      userWorkspaceId,
      runId,
      taskId,
      agentId,
      status: 'WAITING_REVIEW',
      updatedAt: fixture.summary.updatedAt,
    });
    expect(fixture.repositoryReads).not.toHaveBeenCalled();
    fixture.state.historyVisible = false;
    expect(
      (
        await fixture.service.request(
          fixture.workspace,
          memberId,
          userWorkspaceId,
          { requestId },
        )
      ).receipt,
    ).toBeNull();
  });
  it('delegates a typed decision once and returns no workspace or private run payload', async () => {
    const fixture = setup();
    const result = await fixture.service.decide(
      fixture.workspace,
      memberId,
      userWorkspaceId,
      { runId, action: 'REJECT', field: null },
    );
    expect(fixture.command).toHaveBeenCalledWith(
      fixture.workspace,
      memberId,
      userWorkspaceId,
      { type: 'decide', runId, action: 'REJECT', field: null },
    );
    expect(result.runId).toBe(runId);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_');
    expect(fixture.repositoryReads).not.toHaveBeenCalled();
  });
});

it('applies the authorized advertising project filter before counts and rejects mismatched task projects', async () => {
  const fixture = setup();
  await fixture.service.catalog(fixture.workspace, memberId, userWorkspaceId, {
    kind: 'ADVERTISING',
    projectId,
    enabled: true,
  });
  const query = fixture.queries.find(({ sql }) =>
    sql.includes('AS "totalCount"'),
  );
  expect(query?.parameters).toEqual(
    expect.arrayContaining([projectId, 'ADVERTISING', true]),
  );
  expect(query?.sql).toContain("agent.configuration->'projectIds'");
  expect(query?.sql).toContain('WITH source AS MATERIALIZED');
  await expect(
    fixture.service.catalog(fixture.workspace, memberId, userWorkspaceId, {
      kind: 'ADVERTISING',
      projectId: '90000000-0000-4000-8000-000000000099',
    }),
  ).rejects.toBeInstanceOf(NotFoundException);
  await fixture.service.catalog(fixture.workspace, memberId, userWorkspaceId, {
    taskId,
  });
  expect(fixture.queries[fixture.queries.length - 1]?.sql).toContain(
    "agent.configuration->>'kind' IN ('BRIEF','COPY','SEO')",
  );
});

it('keeps workspace activity eligibility administrator-bound and excludes it from project contexts', async () => {
  const fixture = setup();
  await fixture.service.catalog(fixture.workspace, memberId, userWorkspaceId, {
    kind: 'ACTIVITY',
    enabled: true,
  });
  const standalone = fixture.queries.find(({ sql }) =>
    sql.includes('AS "totalCount"'),
  );
  expect(standalone?.parameters).toEqual(
    expect.arrayContaining(['ACTIVITY', true]),
  );
  expect(standalone?.sql).toContain(
    "WHEN agent.configuration->>'kind'='ACTIVITY' THEN $2::boolean AND agent.configuration->'projectIds'='[]'::jsonb",
  );
  expect(standalone?.sql).toContain(
    "(agent.configuration->'roleIds') ?| $3::text[]",
  );
  await fixture.service.catalog(fixture.workspace, memberId, userWorkspaceId, {
    kind: 'ACTIVITY',
    projectId,
  });
  expect(fixture.queries[fixture.queries.length - 1]?.sql).toContain(
    "agent.configuration->>'kind'<>'ACTIVITY'",
  );
});
