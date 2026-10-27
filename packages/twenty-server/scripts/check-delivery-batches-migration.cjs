const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { connectionSource } = require('../dist/database/typeorm/core/core.datasource');
const { AddDeliveryBatchesFastInstanceCommand } = require('../dist/database/commands/upgrade-version-command/2-34/2-34-instance-command-fast-1792937196864-add-delivery-batches');

async function main() {
  assert(['localhost', '127.0.0.1'].includes(new URL(connectionSource.options.url).hostname));
  await connectionSource.initialize();
  const runner = connectionSource.createQueryRunner();
  try {
    await runner.connect();
    await runner.startTransaction();
    const tables = ['deliveryBatch', 'deliveryBatchItem', 'deliveryBatchEvent'];
    const exists = async (table) => (await runner.query('SELECT to_regclass($1) AS name', [`core."${table}"`]))[0].name;
    for (const table of tables) assert.equal(await exists(table), null, 'Run before applying the batch migration.');
    const migration = new AddDeliveryBatchesFastInstanceCommand();
    await migration.up(runner);
    for (const table of tables) assert(await exists(table));
    const [workspace] = await runner.query('SELECT id FROM core.workspace LIMIT 1');
    const batchId = randomUUID(), taskId = randomUUID();
    for (let index = 0; index < 2; index++) {
      await runner.query(`INSERT INTO core."deliveryBatchItem" ("workspaceId","batchId","taskId","taskName") VALUES ($1,$2,$3,'Disposable batch task') ON CONFLICT ("workspaceId","batchId","taskId") DO NOTHING`, [workspace.id, batchId, taskId]);
    }
    const [result] = await runner.query('SELECT count(*)::int AS count FROM core."deliveryBatchItem" WHERE "workspaceId"=$1 AND "batchId"=$2', [workspace.id, batchId]);
    assert.equal(result.count, 1, 'A task occurs only once in a batch.');
    await migration.down(runner);
    for (const table of tables) assert.equal(await exists(table), null);
    console.log('PASS: batch migration up/down and unique batch membership. Rolled back.');
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
