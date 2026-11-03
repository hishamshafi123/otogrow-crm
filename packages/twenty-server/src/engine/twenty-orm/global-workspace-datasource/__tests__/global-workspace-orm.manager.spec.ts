import { randomUUID } from 'crypto';
import { FeatureFlagKey } from 'twenty-shared/types';
import { type EntityMetadata } from 'typeorm';
import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { createEmptyFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-flat-entity-maps.constant';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { type WorkspaceDataSourceV2Service } from 'src/engine/twenty-orm-v2/datasource/workspace-data-source-v2.service';
import { type WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { type GlobalWorkspaceDataSourceService } from '../global-workspace-datasource.service';
import { GlobalWorkspaceOrmManager } from '../global-workspace-orm.manager';

const setup = () => {
  const workspaceId = randomUUID();
  const userWorkspaceId = randomUUID();
  const roleId = randomUUID();
  const authContext = {
    type: 'user',
    workspace: { id: workspaceId },
    userWorkspaceId,
  } as UserWorkspaceAuthContext;
  const data = {
    flatObjectMetadataMaps: createEmptyFlatEntityMaps(),
    flatFieldMetadataMaps: createEmptyFlatEntityMaps(),
    flatIndexMaps: createEmptyFlatEntityMaps(),
    featureFlagsMap: { [FeatureFlagKey.IS_ORM_V2_READ_PATH_ENABLED]: false },
    rolesPermissions: { [roleId]: {} },
    userWorkspaceRoleMap: { [userWorkspaceId]: roleId },
    apiKeyRoleMap: {},
    flatRowLevelPermissionPredicateMaps: createEmptyFlatEntityMaps(),
    flatRowLevelPermissionPredicateGroupMaps: createEmptyFlatEntityMaps(),
  };
  const graph = [{ name: 'NativeTaskGraphSentinel' }] as EntityMetadata[];
  const getOrRecompute = jest.fn(async (_workspaceId: string, keys: string[]) =>
    keys.includes('ORMEntityMetadatas') ? { ORMEntityMetadatas: graph } : data,
  );
  const manager = new GlobalWorkspaceOrmManager(
    {} as GlobalWorkspaceDataSourceService,
    { getOrRecompute } as unknown as WorkspaceCacheService,
    {} as WorkspaceDataSourceV2Service,
  );
  return { manager, authContext, data, graph, getOrRecompute };
};
const FULL_CONTEXT_KEYS = [
  'flatObjectMetadataMaps',
  'flatFieldMetadataMaps',
  'flatIndexMaps',
  'featureFlagsMap',
  'rolesPermissions',
  'userWorkspaceRoleMap',
  'apiKeyRoleMap',
  'flatRowLevelPermissionPredicateMaps',
  'flatRowLevelPermissionPredicateGroupMaps',
];

describe('native permission context without an ORM entity graph', () => {
  it('keeps the default full context and ORM graph behavior unchanged', async () => {
    const fixture = setup();
    const context = await fixture.manager.executeInWorkspaceContext(
      () => getWorkspaceContext(),
      fixture.authContext,
    );
    expect(fixture.getOrRecompute.mock.calls.map(([, keys]) => keys)).toEqual([
      FULL_CONTEXT_KEYS,
      ['ORMEntityMetadatas'],
    ]);
    expect(context.entityMetadatas).toBe(fixture.graph);
    expect(context.permissionsPerRoleId).toBe(fixture.data.rolesPermissions);
  });
  it('skips only the graph while retaining actual role, field and RLS context', async () => {
    const fixture = setup();
    const context = await fixture.manager.executeInWorkspaceContext(
      () => getWorkspaceContext(),
      fixture.authContext,
      { skipEntityMetadatas: true },
    );
    expect(fixture.getOrRecompute.mock.calls.map(([, keys]) => keys)).toEqual([
      FULL_CONTEXT_KEYS,
    ]);
    expect(context.entityMetadatas).toEqual([]);
    expect(context.flatFieldMetadataMaps).toBe(
      fixture.data.flatFieldMetadataMaps,
    );
    expect(context.permissionsPerRoleId).toBe(fixture.data.rolesPermissions);
    expect(context.userWorkspaceRoleMap).toBe(
      fixture.data.userWorkspaceRoleMap,
    );
    expect(context.flatRowLevelPermissionPredicateMaps).toBe(
      fixture.data.flatRowLevelPermissionPredicateMaps,
    );
    expect(context.flatRowLevelPermissionPredicateGroupMaps).toBe(
      fixture.data.flatRowLevelPermissionPredicateGroupMaps,
    );
    expect(context.authContext).toBe(fixture.authContext);
  });
  it('can explicitly load the graph later without weakening the retained permission context', async () => {
    const fixture = setup();
    const context = await fixture.manager.executeInWorkspaceContext(
      async () => {
        await fixture.manager.ensureEntityMetadatasLoaded();
        return getWorkspaceContext();
      },
      fixture.authContext,
      { skipEntityMetadatas: true },
    );
    expect(fixture.getOrRecompute.mock.calls.map(([, keys]) => keys)).toEqual([
      FULL_CONTEXT_KEYS,
      ['ORMEntityMetadatas'],
    ]);
    expect(context.entityMetadatas).toEqual(fixture.graph);
    expect(context.permissionsPerRoleId).toBe(fixture.data.rolesPermissions);
  });
  it('preserves the existing lite branch when both options are supplied', async () => {
    const fixture = setup();
    const context = await fixture.manager.executeInWorkspaceContext(
      () => getWorkspaceContext(),
      fixture.authContext,
      { lite: true, skipEntityMetadatas: true },
    );
    expect(fixture.getOrRecompute.mock.calls.map(([, keys]) => keys)).toEqual([
      ['flatObjectMetadataMaps', 'flatFieldMetadataMaps', 'featureFlagsMap'],
      ['ORMEntityMetadatas'],
    ]);
    expect(context.entityMetadatas).toBe(fixture.graph);
    expect(context.permissionsPerRoleId).toEqual({});
  });
});
