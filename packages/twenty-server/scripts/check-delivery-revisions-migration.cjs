const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  AddDeliveryRevisionsFastInstanceCommand,
} = require('../dist/database/commands/upgrade-version-command/2-34/2-34-instance-command-fast-1793065339880-add-delivery-revisions');
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
    const migration = new AddDeliveryRevisionsFastInstanceCommand();
    // The outer rollback restores an already-installed table and all its original rows.
    if (
      (
        await runner.query(
          `SELECT to_regclass('core."deliveryRevision"') AS table`,
        )
      )[0].table
    )
      await migration.down(runner);
    await migration.up(runner);
    const [{ id: workspaceId }] = await runner.query(
      'SELECT id FROM core.workspace LIMIT 1',
    );
    const taskId = randomUUID(),
      projectId = randomUUID();
    const insert = (round, version) =>
      runner.query(
        'INSERT INTO core."deliveryRevision" ("workspaceId","taskId","projectId",round,"taskRevision",source,reason) VALUES ($1,$2,$3,$4,$5,\'INTERNAL_REVIEW\',\'Fixture\')',
        [workspaceId, taskId, projectId, round, version],
      );
    await insert(1, 2);
    const [row] = await runner.query(
      'SELECT * FROM core."deliveryRevision" WHERE "taskId"=$1',
      [taskId],
    );
    assert.equal(row.internalCost, null);
    assert.equal(row.effortMinutes, null);
    assert.equal(row.proposedCharge, '0');
    assert.equal(row.cause, 'UNCLASSIFIED');
    for (const [round, version] of [
      [1, 3],
      [2, 2],
    ]) {
      await runner.query('SAVEPOINT duplicate_round');
      await assert.rejects(
        insert(round, version),
        (error) => error.code === '23505',
      );
      await runner.query('ROLLBACK TO SAVEPOINT duplicate_round');
    }
    await migration.down(runner);
    assert.equal(
      (
        await runner.query(
          `SELECT to_regclass('core."deliveryRevision"') AS table`,
        )
      )[0].table,
      null,
    );
    console.log(
      'PASS revision migration up/down, unique round and transition, unknown cost/effort and zero-charge defaults. Rolled back.',
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
