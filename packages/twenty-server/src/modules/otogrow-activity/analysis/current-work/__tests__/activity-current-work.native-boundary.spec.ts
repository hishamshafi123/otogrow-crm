import { randomUUID } from 'crypto';
import { ForbiddenException } from '@nestjs/common';
import { type EntityManager } from 'typeorm';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type GlobalWorkspaceDataSourceService } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource.service';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { type WorkspaceDataSourceV2Service } from 'src/engine/twenty-orm-v2/datasource/workspace-data-source-v2.service';
import { type WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { type ActivityIdentity } from 'src/modules/otogrow-activity/otogrow-activity.reads';
import {
  CURRENT_WORK_NATIVE_CACHE_KEYS,
  readActivityCurrentWorkVisibility,
} from '../activity-current-work.visibility';
import { createCurrentWorkNativeFixture } from './current-work-native.fixture';

const boundary = () => {
  const workspace = Object.assign(new WorkspaceEntity(), {
    id: randomUUID(),
    databaseSchema: 'current_work_test',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const user = Object.assign(new UserEntity(), {
    id: randomUUID(),
    disabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const membership = Object.assign(new UserWorkspaceEntity(), {
    id: randomUUID(),
    userId: user.id,
    workspaceId: workspace.id,
    workspace,
    user,
  });
  const memberId = randomUUID();
  const roleId = randomUUID();
  const metadata = createCurrentWorkNativeFixture(
    workspace.id,
    roleId,
    membership.id,
  );
  const identity: ActivityIdentity = {
    workspaceId: workspace.id,
    memberId,
    userWorkspaceId: membership.id,
    scope: 'identity',
    observedAt: new Date().toISOString(),
    actor: {
      memberId,
      isAdmin: true,
      isManager: true,
      capabilities: ['workspace.admin'],
      roleIds: [roleId],
    },
  };
  const hashes = Object.fromEntries(
    CURRENT_WORK_NATIVE_CACHE_KEYS.map((key) => [key, 'current-hash']),
  );
  const cacheMethods = {
    getOrRecompute: jest.fn(async () => metadata.data),
    getOrRecomputeWithHashes: jest.fn(async () => ({
      data: metadata.data,
      hashes,
    })),
    getCacheHashes: jest.fn(async () => ({ ...hashes })),
  };
  const cache = cacheMethods as unknown as WorkspaceCacheService;
  const workspaceOrm = new GlobalWorkspaceOrmManager(
    {} as GlobalWorkspaceDataSourceService,
    cache,
    {} as WorkspaceDataSourceV2Service,
  );
  const query = jest.fn(async (sql: string) =>
    sql.includes('core."roleTarget"')
      ? [{ roleId }]
      : [
          {
            id: memberId,
            userId: user.id,
            nameFirstName: 'Current',
            nameLastName: 'Member',
          },
        ],
  );
  const findOne = jest.fn(async () => membership);
  const manager = {
    getRepository: () => ({ findOne }),
    query,
  } as unknown as EntityManager;
  const read = () =>
    readActivityCurrentWorkVisibility(
      manager,
      workspace,
      identity,
      workspaceOrm,
      cache,
    );
  return {
    ...metadata,
    workspace,
    user,
    membership,
    identity,
    cacheMethods,
    hashes,
    query,
    findOne,
    roleId,
    read,
  };
};

describe('current native task visibility source boundary', () => {
  it('builds real native user permissions and RLS from current membership without system access', async () => {
    const setup = boundary();
    const result = await setup.read();
    expect(result.sql).toContain('"activityNativeTask"."title"');
    expect(Object.values(result.parameters)).toEqual(['%Visible%']);
    expect(
      setup.query.mock.calls.every(([sql]) => sql.startsWith('SELECT')),
    ).toBe(true);
  });
  it('denies disabled native identities before exposing task facts', async () => {
    const setup = boundary();
    setup.user.disabled = true;
    await expect(setup.read()).rejects.toThrow('identity is unavailable');
    expect(setup.query).not.toHaveBeenCalled();
  });
  it('denies a stale cached native role when its real current role target changed', async () => {
    const setup = boundary();
    setup.data.userWorkspaceRoleMap[setup.membership.id] = randomUUID();
    await expect(setup.read()).rejects.toThrow('permissions changed');
  });
  it('denies a still-local-TTL permissions entry when Redis has a newer hash', async () => {
    const setup = boundary();
    setup.cacheMethods.getCacheHashes.mockImplementation(async () => ({
      ...setup.hashes,
      rolesPermissions: 'new-permissions',
    }));
    await expect(setup.read()).rejects.toThrow('permissions changed');
  });
  it('denies permission changes during a source read even if the initial cache matched', async () => {
    const setup = boundary();
    setup.cacheMethods.getCacheHashes
      .mockResolvedValueOnce(setup.hashes)
      .mockResolvedValueOnce({
        ...setup.hashes,
        flatRowLevelPermissionPredicateMaps: 'changed-during-read',
      });
    await expect(setup.read()).rejects.toThrow('permissions changed');
  });
  it('enforces a newly denied native title field through the real native validator', async () => {
    const setup = boundary();
    setup.data.rolesPermissions[setup.roleId][
      setup.taskObject.id
    ].restrictedFields[setup.taskFields[1].id] = { canRead: false };
    await expect(setup.read()).rejects.toThrow(ForbiddenException);
  });
});
