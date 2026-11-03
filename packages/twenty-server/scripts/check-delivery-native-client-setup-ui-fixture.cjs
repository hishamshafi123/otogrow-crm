const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { existsSync, lstatSync, readFileSync, unlinkSync } = require('node:fs');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const { execFileSync } = require('node:child_process');
const { createConnection } = require('node:net');
const {
  intentFor,
  companyNameFor,
  proofPath,
} = require('./native-company-ui-proof.cjs');
const protectedFixture = require('./check-delivery-assistants-ui-fixture.cjs');
const {
  WORKSPACE_ID,
  additions,
  exactIds,
  fingerprint,
  isAuthenticationLifecycleTable,
  locked,
  noNativeAutomation,
  operations,
  quote,
  readTables,
  syncDirectory,
  withoutHeartbeat,
} = protectedFixture;
const FILE = '/tmp/otogrow-native-client-setup-ui-fixture.json';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const OWNED_IDS = [
  'nonce',
  'companyId',
  'editorId',
  'editorUserId',
  'editorMembershipId',
];
const copy = (value) => JSON.parse(JSON.stringify(value));
const markerFor = (nonce) => `native-client-setup-ui:${nonce}`;
const titleFor = (nonce) =>
  `Disposable Native Client Setup ${nonce.slice(0, 8)}`;
const timestamp = (value, label) => {
  assert(
    value instanceof Date || typeof value === 'string',
    `${label} must be a database Date or serialized timestamp.`,
  );
  // Date.parse(Date) coerces through toString(), which discards milliseconds.
  const result = value instanceof Date ? value.getTime() : Date.parse(value);
  assert(Number.isFinite(result), `${label} must be a valid timestamp.`);
  return result;
};
const writeJournal = (value, destination = FILE, initial = false) =>
  protectedFixture.writeJournal(value, destination, initial);

function readJournal() {
  const metadata = lstatSync(FILE);
  assert(
    metadata.isFile() &&
      !metadata.isSymbolicLink() &&
      (metadata.mode & 0o077) === 0,
    'Keep the ownership journal private.',
  );
  const fixture = JSON.parse(readFileSync(FILE, 'utf8'));
  assert.equal(fixture.version, 1);
  assert.equal(fixture.workspaceId, WORKSPACE_ID);
  for (const key of OWNED_IDS) assert.match(fixture[key], UUID);
  assert.equal(fixture.marker, markerFor(fixture.nonce));
  assert.equal(fixture.title, titleFor(fixture.nonce));
  assert(
    ['CREATING', 'PREPARED', 'READY', 'CLEANUP_PREPARED', 'CLEANED'].includes(
      fixture.status,
    ),
  );
  assert(Array.isArray(fixture.cleanupAttempts));
  const intent = intentFor(fixture);
  if (fixture.uiCompanyId)
    assert.equal(
      fixture.uiCompanyId,
      intent?.input.id,
      'A company identity requires its original private precommit intent.',
    );
  fixture.uiCompanyId = intent?.input.id ?? null;
  assert(Array.isArray(fixture.validatedOwned ?? []));
  if (fixture.baseline) {
    quote(fixture.schema);
    for (const key of ['actorId', 'actorUserId', 'userWorkspaceId'])
      assert.match(fixture[key], UUID);
    assert.match(fixture.baseline.operations.id, UUID);
    assert.match(fixture.editorUserId, UUID);
    assert.match(fixture.baseline.operations.hash, HASH);
    for (const table of fixture.baseline.tables) {
      quote(table.schema);
      quote(table.name);
      assert(
        ['NATIVE', 'WORKSPACE', 'WORKSPACE_ROW', 'USERS'].includes(table.scope),
      );
      assert.match(table.hash, HASH);
      for (const row of table.rows) {
        assert.match(row.id, UUID);
        assert.match(row.hash, /^[a-f0-9]{32}$/);
      }
    }
  }
  return fixture;
}

const without = (value, keys) =>
  Object.fromEntries(
    Object.entries(value).filter(([key]) => !keys.includes(key)),
  );
