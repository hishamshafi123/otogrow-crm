const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  AddDeliveryAvailabilityFastInstanceCommand,
} = require('../dist/database/commands/upgrade-version-command/2-34/2-34-instance-command-fast-1793060080823-add-delivery-availability');
(async () => {
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  await connectionSource.initialize();
  const runner = connectionSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    assert.equal(
      (
        await runner.query(
          `SELECT to_regclass('core."deliveryAvailability"') AS table`,
        )
      )[0].table,
      null,
    );
    const migration = new AddDeliveryAvailabilityFastInstanceCommand();
    await migration.up(runner);
    const [{ id: workspaceId }] = await runner.query(
      'SELECT id FROM core.workspace LIMIT 1',
    );
    const memberId = randomUUID();
    await runner.query(
      'INSERT INTO core."deliveryAvailability" ("workspaceId","memberId",date,minutes) VALUES ($1,$2,\'2026-11-01\',NULL)',
      [workspaceId, memberId],
    );
    const [row] = await runner.query(
      'SELECT * FROM core."deliveryAvailability" WHERE "memberId"=$1',
      [memberId],
    );
    assert.equal(row.revision, 1);
    assert.equal(row.minutes, null);
    await runner.query('SAVEPOINT duplicate_slot');
    await assert.rejects(
      runner.query(
        'INSERT INTO core."deliveryAvailability" ("workspaceId","memberId",date,minutes) VALUES ($1,$2,\'2026-11-01\',0)',
        [workspaceId, memberId],
      ),
      (error) => error.code === '23505',
    );
    await runner.query('ROLLBACK TO SAVEPOINT duplicate_slot');
    await migration.down(runner);
    assert.equal(
      (
        await runner.query(
          `SELECT to_regclass('core."deliveryAvailability"') AS table`,
        )
      )[0].table,
      null,
    );
    console.log(
      'PASS availability migration up/down, nullable unknown, initial revision and unique member/day. All rolled back.',
    );
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
