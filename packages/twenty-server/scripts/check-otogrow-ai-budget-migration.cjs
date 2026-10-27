const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { connectionSource } = require('../dist/database/typeorm/core/core.datasource');
const { AddOtogrowAiBudgetFastInstanceCommand } = require('../dist/database/commands/upgrade-version-command/2-34/2-34-instance-command-fast-1792926292956-add-otogrow-ai-budget');

async function main() {
  assert(['localhost', '127.0.0.1'].includes(new URL(connectionSource.options.url).hostname));
  await connectionSource.initialize();
  const runner = connectionSource.createQueryRunner();
  try {
    await runner.connect();
    await runner.startTransaction();
    const tables = ['otogrowAiBudget', 'otogrowAiPrice', 'otogrowAiSpend', 'otogrowAiSpendEvent'];
    const exists = async (table) => (await runner.query('SELECT to_regclass($1) AS name', [`core."${table}"`]))[0].name;
    for (const table of tables) assert.equal(await exists(table), null, 'Run before applying the budget migration.');
    const migration = new AddOtogrowAiBudgetFastInstanceCommand();
    await migration.up(runner);
    for (const table of tables) assert(await exists(table));
    const [workspace] = await runner.query('SELECT id FROM core.workspace LIMIT 1');
    const sourceRunId = randomUUID();
    for (let index = 0; index < 2; index++) {
      await runner.query(`INSERT INTO core."otogrowAiSpend" ("workspaceId","sourceKind","sourceRunId","actorId",state,"reservedMicroUsd",price) VALUES ($1,'TASK_AGENT',$2,$3,'RESERVED',1,'{}') ON CONFLICT ("workspaceId","sourceKind","sourceRunId") DO NOTHING`, [workspace.id, sourceRunId, randomUUID()]);
    }
    const [result] = await runner.query(`SELECT count(*)::int AS count, min("reservedMicroUsd")::text AS reserved FROM core."otogrowAiSpend" WHERE "workspaceId"=$1 AND "sourceRunId"=$2`, [workspace.id, sourceRunId]);
    assert.deepEqual(result, { count: 1, reserved: '1' });
    await migration.down(runner);
    for (const table of tables) assert.equal(await exists(table), null);
    console.log('PASS: AI budget migration up/down, micro-USD storage and unique run identity. Rolled back.');
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