const setupHash = fingerprint;
const fieldsFor = (fixture) => ({
  projectName: `${fixture.title} project`,
  planName: `${fixture.title} service plan`,
  scope: `${fixture.marker}: explicit synthetic SEO delivery scope`,
  taskTitle: `${fixture.title} first task`,
  taskBrief: `${fixture.marker}: synthetic first work`,
  uiCompanyName: `${fixture.title} native company`,
});
const timeOwned = (value, fixture, label) => {
  const time = timestamp(value, label);
  assert(
    time >= timestamp(fixture.createdAt, 'Fixture creation') &&
      time <= Date.now() + 5000,
    `${label} is outside the owned fixture window.`,
  );
};
async function row(manager, schema, name, id) {
  const rows = await manager.query(
    `SELECT * FROM ${quote(schema)}.${quote(name)} WHERE id=$1`,
    [id],
  );
  assert.equal(rows.length, 1, `Expected exact owned ${name}.`);
  return rows[0];
}
function removeOwnedClients(state, engagementIds, fixture) {
  const value = copy(state);
  assert(
    value.clients &&
      Array.isArray(value.clients.engagements) &&
      Array.isArray(value.clients.audit),
  );
  value.clients.engagements = value.clients.engagements.filter(
    (plan) => !engagementIds.includes(plan.id),
  );
  value.clients.audit = value.clients.audit.filter((event) => {
    if (!engagementIds.includes(event.targetId)) return true;
    assert.equal(event.actorId, fixture.actorId);
    assert.equal(event.action, 'engagement');
    timeOwned(event.at, fixture, 'Client setup audit');
    return false;
  });
  return value;
}
async function companyGeneration(manager, fixture) {
  return manager.query(
    `SELECT column_name AS name,generation_expression AS expression FROM information_schema.columns WHERE table_schema=$1 AND table_name='company' AND is_generated='ALWAYS' ORDER BY column_name`,
    [fixture.schema],
  );
}
function expectedTask(details, fixture) {
  assert.equal(details.state, 'PLANNED');
  assert.equal(details.brief, fieldsFor(fixture).taskBrief);
  assert.equal(details.service, 'SEO');
  assert.equal(details.priority, 'NORMAL');
  assert.equal(details.scheduledDate, null);
  assert.equal(details.reviewerId, fixture.actorId);
  assert.equal(details.blocker, '');
  assert.deepEqual(details.checklist, []);
  assert.deepEqual(details.evidence, []);
  assert.deepEqual(details.submissions, []);
  assert.equal(details.events.length, 1);
  const event = details.events[0];
  assert.match(event.id, UUID);
  assert.equal(event.actorId, fixture.actorId);
  assert.equal(event.action, 'CREATED');
  assert.equal(event.text, fieldsFor(fixture).taskTitle);
  timeOwned(event.at, fixture, 'Task creation event');
  timeOwned(details.assignmentAt, fixture, 'Task assignment');
  assert.deepEqual(
    Object.keys(details).sort(),
    [
      'assignmentAt',
      'brief',
      'service',
      'priority',
      'scheduledDate',
      'reviewerId',
      'state',
      'blocker',
      'checklist',
      'evidence',
      'submissions',
      'events',
    ].sort(),
  );
}
function docker(...arguments_) {
  return execFileSync('docker', arguments_, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  }).trim();
}
function containerFor(fixture) {
  let information;
  try {
    information = JSON.parse(
      docker('container', 'inspect', `otogrow-native-company-${fixture.nonce}`),
    )[0];
  } catch (error) {
    if (
      error.status === 1 &&
      String(error.stderr).includes('No such container')
    )
      return null;
    throw error;
  }
  assert.equal(information.Name, `/otogrow-native-company-${fixture.nonce}`);
  assert.equal(
    information.Config.Labels?.['otogrow.native-company-fixture'],
    fixture.nonce,
  );
  assert.equal(information.Image, fixture.redis.imageId);
  assert.equal(information.Config.Image, 'redis:7');
  assert.deepEqual(information.HostConfig.Tmpfs, {
    '/data': 'rw,noexec,nosuid,size=64m',
  });
  assert.equal(information.HostConfig.Binds?.length ?? 0, 0);
  assert.equal(information.HostConfig.Mounts?.length ?? 0, 0);
  // Docker versions differ in whether --tmpfs is also projected into Mounts.
  assert(information.Mounts.length <= 1);
  for (const mount of information.Mounts) {
    assert.equal(mount.Type, 'tmpfs');
    assert.equal(mount.Destination, '/data');
  }
  if (fixture.redis.containerId)
    assert.equal(information.Id, fixture.redis.containerId);
  return information;
}
function redisCommand(fixture, ...arguments_) {
  return docker(
    'exec',
    fixture.redis.containerName,
    'redis-cli',
    '--json',
    ...arguments_,
  );
}
function ensureRedis(fixture) {
  const image = JSON.parse(docker('image', 'inspect', 'redis:7'))[0];
  fixture.redis = {
    phase: 'PLANNED',
    imageId: image.Id,
    containerName: `otogrow-native-company-${fixture.nonce}`,
  };
  writeJournal(fixture);
  assert.equal(
    containerFor(fixture),
    null,
    'An active container must be recovered using its existing journal.',
  );
  docker(
    'run',
    '--detach',
    '--pull=never',
    '--name',
    fixture.redis.containerName,
    '--label',
    `otogrow.native-company-fixture=${fixture.nonce}`,
    '--publish',
    '127.0.0.1::6379',
    '--memory',
    '128m',
    '--tmpfs',
    '/data:rw,noexec,nosuid,size=64m',
    '--no-healthcheck',
    'redis:7',
    'redis-server',
    '--save',
    '',
    '--appendonly',
    'no',
    '--maxmemory',
    '64mb',
    '--maxmemory-policy',
    'noeviction',
  );
  if (
    process.env.OTOGROW_NATIVE_CLIENT_SETUP_TEST_FAILURE ===
    'redis-after-create'
  )
    throw new Error('Injected Redis creation interruption');
  const information = containerFor(fixture);
  assert.equal(information.State.Running, true);
  const ports = information.NetworkSettings.Ports['6379/tcp'];
  assert.equal(ports.length, 1);
  assert.equal(ports[0].HostIp, '127.0.0.1');
  assert(/^\d+$/.test(ports[0].HostPort));
  fixture.redis.containerId = information.Id;
  fixture.redis.url = `redis://127.0.0.1:${ports[0].HostPort}/0`;
  fixture.redis.phase = 'READY';
  assert.equal(JSON.parse(redisCommand(fixture, 'PING')), 'PONG');
  assert.equal(
    JSON.parse(redisCommand(fixture, 'DBSIZE')),
    0,
    'The dedicated Redis must start empty.',
  );
  writeJournal(fixture);
}
function inspectRedis(fixture, cleanup = false) {
  if (!fixture.redis) {
    assert.equal(fixture.status, 'CREATING');
    return;
  }
  const information = containerFor(fixture);
  if (!information) {
    assert(
      cleanup &&
        (['REMOVE_PREPARED', 'REMOVED'].includes(fixture.redis.phase) ||
          (fixture.status === 'CREATING' && fixture.redis.phase === 'PLANNED')),
      'A missing Redis without an owned removal record requires manual review.',
    );
    return;
  }
  assert.equal(
    information.State.Running,
    true,
    'The owned Redis must remain available for job inspection.',
  );
  const clients = redisCommand(fixture, 'CLIENT', 'LIST');
  assert.equal(typeof clients, 'string');
  assert(
    !/cmd=(?:bzpopmin|brpoplpush|blmove|brpop|blpop)(?: |$)/m.test(clients),
    'A worker consumed or is waiting on the isolated queue; preserve the fixture.',
  );
  let cursor = '0',
    keys = [],
    iterations = 0;
  do {
    const page = JSON.parse(
      redisCommand(fixture, 'SCAN', cursor, 'COUNT', '1000'),
    );
    cursor = page[0];
    keys.push(...page[1]);
    assert(
      ++iterations <= 100 && keys.length <= 10000,
      'Unexpected dedicated queue size; preserve it.',
    );
  } while (cursor !== '0');
  keys = [...new Set(keys)].sort();
  for (const key of keys) {
    assert.equal(typeof key, 'string');
    assert(key.length < 1024 && !/[\r\n]/.test(key));
    if (/(?:active|completed|failed)$/.test(key)) {
      const type = JSON.parse(redisCommand(fixture, 'TYPE', key));
      assert(['list', 'zset'].includes(type), 'Unexpected queue state type.');
      assert.equal(
        JSON.parse(
          redisCommand(fixture, type === 'list' ? 'LLEN' : 'ZCARD', key),
        ),
        0,
        'A job was processed; preserve all evidence instead of cleaning it.',
      );
    }
    if (key.endsWith(':events')) {
      const events = JSON.parse(
        redisCommand(fixture, 'XRANGE', key, '-', '+', 'COUNT', '10000'),
      );
      assert(events.length < 10000, 'Retained stream coverage is incomplete.');
      for (const [, fields] of events) {
        const eventIndex = fields.indexOf('event'),
          event = fields[eventIndex + 1];
        assert(
          ![
            'active',
            'completed',
            'failed',
            'progress',
            'stalled',
            'drained',
          ].includes(event),
          'A worker lifecycle event exists; preserve the fixture.',
        );
      }
    }
  }
  fixture.redis.lastObservation = {
    at: new Date().toISOString(),
    keyCount: keys.length,
    keyNamesHash: fingerprint(keys),
    noObservedExecution: true,
  };
}
async function assertApiStopped() {
  const url = new URL(
    process.env.OTOGROW_NATIVE_CLIENT_SETUP_API_URL ?? process.env.SERVER_URL,
  );
  assert(
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.hostname.endsWith('.localhost'),
    'The API shutdown check requires an explicit loopback-only URL.',
  );
  const port = Number(url.port || 80);
  for (const host of ['127.0.0.1', '::1'])
    await new Promise((resolve, reject) => {
      const socket = createConnection({ host, port });
      socket.setTimeout(2000);
      socket.once('connect', () => {
        socket.destroy();
        reject(new Error('Stop the temporary API before cleanup.'));
      });
      socket.once('timeout', () => {
        socket.destroy();
        reject(new Error('API shutdown could not be verified.'));
      });
      socket.once('error', (error) => {
        socket.destroy();
        if (error.code === 'ECONNREFUSED') resolve();
        else reject(error);
      });
    });
}
function removeRedis(fixture) {
  if (!fixture.redis) return;
  const information = containerFor(fixture);
  if (!information) {
    assert(
      ['REMOVE_PREPARED', 'REMOVED'].includes(fixture.redis.phase) ||
        (fixture.status === 'CREATING' && fixture.redis.phase === 'PLANNED'),
    );
    fixture.redis.phase = 'REMOVED';
    writeJournal(fixture);
    return;
  }
  inspectRedis(fixture, true);
  fixture.redis.phase = 'REMOVE_PREPARED';
  writeJournal(fixture);
  if (
    process.env.OTOGROW_NATIVE_CLIENT_SETUP_TEST_FAILURE ===
    'redis-before-remove'
  )
    throw new Error('Injected Redis removal interruption');
  docker('container', 'rm', '--force', fixture.redis.containerName);
  if (
    process.env.OTOGROW_NATIVE_CLIENT_SETUP_TEST_FAILURE ===
    'redis-after-remove'
  )
    throw new Error('Injected Redis post-removal interruption');
  fixture.redis.phase = 'REMOVED';
  writeJournal(fixture);
}
function startupEnvironment(fixture) {
  const {
    MessageQueue,
  } = require('../dist/engine/core-modules/message-queue/message-queue.constants');
  return {
    REDIS_QUEUE_URL: fixture.redis.url,
    WORKER_EXCLUDED_QUEUES: Object.values(MessageQueue).sort().join(','),
    OTOGROW_NATIVE_COMPANY_OBSERVER: 'observe-precommit',
    observerPreload:
      require.resolve('./check-delivery-native-company-http-observer.cjs'),
    instruction:
      'Keep the original REDIS_URL cache connection. Stop the normal API, append this preload after environment loading, start only the temporary API on the existing local port, and never start a worker. Stop that API before cleanup; restore the normal environment only afterwards.',
  };
}
async function validateNativeCompany(manager, fixture) {
  const intent = intentFor(fixture);
  assert(intent);
  assert.equal(intent.input.id, fixture.uiCompanyId);
  const native = await row(
    manager,
    fixture.schema,
    'company',
    fixture.uiCompanyId,
  );
  assert.equal(native.id, intent.input.id);
  assert.equal(native.name, companyNameFor(fixture));
  assert.equal(native.deletedAt, null);
  for (const prefix of ['createdBy', 'updatedBy']) {
    assert.equal(native[`${prefix}Source`], 'MANUAL');
    assert.equal(native[`${prefix}WorkspaceMemberId`], fixture.actorId);
    assert.equal(native[`${prefix}Name`], fixture.nativeActorName);
    assert.deepEqual(native[`${prefix}Context`], {});
  }
  for (const key of ['createdAt', 'updatedAt']) {
    timeOwned(native[key], fixture, `Native company ${key}`);
    assert(
      timestamp(native[key], key) >= Date.parse(intent.observedAt),
      'An earlier row cannot be adopted by an untrusted later intent.',
    );
  }
  assert.equal(native.position, fixture.nativeCompanyPosition);
  const generated = fixture.companyGeneration.map((column) => column.name);
  const dynamic = [
    'id',
    'name',
    'position',
    'createdAt',
    'updatedAt',
    ...generated,
    ...['createdBy', 'updatedBy'].flatMap((prefix) =>
      ['Source', 'WorkspaceMemberId', 'Name', 'Context'].map(
        (suffix) => `${prefix}${suffix}`,
      ),
    ),
  ];
  assert.deepEqual(
    without(native, dynamic),
    without(fixture.companySeed, dynamic),
    'Only explicit company inputs, native actor/time/position and unchanged generated fields may differ from database defaults.',
  );
  for (const column of fixture.companyGeneration) {
    const [expected] = await manager.query(
      `SELECT ${column.expression} AS value FROM ${quote(fixture.schema)}.company WHERE id=$1`,
      [native.id],
    );
    assert.deepEqual(
      native[column.name],
      expected.value,
      'Generated company fields must match the unchanged database expression.',
    );
  }
  return native;
}

