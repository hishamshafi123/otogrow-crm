const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  openSync,
  closeSync,
  fsyncSync,
  writeFileSync,
} = require('node:fs');
const { resolve, join, sep } = require('node:path');
const { Reflector } = require('@nestjs/core');
const { createClient } = require('redis');
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
  WorkspaceUserWorkspaceRoleMapCacheService,
} = require('../dist/engine/metadata-modules/role-target/services/workspace-user-workspace-role-map-cache.service');
const {
  RoleTargetEntity,
} = require('../dist/engine/metadata-modules/role-target/role-target.entity');
const {
  OtogrowAccessService,
} = require('../dist/modules/otogrow-access/otogrow-access.service');
const {
  DeliveryContentSourceService,
} = require('../dist/modules/delivery/content/delivery-content-source.service');
const {
  DeliveryContentReadsService,
} = require('../dist/modules/delivery/content/delivery-content-reads.service');
const {
  DeliveryContentService,
} = require('../dist/modules/delivery/content/delivery-content.service');
const {
  newCreativeDocument,
} = require('../dist/modules/delivery/creative/delivery-creative.types');
const {
  freezeCreativeSubmissionLearning,
} = require('../dist/modules/delivery/creative/learning/freeze-creative-submission-learning');
const {
  realCachedCurrentWork,
} = require('./check-otogrow-activity-current-work-support.cjs');
const {
  WORKSPACE_ID,
  fingerprint,
  quote,
} = require('./check-delivery-assistants-ui-fixture.cjs');
const UUID = /^[a-f0-9-]{36}$/;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function storageRoot(manager) {
  const rows = await manager.query(
    `SELECT key,value FROM core."keyValuePair" WHERE type='CONFIG_VARIABLE' AND "workspaceId" IS NULL AND "userId" IS NULL AND key IN ('STORAGE_TYPE','STORAGE_LOCAL_PATH')`,
  );
  const configuration = Object.fromEntries(
    rows.map((row) => [row.key, row.value]),
  );
  assert.equal(
    (
      configuration.STORAGE_TYPE ??
      process.env.STORAGE_TYPE ??
      'local'
    ).toLowerCase(),
    'local',
  );
  return resolve(
    __dirname,
    '..',
    configuration.STORAGE_LOCAL_PATH ??
      process.env.STORAGE_LOCAL_PATH ??
      '.local-storage',
  );
}
function directory(fixture) {
  assert.equal(
    fixture.media.directory,
    join(fixture.media.root, WORKSPACE_ID, 'delivery-creative', fixture.taskId),
  );
  return fixture.media.directory;
}
function verifyMedia(fixture, allowMissing = false) {
  if (!fixture.media) return;
  const path = directory(fixture);
  if (!existsSync(path)) {
    assert(allowMissing);
    return;
  }
  const metadata = lstatSync(path);
  assert(metadata.isDirectory() && !metadata.isSymbolicLink());
  assert(realpathSync(path).startsWith(realpathSync(fixture.media.root) + sep));
  const names = readdirSync(path).sort();
  if (!allowMissing) assert.deepEqual(names, [fixture.assetId]);
  for (const name of names) {
    assert.equal(name, fixture.assetId);
    assert.match(name, UUID);
    const file = join(path, name),
      info = lstatSync(file);
    assert(info.isFile() && !info.isSymbolicLink());
    assert.equal(info.size, fixture.media.size);
    assert.equal(hash(readFileSync(file)), fixture.media.hash);
  }
}
function generateMedia(fixture, write) {
  const path = directory(fixture);
  assert(!existsSync(path), 'Never overwrite an existing creative directory.');
  const bytes = execFileSync(
    'ffmpeg',
    [
      '-nostdin',
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=320x180:rate=1',
      '-frames:v',
      '1',
      '-threads',
      '1',
      '-f',
      'image2pipe',
      '-vcodec',
      'png',
      'pipe:1',
    ],
    { timeout: 30000, maxBuffer: 1024 * 1024 },
  );
  assert(bytes.length > 0 && bytes.length < 1024 * 1024);
  fixture.media.size = bytes.length;
  fixture.media.hash = hash(bytes);
  write(fixture);
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const descriptor = openSync(join(path, fixture.assetId), 'wx', 0o600);
  try {
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  const folder = openSync(path, 'r');
  try {
    fsyncSync(folder);
  } finally {
    closeSync(folder);
  }
  verifyMedia(fixture);
}
function details(fixture) {
  const creative = newCreativeDocument();
  creative.brief.objective = 'ORGANIC';
  creative.brief.outputKind = 'IMAGE';
  creative.brief.concept = `FIXTURE ${fixture.title}: local test pattern, no real brand or connected account.`;
  creative.approvedBriefVersion = creative.briefVersion;
  creative.finalAssetId = fixture.assetId;
  creative.assets = [
    {
      id: fixture.assetId,
      name: 'FIXTURE approved local image.png',
      kind: 'FINAL',
      mimeType: 'image/png',
      size: fixture.media.size,
      createdAt: fixture.createdAt,
      uploadedBy: fixture.employee.memberId,
      briefVersion: creative.briefVersion,
      productionVersion: creative.productionVersion,
      assemblyVersion: creative.assemblyVersion,
      shotId: null,
      shotVersion: null,
      parentAssetId: null,
      storageState: 'READY',
      reviews: [
        {
          memberId: fixture.actorId,
          at: fixture.createdAt,
          decision: 'APPROVED',
          notes: 'FIXTURE independently reviewed synthetic media.',
        },
      ],
    },
  ];
  return {
    brief: 'FIXTURE approved native image for manual content workflow.',
    service: 'Social media',
    priority: 'NORMAL',
    scheduledDate: null,
    reviewerId: fixture.actorId,
    state: 'APPROVED',
    blocker: '',
    checklist: [],
    evidence: [],
    events: [],
    creative,
    submissions: [
      {
        version: 1,
        creativeVersion: creative.version,
        finalAssetId: fixture.assetId,
        description: 'FIXTURE approved local image.',
        evidence: [],
        submittedBy: fixture.employee.memberId,
        submittedAt: fixture.createdAt,
        decision: 'APPROVED',
        reviewedBy: fixture.actorId,
        reviewedAt: fixture.createdAt,
        feedback: 'FIXTURE source accepted independently.',
        creativeLearning: freezeCreativeSubmissionLearning(
          creative,
          'FIXTURE approved source copy.',
          { id: fixture.projectId, companyId: null },
        ),
      },
    ],
  };
}
async function roleMap(manager) {
  const rows = await manager.query(
    'SELECT "userWorkspaceId","roleId" FROM core."roleTarget" WHERE "workspaceId"=$1 AND "userWorkspaceId" IS NOT NULL ORDER BY "userWorkspaceId"',
    [WORKSPACE_ID],
  );
  return Object.fromEntries(
    rows.map((row) => [row.userWorkspaceId, row.roleId]),
  );
}
async function refreshRoleCache(manager, fixture, write) {
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(process.env.REDIS_URL).hostname,
    ),
  );
  const current = await roleMap(manager);
  const present = Object.hasOwn(current, fixture.employee.userWorkspaceId);
  assert.deepEqual(current, {
    ...fixture.originalRoles,
    ...(present
      ? { [fixture.employee.userWorkspaceId]: fixture.nativeRoleId }
      : {}),
  });
  fixture.cacheIntents.push({
    present,
    mapHash: fingerprint(current),
    at: new Date().toISOString(),
  });
  write(fixture);
  const client = createClient({ url: process.env.REDIS_URL });
  client.on('error', () => {});
  await client.connect();
  const prefix = `engine:workspace:userWorkspaceRoleMap:${WORKSPACE_ID}`;
  const allowed = new Set([`${prefix}:data`, `${prefix}:hash`]);
  const check = (key) =>
    assert(
      allowed.has(key),
      'Cache refresh may touch only the current native user-role map.',
    );
  try {
    const storage = new CacheStorageService(
      {
        get: async (key) => {
          check(key);
          const value = await client.get(key);
          return value === null ? undefined : JSON.parse(value);
        },
        set: async (key, value) => {
          check(key);
          return client.set(key, JSON.stringify(value));
        },
        del: async (key) => {
          check(key);
          return client.del(key);
        },
      },
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
      {
        get: () => {
          throw new Error('Unexpected cache configuration read.');
        },
      },
    );
    const provider = new WorkspaceUserWorkspaceRoleMapCacheService({
      find: async (workspaceId, options) => {
        assert.equal(workspaceId, WORKSPACE_ID);
        return manager
          .getRepository(RoleTargetEntity)
          .find({ ...options, where: { ...options.where, workspaceId } });
      },
    });
    cache.workspaceCacheProviders.set('userWorkspaceRoleMap', provider);
    await cache.invalidateAndRecompute(WORKSPACE_ID, ['userWorkspaceRoleMap']);
    const actual = await cache.getOrRecompute(WORKSPACE_ID, [
      'userWorkspaceRoleMap',
    ]);
    assert.deepEqual(actual.userWorkspaceRoleMap, current);
  } finally {
    await client.quit();
  }
}
async function services(manager, fixture) {
  const [workspace] = await manager.query(
    'SELECT * FROM core.workspace WHERE id=$1',
    [WORKSPACE_ID],
  );
  const source = {
    manager,
    getRepository: (entity) => manager.getRepository(entity),
    query: (...arguments_) => manager.query(...arguments_),
    transaction: (operation) => manager.transaction(operation),
  };
  const access = new OtogrowAccessService(source, {
    userHasWorkspaceSettingPermission: async ({
      workspaceId,
      userWorkspaceId,
    }) => {
      assert.equal(workspaceId, WORKSPACE_ID);
      const [row] = await manager.query(
        'SELECT bool_or(role."canUpdateAllSettings") AS allowed FROM core."roleTarget" target JOIN core.role role ON role.id=target."roleId" WHERE target."workspaceId"=$1 AND target."userWorkspaceId"=$2',
        [workspaceId, userWorkspaceId],
      );
      return row?.allowed === true;
    },
  });
  const native = await realCachedCurrentWork(access);
  const contentSource = new DeliveryContentSourceService(
    source,
    access,
    native.workspaceOrm,
    native.cache,
  );
  const content = new DeliveryContentService(
    contentSource,
    new DeliveryContentReadsService(contentSource),
  );
  return {
    workspace,
    close: native.close,
    call: (method, input, person = fixture.people.admin) =>
      content[method](
        workspace,
        person.memberId,
        person.userWorkspaceId,
        input,
        manager,
      ),
  };
}
module.exports = {
  storageRoot,
  directory,
  verifyMedia,
  generateMedia,
  details,
  roleMap,
  refreshRoleCache,
  services,
  quote,
};
