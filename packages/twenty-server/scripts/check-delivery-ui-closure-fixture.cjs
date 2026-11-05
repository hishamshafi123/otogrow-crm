const assert = require('node:assert/strict');
const {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  unlinkSync,
} = require('node:fs');
const { createConnection } = require('node:net');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  recurrenceSchema,
} = require('../dist/modules/delivery/operations/delivery-operations.types');
const {
  engagementSchema,
} = require('../dist/modules/delivery/clients/delivery-clients.types');
const {
  schemaFingerprint,
} = require('./check-delivery-assistant-indexes-migration.cjs');
const {
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
  writeJournal,
} = require('./check-delivery-assistants-ui-fixture.cjs');
const {
  WORKSPACE_ID,
  copy,
  hashToken,
  newFixture,
  noSyntheticAuthentication,
  operationSeeds,
  protectedOperations,
  rowGroups,
  validateJournal,
  validateOwnedGroups,
} = require('./check-delivery-ui-closure-support.cjs');

const FILE = '/tmp/otogrow-ui-closure-fixture.json';
const write = (fixture, initial = false) =>
  writeJournal(fixture, FILE, initial);
const fault = (stage) => {
  if (process.env.OTOGROW_UI_CLOSURE_FAILURE === stage)
    throw new Error(`Injected UI closure ${stage}.`);
};
function read() {
  const metadata = lstatSync(FILE);
  assert(
    metadata.isFile() &&
      !metadata.isSymbolicLink() &&
      metadata.uid === process.getuid() &&
      (metadata.mode & 0o077) === 0,
  );
  assert(
    metadata.size <= 32 * 1024 * 1024,
    'Keep the ownership journal bounded.',
  );
  return validateJournal(JSON.parse(readFileSync(FILE, 'utf8')));
}
function assertNoOtherFixture() {
  const active = readdirSync('/tmp').filter(
    (name) =>
      /^otogrow-.*ui-fixture\.json$/.test(name) &&
      name !== 'otogrow-ui-closure-fixture.json',
  );
  for (const name of [
    'otogrow-phase4-browser.json',
    'otogrow-phase5-browser.json',
  ])
    if (existsSync(`/tmp/${name}`)) active.push(name);
  assert.deepEqual(
    active,
    [],
    'Clean the existing UI fixture before creating this one.',
  );
}
async function assertServicesStopped() {
  assert.equal(
    process.env.OTOGROW_UI_CLOSURE_SERVICES_STOPPED,
    '1',
    'Stop the local API and all workers before seed/cleanup.',
  );
  assert(
    process.env.OTOGROW_UI_CLOSURE_SERVER_URL,
    'Provide the exact local acceptance API URL.',
  );
  const server = new URL(process.env.OTOGROW_UI_CLOSURE_SERVER_URL);
  assert(['localhost', '127.0.0.1', '[::1]'].includes(server.hostname));
  assert.equal(server.protocol, 'http:');
  await new Promise((resolve, reject) => {
    const socket = createConnection({
      host: server.hostname.replace(/^\[|\]$/g, ''),
      port: Number(server.port || 80),
    });
    socket.setTimeout(1000);
    socket.once('connect', () => {
      socket.destroy();
      reject(new Error('The local API is still listening; stop it first.'));
    });
    socket.once('timeout', () => {
      socket.destroy();
      reject(new Error('Could not establish that the local API is stopped.'));
    });
    socket.once('error', (error) => {
      const errors = error instanceof AggregateError ? error.errors : [error];
      if (errors.length && errors.every((item) => item.code === 'ECONNREFUSED'))
        resolve();
      else reject(error);
    });
  });
}
async function readOperations(manager) {
  const current = await operations(manager);
  const [row] = await manager.query(
    'SELECT "updatedAt" FROM core."deliveryOperations" WHERE id=$1 FOR UPDATE',
    [current.id],
  );
  return { ...current, updatedAt: row.updatedAt.toISOString() };
}
async function ownedRows(manager, fixture) {
  const groups = [];
  for (const group of rowGroups(fixture))
    groups.push({
      ...group,
      rows: await manager.query(
        `SELECT * FROM ${quote(group.schema)}.${quote(group.name)} WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
        [group.ids],
      ),
    });
  return groups;
}
async function validate(manager, fixture) {
  validateJournal(fixture);
  assert(fixture.baseline);
  assert.equal(
    await schemaFingerprint(manager),
    fixture.baseline.schema,
    'Original schema changed.',
  );
  await noNativeAutomation(manager, fixture, ['deliveryoperations']);
  const groups = await ownedRows(manager, fixture);
  const present = validateOwnedGroups(fixture, groups);
  await noSyntheticAuthentication(manager, fixture, present, {
    quote,
    exactIds,
  });
  const current = await readOperations(manager);
  assert.equal(current.id, fixture.baseline.operations.id);
  assert.equal(
    current.updatedAt,
    fixture.baseline.operations.updatedAt,
    'Operations timestamp changed outside a declared fixture seed.',
  );
  const protectedState = protectedOperations(current.state, fixture, present);
  assert.equal(
    fingerprint(withoutHeartbeat(protectedState)),
    fixture.baseline.operations.hash,
    'Unowned Operations state changed; preserve it and this fixture.',
  );
  const tables = await readTables(manager, fixture);
  for (const table of additions(tables, fixture)) {
    const group = groups.find(
      (item) => item.schema === table.schema && item.name === table.name,
    );
    exactIds(
      table.rows,
      group?.rows.map((row) => row.id) ?? [],
      `Unexpected added ${table.schema}.${table.name}.`,
    );
  }
  return { groups, present, tables, protectedState };
}
function print(fixture, present) {
  console.log(
    JSON.stringify(
      {
        status: fixture.status,
        present,
        title: fixture.title,
        projects: fixture.portals.map(
          ({ kind, projectId, companyId, engagementId, revocations }) => ({
            kind,
            projectId,
            companyId,
            engagementId,
            revoked: revocations.length > 0,
          }),
        ),
        pausedTemplateId: fixture.templateId,
        privateJournal: FILE,
        controls: [
          'inspect',
          'revoke-ordinary',
          'revoke-performance',
          'cleanup',
        ],
        boundary:
          'Read-only UI, unsaved validation/Keep/Discard, and submission only while the local API is stopped. Do not save a response, budget, template, project, task, client edit or activity. No Resume/Pause, upload, share, send, invite, provider or worker action. Portal link/code exist only in the private journal; never send them.',
        cacheBoundary:
          'Normal portal GETs consume expiring IP/token rate-limit buckets. No Redis flush, shared bucket reset or permission-cache override.',
      },
      null,
      2,
    ),
  );
}
async function create() {
  await assertServicesStopped();
  assertNoOtherFixture();
  assert(!existsSync(FILE), 'Recover the existing journal first.');
  const fixture = newFixture();
  write(fixture, true);
  await connectionSource.transaction(async (manager) => {
    await locked(manager, true);
    const [workspace] = await manager.query(
      'SELECT * FROM core.workspace WHERE id=$1',
      [WORKSPACE_ID],
    );
    assert.equal(workspace?.activationStatus, 'ACTIVE');
    fixture.schema = workspace.databaseSchema;
    quote(fixture.schema);
    const admins = await manager.query(
      `SELECT DISTINCT member.id AS "memberId",member."userId",membership.id AS "userWorkspaceId" FROM ${quote(fixture.schema)}."workspaceMember" member JOIN core."userWorkspace" membership ON membership."userId"=member."userId" AND membership."workspaceId"=$1 JOIN core."user" account ON account.id=membership."userId" JOIN core."roleTarget" target ON target."userWorkspaceId"=membership.id AND target."workspaceId"=$1 JOIN core.role role ON role.id=target."roleId" AND role."workspaceId"=$1 WHERE member."deletedAt" IS NULL AND membership."deletedAt" IS NULL AND account."deletedAt" IS NULL AND account.disabled=false AND role."canUpdateAllSettings"=true ORDER BY member.id`,
      [WORKSPACE_ID],
    );
    assert.equal(
      admins.length,
      1,
      'Use the existing single administrator without changing permissions.',
    );
    fixture.actorId = admins[0].memberId;
    fixture.actorUserId = admins[0].userId;
    fixture.userWorkspaceId = admins[0].userWorkspaceId;
    const original = await readOperations(manager);
    assert(Array.isArray(original.state.templates));
    assert(
      original.state.templates.length < 100,
      'Do not bypass the normal template capacity.',
    );
    if (original.state.clients)
      for (const name of ['engagements', 'shares', 'links', 'audit'])
        assert(Array.isArray(original.state.clients[name]));
    await noNativeAutomation(manager, fixture, ['deliveryoperations']);
    fixture.baseline = {
      schema: await schemaFingerprint(manager),
      tables: await readTables(manager, fixture),
      operations: {
        id: original.id,
        updatedAt: original.updatedAt,
        clientsPresent: Boolean(original.state.clients),
        hash: fingerprint(withoutHeartbeat(original.state)),
      },
    };
    fixture.status = 'PREPARED';
    write(fixture);
    for (const person of fixture.people) {
      await manager.query(
        'INSERT INTO core."user" (id,email,disabled,"passwordHash","isEmailVerified") VALUES($1,$2,false,NULL,false)',
        [person.userId, `${person.userId}+ui-closure@example.invalid`],
      );
      await manager.query(
        'INSERT INTO core."userWorkspace" (id,"userId","workspaceId") VALUES($1,$2,$3)',
        [person.userWorkspaceId, person.userId, WORKSPACE_ID],
      );
      await manager.query(
        `INSERT INTO ${quote(fixture.schema)}."workspaceMember" (id,"userId","userEmail","nameFirstName","nameLastName") VALUES($1,$2,$3,$4,$5)`,
        [
          person.memberId,
          person.userId,
          `${person.userId}+ui-closure@example.invalid`,
          `Synthetic ${person.label}`,
          fixture.nonce.slice(0, 8),
        ],
      );
    }
    for (const [index, portal] of fixture.portals.entries()) {
      await manager.query(
        `INSERT INTO ${quote(fixture.schema)}.company (id,name) VALUES($1,$2)`,
        [portal.companyId, `${fixture.title} ${portal.kind} brand`],
      );
      await manager.query(
        'INSERT INTO core."deliveryProject" (id,"workspaceId",name,"companyId","memberIds") VALUES($1,$2,$3,$4,$5)',
        [
          portal.projectId,
          WORKSPACE_ID,
          `${fixture.title} ${portal.kind} project`,
          portal.companyId,
          JSON.stringify([fixture.people[index].memberId]),
        ],
      );
    }
    const seeds = operationSeeds(fixture);
    for (const engagement of seeds.engagements) {
      const { companyId, assets, submissions, ...input } = engagement;
      assert(companyId && assets.length === 0 && submissions.length === 0);
      engagementSchema.parse(input);
    }
    const {
      creatorId,
      userWorkspaceId,
      lastDate,
      lastTaskId,
      skipped,
      error,
      ...template
    } = seeds.templates[0];
    assert(
      creatorId &&
        userWorkspaceId &&
        lastDate === null &&
        lastTaskId === null &&
        skipped === 0 &&
        error === null,
    );
    recurrenceSchema.parse(template);
    const state = copy(original.state);
    state.clients ??= { engagements: [], shares: [], links: [], audit: [] };
    state.clients.engagements.push(...seeds.engagements);
    state.clients.links.push(...seeds.links);
    state.templates.push(...seeds.templates);
    assert(
      Buffer.byteLength(JSON.stringify(state)) < 10000000,
      'Do not exceed the Operations storage limit.',
    );
    await manager.query(
      'UPDATE core."deliveryOperations" SET state=$2 WHERE id=$1 AND "workspaceId"=$3',
      [original.id, state, WORKSPACE_ID],
    );
    for (const group of await ownedRows(manager, fixture))
      fixture.seeds[`${group.schema}.${group.name}`] = copy(group.rows);
    fixture.throttleLifecycle = fixture.portals.map((portal) => ({
      kind: portal.kind,
      key: `engine:workspace:delivery-client:token:${hashToken(`${portal.token}:${portal.code}`)}`,
      expiryMilliseconds: 1200000,
    }));
    write(fixture);
    await validate(manager, fixture);
    fault('CREATE_PRECOMMIT');
  });
  fault('CREATE_AFTER_COMMIT');
  fixture.status = 'READY';
  write(fixture);
  print(fixture, true);
}
async function revoke(fixture, kind) {
  const portal = fixture.portals.find((item) => item.kind === kind);
  assert(portal);
  await connectionSource.transaction(async (manager) => {
    await locked(manager);
    assert(
      (await validate(manager, fixture)).present,
      'No seeded portal remains.',
    );
    if (!portal.revocations.length)
      portal.revocations.push(new Date().toISOString());
    fixture.status = 'TRANSITION_PREPARED';
    write(fixture);
    const current = await readOperations(manager);
    const link = current.state.clients.links.find(
      (item) => item.id === portal.linkId,
    );
    assert(link && link.engagementId === portal.engagementId);
    link.revokedAt = portal.revocations[0];
    await manager.query(
      'UPDATE core."deliveryOperations" SET state=$2 WHERE id=$1 AND "workspaceId"=$3',
      [current.id, current.state, WORKSPACE_ID],
    );
    await validate(manager, fixture);
    fault('TRANSITION_PRECOMMIT');
  });
  fault('TRANSITION_AFTER_COMMIT');
  fixture.status = 'READY';
  write(fixture);
  print(fixture, true);
}
async function assertUnseeded(manager, fixture) {
  // No transaction can commit a seed until its baseline and exact rows are durable.
  for (const name of ['user', 'userWorkspace', 'deliveryProject']) {
    const ids = [
      ...fixture.people.flatMap((person) => [
        person.userId,
        person.userWorkspaceId,
      ]),
      ...fixture.portals.map((portal) => portal.projectId),
    ];
    assert.equal(
      (
        await manager.query(
          `SELECT id FROM core.${quote(name)} WHERE id=ANY($1::uuid[])`,
          [ids],
        )
      ).length,
      0,
    );
  }
  const [workspace] = await manager.query(
    'SELECT "databaseSchema" FROM core.workspace WHERE id=$1',
    [WORKSPACE_ID],
  );
  for (const [name, ids] of [
    ['company', fixture.portals.map((portal) => portal.companyId)],
    ['workspaceMember', fixture.people.map((person) => person.memberId)],
  ])
    assert.equal(
      (
        await manager.query(
          `SELECT id FROM ${quote(workspace.databaseSchema)}.${quote(name)} WHERE id=ANY($1::uuid[])`,
          [ids],
        )
      ).length,
      0,
    );
  const current = await readOperations(manager);
  const owned = new Set([
    fixture.templateId,
    ...fixture.portals.flatMap((portal) => [
      portal.engagementId,
      portal.linkId,
    ]),
  ]);
  for (const records of [
    current.state.templates,
    current.state.clients?.engagements ?? [],
    current.state.clients?.links ?? [],
  ])
    assert(
      !records.some((item) => owned.has(item.id)),
      'Unjournaled owned Operations state exists.',
    );
}
function finishCleanup(fixture) {
  const receipt = `${FILE}.${fixture.nonce}.cleaned.json`;
  if (existsSync(receipt)) {
    const metadata = lstatSync(receipt);
    assert(
      metadata.isFile() &&
        !metadata.isSymbolicLink() &&
        metadata.uid === process.getuid() &&
        (metadata.mode & 0o077) === 0,
    );
    assert.deepEqual(JSON.parse(readFileSync(receipt, 'utf8')), fixture);
  } else writeJournal(fixture, receipt, true);
  unlinkSync(FILE);
  syncDirectory(FILE);
  console.log(
    `Exact UI closure cleanup preserved original data/schema/Operations/authentication. Normal expiring portal throttle lifecycle was not reset. Private receipt: ${receipt}`,
  );
}
async function cleanup(fixture) {
  await assertServicesStopped();
  if (fixture.status === 'CLEANED') {
    await connectionSource.transaction(async (manager) => {
      await locked(manager, true);
      if (fixture.baseline)
        assert.equal((await validate(manager, fixture)).present, false);
      else await assertUnseeded(manager, fixture);
    });
    finishCleanup(fixture);
    return;
  }
  await connectionSource.transaction(async (manager) => {
    await locked(manager, true);
    if (!fixture.baseline) return await assertUnseeded(manager, fixture);
    const observed = await validate(manager, fixture);
    fixture.cleanupAttempts.push({
      at: new Date().toISOString(),
      present: observed.present,
      authenticationLifecycle: observed.tables.filter(
        isAuthenticationLifecycleTable,
      ),
    });
    fixture.status = 'CLEANUP_PREPARED';
    write(fixture);
    if (observed.present) {
      await manager.query(
        'UPDATE core."deliveryOperations" SET state=$2 WHERE id=$1 AND "workspaceId"=$3',
        [fixture.baseline.operations.id, observed.protectedState, WORKSPACE_ID],
      );
      for (const group of [...observed.groups].reverse()) {
        const removed = await manager.query(
          `WITH removed AS (DELETE FROM ${quote(group.schema)}.${quote(group.name)} WHERE id=ANY($1::uuid[]) RETURNING id) SELECT id FROM removed`,
          [group.ids],
        );
        exactIds(removed, group.ids, `Exact ${group.name} cleanup.`);
      }
    }
    const after = await readTables(manager, fixture);
    for (const [index, table] of after.entries())
      assert.equal(
        table.hash,
        isAuthenticationLifecycleTable(table)
          ? observed.tables[index].hash
          : fixture.baseline.tables[index].hash,
        `Preserve ${table.schema}.${table.name}.`,
      );
    assert.equal((await validate(manager, fixture)).present, false);
    fault('CLEANUP_PRECOMMIT');
  });
  fault('CLEANUP_AFTER_COMMIT');
  fixture.status = 'CLEANED';
  write(fixture);
  finishCleanup(fixture);
}
async function main() {
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  const mode = process.argv[2];
  assert.equal(process.argv.length, 3);
  assert(
    [
      'create',
      'inspect',
      'revoke-ordinary',
      'revoke-performance',
      'cleanup',
    ].includes(mode),
  );
  await connectionSource.initialize();
  try {
    if (mode === 'create') return await create();
    const fixture = read();
    if (mode === 'cleanup') return await cleanup(fixture);
    if (mode.startsWith('revoke-'))
      return await revoke(fixture, mode.slice('revoke-'.length));
    await connectionSource.transaction(async (manager) => {
      await locked(manager);
      print(fixture, (await validate(manager, fixture)).present);
    });
  } finally {
    await connectionSource.destroy();
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    console.error(`Preserve ${FILE}; unexpected state must never be deleted.`);
    process.exitCode = 1;
  });
module.exports = { validate, assertNoOtherFixture };