async function validate(manager, fixture) {
  await noNativeAutomation(manager, fixture);
  assert.deepEqual(
    await companyGeneration(manager, fixture),
    fixture.companyGeneration,
    'Native generated-column definitions changed during acceptance.',
  );
  const tables = await readTables(manager, fixture),
    extra = additions(tables, fixture),
    state = await operations(manager);
  assert.equal(state.id, fixture.baseline.operations.id);
  const extras = (schema, name) =>
    extra.find((table) => table.schema === schema && table.name === name).rows;
  const fixed = [
    ['core', 'user', fixture.editorUserId],
    ['core', 'userWorkspace', fixture.editorMembershipId],
    [fixture.schema, 'workspaceMember', fixture.editorId],
    [fixture.schema, 'company', fixture.companyId],
  ];
  const hasSeed = extras('core', 'user').some(
    (item) => item.id === fixture.editorUserId,
  );
  for (const [schema, name, id] of fixed) {
    assert.equal(
      extras(schema, name).some((item) => item.id === id),
      hasSeed,
      'Partial committed seed cannot be cleaned automatically.',
    );
    if (hasSeed)
      assert.equal(
        fingerprint(await row(manager, schema, name, id)),
        fixture.seed[`${schema}.${name}:${id}`],
        `Owned seed ${name} is immutable.`,
      );
  }
  const receipts = extras('core', 'deliveryClientSetup').length
    ? await manager.query(
        'SELECT * FROM core."deliveryClientSetup" WHERE "workspaceId"=$1 AND id=ANY($2::uuid[]) ORDER BY "createdAt",id',
        [
          WORKSPACE_ID,
          extras('core', 'deliveryClientSetup').map((item) => item.id),
        ],
      )
    : [];
  assert(
    receipts.length <= 2,
    'At most two explicitly reviewed setup requests belong to this fixture.',
  );
  const primary = receipts.filter(
    (receipt) => !receipt.reusedProject && !receipt.reusedEngagement,
  );
  assert(
    primary.length <= 1,
    'Only one new project/service-plan pair is owned.',
  );
  if (receipts.length)
    assert.equal(
      primary.length,
      1,
      'A reuse receipt requires its exact original setup receipt.',
    );
  const projectIds = primary.map((receipt) => receipt.projectId),
    engagementIds = primary.map((receipt) => receipt.engagementId),
    taskIds = primary.map((receipt) => receipt.taskId);
  assert(
    taskIds.every((id) => typeof id === 'string' && UUID.test(id)),
    'The primary fixture setup must create its explicit first task.',
  );
  const ownedCompanies = [
    fixture.companyId,
    ...(fixture.uiCompanyId ? [fixture.uiCompanyId] : []),
  ];
  const uiCompanies = extras(fixture.schema, 'company').filter(
    (item) => item.id !== fixture.companyId,
  );
  assert(
    uiCompanies.length <= 1,
    'At most one prejournalled native company is owned.',
  );
  if (uiCompanies.length) {
    assert.equal(
      uiCompanies[0].id,
      fixture.uiCompanyId,
      'Unidentified company writes are never adopted.',
    );
    await validateNativeCompany(manager, fixture);
  }
  const plans =
    state.state.clients?.engagements.filter((plan) =>
      engagementIds.includes(plan.id),
    ) ?? [];
  assert.equal(plans.length, engagementIds.length);
  for (const plan of plans) {
    assert.equal(plan.name, fieldsFor(fixture).planName);
    assert.equal(plan.projectId, projectIds[0]);
    assert(ownedCompanies.includes(plan.companyId));
    assert.equal(plan.revision, 1);
    assert.deepEqual(plan.services, ['SEO']);
    assert.equal(plan.billing, 'RETAINER');
    assert.equal(plan.scope, fieldsFor(fixture).scope);
    assert.equal(plan.allowance, '');
    assert.equal(plan.contact, '');
    assert.equal(plan.advertising, null);
    assert.deepEqual(plan.submissions, []);
    assert.deepEqual(plan.assets, []);
    assert.equal(plan.fields.length, 3);
    assert.equal(new Set(plan.fields.map((field) => field.id)).size, 3);
    assert.deepEqual(
      plan.fields.map((field) => field.label),
      [
        'Website link',
        'Logo and brand guideline links',
        'Brand goals and notes',
      ],
    );
    for (const field of plan.fields) {
      assert.match(field.id, UUID);
      assert.equal(field.required, true);
      assert.deepEqual(Object.keys(field).sort(), ['id', 'label', 'required']);
    }
    assert.deepEqual(
      Object.keys(plan).sort(),
      [
        'id',
        'revision',
        'projectId',
        'companyId',
        'name',
        'services',
        'billing',
        'scope',
        'allowance',
        'contact',
        'fields',
        'advertising',
        'submissions',
        'assets',
      ].sort(),
    );
  }
  const audit =
    state.state.clients?.audit.filter((event) =>
      engagementIds.includes(event.targetId),
    ) ?? [];
  assert.equal(
    audit.length,
    plans.length,
    'Exactly one existing Clients audit event belongs to the new service plan.',
  );
  const protectedOperations = removeOwnedClients(
    state.state,
    engagementIds,
    fixture,
  );
  assert.equal(
    fingerprint(withoutHeartbeat(protectedOperations)),
    fixture.baseline.operations.hash,
    'Only the exact owned engagement and its one attributed audit may differ; routing, notices, Seen state, bots and all other Operations data stay protected.',
  );
  const projects = projectIds.length
    ? await manager.query(
        'SELECT * FROM core."deliveryProject" WHERE "workspaceId"=$1 AND id=ANY($2::uuid[])',
        [WORKSPACE_ID, projectIds],
      )
    : [];
  const tasks = taskIds.length
    ? await manager.query(
        'SELECT * FROM core."deliveryTask" WHERE "workspaceId"=$1 AND "taskId"=ANY($2::uuid[])',
        [WORKSPACE_ID, taskIds],
      )
    : [];
  assert.equal(projects.length, projectIds.length);
  assert.equal(tasks.length, taskIds.length);
  for (const project of projects) {
    assert.equal(project.name, fieldsFor(fixture).projectName);
    assert.equal(project.revision, 1);
    assert.deepEqual(
      project.memberIds,
      [fixture.editorId, fixture.actorId].sort(),
    );
    assert.equal(project.companyId, primary[0].companyId);
    timeOwned(project.createdAt, fixture, 'Project creation');
  }
  for (const task of tasks) {
    assert.equal(task.projectId, projectIds[0]);
    assert.equal(task.revision, 1);
    expectedTask(task.details, fixture);
    for (const key of ['createdAt', 'updatedAt'])
      timeOwned(task[key], fixture, `Delivery task ${key}`);
    const native = await row(manager, fixture.schema, 'task', task.taskId);
    assert.equal(native.title, fieldsFor(fixture).taskTitle);
    assert.equal(native.assigneeId, fixture.editorId);
    assert.equal(native.status, 'TODO');
    assert.equal(native.dueAt, null);
    assert.equal(native.deletedAt, null);
    for (const key of ['createdAt', 'updatedAt'])
      timeOwned(native[key], fixture, `Native task ${key}`);
  }
  for (const receipt of receipts) {
    assert.equal(receipt.actorId, fixture.actorId);
    assert.equal(receipt.userWorkspaceId, fixture.userWorkspaceId);
    assert(ownedCompanies.includes(receipt.companyId));
    assert.equal(receipt.projectId, projectIds[0]);
    assert.equal(receipt.engagementId, engagementIds[0]);
    assert.equal(receipt.workspaceId, WORKSPACE_ID);
    assert.match(receipt.requestId, UUID);
    assert.match(receipt.requestHash, HASH);
    timeOwned(receipt.createdAt, fixture, 'Setup receipt');
    const company = await row(
      manager,
      fixture.schema,
      'company',
      receipt.companyId,
    );
    const companySource = {
      id: company.id,
      name: company.name ?? '',
      updatedAt: new Date(company.updatedAt).toISOString(),
    };
    assert.deepEqual(receipt.source, {
      companyName: company.name,
      companySourceToken: setupHash(companySource),
      projectRevision: receipt.reusedProject ? 1 : null,
      engagementRevision: receipt.reusedEngagement ? 1 : null,
    });
    if (receipt !== primary[0]) {
      assert.equal(receipt.reusedProject, true);
      assert.equal(receipt.reusedEngagement, true);
      assert.equal(receipt.taskId, null);
      assert.equal(receipt.companyId, primary[0].companyId);
    }
    const plan = plans[0];
    const command = {
      requestId: receipt.requestId,
      companyId: receipt.companyId,
      companySourceToken: receipt.source.companySourceToken,
      projectId: receipt.reusedProject ? receipt.projectId : null,
      projectRevision: receipt.source.projectRevision,
      projectName: receipt.reusedProject
        ? null
        : fieldsFor(fixture).projectName,
      memberIds: receipt.reusedProject
        ? []
        : [fixture.editorId, fixture.actorId].sort(),
      engagementId: receipt.reusedEngagement ? receipt.engagementId : null,
      engagementRevision: receipt.source.engagementRevision,
      plan: receipt.reusedEngagement
        ? null
        : {
            name: plan.name,
            services: plan.services,
            billing: plan.billing,
            scope: plan.scope,
            allowance: plan.allowance,
            contact: plan.contact,
            fields: plan.fields,
            advertising: plan.advertising,
          },
      firstTask: receipt.taskId
        ? {
            title: fieldsFor(fixture).taskTitle,
            brief: fieldsFor(fixture).taskBrief,
            service: 'SEO',
            assigneeId: fixture.editorId,
            reviewerId: fixture.actorId,
            priority: 'NORMAL',
            scheduledDate: null,
            dueAt: null,
            checklist: [],
            evidence: [],
          }
        : null,
    };
    assert.equal(
      receipt.requestHash,
      setupHash(command),
      'Receipt hash must reconstruct the complete exact permitted UI command.',
    );
  }
  const activityIds = extras('core', 'otogrowActivityEvent').map(
    (item) => item.id,
  );
  const activity = activityIds.length
    ? await manager.query(
        'SELECT * FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND id=ANY($2::uuid[]) ORDER BY "occurredAt",id',
        [WORKSPACE_ID, activityIds],
      )
    : [];
  assert.equal(
    activity.length,
    primary.length * 3 + receipts.length,
    'Only exact project, plan, task and per-request setup activity is owned.',
  );
  const actions = {
    PROJECT_CREATED: 'project',
    CLIENT_ENGAGEMENT_CREATED: 'client-engagement',
    TASK_CREATED: 'task',
    CLIENT_SETUP_CREATED: 'client-engagement',
  };
  for (const event of activity) {
    assert(Object.hasOwn(actions, event.action));
    assert.equal(event.sourceType, actions[event.action]);
    assert.equal(event.actorId, fixture.actorId);
    assert.equal(event.actorName, fixture.actorName);
    assert.equal(event.actorType, 'HUMAN');
    assert.equal(event.outcome, 'RECORDED');
    assert.equal(event.workspaceId, WORKSPACE_ID);
    assert.equal(event.projectId, projectIds[0]);
    assert.equal(event.clientId, primary[0].companyId);
    assert.equal(
      event.sourceId,
      event.action === 'PROJECT_CREATED'
        ? projectIds[0]
        : event.action === 'TASK_CREATED'
          ? taskIds[0]
          : engagementIds[0],
    );
    if (event.action === 'TASK_CREATED') {
      assert.equal(event.taskId, taskIds[0]);
      assert.equal(event.subjectMemberId, fixture.editorId);
    } else if (event.action === 'CLIENT_SETUP_CREATED')
      assert(event.taskId === null || event.taskId === taskIds[0]);
    else {
      assert.equal(event.taskId, null);
      assert.equal(event.subjectMemberId, null);
    }
    for (const key of ['occurredAt', 'recordedAt'])
      timeOwned(event[key], fixture, `Activity ${key}`);
  }
  for (const action of [
    'PROJECT_CREATED',
    'CLIENT_ENGAGEMENT_CREATED',
    'TASK_CREATED',
  ])
    assert.equal(
      activity.filter((event) => event.action === action).length,
      primary.length,
    );
  assert.equal(
    activity.filter((event) => event.action === 'CLIENT_SETUP_CREATED').length,
    receipts.length,
  );
  const permitted = new Map([
    [`core.user`, hasSeed ? [fixture.editorUserId] : []],
    [`core.userWorkspace`, hasSeed ? [fixture.editorMembershipId] : []],
    [`${fixture.schema}.workspaceMember`, hasSeed ? [fixture.editorId] : []],
    [
      `${fixture.schema}.company`,
      [
        ...(hasSeed ? [fixture.companyId] : []),
        ...uiCompanies.map((item) => item.id),
      ],
    ],
    [`core.deliveryProject`, projectIds],
    [`core.deliveryTask`, tasks.map((task) => task.id)],
    [`${fixture.schema}.task`, taskIds],
    [`core.deliveryClientSetup`, receipts.map((receipt) => receipt.id)],
    [`core.otogrowActivityEvent`, activityIds],
  ]);
  for (const table of extra)
    exactIds(
      table.rows,
      permitted.get(`${table.schema}.${table.name}`) ?? [],
      `Unexpected ${table.schema}.${table.name}: native audit/timeline/outbox and all unidentified mutations remain protected.`,
    );
  if (!hasSeed) {
    assert.equal(receipts.length, 0);
    assert.equal(uiCompanies.length, 0);
  }
  const observed = extra.flatMap((table) =>
    table.rows.map((item) => ({
      schema: table.schema,
      name: table.name,
      id: item.id,
      hash: item.hash,
    })),
  );
  for (const prior of fixture.validatedOwned ?? []) {
    const present = observed.find(
      (item) =>
        item.schema === prior.schema &&
        item.name === prior.name &&
        item.id === prior.id,
    );
    if (hasSeed)
      assert.equal(
        present?.hash,
        prior.hash,
        `Previously validated owned ${prior.name} changed.`,
      );
  }
  return {
    tables,
    extra,
    hasSeed,
    receipts,
    projects,
    tasks,
    engagementIds,
    activity,
    protectedOperations,
    observed,
  };
}

