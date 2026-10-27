const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { connectionSource } = require('../dist/database/typeorm/core/core.datasource');
const { AddDeliveryCommitmentsFastInstanceCommand } = require('../dist/database/commands/upgrade-version-command/2-34/2-34-instance-command-fast-1792929062917-add-delivery-commitments');

async function main() {
  assert(['localhost', '127.0.0.1'].includes(new URL(connectionSource.options.url).hostname));
  await connectionSource.initialize();
  const runner = connectionSource.createQueryRunner();
  try {
    await runner.connect();
    await runner.startTransaction();
    const tables = ['deliveryCommitmentPeriod', 'deliveryCommitmentLine', 'deliveryCommitmentAllocation', 'deliveryCommitmentEvent'];
    const exists = async (table) => (await runner.query('SELECT to_regclass($1) AS name', [`core."${table}"`]))[0].name;
    for (const table of tables) assert.equal(await exists(table), null, 'Run before applying the commitment migration.');
    const migration = new AddDeliveryCommitmentsFastInstanceCommand();
    await migration.up(runner);
    for (const table of tables) assert(await exists(table));
    const [workspace] = await runner.query('SELECT id FROM core.workspace LIMIT 1');
    const taskId = randomUUID();
    for (let index = 0; index < 2; index++) {
      await runner.query(`INSERT INTO core."deliveryCommitmentAllocation" ("workspaceId","periodId","lineId","taskId","taskName",state,revision) VALUES ($1,$2,$3,$4,'Migration fixture','ACTIVE',1) ON CONFLICT ("workspaceId","taskId") DO NOTHING`, [workspace.id, randomUUID(), randomUUID(), taskId]);
    }
    const [result] = await runner.query('SELECT count(*)::int AS count FROM core."deliveryCommitmentAllocation" WHERE "workspaceId"=$1 AND "taskId"=$2', [workspace.id, taskId]);
    assert.equal(result.count, 1, 'A task cannot count toward two commitment lines.');
    await migration.down(runner);
    for (const table of tables) assert.equal(await exists(table), null);
    console.log('PASS: commitment migration up/down and unique workspace/task allocation. Rolled back.');
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
