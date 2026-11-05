const assert = require('node:assert/strict');
const { createClient } = require('redis');
const { Reflector } = require('@nestjs/core');
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
  WorkspaceRolesPermissionsCacheService,
} = require('../dist/engine/metadata-modules/role/services/workspace-roles-permissions-cache.service');
const {
  WorkspaceUserWorkspaceRoleMapCacheService,
} = require('../dist/engine/metadata-modules/role-target/services/workspace-user-workspace-role-map-cache.service');
const {
  WORKSPACE_ID,
  fingerprint,
} = require('./check-delivery-assistants-ui-fixture.cjs');

const CACHE_NAMES = ['rolesPermissions', 'userWorkspaceRoleMap'];
const cacheKeys = () =>
  CACHE_NAMES.flatMap((name) =>
    ['data', 'hash'].map(
      (part) => `engine:workspace:${name}:${WORKSPACE_ID}:${part}`,
    ),
  );
async function withRedis(operation) {
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(process.env.REDIS_URL).hostname,
    ),
  );
  const client = createClient({ url: process.env.REDIS_URL });
  client.on('error', () => {});
  await client.connect();
  try {
    return await operation(client);
  } finally {
    await client.quit();
  }
}
async function cacheState(client, key) {
  const [value, expiresAt] = await client.eval(
    "return {redis.call('GET',KEYS[1]) or '__ABSENT__',redis.call('PEXPIRETIME',KEYS[1])}",
    { keys: [key], arguments: [] },
  );
  return {
    value: value === '__ABSENT__' ? null : value,
    expiresAt: Number(expiresAt),
  };
}
async function captureCache() {
  return withRedis(async (client) => {
    const result = {};
    for (const key of cacheKeys()) {
      const state = await cacheState(client, key);
      assert(
        state.expiresAt < 0 || state.expiresAt > Date.now() + 3600000,
        'Original policy cache must outlive the bounded acceptance window.',
      );
      result[key] = state;
    }
    return result;
  });
}
function declaredStates(fixture, key) {
  return [
    fixture.cacheOriginal[key],
    ...fixture.cacheIntents
      .filter((item) => item.key === key)
      .map(({ value, expiresAt }) => ({ value, expiresAt })),
  ];
}
async function verifyCache(fixture, client) {
  assert.deepEqual(
    Object.keys(fixture.cacheOriginal).sort(),
    cacheKeys().sort(),
  );
  for (const key of cacheKeys()) {
    const current = await cacheState(client, key);
    assert(
      declaredStates(fixture, key).some(
        (state) => fingerprint(state) === fingerprint(current),
      ),
      `Unplanned native cache change: ${key}.`,
    );
  }
}
const CAS_CACHE =
  "local current=redis.call('GET',KEYS[1]); if (current or '__ABSENT__')~=ARGV[1] or tostring(redis.call('PEXPIRETIME',KEYS[1]))~=ARGV[2] then return 0 end; if ARGV[3]=='__ABSENT__' then redis.call('DEL',KEYS[1]) else redis.call('SET',KEYS[1],ARGV[3]); if tonumber(ARGV[4])>0 then redis.call('PEXPIREAT',KEYS[1],ARGV[4]) end end; return 1";
