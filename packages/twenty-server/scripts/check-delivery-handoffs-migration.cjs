const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  AddDeliveryHandoffsFastInstanceCommand,
} = require('../dist/database/commands/upgrade-version-command/2-34/2-34-instance-command-fast-1793083523639-add-delivery-handoffs');
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
    const migration = new AddDeliveryHandoffsFastInstanceCommand();
    // The outer rollback preserves the installed table and every pre-existing row.
    if (
      (
        await runner.query(
          `SELECT to_regclass('core."deliveryHandoff"') AS table`,
        )
      )[0].table
    )
      await migration.down(runner);
    await migration.up(runner);
    const [{ id: workspaceId }] = await runner.query(
      'SELECT id FROM core.workspace LIMIT 1',
    );
    const opportunityId = randomUUID(),
      memberId = randomUUID();
    const insert = () =>
      runner.query(
        'INSERT INTO core."deliveryHandoff" ("workspaceId","opportunityId","projectId","engagementId","managerId","reviewerId","createdBy",source,"setupTaskIds") VALUES ($1,$2,$3,$4,$5,$6,$5,$7,$8) RETURNING *',
        [
          workspaceId,
          opportunityId,
          randomUUID(),
          randomUUID(),
          memberId,
          randomUUID(),
          { scope: 'Agreed fixture' },
          JSON.stringify([randomUUID()]),
        ],
      );
    const [row] = await insert();
    assert(row.id);
    assert(row.createdAt);
    assert.equal(row.source.scope, 'Agreed fixture');
    assert.equal(row.setupTaskIds.length, 1);
    await runner.query('SAVEPOINT duplicate_handoff');
    await assert.rejects(insert(), (error) => error.code === '23505');
    await runner.query('ROLLBACK TO SAVEPOINT duplicate_handoff');
    await migration.down(runner);
    assert.equal(
      (
        await runner.query(
          `SELECT to_regclass('core."deliveryHandoff"') AS table`,
        )
      )[0].table,
      null,
    );
    console.log(
      'PASS handoff migration up/down, source/task storage, defaults and unique workspace/deal identity. Rolled back.',
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
