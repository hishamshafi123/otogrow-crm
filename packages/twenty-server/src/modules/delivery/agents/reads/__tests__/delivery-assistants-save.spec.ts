import { ConflictException, ForbiddenException } from '@nestjs/common';
import { type DataSource, type EntityManager, QueryFailedError } from 'typeorm';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type AiModelRegistryService } from 'src/engine/metadata-modules/ai/ai-models/services/ai-model-registry.service';
import { type MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { type DeliveryService } from 'src/modules/delivery/delivery.service';
import { type DeliveryNativeTaskAccessService } from 'src/modules/delivery/delivery-native-task-access.service';
import { type OtogrowAiBudgetService } from 'src/modules/otogrow-ai-budget/otogrow-ai-budget.service';
import { type OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { type DeliveryAgentConfiguration } from 'src/modules/delivery/agents/delivery-agent.types';
import { DeliveryAgentService } from 'src/modules/delivery/agents/delivery-agent.service';
import { DeliveryAgentEntity } from 'src/modules/delivery/entities/delivery-agent.entity';
import { DeliveryAgentRunEntity } from 'src/modules/delivery/entities/delivery-agent-run.entity';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';

jest.mock('src/modules/otogrow-activity/record-otogrow-activity', () => ({
  recordOtogrowActivity: jest.fn(),
}));
const workspaceId = '10000000-0000-4000-8000-000000000001';
const projectId = '10000000-0000-4000-8000-000000000002';
const memberId = '10000000-0000-4000-8000-000000000003';
const userWorkspaceId = '10000000-0000-4000-8000-000000000004';
const createId = '10000000-0000-4000-8000-000000000005';
const configuration: DeliveryAgentConfiguration = {
  name: 'Brand checker',
  purpose: 'Check supplied claims',
  kind: 'BRIEF',
  enabled: false,
  instructions: 'Use supplied facts.',
  requiredInputs: ['brief'],
  outputFormat: 'findings',
  tools: [],
  modelId: 'model',
  projectIds: [projectId],
  roles: ['ADMIN'],
  roleIds: null,
  dailyRunLimit: 10,
  maxOutputTokens: 1024,
  humanConfirmation: true,
};
const setup = () => {
  const state = {
    admin: true,
    projects: true,
    modelAvailable: true,
    active: true,
  };
  const stored = new Map<string, DeliveryAgentEntity>();
  const inserts = jest.fn(async (agent: DeliveryAgentEntity) => {
    if (stored.has(agent.id))
      throw new QueryFailedError(
        'INSERT',
        [],
        Object.assign(new Error('duplicate global primary key'), {
          code: '23505',
        }),
      );
    stored.set(agent.id, agent);
    return { identifiers: [{ id: agent.id }] };
  });
  const saves = jest.fn(async (agent: DeliveryAgentEntity) => {
    stored.set(agent.id, agent);
    return agent;
  });
  const projects = jest.fn(async () =>
    state.projects ? [{ id: projectId, workspaceId }] : [],
  );
  const directory = jest.fn(async () => ({ roles: [] }));
  const repository = {
    findOneBy: async ({
      id,
      workspaceId: scope,
    }: {
      id: string;
      workspaceId: string;
    }) => {
      const current = stored.get(id);
      return current?.workspaceId === scope ? current : null;
    },
    create: (value: Partial<DeliveryAgentEntity>) =>
      Object.assign(new DeliveryAgentEntity(), value),
    insert: inserts,
    save: saves,
  };
  const manager = {
    query: async (sql: string) =>
      sql.includes('pg_advisory') ? [] : state.active ? [{ id: memberId }] : [],
    getRepository: (entity: unknown) => {
      if (entity === DeliveryAgentEntity) return repository;
      if (entity === DeliveryAgentRunEntity) return {};
      if (entity === DeliveryProjectEntity) return { findBy: projects };
      throw new Error('Unexpected repository');
    },
  } as unknown as EntityManager;
  const dataSource = {
    transaction: async <TResult>(
      callback: (manager: EntityManager) => Promise<TResult>,
    ) => callback(manager),
  } as DataSource;
  const delivery = {
    schema: () => 'workspace_fixture',
    actor: async () => ({
      memberId,
      isAdmin: state.admin,
      isManager: state.admin,
      roleIds: [],
      capabilities: state.admin ? ['workspace.admin'] : [],
    }),
  } as unknown as DeliveryService;
  const modelChecks = jest.fn(() => {
    if (!state.modelAvailable) throw new Error('unavailable provider');
    return { model: {} };
  });
  const models = {
    getModel: modelChecks,
    validateModelAvailability: jest.fn(),
  } as unknown as AiModelRegistryService;
  const engine = new DeliveryAgentService(
    dataSource,
    delivery,
    models,
    {} as MessageQueueService,
    {} as OtogrowAiBudgetService,
    { directory } as unknown as OtogrowAccessService,
    {} as DeliveryNativeTaskAccessService,
  );
  const workspace = { id: workspaceId } as WorkspaceEntity;
  const save = (extra: Record<string, unknown> = {}) =>
    engine.command(workspace, memberId, userWorkspaceId, {
      type: 'save',
      createId,
      configuration: { ...configuration },
      ...extra,
    });
  return {
    state,
    stored,
    inserts,
    saves,
    projects,
    directory,
    modelChecks,
    save,
    engine,
    workspace,
  };
};
describe('stable assistant creation', () => {
  beforeEach(() => jest.clearAllMocks());
  it('strictly inserts one record and returns the same version without another write or audit', async () => {
    const fixture = setup();
    expect(await fixture.save()).toEqual({
      saved: createId,
      version: 1,
      replayed: false,
    });
    fixture.state.projects = false;
    fixture.state.modelAvailable = false;
    expect(await fixture.save()).toEqual({
      saved: createId,
      version: 1,
      replayed: true,
    });
    expect(fixture.inserts).toHaveBeenCalledTimes(1);
    expect(fixture.saves).not.toHaveBeenCalled();
    expect(fixture.projects).toHaveBeenCalledTimes(1);
    expect(recordOtogrowActivity).toHaveBeenCalledTimes(1);
  });
  it('finds a normalized version-one retry before current provider and project checks', async () => {
    const fixture = setup();
    const enabled = { ...configuration, enabled: true };
    await fixture.save({ configuration: enabled });
    fixture.state.projects = false;
    fixture.state.modelAvailable = false;
    expect(
      await fixture.save({
        configuration: { ...enabled, name: ' Brand checker ' },
      }),
    ).toEqual({ saved: createId, version: 1, replayed: true });
    expect(fixture.modelChecks).toHaveBeenCalledTimes(1);
  });
  it('rejects changed bodies or edited records instead of silently duplicating', async () => {
    const fixture = setup();
    await fixture.save();
    await expect(
      fixture.save({
        configuration: { ...configuration, instructions: 'A different task' },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    const record = fixture.stored.get(createId);
    if (!record) throw new Error('Expected saved fixture');
    record.version = 2;
    await expect(fixture.save()).rejects.toBeInstanceOf(ConflictException);
    expect(fixture.inserts).toHaveBeenCalledTimes(1);
  });
  it('rechecks current administrative authority before record-found replay', async () => {
    const fixture = setup();
    await fixture.save();
    fixture.state.admin = false;
    await expect(fixture.save()).rejects.toBeInstanceOf(ForbiddenException);
    fixture.state.admin = true;
    fixture.state.active = false;
    await expect(fixture.save()).rejects.toBeInstanceOf(ForbiddenException);
    expect(fixture.inserts).toHaveBeenCalledTimes(1);
  });
  it('cannot upsert or transfer a global identity owned by another workspace', async () => {
    const fixture = setup();
    const foreign = Object.assign(new DeliveryAgentEntity(), {
      id: createId,
      workspaceId: projectId,
      configuration,
      version: 1,
    });
    fixture.stored.set(createId, foreign);
    await expect(fixture.save()).rejects.toBeInstanceOf(ConflictException);
    expect(fixture.stored.get(createId)).toBe(foreign);
    expect(fixture.saves).not.toHaveBeenCalled();
    expect(recordOtogrowActivity).not.toHaveBeenCalled();
  });
  it('preserves legacy random creation and version-checked updates', async () => {
    const fixture = setup();
    const command = { type: 'save', configuration };
    await fixture.engine.command(
      fixture.workspace,
      memberId,
      userWorkspaceId,
      command,
    );
    expect(fixture.saves).toHaveBeenCalledTimes(1);
    expect(fixture.inserts).not.toHaveBeenCalled();
    await fixture.save();
    await expect(
      fixture.engine.command(fixture.workspace, memberId, userWorkspaceId, {
        type: 'save',
        id: createId,
        version: 2,
        configuration,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      await fixture.engine.command(
        fixture.workspace,
        memberId,
        userWorkspaceId,
        { type: 'save', id: createId, version: 1, configuration },
      ),
    ).toEqual({ saved: createId, version: 2, replayed: false });
  });
});