async function compareAndSet(client, key, previous, next) {
  const changed = await client.eval(CAS_CACHE, {
    keys: [key],
    arguments: [
      previous.value ?? '__ABSENT__',
      String(previous.expiresAt),
      next.value ?? '__ABSENT__',
      String(next.expiresAt),
    ],
  });
  assert.equal(changed, 1, 'Native cache changed concurrently.');
}
async function recomputeCache(manager, fixture, write) {
  await withRedis(async (client) => {
    await verifyCache(fixture, client);
    const allowed = new Set(cacheKeys());
    const check = (key) =>
      assert(allowed.has(key), 'Only two native policy caches may be touched.');
    const before = {};
    for (const key of cacheKeys()) {
      before[key] = await cacheState(client, key);
      assert(
        declaredStates(fixture, key).some(
          (state) => fingerprint(state) === fingerprint(before[key]),
        ),
        'A concurrent cache state was not declared.',
      );
    }
    const shadow = structuredClone(before);
    const mutate = async (key, value, ttl) => {
      check(key);
      shadow[key] = {
        value,
        expiresAt: value === null ? -2 : ttl > 0 ? Date.now() + ttl : -1,
      };
    };
    const storage = new CacheStorageService(
      {
        get: async (key) => {
          check(key);
          const value = shadow[key].value;
          return value === null ? undefined : JSON.parse(value);
        },
        set: (key, value, ttl) => mutate(key, JSON.stringify(value), ttl),
        del: (key) => mutate(key, null),
      },
      CacheStorageNamespace.EngineWorkspace,
    );
    const forbidden = new Proxy(
      {},
      {
        get: () => () => {
          throw new Error('Unexpected cache dependency.');
        },
      },
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
      forbidden,
    );
    const repository = (path, name) =>
      manager.getRepository(require(`../dist/engine/${path}`)[name]);
    const scoped = (path, name) => ({
      find: (workspaceId, options = {}) => {
        assert.equal(workspaceId, WORKSPACE_ID);
        return repository(path, name).find({
          ...options,
          where: { ...options.where, workspaceId },
        });
      },
    });
    cache.workspaceCacheProviders.set(
      'userWorkspaceRoleMap',
      new WorkspaceUserWorkspaceRoleMapCacheService(
        scoped(
          'metadata-modules/role-target/role-target.entity',
          'RoleTargetEntity',
        ),
      ),
    );
    cache.workspaceCacheProviders.set(
      'rolesPermissions',
      new WorkspaceRolesPermissionsCacheService(
        repository(
          'metadata-modules/object-metadata/object-metadata.entity',
          'ObjectMetadataEntity',
        ),
        scoped('metadata-modules/role/role.entity', 'RoleEntity'),
        scoped(
          'metadata-modules/object-permission/object-permission.entity',
          'ObjectPermissionEntity',
        ),
        {
          find: async (options) => {
            assert.equal(options.where.workspaceId, WORKSPACE_ID);
            assert.deepEqual(options.relations, ['permissionFlag']);
            // Standalone proof metadata retains the pre-upgrade flag column; read the current relation without selecting that removed column.
            return manager.query(
              'SELECT permission.*,to_jsonb(flag) AS "permissionFlag" FROM core."rolePermissionFlag" permission LEFT JOIN core."permissionFlag" flag ON flag.id=permission."permissionFlagId" WHERE permission."workspaceId"=$1',
              [WORKSPACE_ID],
            );
          },
        },
        scoped(
          'metadata-modules/object-permission/field-permission/field-permission.entity',
          'FieldPermissionEntity',
        ),
        scoped(
          'metadata-modules/row-level-permission-predicate/entities/row-level-permission-predicate.entity',
          'RowLevelPermissionPredicateEntity',
        ),
        scoped(
          'metadata-modules/row-level-permission-predicate/entities/row-level-permission-predicate-group.entity',
          'RowLevelPermissionPredicateGroupEntity',
        ),
      ),
    );
    await cache.invalidateAndRecompute(WORKSPACE_ID, CACHE_NAMES);
    const actual = await cache.getOrRecompute(WORKSPACE_ID, CACHE_NAMES);
    assert.equal(
      actual.userWorkspaceRoleMap[fixture.userWorkspaceId],
      fixture.nativeRoleId,
    );
    assert.equal(
      actual.rolesPermissions[fixture.nativeRoleId][fixture.taskObjectId]
        .canReadObjectRecords,
      fixture.desired === 'ALLOWED',
    );
    // Publishing a complete cache pair prevents live reads from recomputing a transiently absent entry.
    const batchId = require('node:crypto').randomUUID();
    for (const key of cacheKeys())
      fixture.cacheIntents.push({
        key,
        ...shadow[key],
        batchId,
        at: new Date().toISOString(),
      });
    write(fixture);
    const arguments_ = cacheKeys().flatMap((key) => [
      before[key].value ?? '__ABSENT__',
      String(before[key].expiresAt),
      shadow[key].value ?? '__ABSENT__',
      String(shadow[key].expiresAt),
    ]);
    const changed = await client.eval(
      "for i,key in ipairs(KEYS) do local offset=(i-1)*4; local current=redis.call('GET',key); if (current or '__ABSENT__')~=ARGV[offset+1] or tostring(redis.call('PEXPIRETIME',key))~=ARGV[offset+2] then return 0 end end; for i,key in ipairs(KEYS) do local offset=(i-1)*4; if ARGV[offset+3]=='__ABSENT__' then redis.call('DEL',key) else redis.call('SET',key,ARGV[offset+3]); if tonumber(ARGV[offset+4])>0 then redis.call('PEXPIREAT',key,ARGV[offset+4]) end end end; return 1",
      { keys: cacheKeys(), arguments: arguments_ },
    );
    assert.equal(
      changed,
      1,
      'Native policy caches changed concurrently; no transition was published.',
    );
    if (process.env.OTOGROW_NATIVE_ACCESS_UI_FAILURE === 'CACHE_WRITE')
      throw new Error('Injected native-access UI CACHE_WRITE.');
    fixture.cacheReceipt = {
      desired: fixture.desired,
      hash: fingerprint(actual),
      at: new Date().toISOString(),
    };
    write(fixture);
  });
}
async function restoreCache(fixture, write) {
  await withRedis(async (client) => {
    await verifyCache(fixture, client);
    for (const key of cacheKeys()) {
      const current = await cacheState(client, key);
      assert(
        declaredStates(fixture, key).some(
          (state) => fingerprint(state) === fingerprint(current),
        ),
        'A concurrent cache state was not declared.',
      );
      const original = fixture.cacheOriginal[key];
      assert(original.expiresAt < 0 || original.expiresAt > Date.now());
      fixture.cacheIntents.push({
        key,
        ...original,
        at: new Date().toISOString(),
        restoration: true,
      });
      write(fixture);
      await compareAndSet(client, key, current, original);
      assert.deepEqual(await cacheState(client, key), original);
    }
  });
}
module.exports = {
  captureCache,
  withRedis,
  verifyCache,
  recomputeCache,
  restoreCache,
};
