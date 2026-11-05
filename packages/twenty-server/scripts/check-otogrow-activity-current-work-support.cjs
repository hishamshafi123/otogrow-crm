const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Reflector } = require('@nestjs/core');
const { createClient } = require('redis');
const {
  GlobalWorkspaceOrmManager,
} = require('../dist/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager');
const {
  CacheStorageService,
} = require('../dist/engine/core-modules/cache-storage/services/cache-storage.service');
const {
  CacheStorageNamespace,
} = require('../dist/engine/core-modules/cache-storage/types/cache-storage-namespace.enum');
const {
  WorkspaceCacheService,
} = require('../dist/engine/workspace-cache/services/workspace-cache.service');
const {
  OtogrowActivityCurrentWorkService,
} = require('../dist/modules/otogrow-activity/analysis/current-work/otogrow-activity-current-work.service');
const {
  advertisingHash,
} = require('../dist/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy');

const unusedDependency = new Proxy(
  {},
  {
    get: (_target, method) => () => {
      throw new Error(
        `An unexpected native infrastructure method was requested: ${String(method)}.`,
      );
    },
  },
);
const CACHE_PROVIDERS = [
  [
    'flatObjectMetadataMaps',
    'metadata-modules/flat-object-metadata/services/workspace-flat-object-metadata-map-cache.service',
    'WorkspaceFlatObjectMetadataMapCacheService',
  ],
  [
    'flatFieldMetadataMaps',
    'metadata-modules/flat-field-metadata/services/workspace-flat-field-metadata-map-cache.service',
    'WorkspaceFlatFieldMetadataMapCacheService',
  ],
  [
    'flatIndexMaps',
    'metadata-modules/flat-index-metadata/services/workspace-flat-index-map-cache.service',
    'WorkspaceFlatIndexMapCacheService',
  ],
  [
    'flatRowLevelPermissionPredicateMaps',
    'metadata-modules/flat-row-level-permission-predicate/services/workspace-flat-row-level-permission-predicate-map-cache.service',
    'WorkspaceFlatRowLevelPermissionPredicateMapCacheService',
  ],
  [
    'flatRowLevelPermissionPredicateGroupMaps',
    'metadata-modules/flat-row-level-permission-predicate/services/workspace-flat-row-level-permission-predicate-group-map-cache.service',
    'WorkspaceFlatRowLevelPermissionPredicateGroupMapCacheService',
  ],
  [
    'rolesPermissions',
    'metadata-modules/role/services/workspace-roles-permissions-cache.service',
    'WorkspaceRolesPermissionsCacheService',
  ],
  [
    'userWorkspaceRoleMap',
    'metadata-modules/role-target/services/workspace-user-workspace-role-map-cache.service',
    'WorkspaceUserWorkspaceRoleMapCacheService',
  ],
  [
    'apiKeyRoleMap',
    'metadata-modules/role-target/services/workspace-api-key-role-map-cache.service',
    'WorkspaceApiKeyRoleMapCacheService',
  ],
  [
    'featureFlagsMap',
    'metadata-modules/workspace-feature-flags-map-cache/workspace-feature-flags-map-cache.service',
    'WorkspaceFeatureFlagsMapCacheService',
  ],
  [
    'ORMEntityMetadatas',
    'twenty-orm/global-workspace-datasource/workspace-orm-entity-metadatas-cache.service',
    'WorkspaceORMEntityMetadatasCacheService',
  ],
];

