const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { existsSync, lstatSync, readFileSync, unlinkSync } = require('node:fs');
const { readdir, readFile, unlink, rmdir } = require('node:fs/promises');
const { join, basename } = require('node:path');
const { DataSource } = require('typeorm');
const http = require('node:http');
const https = require('node:https');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  advertisingHash,
} = require('../dist/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy');
const {
  schemaFingerprint,
} = require('./check-delivery-assistant-indexes-migration.cjs');
const {
  originalDigest,
  deferred,
  bounded,
} = require('./check-otogrow-activity-analysis-support.cjs');
const {
  writeJournal,
  syncDirectory,
} = require('./check-delivery-assistants-ui-fixture.cjs');
const { ownedRows } = require('./check-delivery-content-concurrency-guard.cjs');
const { cleanupFixture } = require('./check-delivery-reconciliation.cjs');
const {
  PNG,
  digest,
  seedKnowledgeAssets,
  knowledgeAssetServices,
  uploadInput,
  selection,
  temporaryKnowledgeStorage,
} = require('./check-delivery-knowledge-assets-support.cjs');

const FILE = '/tmp/otogrow-knowledge-assets-concurrency.json';
const CHECKER = 'knowledge-assets-concurrency-v1';
const save = (fixture, initial = false) => writeJournal(fixture, FILE, initial);
const read = () => {
  const file = lstatSync(FILE);
  assert(
    file.isFile() &&
      !file.isSymbolicLink() &&
      (file.mode & 0o077) === 0 &&
      file.uid === process.getuid(),
  );
  const fixture = JSON.parse(readFileSync(FILE, 'utf8'));
  assert.equal(fixture.checker, CHECKER);
  assert.equal(
    fixture.schemaName,
    `knowledge_race_${fixture.workspaceId.replaceAll('-', '_')}`,
  );
  assert.equal(
    fixture.sentinel,
    `otogrow-reconciliation-fixture:${fixture.workspaceId}`,
  );
  assert(basename(fixture.storageRoot).startsWith('otogrow-knowledge-files-'));
  for (const command of fixture.uploads) {
    assert.equal(command.input.sha256, digest(PNG));
    assert.equal(command.input.size, PNG.length);
    assert.equal(command.inputHash, advertisingHash(command.input));
    assert.equal(command.memberId, fixture.people.writer.memberId);
    assert.equal(
      command.userWorkspaceId,
      fixture.people.writer.userWorkspaceId,
    );
  }
  return fixture;
};
async function fileEvidence(fixture) {
  if (!existsSync(fixture.storageRoot)) {
    assert.equal(fixture.cleanupStage, 'DATA_CLEANED');
    return [];
  }
  const metadata = lstatSync(fixture.storageRoot);
  assert(
    metadata.isDirectory() &&
      !metadata.isSymbolicLink() &&
      metadata.uid === process.getuid() &&
      (metadata.mode & 0o077) === 0,
  );
  const names = await readdir(fixture.storageRoot);
  for (const name of names) {
    const command = fixture.uploads.find(
      (item) => item.input.requestId === name,
    );
    assert(command, 'Only a predeclared upload path may exist.');
    const path = join(fixture.storageRoot, name);
    const info = lstatSync(path);
    assert(info.isFile() && !info.isSymbolicLink());
    assert.equal(
      digest(await readFile(path)),
      command.input.sha256,
      'Unexpected fixture file bytes prevent cleanup.',
    );
  }
  return names;
}
async function validate(manager, fixture) {
  assert.equal(
    await originalDigest((...args) => manager.query(...args), fixture),
    fixture.original,
    'Unrelated original data changed; preserve the journal.',
  );
  const workspaces = await manager.query(
    'SELECT id,"displayName","databaseSchema" FROM core.workspace WHERE id=ANY($1::uuid[])',
    [[fixture.workspaceId, fixture.foreignWorkspaceId]],
  );
  if (!workspaces.length) {
    assert.equal(await schemaFingerprint(manager), fixture.originalSchema);
    assert.equal(
      (
        await manager.query('SELECT to_regnamespace($1)::text AS name', [
          fixture.schemaName,
        ])
      )[0].name,
      null,
    );
    await fileEvidence(fixture);
    return null;
  }
  assert.equal(workspaces.length, 2);
  for (const workspace of workspaces) {
    assert.equal(workspace.displayName, fixture.sentinel);
    assert.equal(workspace.databaseSchema, fixture.schemaName);
  }
  assert.equal(await schemaFingerprint(manager), fixture.seedSchema);
  const assets = await manager.query(
    'SELECT * FROM core."deliveryKnowledgeAsset" WHERE "workspaceId"=ANY($1::uuid[])',
    [[fixture.workspaceId, fixture.foreignWorkspaceId]],
  );
  for (const asset of assets) {
    const command = fixture.uploads.find(
      (item) => item.input.requestId === asset.id,
    );
    assert(command, 'Unexpected upload row.');
    for (const field of [
      'projectId',
      'sourceId',
      'sourceRevision',
      'name',
      'sha256',
    ])
      assert.equal(asset[field], command.input[field]);
    assert(
      [
        command.input.size,
        ...fixture.quotaOverrides
          .filter((item) => item.id === asset.id)
          .map((item) => item.size),
      ].includes(asset.size),
      'Only the exact predeclared quota metadata can change an upload size.',
    );
    assert.equal(asset.workspaceId, fixture.workspaceId);
    assert.equal(asset.companyId, command.input.expectedCompanyId);
    assert.equal(asset.uploadedBy, command.memberId);
    assert.equal(asset.uploaderUserWorkspaceId, command.userWorkspaceId);
    assert.equal(asset.inputHash, command.inputHash);
    assert.equal(asset.mimeType, 'image/png');
    assert(['PENDING', 'READY', 'FAILED'].includes(asset.state));
  }
  const events = await manager.query(
    'SELECT * FROM core."otogrowActivityEvent" WHERE "workspaceId"=ANY($1::uuid[])',
    [[fixture.workspaceId, fixture.foreignWorkspaceId]],
  );
  const eventCounts = new Map();
  const eventStates = {
    KNOWLEDGE_FILE_UPLOAD_STARTED: [null, 'PENDING'],
    KNOWLEDGE_FILE_READY: ['PENDING', 'READY'],
    KNOWLEDGE_FILE_DISCARDED: ['READY', 'FAILED'],
    KNOWLEDGE_FILE_CLEANED: ['CLEANUP_PENDING', 'CLEANED'],
  };
  for (const event of events) {
    const command = fixture.uploads.find(
      (item) => item.input.requestId === event.sourceId,
    );
    assert(command && assets.some((asset) => asset.id === event.sourceId));
    assert.equal(event.workspaceId, fixture.workspaceId);
    assert.equal(event.sourceType, 'knowledge-upload');
    assert.equal(event.projectId, command.input.projectId);
    assert.equal(event.subjectMemberId, command.memberId);
    assert.equal(event.category, 'CLIENT');
    assert.equal(event.taskId, null);
    assert(
      [
        'KNOWLEDGE_FILE_UPLOAD_STARTED',
        'KNOWLEDGE_FILE_READY',
        'KNOWLEDGE_FILE_DISCARDED',
        'KNOWLEDGE_FILE_CLEANED',
      ].includes(event.action),
    );
    assert.equal(
      event.actorId,
      event.action === 'KNOWLEDGE_FILE_CLEANED' ? null : command.memberId,
    );
    assert.equal(
      event.actorType,
      event.action === 'KNOWLEDGE_FILE_CLEANED' ? 'SYSTEM' : 'HUMAN',
    );
    assert.deepEqual(event.changes.map((change) => change.field).sort(), [
      'assetId',
      'state',
    ]);
    assert.equal(
      event.changes.find((change) => change.field === 'assetId').after,
      command.input.requestId,
    );
    assert.equal(
      event.changes.find((change) => change.field === 'assetId').before,
      null,
    );
    const state = event.changes.find((change) => change.field === 'state');
    assert.deepEqual([state.before, state.after], eventStates[event.action]);
    const key = `${event.sourceId}:${event.action}`;
    eventCounts.set(key, (eventCounts.get(key) ?? 0) + 1);
    assert.equal(
      eventCounts.get(key),
      1,
      'A transition cannot be recorded twice.',
    );
  }
  for (const asset of assets) {
    const has = (action) =>
      eventCounts.has(`${asset.id}:KNOWLEDGE_FILE_${action}`);
    assert(has('UPLOAD_STARTED'));
    assert.equal(
      asset.state,
      has('DISCARDED') ? 'FAILED' : has('READY') ? 'READY' : 'PENDING',
    );
    assert.equal(
      asset.failureReason,
      has('DISCARDED') ? 'This unused private upload was discarded.' : null,
    );
    assert.equal(asset.readyAt !== null, asset.state === 'READY');
    assert.equal(asset.cleanedAt !== null, has('CLEANED'));
    if (has('CLEANED')) assert(has('DISCARDED'));
  }
  const rows = await ownedRows(manager, fixture);
  assert.deepEqual(
    rows.map(({ schema, name }) => ({ schema, name })),
    fixture.seed.map(({ schema, name }) => ({ schema, name })),
  );
  for (const table of rows) {
    const original = fixture.seed.find(
      (item) => item.schema === table.schema && item.name === table.name,
    );
    const added =
      table.schema === 'core'
        ? table.name === 'deliveryKnowledgeAsset'
          ? assets
          : table.name === 'otogrowActivityEvent'
            ? events
            : []
        : [];
    assert.deepEqual(
      table.rows.map((row) => row.id).sort(),
      [
        ...original.rows.map((row) => row.id),
        ...added.map((row) => row.id),
      ].sort(),
    );
    for (const row of original.rows)
      assert(
        (
          fixture.mutable[`${table.schema}.${table.name}:${row.id}`] ?? [
            row.hash,
          ]
        ).includes(table.rows.find((current) => current.id === row.id).hash),
        `Unexpected mutation in ${table.schema}.${table.name}.`,
      );
  }
  await fileEvidence(fixture);
  return { assets, events };
}
async function cleanup(fixture) {
  await connectionSource.transaction(async (manager) => {
    for (const id of [fixture.workspaceId, fixture.foreignWorkspaceId].sort())
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`delivery:${id}`],
      );
    const state = await validate(manager, fixture);
    if (!state) return;
    for (const [table, ids] of [
      ['deliveryKnowledgeAsset', state.assets.map((item) => item.id)],
      ['otogrowActivityEvent', state.events.map((item) => item.id)],
    ]) {
      const removed = await manager.query(
        `WITH removed AS (DELETE FROM core."${table}" WHERE "workspaceId"=$1 AND id=ANY($2::uuid[]) RETURNING id) SELECT id FROM removed`,
        [fixture.workspaceId, ids],
      );
      assert.deepEqual(removed.map((item) => item.id).sort(), ids.sort());
    }
    await cleanupFixture(manager, fixture);
    assert.equal(
      await originalDigest((...args) => manager.query(...args)),
      fixture.original,
    );
    assert.equal(await schemaFingerprint(manager), fixture.originalSchema);
    if (process.env.OTOGROW_KNOWLEDGE_FILES_FAILURE === 'CLEANUP_PRECOMMIT')
      throw new Error('Injected CLEANUP_PRECOMMIT failure.');
  });
  fixture.cleanupStage = 'DATA_CLEANED';
  save(fixture);
  const names = await fileEvidence(fixture);
  for (const name of names) await unlink(join(fixture.storageRoot, name));
  if (existsSync(fixture.storageRoot)) await rmdir(fixture.storageRoot);
  const receipt = `${FILE}.${fixture.workspaceId}.cleaned.json`;
  const evidence = {
    checker: CHECKER,
    workspaceId: fixture.workspaceId,
    original: fixture.original,
    cleaned: true,
  };
  if (existsSync(receipt))
    assert.deepEqual(JSON.parse(readFileSync(receipt, 'utf8')), evidence);
  else writeJournal(evidence, receipt, true);
  unlinkSync(FILE);
  syncDirectory(FILE);
}
async function main() {
  assert.equal(process.env.OTOGROW_KNOWLEDGE_FILES_SERVICES_STOPPED, '1');
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  const mode = process.argv[2] ?? 'run';
  assert(
    ['run', 'inspect', 'cleanup'].includes(mode) && process.argv.length <= 3,
  );
  if (mode === 'run')
    assert(
      !existsSync(FILE),
      'Inspect the retained fixture before starting another.',
    );
  await connectionSource.initialize();
  if (mode !== 'run') {
    try {
      const fixture = read();
      if (mode === 'cleanup') await cleanup(fixture);
      else
        await connectionSource.transaction((manager) =>
          validate(manager, fixture),
        );
    } finally {
      await connectionSource.destroy();
    }
    console.log(`PASS guarded brand-file concurrency ${mode}.`);
    return;
  }
  const transports = [
    [global, 'fetch'],
    [http, 'request'],
    [http, 'get'],
    [https, 'request'],
    [https, 'get'],
  ].map(([owner, key]) => ({ owner, key, original: owner[key] }));
  for (const { owner, key } of transports)
    owner[key] = () => {
      throw new Error('No provider calls are allowed.');
    };
  const sessions = [0, 1].map(
    () =>
      new DataSource({
        ...connectionSource.options,
        extra: { ...connectionSource.options.extra, max: 3 },
      }),
  );
  const barriers = [],
    pending = [];
  const checks = [];
  let fixture, storage;
  const track = (promise) => {
    pending.push(promise);
    void promise.catch(() => undefined);
    return promise;
  };
  const barrier = () => {
    const entered = deferred(),
      release = deferred();
    barriers.push(release);
    return { entered, release };
  };
  try {
    await Promise.all(sessions.map((session) => session.initialize()));
    const original = await originalDigest((...args) =>
      connectionSource.query(...args),
    );
    const originalSchema = await schemaFingerprint(connectionSource);
    await connectionSource.transaction(async (manager) => {
      fixture = await seedKnowledgeAssets(manager, 'knowledge_race');
      storage = await temporaryKnowledgeStorage(fixture);
      Object.assign(fixture, {
        checker: CHECKER,
        original,
        originalSchema,
        uploads: [],
        quotaOverrides: [],
        mutable: {},
        storageRoot: storage.root,
        seed: await ownedRows(manager, fixture),
        seedSchema: await schemaFingerprint(manager),
      });
      save(fixture, true);
      if (process.env.OTOGROW_KNOWLEDGE_FILES_FAILURE === 'PRECOMMIT')
        throw new Error('Injected PRECOMMIT failure.');
    });
    if (process.env.OTOGROW_KNOWLEDGE_FILES_FAILURE === 'AFTER_SEED_COMMIT')
      throw new Error('Injected AFTER_SEED_COMMIT failure.');
    const domains = sessions.map((session) =>
      knowledgeAssetServices(session, fixture, storage),
    );
    const declare = (changes = {}) => {
      const input = uploadInput(fixture, changes);
      fixture.uploads.push({
        input,
        inputHash: advertisingHash(input),
        memberId: fixture.people.writer.memberId,
        userWorkspaceId: fixture.people.writer.userWorkspaceId,
      });
      save(fixture);
      storage.allocate(input);
      return input;
    };
    const upload = (index, input) =>
      domains[index].file('upload', [
        input,
        { buffer: PNG, originalname: input.name },
      ]);
    const held = declare();
    const writeHold = barrier();
    storage.hooks.beforeWrite = async () => {
      storage.hooks.beforeWrite = null;
      writeHold.entered.resolve();
      await bounded(writeHold.release.promise);
    };
    const first = track(upload(0, held));
    await bounded(writeHold.entered.promise);
    const duplicate = await bounded(upload(1, held));
    assert.equal(duplicate.receipt.state, 'PENDING');
    assert.equal(duplicate.receipt.canRecover, false);
    assert.equal(duplicate.receipt.canDiscard, false);
    const recovered = await domains[1].file('recover', [selection(held)]);
    const discarded = await domains[1].file('recover', [selection(held), true]);
    assert.equal(recovered.receipt.state, 'PENDING');
    assert.equal(discarded.receipt.state, 'PENDING');
    assert.equal(storage.calls.writes, 1);
    assert.equal(storage.calls.deletes, 0);
    writeHold.release.resolve();
    assert.equal((await bounded(first)).receipt.state, 'READY');
    checks.push(
      'Independent duplicate upload, recovery and discard cannot rewrite or race an active writer',
    );
    await assert.rejects(() => upload(1, { ...held, name: 'changed.png' }));
    assert.equal(storage.calls.writes, 1);
    checks.push('A second session cannot reuse the receipt for changed input');
    const cleanupHold = barrier();
    storage.hooks.beforeDelete = async () => {
      storage.hooks.beforeDelete = null;
      cleanupHold.entered.resolve();
      await bounded(cleanupHold.release.promise);
    };
    const removal = track(domains[0].file('recover', [selection(held), true]));
    await bounded(cleanupHold.entered.promise);
    const duringRemoval = await upload(1, held);
    assert.equal(duringRemoval.receipt.state, 'FAILED');
    assert.equal(storage.calls.writes, 1);
    cleanupHold.release.resolve();
    assert.equal((await bounded(removal)).receipt.cleanupPending, false);
    checks.push(
      'Late retries cannot revive a discarded request while exact cleanup is in flight',
    );
    const quotaSource = randomUUID();
    const quotaInputs = [];
    for (let index = 0; index < 19; index++) {
      const input = declare({ sourceId: quotaSource });
      quotaInputs.push(input);
      await upload(0, input);
    }
    const contenders = [
      declare({ sourceId: quotaSource }),
      declare({ sourceId: quotaSource }),
    ];
    const quota = await Promise.allSettled(
      contenders.map((input, index) => upload(index, input)),
    );
    assert.equal(
      quota.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    assert.equal(
      quota.find((result) => result.status === 'rejected').reason.getStatus(),
      400,
    );
    checks.push(
      'Independent uploads reserve the final source quota slot only once',
    );
    for (let index = 0; index < 32; index++)
      await upload(0, declare({ sourceId: randomUUID() }));
    const reserved = await connectionSource.query(
      'SELECT id FROM core."deliveryKnowledgeAsset" WHERE "workspaceId"=$1 AND "projectId"=$2 AND "cleanedAt" IS NULL ORDER BY id',
      [fixture.workspaceId, fixture.projects.first],
    );
    assert.equal(reserved.length, 52);
    let remaining = 1073741824 - PNG.length;
    for (const asset of reserved) {
      const size = Math.min(remaining, 20971520);
      fixture.quotaOverrides.push({ id: asset.id, size });
      remaining -= size;
    }
    assert.equal(remaining, 0);
    save(fixture);
    await connectionSource.transaction(async (manager) => {
      for (const asset of fixture.quotaOverrides)
        await manager.query(
          'UPDATE core."deliveryKnowledgeAsset" SET size=$2 WHERE id=$1',
          [asset.id, asset.size],
        );
    });
    const projectContenders = [
      declare({ sourceId: randomUUID() }),
      declare({ sourceId: randomUUID() }),
    ];
    const projectQuota = await Promise.allSettled(
      projectContenders.map((input, index) => upload(index, input)),
    );
    assert.equal(
      projectQuota.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    assert.match(
      projectQuota.find((result) => result.status === 'rejected').reason
        .message,
      /brand-file storage limit/,
    );
    await connectionSource.transaction(async (manager) => {
      for (const asset of fixture.quotaOverrides)
        await manager.query(
          'UPDATE core."deliveryKnowledgeAsset" SET size=$2 WHERE id=$1',
          [asset.id, PNG.length],
        );
    });
    checks.push(
      'Independent sessions reserve the final project byte allowance only once, including retained metadata',
    );
    const readable = declare({ sourceId: randomUUID() });
    await upload(0, readable);
    const readHold = barrier();
    storage.hooks.beforeRead = async () => {
      storage.hooks.beforeRead = null;
      readHold.entered.resolve();
      await bounded(readHold.release.promise);
    };
    const reading = track(domains[0].file('download', [readable.requestId]));
    await bounded(readHold.entered.promise);
    const members = JSON.stringify([
      fixture.people.reader.memberId,
      fixture.people.secondWriter.memberId,
    ]);
    const key = `core.deliveryProject:${fixture.projects.first}`;
    const [expected] = await connectionSource.query(
      'SELECT md5(jsonb_set(to_jsonb(project),\'{memberIds}\',$2::jsonb)::text) AS hash FROM core."deliveryProject" project WHERE id=$1',
      [fixture.projects.first, members],
    );
    fixture.mutable[key] = [
      fixture.seed
        .find(
          (table) =>
            table.schema === 'core' && table.name === 'deliveryProject',
        )
        .rows.find((row) => row.id === fixture.projects.first).hash,
      expected.hash,
    ];
    save(fixture);
    await connectionSource.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`delivery:${fixture.workspaceId}`],
      );
      await manager.query(
        'UPDATE core."deliveryProject" SET "memberIds"=$2 WHERE id=$1',
        [fixture.projects.first, members],
      );
    });
    readHold.release.resolve();
    await assert.rejects(() => bounded(reading));
    checks.push(
      'Committed project revocation during storage I/O denies the late byte result',
    );
    await connectionSource.transaction((manager) => validate(manager, fixture));
    await cleanup(fixture);
    console.log(
      JSON.stringify(
        {
          status: 'PASS',
          checks: checks.length,
          evidence: checks,
          preservation:
            'Original schema/data preserved; exact disposable records and files removed.',
        },
        null,
        2,
      ),
    );
  } finally {
    for (const release of barriers) release.resolve();
    await Promise.allSettled(pending);
    for (const session of sessions)
      if (session.isInitialized) await session.destroy();
    if (connectionSource.isInitialized) await connectionSource.destroy();
    for (const { owner, key, original } of transports) owner[key] = original;
  }
}
main().catch((error) => {
  console.error(error.stack);
  console.error(`Preserve ${FILE}; use guarded inspect/cleanup only.`);
  process.exitCode = 1;
});
