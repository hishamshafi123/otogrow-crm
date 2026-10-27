const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { connectionSource } = require('../dist/database/typeorm/core/core.datasource');
const { AddDeliveryWorkflowsFastInstanceCommand } = require('../dist/database/commands/upgrade-version-command/2-34/2-34-instance-command-fast-1792930786458-add-delivery-workflows');

async function main() {
  assert(['localhost', '127.0.0.1'].includes(new URL(connectionSource.options.url).hostname));
  await connectionSource.initialize();
  const runner = connectionSource.createQueryRunner();
  try {
    await runner.connect();
    await runner.startTransaction();
    const tables = ['deliveryWorkflowTemplate', 'deliveryWorkflowVersion', 'deliveryWorkflowArchive'];
    const exists = async (table) => (await runner.query('SELECT to_regclass($1) AS name', [`core."${table}"`]))[0].name;
    for (const table of tables) assert.equal(await exists(table), null, 'Run before applying the workflow migration.');
    const migration = new AddDeliveryWorkflowsFastInstanceCommand();
    await migration.up(runner);
    for (const table of tables) assert(await exists(table));
    const [workspace] = await runner.query('SELECT id FROM core.workspace LIMIT 1');
    const templateId = randomUUID();
    for (let index = 0; index < 2; index++) {
      await runner.query(`INSERT INTO core."deliveryWorkflowVersion" ("workspaceId","templateId",version,definition,"publishedBy","publishedByName",reason) VALUES ($1,$2,1,'{}',$3,'Migration fixture','Disposable migration check') ON CONFLICT ("workspaceId","templateId",version) DO NOTHING`, [workspace.id, templateId, randomUUID()]);
    }
    const [result] = await runner.query('SELECT count(*)::int AS count FROM core."deliveryWorkflowVersion" WHERE "workspaceId"=$1 AND "templateId"=$2', [workspace.id, templateId]);
    assert.equal(result.count, 1, 'Each template version must be unique.');
    await migration.down(runner);
    for (const table of tables) assert.equal(await exists(table), null);
    console.log('PASS: workflow migration up/down and unique template version. Rolled back.');
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