// Real cached policies can be read without booting workers or authorizing a cache recomputation.
async function realCachedCurrentWork(access, onDiagnostic = () => {}) {
  const redisUrl = process.env.REDIS_URL;
  assert(redisUrl, 'The existing local Redis URL is required.');
  assert(['localhost', '127.0.0.1'].includes(new URL(redisUrl).hostname));
  const client = createClient({ url: redisUrl });
  client.on('error', () => {});
  try {
    await client.connect();
    const readonlyManager = {
      get: async (key) => {
        const value = await client.get(key);
        if (value === null) return undefined;
        return JSON.parse(value);
      },
    };
    const storage = new CacheStorageService(
      readonlyManager,
      CacheStorageNamespace.EngineWorkspace,
    );
    const cache = new WorkspaceCacheService(
      storage,
      { getProviders: () => [] },
      new Reflector(),
      {
        recordRecompute: () => {},
        recordRedisWrite: () => {},
        recordEviction: () => {},
        recordPackingRun: () => {},
        recordUnpacking: () => {},
      },
      unusedDependency,
    );
    // Register genuine storage expanders without starting maintenance timers or supplying any recomputation repository.
    for (const [key, path, name] of CACHE_PROVIDERS) {
      const Provider = require(`../dist/engine/${path}`)[name];
      assert.equal(
        typeof Provider,
        'function',
        `Missing genuine ${key} cache provider.`,
      );
      const readonlyProviderDependency = new Proxy(
        {},
        {
          get: (_target, method) => () => {
            throw new Error(
              `Read-only native cache cannot recompute ${key} (${String(method)}).`,
            );
          },
        },
      );
      cache.workspaceCacheProviders.set(
        key,
        new Provider(...Array(12).fill(readonlyProviderDependency)),
      );
    }
    const workspaceOrm = new GlobalWorkspaceOrmManager(
      unusedDependency,
      cache,
      unusedDependency,
    );
    const execute = workspaceOrm.executeInWorkspaceContext.bind(workspaceOrm);
    workspaceOrm.executeInWorkspaceContext = async (...arguments_) => {
      try {
        return await execute(...arguments_);
      } catch (error) {
        onDiagnostic({
          name: error?.name ?? 'Error',
          message: String(error?.message ?? 'Native context failed.').slice(
            0,
            600,
          ),
        });
        throw error;
      }
    };
    return {
      workspaceOrm,
      cache,
      currentWork: new OtogrowActivityCurrentWorkService(
        workspaceOrm,
        access,
        cache,
      ),
      close: async () => {
        if (client.isOpen) await client.quit();
      },
    };
  } catch (error) {
    if (client.isOpen) await client.quit();
    throw error;
  }
}

async function seedCurrentWorkFixture(manager, fixture) {
  const schema = `"${fixture.schemaName}"`;
  fixture.nativeRoleId = randomUUID();
  await manager.query(
    'INSERT INTO core.role (id,"workspaceId",label,"universalIdentifier","applicationId") VALUES ($1,$2,$3,$1,$4)',
    [
      fixture.nativeRoleId,
      fixture.workspaceId,
      'FIXTURE task visibility only',
      fixture.workspace.workspaceCustomApplicationId,
    ],
  );
  for (const person of Object.values(fixture.people))
    await manager.query(
      'INSERT INTO core."roleTarget" ("workspaceId","roleId","userWorkspaceId","universalIdentifier","applicationId") VALUES ($1,$2,$3,$4,$5)',
      [
        fixture.workspaceId,
        fixture.nativeRoleId,
        person.userWorkspaceId,
        randomUUID(),
        fixture.workspace.workspaceCustomApplicationId,
      ],
    );
  await manager.query(
    `CREATE TABLE ${schema}.task (id uuid PRIMARY KEY,title text NOT NULL,"assigneeId" uuid,"dueAt" timestamptz,"deletedAt" timestamptz)`,
  );
  await manager.query(
    'UPDATE core."otogrowRole" SET capabilities=$2 WHERE id=$1',
    [fixture.roles.secondWriter, ['delivery.review']],
  );
  await manager.query(
    'UPDATE core."deliveryProject" SET "memberIds"=$2::jsonb WHERE id=$1',
    [
      fixture.projects.first,
      JSON.stringify([
        fixture.people.writer.memberId,
        fixture.people.reader.memberId,
        fixture.people.secondWriter.memberId,
      ]),
    ],
  );
  fixture.currentTasks = {};
  fixture.currentManagedIds = {};
  fixture.currentAssignmentIds = {};
  const add = async (key, overrides = {}) => {
    const taskId = randomUUID();
    const ownerId = overrides.ownerId ?? fixture.people.writer.memberId;
    const projectId = overrides.projectId ?? fixture.projects.first;
    const details = {
      state: 'IN_REVIEW',
      blocker: null,
      reviewerId: fixture.people.reader.memberId,
      submissions: [
        { version: 1, submittedAt: '2020-02-21T10:00:00.000Z' },
        { version: 2, submittedAt: '2020-02-21T11:00:00.000Z' },
      ],
      ...overrides.details,
    };
    await manager.query(
      `INSERT INTO ${schema}.task (id,title,"assigneeId","dueAt","deletedAt") VALUES ($1,$2,$3,$4,$5)`,
      [
        taskId,
        overrides.title ?? `Visible FIXTURE ${key}`,
        ownerId,
        '2020-02-22T12:00:00.000Z',
        overrides.deletedAt ?? null,
      ],
    );
    const [managed] = await manager.query(
      'INSERT INTO core."deliveryTask" ("workspaceId","taskId","projectId",details,revision) VALUES ($1,$2,$3,$4,1) RETURNING id',
      [fixture.workspaceId, taskId, projectId, JSON.stringify(details)],
    );
    fixture.currentTasks[key] = taskId;
    fixture.currentManagedIds[key] = managed.id;
    return taskId;
  };
  const assign = async (taskId, version, reviewerId) => {
    const [assignment] = await manager.query(
      'INSERT INTO core."deliveryReviewAssignment" ("workspaceId","taskId","submissionVersion",revision,mode,"reviewerId","reviewerName",reason,"changedBy","changedByName","changedAt") VALUES ($1,$2,$3,1,\'BACKUP\',$4,\'FIXTURE backup\',\'FIXTURE verified backup\',$5,\'FIXTURE administrator\',\'2020-02-21T12:00:00Z\') RETURNING id',
      [
        fixture.workspaceId,
        taskId,
        version,
        reviewerId,
        fixture.people.admin.memberId,
      ],
    );
    fixture.currentAssignmentIds[`${taskId}:${version}`] = assignment.id;
  };
  const stale = await add('staleBackup');
  await assign(stale, 1, fixture.people.secondWriter.memberId);
  const backup = await add('activeBackup');
  await assign(backup, 2, fixture.people.secondWriter.memberId);
  const self = await add('selfBackup');
  await assign(self, 2, fixture.people.writer.memberId);
  const unavailable = await add('unavailableBackup');
  await assign(unavailable, 2, fixture.people.outsider.memberId);
  await add('approved', { details: { state: 'APPROVED' } });
  await add('inProgress', {
    details: { state: 'IN_PROGRESS', submissions: [], reviewerId: null },
  });
  await add('otherProject', { projectId: fixture.projects.otherClient });
  await add('hidden', { title: 'PRIVATE_NATIVE_RLS_HIDDEN_TASK' });
  await add('deleted', { deletedAt: '2020-02-21T00:00:00Z' });
  return fixture.currentTasks;
}

