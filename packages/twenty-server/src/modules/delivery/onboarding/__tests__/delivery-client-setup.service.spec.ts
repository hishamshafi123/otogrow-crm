import { randomUUID } from 'node:crypto';
import { type DataSource, type EntityManager } from 'typeorm';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { DeliveryProjectEntity } from 'src/modules/delivery/entities/delivery-project.entity';
import { DeliveryClientSetupEntity } from 'src/modules/delivery/onboarding/entities/delivery-client-setup.entity';
import { DeliveryClientSetupService } from 'src/modules/delivery/onboarding/delivery-client-setup.service';
import { type DeliveryClientSetupSourceService } from 'src/modules/delivery/onboarding/delivery-client-setup-source.service';
import { clientSetupHash } from 'src/modules/delivery/onboarding/delivery-client-setup.policy';
import { type DeliveryService } from 'src/modules/delivery/delivery.service';
import { type DeliveryClientsService } from 'src/modules/delivery/clients/delivery-clients.service';
import { type OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';
import { type DeliveryClientSetupCreateInput } from 'src/modules/delivery/onboarding/delivery-client-setup.dto';
jest.mock('src/modules/otogrow-activity/record-otogrow-activity', () => ({
  recordOtogrowActivity: jest.fn(),
}));
const setup = () => {
  const workspace = {
    id: randomUUID(),
    databaseSchema: 'setup_fixture',
  } as WorkspaceEntity;
  const memberId = randomUUID(),
    userWorkspaceId = randomUUID(),
    companyId = randomUUID(),
    projectId = randomUUID(),
    engagementId = randomUUID();
  const auth = {
    type: 'user',
    workspace,
    workspaceMemberId: memberId,
    userWorkspaceId,
  } as unknown as WorkspaceAuthContext;
  const company = {
    id: companyId,
    name: 'Brand',
    updatedAt: '2026-10-30T00:00:00.000Z',
  };
  const currentCompany = { ...company, sourceToken: clientSetupHash(company) };
  let project: Partial<DeliveryProjectEntity> | null = null;
  let receipt: DeliveryClientSetupEntity | null = null;
  let plan: Record<string, unknown> | null = null;
  const receipts = {
    findOneBy: jest.fn(async () => receipt),
    save: jest.fn(async (input: Partial<DeliveryClientSetupEntity>) => {
      receipt = Object.assign(new DeliveryClientSetupEntity(), input, {
        id: randomUUID(),
        createdAt: new Date(),
      });
      return receipt;
    }),
  };
  const projects = {
    findOneBy: jest.fn(async () => project),
    find: jest.fn(async () => (project ? [project] : [])),
  };
  const query = jest.fn(async (sql: string) =>
    sql.includes('FOR SHARE')
      ? [company]
      : sql.includes('jsonb_build_object') && plan
        ? [{ plan }]
        : [],
  );
  const manager = {
    queryRunner: { isTransactionActive: true },
    query,
    getRepository: (entity: unknown) =>
      entity === WorkspaceEntity
        ? { findOneByOrFail: async () => workspace }
        : entity === DeliveryClientSetupEntity
          ? receipts
          : entity === DeliveryProjectEntity
            ? projects
            : { findOneBy: async () => null },
  } as unknown as EntityManager;
  const source = {
    transaction: async (work: (manager: EntityManager) => Promise<unknown>) =>
      work(manager),
  } as DataSource;
  const actor = jest.fn(async () => ({ isManager: true }));
  const snapshot = jest.fn(() => {
    throw new Error('Full snapshots are forbidden.');
  });
  const command = jest.fn(
    async (
      _workspace: WorkspaceEntity,
      _member: string,
      _membership: string,
      input: { action: string },
    ) => {
      if (input.action === 'project') {
        project = {
          id: projectId,
          companyId,
          workspaceId: workspace.id,
          name: 'New project',
          revision: 1,
          memberIds: [],
        };
        return projectId;
      }
      throw new Error('Unexpected task creation.');
    },
  );
  const savePlan = jest.fn(
    async (
      _workspace: WorkspaceEntity,
      _member: string,
      _membership: string,
      input: Record<string, unknown>,
    ) => {
      plan = { ...input, id: engagementId, companyId, revision: 1 };
      return plan;
    },
  );
  const nativeRead = jest.fn(async () => currentCompany);
  const service = new DeliveryClientSetupService(
    source,
    {
      actor,
      snapshot,
      schema: () => '"setup_fixture"',
      command,
    } as unknown as DeliveryService,
    {
      snapshot,
      saveSetupEngagement: savePlan,
    } as unknown as DeliveryClientsService,
    {
      listActiveMembers: async () => [{ memberId, name: 'Founder' }],
      listAccess: async () => [
        { memberId, capabilities: ['workspace.admin', 'delivery.manage'] },
      ],
    } as unknown as OtogrowAccessService,
    {
      read: nativeRead,
      list: async () => ({
        companies: [currentCompany],
        companiesHasMore: false,
      }),
    } as unknown as DeliveryClientSetupSourceService,
  );
  const input: DeliveryClientSetupCreateInput = {
    requestId: randomUUID(),
    companyId,
    companySourceToken: currentCompany.sourceToken,
    projectId: null,
    projectRevision: null,
    projectName: 'New project',
    memberIds: [],
    engagementId: null,
    engagementRevision: null,
    plan: {
      name: 'New service plan',
      services: ['SEO'],
      billing: 'RETAINER',
      scope: 'Explicit reviewed work',
      allowance: '',
      contact: '',
      advertising: null,
      fields: [],
    },
    firstTask: null,
  };
  return {
    service,
    auth,
    actor,
    input,
    company,
    currentCompany,
    nativeRead,
    query,
    command,
    savePlan,
    receipts,
    snapshot,
    receipt: () => receipt!,
    create: (value = input) => service.create(auth, value),
    reuseProject: () => {
      project = {
        id: projectId,
        companyId,
        workspaceId: workspace.id,
        name: 'Existing project',
        revision: 4,
        memberIds: [],
      };
      return projectId;
    },
  };
};
describe('Atomic client setup and exact outcome recovery', () => {
  it('creates one project and plan, returns a thin receipt and replays only the exact request', async () => {
    const test = setup();
    const first = await test.create();
    expect(first).toEqual(
      expect.objectContaining({
        requestId: test.input.requestId,
        taskId: null,
        replayed: false,
        reusedProject: false,
        reusedEngagement: false,
      }),
    );
    expect(await test.create()).toEqual({ ...first, replayed: true });
    expect(test.command).toHaveBeenCalledTimes(1);
    expect(test.savePlan).toHaveBeenCalledTimes(1);
    expect(test.snapshot).not.toHaveBeenCalled();
    await expect(
      test.create({ ...test.input, projectName: 'Replacement' }),
    ).rejects.toThrow('different setup inputs');
    expect(test.command).toHaveBeenCalledTimes(1);
  });
  it('looks up the exact missing request without creating any work', async () => {
    const test = setup();
    expect(
      await test.service.receipt(test.auth, {
        requestId: test.input.requestId,
      }),
    ).toBeNull();
    expect(test.receipts.save).not.toHaveBeenCalled();
    expect(test.command).not.toHaveBeenCalled();
  });
  it('requires current manager and current native company access on committed replay', async () => {
    const test = setup();
    await test.create();
    test.actor.mockResolvedValue({ isManager: false });
    await expect(
      test.service.receipt(test.auth, { requestId: test.input.requestId }),
    ).rejects.toThrow('management access');
    test.actor.mockResolvedValue({ isManager: true });
    test.nativeRead.mockRejectedValue(new Error('Native permission revoked'));
    await expect(test.create()).rejects.toThrow('Native permission revoked');
    expect(test.command).toHaveBeenCalledTimes(1);
  });
  it('rejects stale company and project sources before making service-plan changes', async () => {
    const test = setup();
    await expect(
      test.create({ ...test.input, companySourceToken: 'b'.repeat(64) }),
    ).rejects.toThrow('company changed');
    const projectId = test.reuseProject();
    await expect(
      test.create({
        ...test.input,
        projectId,
        projectRevision: 3,
        projectName: null,
      }),
    ).rejects.toThrow('project team changed');
    expect(test.savePlan).not.toHaveBeenCalled();
    expect(test.command).not.toHaveBeenCalled();
  });
  it('does not disclose another actor’s receipt even to another manager', async () => {
    const test = setup();
    await test.create();
    const other = {
      ...test.auth,
      workspaceMemberId: randomUUID(),
    } as unknown as WorkspaceAuthContext;
    await expect(
      test.service.receipt(other, { requestId: test.input.requestId }),
    ).rejects.toThrow('another workspace member');
  });
  it('returns task-free bounded context and row-locks only an authorized exact company', async () => {
    const test = setup();
    const context = await test.service.context(test.auth, {
      companyId: test.input.companyId,
    });
    expect(context.selectedCompany?.id).toBe(test.input.companyId);
    expect(context.members).toEqual([
      { id: context.memberId, name: 'Founder', access: 'ADMIN' },
    ]);
    expect(context).not.toHaveProperty('tasks');
    expect(test.snapshot).not.toHaveBeenCalled();
    expect(test.query).toHaveBeenCalledWith(
      expect.stringContaining('FOR SHARE'),
      [test.input.companyId],
    );
  });
});
