const assert = require('node:assert/strict');
const {
  validateContentLedger,
} = require('./check-delivery-content-ledger.cjs');
const { existsSync, lstatSync, readFileSync, unlinkSync } = require('node:fs');
const {
  writeJournal,
  syncDirectory,
} = require('./check-delivery-assistants-ui-fixture.cjs');
const { cleanupFixture } = require('./check-delivery-reconciliation.cjs');
const {
  schemaFingerprint,
} = require('./check-delivery-assistant-indexes-migration.cjs');
const {
  originalDigest,
} = require('./check-otogrow-activity-analysis-support.cjs');
const {
  advertisingHash,
} = require('../dist/modules/delivery/advertising/workbench/delivery-advertising-workbench.policy');
const {
  contentAccountSchema,
  contentPlanSchema,
  contentSaveSchema,
  contentDecisionSchema,
} = require('../dist/modules/delivery/content/delivery-content.types');
const {
  CONTENT_TABLES,
  quote,
} = require('./check-delivery-content-support.cjs');

const FILE = '/tmp/otogrow-content-concurrency.json';
const CHECKER = 'content-concurrency-v1';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const schemas = {
  saveAccount: contentAccountSchema,
  savePlan: contentPlanSchema,
  save: contentSaveSchema,
  decide: contentDecisionSchema,
};
const saveJournal = (fixture, initial = false) =>
  writeJournal(fixture, FILE, initial);

async function ownedRows(manager, fixture) {
  const tables = await manager.query(
    "SELECT table_schema AS schema,table_name AS name FROM information_schema.tables WHERE table_type='BASE TABLE' AND table_schema IN ('core',$1) ORDER BY table_schema,table_name",
    [fixture.schemaName],
  );
  const scoped = new Set(
    (
      await manager.query(
        "SELECT table_name FROM information_schema.columns WHERE table_schema='core' AND column_name='workspaceId'",
      )
    ).map((row) => row.table_name),
  );
  const rows = [];
  for (const table of tables) {
    let condition, values;
    if (table.schema === fixture.schemaName) {
      condition = 'true';
      values = [];
    } else if (table.name === 'workspace') {
      condition = 'record.id=ANY($1::uuid[])';
      values = [[fixture.workspaceId, fixture.foreignWorkspaceId]];
    } else if (table.name === 'user') {
      condition = 'record.id=ANY($1::uuid[])';
      values = [Object.values(fixture.people).map((person) => person.userId)];
    } else if (scoped.has(table.name)) {
      condition = 'record."workspaceId"=ANY($1::uuid[])';
      values = [[fixture.workspaceId, fixture.foreignWorkspaceId]];
    } else continue;
    rows.push({
      ...table,
      rows: await manager.query(
        `SELECT to_jsonb(record)->>'id' AS id,md5(to_jsonb(record)::text) AS hash FROM ${quote(table.schema)}.${quote(table.name)} record WHERE ${condition} ORDER BY to_jsonb(record)->>'id'`,
        values,
      ),
    });
  }
  return rows;
}
function readJournal() {
  const file = lstatSync(FILE);
  assert(file.isFile() && !file.isSymbolicLink() && (file.mode & 0o077) === 0);
  const fixture = JSON.parse(readFileSync(FILE, 'utf8'));
  assert.equal(fixture.checker, CHECKER);
  for (const id of [
    fixture.workspaceId,
    fixture.foreignWorkspaceId,
    ...Object.values(fixture.people).flatMap((person) => [
      person.memberId,
      person.userId,
      person.userWorkspaceId,
    ]),
  ])
    assert.match(id, UUID);
  assert.equal(
    fixture.schemaName,
    `content_race_${fixture.workspaceId.replaceAll('-', '_')}`,
  );
  assert.equal(
    fixture.sentinel,
    `otogrow-reconciliation-fixture:${fixture.workspaceId}`,
  );
  for (const command of fixture.commands) {
    assert(Object.hasOwn(schemas, command.method));
    assert.deepEqual(
      schemas[command.method].parse(command.input),
      command.input,
    );
    assert.equal(command.hash, advertisingHash(command.input));
    assert(
      Object.values(fixture.people).some(
        (person) =>
          person.memberId === command.memberId &&
          person.userWorkspaceId === command.userWorkspaceId,
      ),
    );
    if (command.method === 'save')
      assert.equal(
        command.body.sourceFingerprint,
        command.input.expectedSourceFingerprint,
      );
  }
  return fixture;
}
function journalCommand(fixture, method, input, person, body = null) {
  const canonical = schemas[method].parse(input);
  fixture.commands.push({
    method,
    input: canonical,
    hash: advertisingHash(canonical),
    memberId: person.memberId,
    userWorkspaceId: person.userWorkspaceId,
    body,
  });
  saveJournal(fixture);
  return canonical;
}
async function validate(manager, fixture) {
  assert.equal(
    await originalDigest(
      (...arguments_) => manager.query(...arguments_),
      fixture,
    ),
    fixture.original,
    'Original rows changed; keep the private journal for investigation.',
  );
  const workspaces = await manager.query(
    'SELECT id,"displayName","databaseSchema" FROM core.workspace WHERE id=ANY($1::uuid[]) FOR UPDATE',
    [[fixture.workspaceId, fixture.foreignWorkspaceId]],
  );
  if (!workspaces.length) {
    assert.equal(
      (
        await manager.query('SELECT to_regnamespace($1)::text AS schema', [
          fixture.schemaName,
        ])
      )[0].schema,
      null,
    );
    return null;
  }
  assert.equal(workspaces.length, 2);
  for (const workspace of workspaces) {
    assert.equal(workspace.displayName, fixture.sentinel);
    assert.equal(workspace.databaseSchema, fixture.schemaName);
  }
  assert.equal(
    await schemaFingerprint(manager),
    fixture.seedSchema,
    'Unexpected schema change prevents fixture cleanup.',
  );
  const dynamic = {};
  for (const table of [...CONTENT_TABLES, 'otogrowActivityEvent'])
    dynamic[table] = await manager.query(
      `SELECT * FROM core.${quote(table)} WHERE "workspaceId"=ANY($1::uuid[])`,
      [[fixture.workspaceId, fixture.foreignWorkspaceId]],
    );
  validateContentLedger(fixture, dynamic);
  const currentRows = await ownedRows(manager, fixture);
  assert.deepEqual(
    currentRows.map(({ schema, name }) => ({ schema, name })),
    fixture.seed.map(({ schema, name }) => ({ schema, name })),
  );
  for (const table of currentRows) {
    const seed = fixture.seed.find(
      (item) => item.schema === table.schema && item.name === table.name,
    );
    const added = table.schema === 'core' ? (dynamic[table.name] ?? []) : [];
    assert.deepEqual(
      table.rows.map((row) => row.id).sort(),
      [...seed.rows.map((row) => row.id), ...added.map((row) => row.id)].sort(),
      `Unexpected fixture rows in ${table.schema}.${table.name}.`,
    );
    for (const row of seed.rows)
      assert(
        (
          fixture.mutable[`${table.schema}.${table.name}:${row.id}`] ?? [
            row.hash,
          ]
        ).includes(table.rows.find((item) => item.id === row.id).hash),
        `Unexpected fixture mutation in ${table.schema}.${table.name}.`,
      );
  }
  return { dynamic, currentRows };
}