function syntheticCurrentWork(access, fixture, sharedNative) {
  const {
    createCurrentWorkNativeFixture,
  } = require('../dist/modules/otogrow-activity/analysis/current-work/__tests__/current-work-native.fixture');
  const native =
    sharedNative ??
    createCurrentWorkNativeFixture(
      fixture.workspaceId,
      fixture.nativeRoleId,
      fixture.people.admin.userWorkspaceId,
    );
  for (const person of Object.values(fixture.people))
    native.data.userWorkspaceRoleMap[person.userWorkspaceId] =
      fixture.nativeRoleId;
  const state = { changingHash: false, hashReads: 0 };
  const hashes = () =>
    Object.fromEntries(
      Object.entries(native.data).map(([key, value]) => [
        key,
        advertisingHash(value),
      ]),
    );
  const cache = {
    getOrRecompute: async (workspaceId, keys) => {
      assert.equal(workspaceId, fixture.workspaceId);
      return Object.fromEntries(
        keys.map((key) => {
          assert(Object.hasOwn(native.data, key));
          return [key, native.data[key]];
        }),
      );
    },
    getOrRecomputeWithHashes: async (workspaceId, keys) => ({
      data: await cache.getOrRecompute(workspaceId, keys),
      hashes: hashes(),
    }),
    getCacheHashes: async (workspaceId) => {
      assert.equal(workspaceId, fixture.workspaceId);
      state.hashReads++;
      const result = hashes();
      if (state.changingHash && state.hashReads % 2 === 0)
        result.rolesPermissions = 'FIXTURE concurrent metadata revision';
      return result;
    },
  };
  const workspaceOrm = new GlobalWorkspaceOrmManager(
    unusedDependency,
    cache,
    unusedDependency,
  );
  return {
    workspaceOrm,
    cache,
    currentWork: new OtogrowActivityCurrentWorkService(
      workspaceOrm,
      access,
      cache,
    ),
    native,
    state,
  };
}

module.exports = {
  realCachedCurrentWork,
  seedCurrentWorkFixture,
  syntheticCurrentWork,
};
