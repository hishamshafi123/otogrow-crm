const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { connectionSource } = require('../dist/database/typeorm/core/core.datasource');
const { AddDeliveryReminderOutboxFastInstanceCommand } = require('../dist/database/commands/upgrade-version-command/2-34/2-34-instance-command-fast-1792924760229-add-delivery-reminder-outbox');

async function main() {
  assert(['localhost', '127.0.0.1'].includes(new URL(connectionSource.options.url).hostname));
  await connectionSource.initialize();
  const runner = connectionSource.createQueryRunner();
  try {
    await runner.connect();
    await runner.startTransaction();
    const exists = async () => (await runner.query(`SELECT to_regclass('core."deliveryReminderOutbox"') AS name`))[0].name;
    assert.equal(await exists(), null, 'Run before applying the reminder migration.');
    const migration = new AddDeliveryReminderOutboxFastInstanceCommand();
    await migration.up(runner);
    const [workspace] = await runner.query('SELECT id FROM core.workspace LIMIT 1');
    const noticeId = randomUUID();
    for (let index = 0; index < 2; index++) {
      await runner.query(`INSERT INTO core."deliveryReminderOutbox" ("workspaceId","noticeId") VALUES ($1,$2) ON CONFLICT ("workspaceId","noticeId") DO NOTHING`, [workspace.id, noticeId]);
    }
    const [result] = await runner.query(`SELECT count(*)::int AS count, min(status) AS status FROM core."deliveryReminderOutbox" WHERE "workspaceId"=$1 AND "noticeId"=$2`, [workspace.id, noticeId]);
    assert.deepEqual(result, { count: 1, status: 'QUEUED' });
    await migration.down(runner);
    assert.equal(await exists(), null);
    console.log('PASS: reminder outbox up/down and unique notice identity. Rolled back.');
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
