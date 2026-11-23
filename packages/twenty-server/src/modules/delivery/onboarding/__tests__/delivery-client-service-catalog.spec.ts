import { randomUUID } from 'node:crypto';
import { recordOtogrowActivity } from 'src/modules/otogrow-activity/record-otogrow-activity';
import { type DataSource, type EntityManager } from 'typeorm';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type DeliveryService } from 'src/modules/delivery/delivery.service';
import { type DeliveryClientsService } from 'src/modules/delivery/clients/delivery-clients.service';
import { DeliveryOperationsEntity } from 'src/modules/delivery/entities/delivery-operations.entity';
import { newDeliveryOperations } from 'src/modules/delivery/operations/delivery-operations.types';
import { DeliveryClientSetupService } from 'src/modules/delivery/onboarding/delivery-client-setup.service';
import { type DeliveryClientSetupSourceService } from 'src/modules/delivery/onboarding/delivery-client-setup-source.service';
import { type OtogrowAccessService } from 'src/modules/otogrow-access/otogrow-access.service';

jest.mock('src/modules/otogrow-activity/record-otogrow-activity', () => ({
  recordOtogrowActivity: jest.fn(),
}));
const setup = () => {
  const workspace = { id: randomUUID() } as WorkspaceEntity;
  const auth = {
    type: 'user',
    workspace,
    workspaceMemberId: randomUUID(),
    userWorkspaceId: randomUUID(),
  } as unknown as Extract<WorkspaceAuthContext, { type: 'user' }>;
  const records = new Map<string, DeliveryOperationsEntity>();
  const repository = {
    findOneBy: jest.fn(async ({ workspaceId }: { workspaceId: string }) =>
      records.get(workspaceId),
    ),
    create: (value: Partial<DeliveryOperationsEntity>) =>
      Object.assign(new DeliveryOperationsEntity(), value),
    save: jest.fn(async (record: DeliveryOperationsEntity) => {
      records.set(record.workspaceId, record);
      return record;
    }),
  };
  const query = jest.fn(async () => []);
  const manager = {
    query,
    getRepository: (entity: unknown) =>
      entity === WorkspaceEntity
        ? { findOneByOrFail: async () => workspace }
        : repository,
  } as unknown as EntityManager;
  const source = {
    transaction: async (
      operation: (manager: EntityManager) => Promise<unknown>,
    ) => operation(manager),
  } as DataSource;
  const actor = jest.fn(async () => ({ isManager: true }));
  const service = new DeliveryClientSetupService(
    source,
    { actor } as unknown as DeliveryService,
    {} as DeliveryClientsService,
    {} as OtogrowAccessService,
    {} as DeliveryClientSetupSourceService,
  );
  return { auth, actor, service, records, repository, query };
};