async function cleanup(dataSource, fixture) {
  await dataSource.transaction(async (manager) => {
    await manager.query("SET LOCAL lock_timeout='10s'");
    await manager.query("SET LOCAL statement_timeout='30s'");
    for (const id of [fixture.workspaceId, fixture.foreignWorkspaceId].sort())
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`delivery:${id}`],
      );
    const checked = await validate(manager, fixture);
    if (!checked) return;
    for (const table of [
      ...CONTENT_TABLES,
      'deliveryReviewAssignment',
      'deliveryTask',
      'roleTarget',
      'role',
    ]) {
      const ids = checked.currentRows
        .find((item) => item.schema === 'core' && item.name === table)
        .rows.map((item) => item.id);
      const removed = await manager.query(
        `WITH removed AS (DELETE FROM core.${quote(table)} WHERE "workspaceId"=ANY($1::uuid[]) AND id=ANY($2::uuid[]) RETURNING id) SELECT id FROM removed`,
        [[fixture.workspaceId, fixture.foreignWorkspaceId], ids],
      );
      assert.deepEqual(removed.map((item) => item.id).sort(), ids.sort());
    }
    await cleanupFixture(manager, fixture);
    assert.equal(
      await originalDigest((...arguments_) => manager.query(...arguments_)),
      fixture.original,
    );
    if (process.env.OTOGROW_CONTENT_PROOF_FAILURE === 'CLEANUP_PRECOMMIT')
      throw new Error('Injected CLEANUP_PRECOMMIT failure.');
  });
  const receipt = `${FILE}.${fixture.workspaceId}.cleaned.json`;
  if (!existsSync(receipt))
    writeJournal(
      {
        checker: CHECKER,
        workspaceId: fixture.workspaceId,
        original: fixture.original,
        cleaned: true,
      },
      receipt,
      true,
    );
  if (existsSync(FILE)) {
    unlinkSync(FILE);
    syncDirectory(FILE);
  }
}
module.exports = {
  FILE,
  CHECKER,
  saveJournal,
  readJournal,
  journalCommand,
  ownedRows,
  validate,
  cleanup,
};
