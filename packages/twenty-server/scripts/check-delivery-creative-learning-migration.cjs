const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { connectionSource } = require('../dist/database/typeorm/core/core.datasource');
const { AddCreativePerformanceLearningFastInstanceCommand: Command } = require('../dist/database/commands/upgrade-version-command/2-34/2-34-instance-command-fast-1793675579721-add-creative-performance-learning');
const { INSTANCE_COMMANDS } = require('../dist/database/commands/upgrade-version-command/instance-commands.constant');
const { getRegisteredInstanceCommandMetadata } = require('../dist/engine/core-modules/upgrade/decorators/registered-instance-command.decorator');
const { userTables, dataFingerprint, schemaFingerprint } = require('./check-delivery-assistant-indexes-migration.cjs');
const { createFixture } = require('./check-delivery-reconciliation.cjs');

const TABLES = ['deliveryCreativeAdLink', 'deliveryCreativeAdVersion', 'deliveryCreativeLearningEvent', 'deliveryCreativeLesson'];
const quote = (value) => `"${value.replaceAll('"', '""')}"`;
async function main() {
  assert.equal(INSTANCE_COMMANDS.filter((candidate) => candidate === Command).length, 1);
  assert.deepEqual(getRegisteredInstanceCommandMetadata(Command), { version: '2.34.0', timestamp: 1793675579721, type: 'fast' });
  await connectionSource.initialize();
  const runner = connectionSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    await runner.query("SET LOCAL lock_timeout='10s'");
    const tables = await userTables(runner);
    assert(!tables.some((table) => table.schema === 'core' && TABLES.includes(table.name)), 'Verify the migration before installation; never erase retained learning.');
    const data = await dataFingerprint(runner, TABLES);
    const schema = await schemaFingerprint(runner);
    const protectedSchema = await schemaFingerprint(runner, false, [], '', TABLES);
    const migration = new Command();
    let sequence = 0;
    const isolated = async (operation) => {
      const name = `learning_schema_${++sequence}`;
      await runner.query(`SAVEPOINT ${name}`);
      try { return await operation(); }
      finally {
        await runner.query(`ROLLBACK TO SAVEPOINT ${name}`);
        await runner.query(`RELEASE SAVEPOINT ${name}`);
      }
    };
    const reject = (operation, code) => isolated(() => assert.rejects(operation, (error) => error.code === code));
    const insert = (table, values) => {
      const fields = Object.keys(values);
      return runner.query(`INSERT INTO core.${quote(table)} (${fields.map(quote).join(',')}) VALUES(${fields.map((_, index) => `$${index + 1}`).join(',')})`, Object.values(values));
    };
    const preserved = async () => {
      assert.deepEqual(await dataFingerprint(runner, TABLES), data);
      assert.equal(await schemaFingerprint(runner, false, [], '', TABLES), protectedSchema);
    };
    const check = async () => {
      const indexes = await runner.query(`SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='core' AND tablename=ANY($1) AND indexname NOT LIKE 'PK_%'`, [TABLES]);
      assert.equal(indexes.length, 10);
      assert.equal(indexes.filter((row) => row.indexdef.startsWith('CREATE UNIQUE')).length, 6);
      const keys = await runner.query(`SELECT c.relname,pg_get_constraintdef(k.oid,true) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='core' AND c.relname=ANY($1) AND k.contype='f'`, [TABLES]);
      assert.equal(keys.length, 13);
      assert(keys.some((row) => row.definition.includes('FOREIGN KEY ("workspaceId", "taskId")')));
      assert(keys.some((row) => row.definition.includes('FOREIGN KEY ("workspaceId", "correctsId")')));
    };
    await migration.up(runner);
    await check();
    await preserved();
    const installedSchema = await schemaFingerprint(runner);
    await isolated(async () => {
      const fixture = await createFixture(runner.manager, 'learning_schema');
      const taskId = randomUUID();
      await insert('deliveryTask', { workspaceId: fixture.workspaceId, taskId, projectId: fixture.projects.first, revision: 1, details: {} });
      const link = (fields = {}) => ({ id: randomUUID(), workspaceId: fixture.workspaceId, projectId: fixture.projects.first, sourceProjectId: fixture.projects.first, sourceId: randomUUID(), adId: '1000', taskId, assetId: randomUUID(), createdBy: fixture.people.writer.memberId, createdByName: 'FIXTURE author', revision: 1, currentVersion: 1, state: 'DRAFT', ...fields });
      const initial = link();
      const event = (fields = {}) => ({ id: randomUUID(), workspaceId: fixture.workspaceId, linkId: initial.id, requestId: randomUUID(), inputHash: 'a'.repeat(64), actorId: fixture.people.writer.memberId, userWorkspaceId: fixture.people.writer.userWorkspaceId, actorName: 'FIXTURE author', action: 'SAVE', revision: 1, version: 1, state: 'DRAFT', note: '', ...fields });
      const assertRetained = () => isolated(() => assert.rejects(() => migration.down(runner), /Cannot remove retained creative learning history/));
      await isolated(async () => {
        await insert('deliveryCreativeAdLink', initial);
        await assertRetained();
        await reject(() => insert('deliveryCreativeAdLink', link({ taskId: randomUUID() })), '23503');
        await reject(() => insert('deliveryCreativeAdLink', link({ projectId: fixture.projects.foreign })), '23503');
        await reject(() => insert('deliveryCreativeAdLink', link({ state: 'REVIEWED', reviewedBy: fixture.people.admin.memberId, reviewedAt: new Date() })), '23514');
        await reject(() => insert('deliveryCreativeAdLink', link({ state: 'REVIEWED', reviewedVersion: 1, reviewedBy: fixture.people.writer.memberId, reviewedAt: new Date() })), '23514');
        await insert('deliveryCreativeAdVersion', { workspaceId: fixture.workspaceId, linkId: initial.id, version: 1, body: {}, createdBy: fixture.people.writer.memberId, createdByName: 'FIXTURE author' });
        await reject(() => insert('deliveryCreativeAdVersion', { workspaceId: fixture.workspaceId, linkId: initial.id, version: 1, body: {}, createdBy: fixture.people.writer.memberId, createdByName: 'FIXTURE author' }), '23505');
        const firstEvent = event();
        await insert('deliveryCreativeLearningEvent', firstEvent);
        await reject(() => insert('deliveryCreativeLearningEvent', event({ requestId: firstEvent.requestId })), '23505');
        await reject(() => insert('deliveryCreativeLearningEvent', event({ inputHash: 'invalid' })), '23514');
        await insert('deliveryCreativeLesson', { id: randomUUID(), workspaceId: fixture.workspaceId, projectId: fixture.projects.first, anchorLinkId: initial.id, linkIds: [initial.id], body: {}, createdBy: fixture.people.admin.memberId, createdByName: 'FIXTURE manager' });
        await reject(() => insert('deliveryCreativeLesson', { id: randomUUID(), workspaceId: fixture.workspaceId, projectId: fixture.projects.first, anchorLinkId: initial.id, linkIds: [], body: {}, createdBy: fixture.people.admin.memberId, createdByName: 'FIXTURE manager' }), '23514');
        await assertRetained();
      });
      await isolated(async () => {
        await runner.query('UPDATE core."deliveryTask" SET details=$3 WHERE "workspaceId"=$1 AND "taskId"=$2', [fixture.workspaceId, taskId, { submissions: [{ creativeLearning: { version: 1 } }] }]);
        await assertRetained();
      });
      await isolated(async () => {
        await insert('otogrowActivityEvent', { id: randomUUID(), workspaceId: fixture.workspaceId, occurredAt: new Date(), actorId: fixture.people.admin.memberId, actorName: 'FIXTURE manager', actorType: 'HUMAN', category: 'CREATIVE', action: 'CREATIVE_LEARNING_SAVED', outcome: 'RECORDED', summary: 'FIXTURE retained audit', sourceType: 'creative-learning', sourceId: randomUUID(), changes: JSON.stringify([]) });
        await assertRetained();
      });
    });
    await preserved();
    await migration.down(runner);
    assert.equal(await schemaFingerprint(runner), schema);
    await migration.up(runner);
    await check();
    assert.equal(await schemaFingerprint(runner), installedSchema);
    await preserved();
    console.log(`PASS learning migration: ${tables.length} original tables preserved; four tables/ten indexes/thirteen scoped FKs; approval/null/identity/version/receipt/lesson constraints, retained domain/audit/submitted-snapshot guards and full up/down/re-up. Outer rollback only.`);
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