describe('Reusable client service catalog', () => {
  beforeEach(() => jest.clearAllMocks());
  it('reads old workspaces without creating operations state', async () => {
    const fixture = setup();
    expect(await fixture.service.serviceCatalog(fixture.auth)).toEqual({
      workspaceId: fixture.auth.workspace.id,
      memberId: fixture.auth.workspaceMemberId,
      userWorkspaceId: fixture.auth.userWorkspaceId,
      services: [],
    });
    expect(fixture.repository.save).not.toHaveBeenCalled();
  });
  it('persists normalized names and preserves existing business state', async () => {
    const fixture = setup();
    const state = {
      ...newDeliveryOperations(),
      timezone: 'Asia/Qatar',
      founderId: randomUUID(),
    };
    fixture.records.set(
      fixture.auth.workspace.id,
      Object.assign(new DeliveryOperationsEntity(), {
        workspaceId: fixture.auth.workspace.id,
        state,
      }),
    );
    await fixture.service.addService(fixture.auth, '  AI   automation  ');
    expect(
      (await fixture.service.serviceCatalog(fixture.auth)).services,
    ).toEqual(['AI automation']);
    expect(fixture.records.get(fixture.auth.workspace.id)?.state).toEqual({
      ...state,
      serviceCatalog: ['AI automation'],
    });
    expect(fixture.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`delivery:${fixture.auth.workspace.id}`],
    );
  });
  it('treats repeated requests and case or whitespace variants as the same service', async () => {
    const fixture = setup();
    await fixture.service.addService(fixture.auth, 'AI automation');
    expect(
      (await fixture.service.addService(fixture.auth, 'ai  AUTOMATION'))
        .services,
    ).toEqual(['AI automation']);
    expect(fixture.repository.save).toHaveBeenCalledTimes(1);
  });
  it('deduplicates legacy hyphen and underscore service aliases and audits only new names', async () => {
    const fixture = setup();
    await fixture.service.addService(fixture.auth, 'AI automation');
    await fixture.service.addService(fixture.auth, 'AI-automation');
    await fixture.service.addService(fixture.auth, 'AI_automation');
    expect(
      (await fixture.service.serviceCatalog(fixture.auth)).services,
    ).toEqual(['AI automation']);
    expect(fixture.repository.save).toHaveBeenCalledTimes(1);
    expect(recordOtogrowActivity).toHaveBeenCalledTimes(1);
    expect(recordOtogrowActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        workspaceId: fixture.auth.workspace.id,
        actorId: fixture.auth.workspaceMemberId,
        action: 'CLIENT_SERVICE_CATALOG_UPDATED',
        sourceType: 'settings',
        changes: [{ field: 'serviceCount', before: '0', after: '1' }],
      }),
    );
  });
  it('keeps catalogs isolated by workspace', async () => {
    const fixture = setup();
    await fixture.service.addService(fixture.auth, 'Private service');
    const other = {
      ...fixture.auth,
      workspace: { ...fixture.auth.workspace, id: randomUUID() },
    } as WorkspaceAuthContext;
    expect((await fixture.service.serviceCatalog(other)).services).toEqual([]);
  });
  it.each([
    '',
    '   ',
    'a'.repeat(101),
    'SEO, Ads',
    'SEO\nAds',
    'SEO\tAds',
    'SEO\u0000',
  ])('rejects invalid names %j', async (name) => {
    const fixture = setup();
    await expect(
      fixture.service.addService(fixture.auth, name),
    ).rejects.toThrow();
    expect(fixture.repository.save).not.toHaveBeenCalled();
  });
  it('checks current manager authority for both reads and writes', async () => {
    const fixture = setup();
    fixture.actor.mockResolvedValue({ isManager: false });
    await expect(fixture.service.serviceCatalog(fixture.auth)).rejects.toThrow(
      'management access',
    );
    await expect(
      fixture.service.addService(fixture.auth, 'SEO'),
    ).rejects.toThrow('management access');
    expect(fixture.repository.findOneBy).not.toHaveBeenCalled();
  });
  it('rejects non-user authentication', async () => {
    const fixture = setup();
    const auth = {
      ...fixture.auth,
      type: 'apiKey',
    } as unknown as WorkspaceAuthContext;
    await expect(fixture.service.serviceCatalog(auth)).rejects.toThrow(
      'Sign in',
    );
    await expect(fixture.service.addService(auth, 'SEO')).rejects.toThrow(
      'Sign in',
    );
  });
  it('caps growth while allowing an existing service at the limit', async () => {
    const fixture = setup();
    fixture.records.set(
      fixture.auth.workspace.id,
      Object.assign(new DeliveryOperationsEntity(), {
        workspaceId: fixture.auth.workspace.id,
        state: {
          ...newDeliveryOperations(),
          serviceCatalog: Array.from(
            { length: 200 },
            (_, index) => `Service ${index}`,
          ),
        },
      }),
    );
    await expect(
      fixture.service.addService(fixture.auth, 'Another'),
    ).rejects.toThrow('200');
    expect(
      (await fixture.service.addService(fixture.auth, 'service 0')).services,
    ).toHaveLength(200);
    expect(fixture.repository.save).not.toHaveBeenCalled();
  });
});
