import { randomUUID } from 'node:crypto';
import { type GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';
import { DeliveryClientSetupSourceService } from 'src/modules/delivery/onboarding/delivery-client-setup-source.service';
import { CompanyWorkspaceEntity } from 'src/modules/company/standard-objects/company.workspace-entity';
jest.mock(
  'src/engine/twenty-orm/storage/orm-workspace-context.storage',
  () => ({ getWorkspaceContext: jest.fn() }),
);
jest.mock(
  'src/engine/twenty-orm/utils/resolve-role-permission-config.util',
  () => ({ resolveRolePermissionConfig: jest.fn() }),
);
const auth = {
  type: 'user',
  workspace: { id: randomUUID() },
  userWorkspaceId: randomUUID(),
} as WorkspaceAuthContext;
const setup = () => {
  const rows = Array.from({ length: 51 }, (_, index) => ({
    id: randomUUID(),
    name: `Brand ${index}`,
    updatedAt: '2026-10-30T00:00:00.000Z',
  }));
  const find = jest.fn(async () => rows),
    findOne = jest.fn(async () => rows[0] ?? null);
  const getRepository = jest.fn(async () => ({ find, findOne }));
  jest
    .mocked(getWorkspaceContext)
    .mockReturnValue({ authContext: auth } as ReturnType<
      typeof getWorkspaceContext
    >);
  jest
    .mocked(resolveRolePermissionConfig)
    .mockReturnValue({ intersectionOf: ['native-role'] });
  const service = new DeliveryClientSetupSourceService({
    executeInWorkspaceContext: async (read: () => Promise<unknown>) => read(),
    getRepository,
  } as unknown as GlobalWorkspaceOrmManager);
  return { service, rows, find, findOne, getRepository };
};
describe('Native company onboarding source', () => {
  it('uses explicit native permissions and a bounded directory rather than bypassing CRM access', async () => {
    const test = setup();
    const result = await test.service.list(auth, 'Brand');
    expect(test.getRepository).toHaveBeenCalledWith(
      auth.workspace.id,
      CompanyWorkspaceEntity,
      { intersectionOf: ['native-role'] },
    );
    expect(test.find).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 51,
        select: { id: true, name: true, updatedAt: true },
      }),
    );
    expect(result.companies).toHaveLength(50);
    expect(result.companiesHasMore).toBe(true);
    expect(result.companies[0].sourceToken).toHaveLength(64);
  });
  it('returns only the exact requested company and keeps an absent result absent', async () => {
    const test = setup();
    const id = randomUUID();
    test.findOne.mockResolvedValue(
      null as unknown as (typeof test.rows)[number],
    );
    await expect(test.service.read(auth, id)).resolves.toBeNull();
    expect(test.findOne).toHaveBeenCalledWith({
      where: { id },
      select: { id: true, name: true, updatedAt: true },
    });
  });
  it('does not acquire a bypass repository when native permissions are unavailable', async () => {
    const test = setup();
    jest.mocked(resolveRolePermissionConfig).mockReturnValue(null);
    await expect(test.service.read(auth, randomUUID())).rejects.toThrow(
      'CRM permissions',
    );
    expect(test.getRepository).not.toHaveBeenCalled();
  });
});