function printFixture(fixture) {
  console.log(
    JSON.stringify(
      {
        journal: FILE,
        status: fixture.status,
        marker: fixture.marker,
        actorId: fixture.actorId,
        editorId: fixture.editorId,
        editorLabel: `Synthetic setup editor ${fixture.nonce.slice(0, 8)}`,
        existingCompanyId: fixture.companyId,
        existingCompanyName: fixture.title,
        nativeCompanyCommitAllowed: true,
        precommitIntent: proofPath(fixture),
        isolatedRedis: fixture.redis,
        startupEnvironment: startupEnvironment(fixture),
        fields: fieldsFor(fixture),
        url: 'http://apple.localhost:3001/delivery?view=onboarding',
      },
      null,
      2,
    ),
  );
  console.log(
    'Allowed journey: start the temporary API only with the printed dedicated queue URL, all queues excluded and read-only observer. Create exactly ONE company with fields.uiCompanyName through guided setup; use that exact saved company to make ONE project, ONE SEO/RETAINER service plan and ONE first task owned by the synthetic editor/reviewed by the existing administrator. Optional same-plan/project reuse with no task. No Seen/progress/fulfilment, invites, role/grant/settings/bot/provider/message/payment changes. Stop the temporary API before cleanup; never start a worker or point another process at the isolated Redis. Unidentified rows stop cleanup.',
  );
}
async function createFixture() {
  assert(!existsSync(FILE), 'Recover the active client setup fixture first.');
  const fixture = {
    version: 1,
    status: 'CREATING',
    workspaceId: WORKSPACE_ID,
    ...Object.fromEntries(OWNED_IDS.map((key) => [key, randomUUID()])),
    createdAt: new Date().toISOString(),
    baseline: null,
    seed: {},
    validatedOwned: [],
    cleanupAttempts: [],
  };
  fixture.marker = markerFor(fixture.nonce);
  fixture.title = titleFor(fixture.nonce);
  writeJournal(fixture, FILE, true);
  ensureRedis(fixture);
  await connectionSource.transaction(async (manager) => {
    await locked(manager);
    const [workspace] = await manager.query(
      'SELECT "databaseSchema","activationStatus" FROM core.workspace WHERE id=$1',
      [WORKSPACE_ID],
    );
    assert.equal(workspace?.activationStatus, 'ACTIVE');
    fixture.schema = workspace.databaseSchema;
    quote(fixture.schema);
    const admins = await manager.query(
      `SELECT DISTINCT member.id AS "memberId",member."userId",membership.id AS "userWorkspaceId",trim(concat_ws(' ',member."nameFirstName",member."nameLastName")) AS name FROM ${quote(fixture.schema)}."workspaceMember" member JOIN core."userWorkspace" membership ON membership."userId"=member."userId" AND membership."workspaceId"=$1 JOIN core."user" account ON account.id=membership."userId" JOIN core."roleTarget" target ON target."userWorkspaceId"=membership.id AND target."workspaceId"=$1 JOIN core.role role ON role.id=target."roleId" AND role."workspaceId"=$1 WHERE member."deletedAt" IS NULL AND membership."deletedAt" IS NULL AND account."deletedAt" IS NULL AND account.disabled=false AND role."canUpdateAllSettings"=true ORDER BY member.id`,
      [WORKSPACE_ID],
    );
    assert.equal(
      admins.length,
      1,
      'Use the current single admin; never grant real access.',
    );
    fixture.actorId = admins[0].memberId;
    fixture.actorUserId = admins[0].userId;
    fixture.userWorkspaceId = admins[0].userWorkspaceId;
    fixture.actorName = admins[0].name;
    const nativeActor = await row(
      manager,
      fixture.schema,
      'workspaceMember',
      fixture.actorId,
    );
    assert.equal(typeof nativeActor.nameFirstName, 'string');
    assert.equal(typeof nativeActor.nameLastName, 'string');
    fixture.nativeActorName = `${nativeActor.nameFirstName} ${nativeActor.nameLastName}`;
    const currentOperations = await operations(manager);
    await noNativeAutomation(manager, fixture);
    fixture.companyGeneration = await companyGeneration(manager, fixture);
    const collisions = await manager.query(
      `SELECT id FROM ${quote(fixture.schema)}.company WHERE name LIKE 'Disposable Native Client Setup %' LIMIT 1`,
    );
    assert.equal(
      collisions.length,
      0,
      'Recover an earlier client setup fixture first.',
    );
    fixture.baseline = {
      tables: await readTables(manager, fixture),
      operations: {
        id: currentOperations.id,
        hash: fingerprint(withoutHeartbeat(currentOperations.state)),
      },
    };
    fixture.status = 'PREPARED';
    writeJournal(fixture);
    await manager.query('INSERT INTO core."user" (id,email) VALUES($1,$2)', [
      fixture.editorUserId,
      `${fixture.editorUserId}+client-setup@example.invalid`,
    ]);
    await manager.query(
      'INSERT INTO core."userWorkspace" (id,"userId","workspaceId") VALUES($1,$2,$3)',
      [fixture.editorMembershipId, fixture.editorUserId, WORKSPACE_ID],
    );
    await manager.query(
      `INSERT INTO ${quote(fixture.schema)}."workspaceMember" (id,"userId","nameFirstName","nameLastName") VALUES($1,$2,'Synthetic setup editor',$3)`,
      [fixture.editorId, fixture.editorUserId, fixture.nonce.slice(0, 8)],
    );
    await manager.query(
      `INSERT INTO ${quote(fixture.schema)}.company (id,name) VALUES($1,$2)`,
      [fixture.companyId, fixture.title],
    );
    for (const [schema, name, id] of [
      ['core', 'user', fixture.editorUserId],
      ['core', 'userWorkspace', fixture.editorMembershipId],
      [fixture.schema, 'workspaceMember', fixture.editorId],
      [fixture.schema, 'company', fixture.companyId],
    ])
      fixture.seed[`${schema}.${name}:${id}`] = fingerprint(
        await row(manager, schema, name, id),
      );
    fixture.companySeed = await row(
      manager,
      fixture.schema,
      'company',
      fixture.companyId,
    );
    const [position] = await manager.query(
      `SELECT min(position) AS minimum FROM ${quote(fixture.schema)}.company WHERE \"deletedAt\" IS NULL`,
    );
    fixture.nativeCompanyPosition = (position.minimum ?? 1) - 1;
    writeJournal(fixture);
    await validate(manager, fixture);
    if (
      process.env.OTOGROW_NATIVE_CLIENT_SETUP_TEST_FAILURE ===
      'create-before-commit'
    )
      throw new Error('Injected client setup fixture before commit');
  });
  if (
    process.env.OTOGROW_NATIVE_CLIENT_SETUP_TEST_FAILURE ===
    'create-after-commit'
  )
    throw new Error('Injected client setup fixture after commit');
  fixture.status = 'READY';
  writeJournal(fixture);
  printFixture(fixture);
}
async function inspectFixture() {
  const fixture = readJournal();
  inspectRedis(fixture);
  assert(fixture.baseline, 'No baseline was prepared; use cleanup recovery.');
  const observation = await connectionSource.transaction(async (manager) => {
    await locked(manager);
    return validate(manager, fixture);
  });
  fixture.validatedOwned = observation.observed;
  if (observation.hasSeed && fixture.status === 'PREPARED') {
    fixture.status = 'READY';
    fixture.recoveredAfterCreateCommit = true;
  }
  fixture.inspection = {
    observedAt: new Date().toISOString(),
    receiptIds: observation.receipts.map((receipt) => receipt.id),
    requestIds: observation.receipts.map((receipt) => receipt.requestId),
    projectIds: observation.projects.map((project) => project.id),
    taskIds: observation.tasks.map((task) => task.taskId),
  };
  writeJournal(fixture);
  printFixture(fixture);
  console.log('Protected owned-state inspection passed.');
}
async function cleanupFixture() {
  const fixture = readJournal();
  await assertApiStopped();
  inspectRedis(fixture, true);
  await connectionSource.transaction(async (manager) => {
    await locked(manager, true);
    if (!fixture.baseline) {
      for (const [schema, name, id] of [
        ['core', 'user', fixture.editorUserId],
        ['core', 'userWorkspace', fixture.editorMembershipId],
        ...(fixture.schema
          ? [
              [fixture.schema, 'workspaceMember', fixture.editorId],
              [fixture.schema, 'company', fixture.companyId],
            ]
          : []),
      ])
        assert.equal(
          (
            await manager.query(
              `SELECT count(*)::int AS count FROM ${quote(schema)}.${quote(name)} WHERE id=$1`,
              [id],
            )
          )[0].count,
          0,
          'An unjournaled owned seed exists; preserve the journal.',
        );
      fixture.noCommittedSeed = true;
      return;
    }
    const observation = await validate(manager, fixture),
      authentication = observation.tables.filter(
        isAuthenticationLifecycleTable,
      );
    if (observation.hasSeed) {
      assert(fixture.cleanupAttempts.length < 20);
      fixture.cleanupAttempts.push({
        preparedAt: new Date().toISOString(),
        rows: observation.extra
          .filter((table) => table.rows.length)
          .map(({ schema, name, rows }) => ({ schema, name, rows })),
        engagementIds: observation.engagementIds,
        authenticationLifecycle: authentication,
      });
      fixture.status = 'CLEANUP_PREPARED';
      writeJournal(fixture);
      if (observation.engagementIds.length) {
        const restored = await manager.query(
          'WITH restored AS (UPDATE core."deliveryOperations" SET state=$3 WHERE id=$1 AND "workspaceId"=$2 RETURNING id) SELECT id FROM restored',
          [
            fixture.baseline.operations.id,
            WORKSPACE_ID,
            observation.protectedOperations,
          ],
        );
        assert.equal(restored.length, 1);
      }
      for (const [schema, name] of [
        ['core', 'otogrowActivityEvent'],
        ['core', 'deliveryClientSetup'],
        ['core', 'deliveryTask'],
        [fixture.schema, 'task'],
        ['core', 'deliveryProject'],
        [fixture.schema, 'company'],
        [fixture.schema, 'workspaceMember'],
        ['core', 'userWorkspace'],
        ['core', 'user'],
      ]) {
        const ids = observation.extra
          .find((table) => table.schema === schema && table.name === name)
          .rows.map((item) => item.id);
        if (!ids.length) continue;
        const removed = await manager.query(
          `WITH removed AS (DELETE FROM ${quote(schema)}.${quote(name)} WHERE id=ANY($1::uuid[]) RETURNING id) SELECT id FROM removed`,
          [ids],
        );
        exactIds(removed, ids, `Remove only exact validated ${name} rows.`);
      }
    } else {
      fixture.cleanupRecoveredAfterCommit = fixture.cleanupAttempts.length > 0;
      fixture.noCommittedSeed = fixture.cleanupAttempts.length === 0;
    }
    const after = await readTables(manager, fixture);
    for (let index = 0; index < after.length; index++)
      assert.equal(
        after[index].hash,
        isAuthenticationLifecycleTable(after[index])
          ? authentication.find((table) => table.name === after[index].name)
              .hash
          : fixture.baseline.tables[index].hash,
        `Protected ${after[index].schema}.${after[index].name} changed during cleanup.`,
      );
    assert.equal(
      fingerprint(withoutHeartbeat((await operations(manager)).state)),
      fixture.baseline.operations.hash,
    );
    fixture.recoveryAuthenticationLifecycle = authentication.map((table) => ({
      table: table.name,
      originalHash: fixture.baseline.tables.find(
        (item) => item.schema === table.schema && item.name === table.name,
      ).hash,
      beforeHash: table.hash,
      afterHash: after.find(
        (item) => item.schema === table.schema && item.name === table.name,
      ).hash,
    }));
    writeJournal(fixture);
    if (
      process.env.OTOGROW_NATIVE_CLIENT_SETUP_TEST_FAILURE ===
      'cleanup-before-commit'
    )
      throw new Error('Injected client setup cleanup before commit');
  });
  if (
    process.env.OTOGROW_NATIVE_CLIENT_SETUP_TEST_FAILURE ===
    'cleanup-after-commit'
  )
    throw new Error('Injected client setup cleanup after commit');
  removeRedis(fixture);
  fixture.status = 'CLEANED';
  writeJournal(fixture);
  const receipt = `${FILE}.${fixture.nonce}.cleaned.json`;
  if (existsSync(receipt))
    assert.equal(
      fingerprint(JSON.parse(readFileSync(receipt, 'utf8'))),
      fingerprint(fixture),
    );
  else writeJournal(fixture, receipt, true);
  unlinkSync(FILE);
  syncDirectory(FILE);
  console.log(
    `Removed only exact owned company/editor/setup/project/plan/task/receipt/activity rows. All original core/native/financial/access/transport/routing/Operations data and locked current login lifecycle were preserved. The exact prejournalled native company was removed only after persisted actor/default verification. Its nonce-owned Redis container was removed after the temporary API stopped; main queues and all native audit/timeline/outbox remain protected. Private receipt: ${receipt}`,
  );
}
async function main() {
  const command = process.argv[2];
  assert(['create', 'inspect', 'cleanup'].includes(command));
  assert.equal(process.argv.length, 3);
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
    'Local database only.',
  );
  await connectionSource.initialize();
  try {
    if (command === 'create') await createFixture();
    else if (command === 'inspect') await inspectFixture();
    else await cleanupFixture();
  } finally {
    await connectionSource.destroy();
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    console.error(`Preserve ${FILE}; no unverified cleanup is permitted.`);
    process.exitCode = 1;
  });
