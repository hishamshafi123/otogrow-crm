const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { connectionSource } = require('../dist/database/typeorm/core/core.datasource');
const { INSTANCE_COMMANDS } = require('../dist/database/commands/upgrade-version-command/instance-commands.constant');
const { AddOtogrowActivityAnalysisFastInstanceCommand: Command } = require('../dist/database/commands/upgrade-version-command/2-34/2-34-instance-command-fast-1793500218540-add-otogrow-activity-analysis');
const { getRegisteredInstanceCommandMetadata } = require('../dist/engine/core-modules/upgrade/decorators/registered-instance-command.decorator');
const { TWENTY_CURRENT_VERSION } = require('../dist/engine/core-modules/upgrade/constants/twenty-current-version.constant');
const { userTables, dataFingerprint, schemaFingerprint, indexRows } = require('./check-delivery-assistant-indexes-migration.cjs');
const { createReviewFixture } = require('./check-delivery-creative-review-support.cjs');

const EPOCH = 1793500218540;
const TABLE = 'otogrowActivityAnalysisRun';
const INDEXES = [
  { name: 'IDX_c2a6736a8d4db7ba9ccf7f34a3', columns: ['status', 'updatedAt', 'id'], unique: false },
  { name: 'IDX_f6f2b54af97199c849843f4a6b', columns: ['workspaceId', 'agentId', 'createdAt'], unique: false },
  { name: 'IDX_426e066c40c7c5b790f0cb4ece', columns: ['workspaceId', 'createdAt', 'id'], unique: false },
  { name: 'IDX_ec3c6b86634faa444ff1fc226a', columns: ['workspaceId', 'cancelRequestId'], unique: true, predicate: '("cancelRequestId" IS NOT NULL)' },
  { name: 'IDX_e1abec1bdd13cf1849b8b2a9f8', columns: ['workspaceId', 'requestId'], unique: true },
  { name: 'IDX_32d32a9dc469f91f3ee73ef11b', columns: ['workspaceId', 'id'], unique: true },
];
const quote = (value) => { assert(/^[a-zA-Z0-9_]+$/.test(value)); return `"${value}"`; };
async function history(runner) {
  const [row] = await runner.query(`SELECT
    (SELECT count(*)::integer FROM core."otogrowActivityAnalysisRun") AS runs,
    (SELECT count(*)::integer FROM core."otogrowAiSpend" WHERE "sourceKind"='ACTIVITY_ANALYSIS') AS spend,
    (SELECT count(*)::integer FROM core."otogrowActivityEvent" WHERE "sourceType"='activity-analysis' OR action LIKE 'ACTIVITY_ANALYSIS_%') AS activity,
    (SELECT count(*)::integer FROM core."deliveryAgent" WHERE configuration->>'kind'='ACTIVITY') AS configuration`);
  return row;
}
const EMPTY_HISTORY = { runs: 0, spend: 0, activity: 0, configuration: 0 };
async function assertSchema(runner) {
  const [{ defaultCollation }] = await runner.query(`SELECT oid::integer AS "defaultCollation" FROM pg_collation WHERE collname='default' AND collnamespace='pg_catalog'::regnamespace`);
  const actual = await indexRows(runner, INDEXES);
  assert.equal(actual.length, 6);
  for (const expected of INDEXES) assert.deepEqual(actual.find((row) => row.name === expected.name), {
    schema: 'core', name: expected.name, tableSchema: 'core', tableName: TABLE, method: 'btree', primary: false,
    unique: expected.unique, valid: true, ready: true, live: true, replicaIdentity: false,
    attributeCount: expected.columns.length, keyCount: expected.columns.length, simple: true,
    predicate: expected.predicate ?? null, options: null, tablespace: 0,
    columns: expected.columns,
    keyOptions: expected.columns.map(() => 0),
    collations: expected.columns.map((name) => name === 'status' ? defaultCollation : 0),
    defaultOperatorClasses: expected.columns.map(() => true),
  });
  const [count] = await runner.query(`SELECT count(*)::integer AS count FROM pg_indexes WHERE schemaname='core' AND tablename=$1`, [TABLE]);
  assert.equal(count.count, 7, 'Six indexes and primary key only.');
  const constraints = await runner.query(`SELECT contype AS type,convalidated AS validated,pg_get_constraintdef(oid) AS definition,confdeltype::text AS "deleteAction" FROM pg_constraint WHERE conrelid='core."otogrowActivityAnalysisRun"'::regclass`);
  assert.equal(constraints.length, 7);
  assert(constraints.every((row) => row.validated));
  assert.equal(constraints.filter((row) => row.type === 'c').length, 5);
  assert.equal(constraints.filter((row) => row.type === 'p').length, 1);
  const foreign = constraints.filter((row) => row.type === 'f');
  assert.equal(foreign.length, 1);
  assert(foreign[0].definition.includes('FOREIGN KEY ("workspaceId") REFERENCES core.workspace(id)'));
  assert.equal(foreign[0].deleteAction, 'c');
  const columns = await runner.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='core' AND table_name=$1`, [TABLE]);
  assert(!columns.some((row) => ['taskId', 'projectId', 'companyId'].includes(row.column_name)), 'Company activity does not manufacture a task or client allocation.');
}
async function insertRun(runner, fixture, changes = {}) {
  const values = { workspaceId: fixture.workspaceId, id: randomUUID(), requestId: randomUUID(),
    initiatorId: fixture.people.admin.memberId, initiatorName: 'Synthetic migration actor', userWorkspaceId: fixture.people.admin.userWorkspaceId,
    agentId: randomUUID(), agentVersion: 1, revision: 1, status: 'QUEUED', inputHash: 'a'.repeat(64),
    bodyFingerprint: 'b'.repeat(64), contextFingerprint: 'c'.repeat(64), input: {}, configuration: {}, agent: {}, basis: {}, context: {}, startReceipt: {},
    result: null, cancelRequestId: null, cancelInputHash: null, cancelReceipt: null, ...changes };
  const fields = Object.keys(values);
  await runner.query(`INSERT INTO core."otogrowActivityAnalysisRun" (${fields.map(quote).join(',')}) VALUES(${fields.map((_, index) => `$${index + 1}`).join(',')})`, Object.values(values));
  return values;
}
async function main() {
  assert.equal(process.argv.length, 2, 'Rollback-only checker; no apply/commit mode.');
  assert(['localhost', '127.0.0.1'].includes(new URL(connectionSource.options.url).hostname), 'Local database only.');
  assert.equal(TWENTY_CURRENT_VERSION, '2.34.0');
  assert.equal(INSTANCE_COMMANDS.filter((command) => command === Command).length, 1);
  assert.deepEqual(getRegisteredInstanceCommandMetadata(Command), { version: '2.34.0', timestamp: EPOCH, type: 'fast' });
  assert(EPOCH <= Date.now() + 60000);
  for (const command of INSTANCE_COMMANDS) {
    const metadata = getRegisteredInstanceCommandMetadata(command);
    if (metadata?.version === '2.34.0' && command !== Command) assert(metadata.timestamp < EPOCH);
  }
  await connectionSource.initialize();
  const runner = connectionSource.createQueryRunner();
  try {
    await runner.connect(); await runner.startTransaction();
    await runner.query("SET LOCAL lock_timeout='10s'"); await runner.query("SET LOCAL statement_timeout='30s'");
    const originalTables = await userTables(runner);
    for (const table of originalTables) await runner.query(`LOCK TABLE ${quote(table.schema)}.${quote(table.name)} IN SHARE MODE`);
    const originalData = await dataFingerprint(runner, [TABLE]);
    const originalSchema = await schemaFingerprint(runner);
    const protectedSchema = await schemaFingerprint(runner, false, [], '', [TABLE]);
    const present = async () => (await runner.query(`SELECT to_regclass('core."otogrowActivityAnalysisRun"') IS NOT NULL AS present`))[0].present;
    const installed = await present();
    const migration = new Command();
    let sequence = 0;
    const isolated = async (label, action) => {
      const name = `activity_migration_${++sequence}`;
      await runner.query(`SAVEPOINT ${name}`);
      try { return await action(); }
      catch (error) { error.message = `${label}: ${error.message}`; throw error; }
      finally { await runner.query(`ROLLBACK TO SAVEPOINT ${name}`); await runner.query(`RELEASE SAVEPOINT ${name}`); }
    };
    const rejects = (label, action, code) => isolated(label, () => assert.rejects(action, (error) => error.code === code, label));
    const preserved = async () => {
      assert.deepEqual(await dataFingerprint(runner, [TABLE]), originalData, 'All original core/native rows must be preserved.');
      assert.equal(await schemaFingerprint(runner, false, [], '', [TABLE]), protectedSchema, 'Only the new analysis table may differ.');
    };
    if (installed) {
      await assertSchema(runner);
      assert.deepEqual(await history(runner), EMPTY_HISTORY, 'Do not delete retained history/configuration to make a proof pass.');
      await migration.down(runner);
    }
    const absentSchema = await schemaFingerprint(runner);
    await migration.up(runner); assert(await present()); await assertSchema(runner); await preserved();
    const addedSchema = await schemaFingerprint(runner);
    if (installed) assert.equal(addedSchema, originalSchema);
    assert.deepEqual(await history(runner), EMPTY_HISTORY);
    await isolated('Disposable migration fixture', async () => {
      const fixture = await createReviewFixture(runner.manager, 'ai_audit_migration');
      await isolated('Identity/lifecycle constraints', async () => {
        const original = await insertRun(runner, fixture);
        await rejects('Global run identity', () => insertRun(runner, fixture, { id: original.id }), '23505');
        await rejects('Scoped request identity', () => insertRun(runner, fixture, { requestId: original.requestId }), '23505');
        await rejects('Workspace must exist', () => insertRun(runner, fixture, { workspaceId: randomUUID() }), '23503');
        await insertRun(runner, fixture, { workspaceId: fixture.foreignWorkspaceId, requestId: original.requestId });
        await rejects('Global id cannot cross workspace', () => insertRun(runner, fixture, { workspaceId: fixture.foreignWorkspaceId, id: original.id }), '23505');
        const cancelled = await insertRun(runner, fixture, { status: 'CANCELLED', cancelRequestId: randomUUID(), cancelInputHash: 'd'.repeat(64), cancelReceipt: {} });
        await rejects('Scoped cancellation identity', () => insertRun(runner, fixture, { status: 'CANCELLED', cancelRequestId: cancelled.cancelRequestId, cancelInputHash: 'e'.repeat(64), cancelReceipt: {} }), '23505');
        for (const [label, changes] of [
          ['Positive revision', { revision: 0 }], ['Positive assistant version', { agentVersion: 0 }],
          ['Known lifecycle only', { status: 'APPROVED' }], ['Valid input hash', { inputHash: 'invalid' }],
          ['Valid body hash', { bodyFingerprint: 'invalid' }], ['Valid context hash', { contextFingerprint: 'invalid' }],
          ['Success requires result', { status: 'SUCCEEDED' }], ['Unfinished run has no result', { result: {} }],
          ['Cancellation requires complete receipt', { status: 'CANCELLED', cancelRequestId: randomUUID() }],
          ['Cancellation hash requires identity', { status: 'CANCELLED', cancelInputHash: 'd'.repeat(64) }],
          ['Cancellation receipt requires identity', { status: 'CANCELLED', cancelReceipt: {} }],
          ['Cancellation hash cannot be null', { status: 'CANCELLED', cancelRequestId: randomUUID(), cancelInputHash: null, cancelReceipt: {} }],
          ['Cancellation hash must be valid', { status: 'CANCELLED', cancelRequestId: randomUUID(), cancelInputHash: 'bad', cancelReceipt: {} }],
          ['Cancellation receipt requires cancelled state', { cancelRequestId: randomUUID(), cancelInputHash: 'd'.repeat(64), cancelReceipt: {} }],
        ]) await rejects(label, () => insertRun(runner, fixture, changes), '23514');
        await insertRun(runner, fixture, { status: 'SUCCEEDED', result: {} });
      });
      const guard = (kind, seed) => isolated(`Independent ${kind} guard`, async () => {
        assert.deepEqual(await history(runner), EMPTY_HISTORY); await seed();
        const expected = { ...EMPTY_HISTORY, [kind]: 1 };
        assert.deepEqual(await history(runner), expected);
        const before = await schemaFingerprint(runner);
        await assert.rejects(() => migration.down(runner), /Refusing to remove activity analysis history/);
        assert(await present()); assert.deepEqual(await history(runner), expected);
        assert.equal(await schemaFingerprint(runner), before, 'Rejected downgrade executes no destructive schema change.');
      });
      await guard('runs', () => insertRun(runner, fixture));
      await guard('spend', () => runner.query(`INSERT INTO core."otogrowAiSpend" (id,"workspaceId","sourceKind","sourceRunId","actorId",state,"reservedMicroUsd",price) VALUES($1,$2,'ACTIVITY_ANALYSIS',$3,$4,'RESERVED',1,'{}')`, [randomUUID(), fixture.workspaceId, randomUUID(), fixture.people.admin.memberId]));
      await guard('activity', () => runner.query(`INSERT INTO core."otogrowActivityEvent" (id,"workspaceId","occurredAt","actorName","actorType",category,action,outcome,summary,"sourceType","sourceId") VALUES($1,$2,now(),'Synthetic migration actor','SYSTEM','AGENT','ACTIVITY_ANALYSIS_STARTED','QUEUED','Synthetic protected history','activity-analysis',$3)`, [randomUUID(), fixture.workspaceId, randomUUID()]));
      await guard('configuration', () => runner.query(`INSERT INTO core."deliveryAgent" (id,"workspaceId",configuration) VALUES($1,$2,'{"kind":"ACTIVITY"}')`, [randomUUID(), fixture.workspaceId]));
    });
    await preserved(); assert.deepEqual(await history(runner), EMPTY_HISTORY);
    await migration.down(runner); assert.equal(await present(), false); assert.equal(await schemaFingerprint(runner), absentSchema); await preserved();
    await migration.up(runner); await assertSchema(runner); assert.equal(await schemaFingerprint(runner), addedSchema); await preserved();
    if (!installed) await migration.down(runner);
    assert.equal(await schemaFingerprint(runner), originalSchema); assert.deepEqual(await userTables(runner), originalTables); await preserved();
    console.log(`PASS activity analysis migration: ${originalTables.length} protected tables; six exact indexes, workspace-only FK, identity/state/result/cancellation constraints and four independent retained-history/configuration guards; full up/down/re-up preserved original schema/data. All changes rolled back.`);
  } finally { if (runner.isTransactionActive) await runner.rollbackTransaction(); await runner.release(); await connectionSource.destroy(); }
}
if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
