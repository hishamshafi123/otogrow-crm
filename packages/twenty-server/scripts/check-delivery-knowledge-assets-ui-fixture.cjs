const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  unlinkSync,
} = require('node:fs');
const { join, resolve, basename, sep } = require('node:path');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  advertisingHash,
} = require('../dist/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy');
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
  writeJournal,
} = require('./check-delivery-assistants-ui-fixture.cjs');
const {
  schemaFingerprint,
} = require('./check-delivery-assistant-indexes-migration.cjs');
const { storageRoot } = require('./check-delivery-content-ui-support.cjs');
const {
  validateOwnedRows,
} = require('./check-delivery-knowledge-assets-ui-guard.cjs');

const FILE = '/tmp/otogrow-knowledge-assets-ui-fixture.json';
const CHECKER = 'knowledge-assets-ui-v1';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const normalize = (value) => JSON.parse(JSON.stringify(value));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const write = (fixture, initial = false) =>
  writeJournal(fixture, FILE, initial);
const fault = (stage) => {
  if (process.env.OTOGROW_KNOWLEDGE_FILES_UI_FAILURE === stage)
    throw new Error(`Injected brand-files UI ${stage}.`);
};
function read() {
  const info = lstatSync(FILE);
  assert(
    info.isFile() &&
      !info.isSymbolicLink() &&
      (info.mode & 0o077) === 0 &&
      info.uid === process.getuid(),
  );
  const fixture = JSON.parse(readFileSync(FILE, 'utf8'));
  assert.equal(fixture.checker, CHECKER);
  assert.equal(fixture.workspaceId, WORKSPACE_ID);
  for (const key of ['nonce', 'projectId']) assert.match(fixture[key], UUID);
  assert.equal(
    fixture.title,
    `Disposable Brand Files ${fixture.nonce.slice(0, 8)}`,
  );
  assert.equal(fixture.marker, `brand-files-ui:${fixture.nonce}`);
  if (fixture.sourceId) assert.match(fixture.sourceId, UUID);
  assert.equal(new Date(fixture.createdAt).toISOString(), fixture.createdAt);
  if (fixture.baseline) {
    for (const key of ['actorId', 'actorUserId', 'userWorkspaceId'])
      assert.match(fixture[key], UUID);
    assert.equal(
      fixture.directory,
      join(fixture.storageRoot, WORKSPACE_ID, 'delivery-knowledge'),
    );
  }
  return fixture;
}
function files(fixture) {
  if (!existsSync(fixture.directory)) return [];
  for (const path of [
    fixture.storageRoot,
    join(fixture.storageRoot, WORKSPACE_ID),
    fixture.directory,
  ]) {
    assert(lstatSync(path).isDirectory() && !lstatSync(path).isSymbolicLink());
    assert.equal(realpathSync(path), resolve(path));
  }
  assert(
    realpathSync(fixture.directory).startsWith(
      realpathSync(fixture.storageRoot) + sep,
    ),
  );
  return readdirSync(fixture.directory)
    .sort()
    .map((name) => {
      assert.match(name, UUID);
      const path = join(fixture.directory, name);
      const info = lstatSync(path);
      assert(info.isFile() && !info.isSymbolicLink());
      return { name, size: info.size, sha256: hash(readFileSync(path)) };
    });
}
function verifyFiles(fixture, assets = [], afterDataCleanup = false) {
  const current = files(fixture);
  const originalNames = new Set(fixture.originalFiles.map((item) => item.name));
  assert.deepEqual(
    current.filter((item) => originalNames.has(item.name)),
    fixture.originalFiles,
    'Original stored brand files changed.',
  );
  for (const item of current.filter((item) => !originalNames.has(item.name))) {
    const asset = assets.find((row) => row.id === item.name);
    const upload = fixture.uploads.find(
      (slot) =>
        slot.input.requestId === item.name ||
        (!slot.input.requestId &&
          asset &&
          slot.input.name === asset.name &&
          slot.input.sha256 === asset.sha256 &&
          slot.input.size === asset.size),
    );
    assert(upload, 'Unplanned stored file prevents cleanup.');
    assert.equal(item.size, upload.input.size);
    assert.equal(item.sha256, upload.input.sha256);
    assert(
      asset || afterDataCleanup,
      'Stored bytes need an exact owned upload row or cleanup receipt.',
    );
  }
  for (const asset of assets.filter((item) => item.state === 'READY'))
    assert(
      current.some((item) => item.name === asset.id),
      'A READY fixture upload lost its exact bytes.',
    );
  return current.filter((item) => !originalNames.has(item.name));
}
async function validate(manager, fixture) {
  assert(fixture.baseline, 'Unjournaled baseline cannot be accepted.');
  assert.equal(await schemaFingerprint(manager), fixture.baseline.schema);
  assert.equal(
    fingerprint(withoutHeartbeat((await operations(manager)).state)),
    fixture.baseline.operations.hash,
  );
  await noNativeAutomation(manager, fixture, [
    'deliveryknowledgesource',
    'deliveryknowledgeversion',
    'deliveryknowledgeasset',
  ]);
  const tables = await readTables(manager, fixture);
  const extra = additions(tables, fixture);
  const rows = await validateOwnedRows(manager, fixture);
  const expected = new Map([
    ['core.deliveryProject', rows.projects],
    ['core.deliveryKnowledgeSource', rows.sources],
    ['core.deliveryKnowledgeVersion', rows.versions],
    ['core.deliveryKnowledgeAsset', rows.assets],
    ['core.otogrowActivityEvent', rows.events],
  ]);
  for (const table of extra)
    exactIds(
      table.rows,
      (expected.get(`${table.schema}.${table.name}`) ?? []).map(
        (row) => row.id,
      ),
      `Unexpected addition to ${table.name}.`,
    );
  verifyFiles(
    fixture,
    rows.assets,
    rows.projects.length === 0 && fixture.cleanupAttempts.length > 0,
  );
  return { tables, extra, rows };
}
function bindUploads(fixture, rows) {
  for (const slot of fixture.uploads) {
    if (slot.input.requestId) continue;
    const matches = rows.assets.filter(
      (asset) =>
        asset.projectId === slot.input.projectId &&
        asset.sourceId === slot.input.sourceId &&
        asset.name === slot.input.name &&
        asset.size === slot.input.size &&
        asset.sha256 === slot.input.sha256,
    );
    assert(matches.length <= 1);
    if (matches.length === 1) {
      slot.input.requestId = matches[0].id;
      slot.inputHash = advertisingHash(slot.input);
    }
  }
}
function print(fixture, rows) {
  console.log(
    JSON.stringify(
      {
        status: fixture.status,
        title: fixture.title,
        projectId: fixture.projectId,
        sourceId: fixture.sourceId,
        uploads: fixture.uploads.map(({ input }) => input),
        commands: fixture.commands,
        counts: rows
          ? Object.fromEntries(
              Object.entries(rows).map(([key, values]) => [key, values.length]),
            )
          : undefined,
      },
      null,
      2,
    ),
  );
}
async function create() {
  assert.equal(process.env.OTOGROW_KNOWLEDGE_FILES_SERVICES_STOPPED, '1');
  assert(!existsSync(FILE));
  const nonce = randomUUID();
  const fixture = {
    checker: CHECKER,
    nonce,
    workspaceId: WORKSPACE_ID,
    projectId: randomUUID(),
    sourceId: null,
    title: `Disposable Brand Files ${nonce.slice(0, 8)}`,
    marker: `brand-files-ui:${nonce}`,
    createdAt: new Date().toISOString(),
    status: 'CREATING',
    uploads: [],
    commands: [],
    cleanupAttempts: [],
  };
  write(fixture, true);
  await connectionSource.transaction(async (manager) => {
    await locked(manager);
    const [workspace] = await manager.query(
      'SELECT "databaseSchema","activationStatus" FROM core.workspace WHERE id=$1',
      [WORKSPACE_ID],
    );
    assert.equal(workspace.activationStatus, 'ACTIVE');
    fixture.schema = workspace.databaseSchema;
    const admins = await manager.query(
      `SELECT DISTINCT member.id AS "memberId",member."userId",membership.id AS "userWorkspaceId" FROM ${quote(fixture.schema)}."workspaceMember" member JOIN core."userWorkspace" membership ON membership."userId"=member."userId" AND membership."workspaceId"=$1 JOIN core."user" account ON account.id=membership."userId" JOIN core."roleTarget" target ON target."userWorkspaceId"=membership.id AND target."workspaceId"=$1 JOIN core.role role ON role.id=target."roleId" AND role."workspaceId"=$1 WHERE member."deletedAt" IS NULL AND membership."deletedAt" IS NULL AND account."deletedAt" IS NULL AND account.disabled=false AND role."canUpdateAllSettings"=true ORDER BY member.id`,
      [WORKSPACE_ID],
    );
    assert.equal(admins.length, 1);
    Object.assign(fixture, {
      actorId: admins[0].memberId,
      actorUserId: admins[0].userId,
      userWorkspaceId: admins[0].userWorkspaceId,
    });
    const original = await operations(manager);
    await noNativeAutomation(manager, fixture, [
      'deliveryknowledgesource',
      'deliveryknowledgeversion',
      'deliveryknowledgeasset',
    ]);
    fixture.storageRoot = await storageRoot(manager);
    fixture.directory = join(
      fixture.storageRoot,
      WORKSPACE_ID,
      'delivery-knowledge',
    );
    fixture.originalFiles = files(fixture);
    fixture.baseline = {
      tables: await readTables(manager, fixture),
      schema: await schemaFingerprint(manager),
      operations: {
        id: original.id,
        hash: fingerprint(withoutHeartbeat(original.state)),
      },
    };
    fixture.status = 'PREPARED';
    write(fixture);
    const [project] = await manager.query(
      'INSERT INTO core."deliveryProject" (id,"workspaceId",name,"companyId","memberIds") VALUES($1,$2,$3,NULL,\'[]\') RETURNING *',
      [fixture.projectId, WORKSPACE_ID, fixture.title],
    );
    fixture.projectSeed = normalize(project);
    write(fixture);
    fault('CREATE_PRECOMMIT');
  });
  fault('CREATE_AFTER_COMMIT');
  fixture.status = 'READY';
  write(fixture);
  print(fixture);
}
async function observe(fixture) {
  const observed = await connectionSource.transaction(async (manager) => {
    await locked(manager);
    return validate(manager, fixture);
  });
  bindUploads(fixture, observed.rows);
  fixture.inspection = {
    at: new Date().toISOString(),
    counts: Object.fromEntries(
      Object.entries(observed.rows).map(([key, values]) => [
        key,
        values.length,
      ]),
    ),
  };
  write(fixture);
  return observed;
}
async function plan(fixture, mode, argument) {
  const observed = await observe(fixture);
  assert.equal(observed.rows.projects.length, 1);
  const [{ declaredDatabaseAt }] = await connectionSource.query(
    'SELECT clock_timestamp() AS "declaredDatabaseAt"',
  );
  if (mode === 'source') {
    assert.match(argument, UUID);
    assert(!fixture.sourceId || fixture.sourceId === argument);
    assert.equal(
      (
        await connectionSource.query(
          'SELECT id FROM core."deliveryKnowledgeSource" WHERE id=$1',
          [argument],
        )
      ).length,
      0,
    );
    fixture.sourceId = argument;
  } else if (mode === 'upload') {
    assert(fixture.sourceId);
    assert(fixture.uploads.every((slot) => slot.input.requestId));
    assert(fixture.uploads.length < 2);
    const path = resolve(argument);
    const info = lstatSync(path);
    assert(
      info.isFile() &&
        !info.isSymbolicLink() &&
        info.size > 0 &&
        info.size <= 20971520,
    );
    const name = basename(path);
    assert(/\.(png|pdf)$/.test(name));
    const input = {
      requestId: null,
      projectId: fixture.projectId,
      sourceId: fixture.sourceId,
      sourceRevision: observed.rows.sources[0]?.revision ?? 0,
      expectedCompanyId: null,
      name,
      size: info.size,
      sha256: hash(readFileSync(path)),
    };
    assert(
      !fixture.uploads.some(
        (slot) =>
          slot.input.name === name && slot.input.sha256 === input.sha256,
      ),
    );
    fixture.uploads.push({
      input,
      inputHash: null,
      mimeType: name.endsWith('.png') ? 'image/png' : 'application/pdf',
      localPath: path,
      declaredAt: new Date().toISOString(),
      declaredDatabaseAt: declaredDatabaseAt.toISOString(),
    });
  } else if (mode === 'plan-save') {
    assert.equal(fixture.commands.length, 0);
    assert.equal(fixture.uploads.length, 2);
    assert(
      fixture.uploads.every((slot) =>
        observed.rows.assets.some(
          (asset) =>
            asset.id === slot.input.requestId && asset.state === 'READY',
        ),
      ),
    );
    fixture.commands.push({
      kind: 'SAVE',
      declaredAt: new Date().toISOString(),
      declaredDatabaseAt: declaredDatabaseAt.toISOString(),
      input: {
        id: fixture.sourceId,
        projectId: fixture.projectId,
        revision: 0,
        title: `${fixture.title} approved logo and guide`,
        category: 'ASSET_REFERENCE',
        meetingDate: '2026-11-05',
        sourceUrl: '',
        transcript: `${fixture.marker}: private upload provenance.`,
        knowledge: `${fixture.marker}: Use the attached logo and guideline for approved brand work.`,
        attachments: fixture.uploads.map((slot) => ({
          id: slot.input.requestId,
          sha256: slot.input.sha256,
        })),
      },
    });
  } else {
    assert.equal(mode, 'plan-publish');
    assert(['true', 'false'].includes(argument));
    const source = observed.rows.sources[0];
    assert(source);
    assert.equal(fixture.commands.length, source.revision);
    fixture.commands.push({
      kind: 'PUBLISH',
      declaredAt: new Date().toISOString(),
      declaredDatabaseAt: declaredDatabaseAt.toISOString(),
      input: {
        id: fixture.sourceId,
        projectId: fixture.projectId,
        revision: source.revision,
        publish: argument === 'true',
      },
    });
  }
  write(fixture);
  print(fixture, observed.rows);
}
async function cleanup(fixture) {
  assert.equal(process.env.OTOGROW_KNOWLEDGE_FILES_SERVICES_STOPPED, '1');
  await connectionSource.transaction(async (manager) => {
    await locked(manager, true);
    if (!fixture.baseline) {
      assert.equal(
        (
          await manager.query(
            'SELECT id FROM core."deliveryProject" WHERE id=$1',
            [fixture.projectId],
          )
        ).length,
        0,
      );
      return;
    }
    const observed = await validate(manager, fixture);
    bindUploads(fixture, observed.rows);
    if (observed.rows.projects.length) {
      fixture.cleanupAttempts.push({
        at: new Date().toISOString(),
        rows: observed.rows,
        authenticationLifecycle: observed.tables.filter(
          isAuthenticationLifecycleTable,
        ),
      });
      fixture.status = 'CLEANUP_PREPARED';
      write(fixture);
      for (const [name, rows] of [
        ['deliveryKnowledgeVersion', observed.rows.versions],
        ['deliveryKnowledgeSource', observed.rows.sources],
        ['deliveryKnowledgeAsset', observed.rows.assets],
        ['otogrowActivityEvent', observed.rows.events],
        ['deliveryProject', observed.rows.projects],
      ]) {
        const removed = await manager.query(
          `WITH removed AS (DELETE FROM core.${quote(name)} WHERE "workspaceId"=$1 AND id=ANY($2::uuid[]) RETURNING id) SELECT id FROM removed`,
          [WORKSPACE_ID, rows.map((row) => row.id)],
        );
        exactIds(
          removed,
          rows.map((row) => row.id),
          `Delete only exact owned ${name}.`,
        );
      }
    }
    const after = await readTables(manager, fixture);
    for (const [index, table] of after.entries())
      assert.equal(
        table.hash,
        isAuthenticationLifecycleTable(table)
          ? observed.tables[index].hash
          : fixture.baseline.tables[index].hash,
        `Preserve ${table.name} and current authentication.`,
      );
    assert.equal(await schemaFingerprint(manager), fixture.baseline.schema);
    assert.equal(
      fingerprint(withoutHeartbeat((await operations(manager)).state)),
      fixture.baseline.operations.hash,
    );
    fault('CLEANUP_PRECOMMIT');
  });
  fixture.status = 'DATA_CLEANED';
  write(fixture);
  fault('CLEANUP_AFTER_COMMIT');
  if (fixture.baseline) {
    const ownedFiles = verifyFiles(fixture, [], true);
    for (const item of ownedFiles)
      unlinkSync(join(fixture.directory, item.name));
    assert.deepEqual(files(fixture), fixture.originalFiles);
  }
  fixture.status = 'CLEANED';
  write(fixture);
  const receipt = `${FILE}.${fixture.nonce}.cleaned.json`;
  if (existsSync(receipt))
    assert.deepEqual(JSON.parse(readFileSync(receipt, 'utf8')), fixture);
  else writeJournal(fixture, receipt, true);
  unlinkSync(FILE);
  syncDirectory(FILE);
  console.log(
    `PASS exact brand-files UI cleanup; original data/schema/current authentication/Operations/files preserved. Receipt: ${receipt}`,
  );
}
async function main() {
  const mode = process.argv[2];
  assert(
    [
      'create',
      'inspect',
      'source',
      'upload',
      'plan-save',
      'plan-publish',
      'cleanup',
    ].includes(mode),
  );
  assert.equal(
    process.argv.length,
    ['source', 'upload', 'plan-publish'].includes(mode) ? 4 : 3,
  );
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  await connectionSource.initialize();
  try {
    if (mode === 'create') await create();
    else {
      const fixture = read();
      if (mode === 'cleanup') await cleanup(fixture);
      else if (mode === 'inspect')
        print(fixture, (await observe(fixture)).rows);
      else await plan(fixture, mode, process.argv[3]);
    }
  } finally {
    await connectionSource.destroy();
  }
}
main().catch((error) => {
  console.error(error.stack);
  console.error(`Preserve ${FILE}; no broad cleanup is allowed.`);
  process.exitCode = 1;
});
