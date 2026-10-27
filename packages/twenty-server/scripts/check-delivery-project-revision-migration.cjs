const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  AddDeliveryProjectRevisionFastInstanceCommand,
} = require('../dist/database/commands/upgrade-version-command/2-34/2-34-instance-command-fast-1793059035908-add-delivery-project-revision');
(async () => {
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  await connectionSource.initialize();
  const runner = connectionSource.createQueryRunner();
  try {
    await runner.connect();
    await runner.startTransaction();
    const column = async () =>
      runner.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema='core' AND table_name='deliveryProject' AND column_name='revision'",
      );
    assert.equal((await column()).length, 0, 'Run before applying migration');
    const [{ id: workspaceId }] = await runner.query(
      'SELECT id FROM core.workspace WHERE "activationStatus"=\'ACTIVE\' LIMIT 1',
    );
    const projectId = randomUUID();
    await runner.query(
      'INSERT INTO core."deliveryProject" (id,"workspaceId",name,"memberIds") VALUES ($1,$2,\'Rollback migration fixture\',\'[]\')',
      [projectId, workspaceId],
    );
    const migration = new AddDeliveryProjectRevisionFastInstanceCommand();
    await migration.up(runner);
    assert.equal((await column()).length, 1);
    const [project] = await runner.query(
      'SELECT name,revision FROM core."deliveryProject" WHERE id=$1',
      [projectId],
    );
    assert.equal(project.revision, 1);
    assert.equal(project.name, 'Rollback migration fixture');
    await migration.down(runner);
    assert.equal((await column()).length, 0);
    assert.equal(
      (
        await runner.query(
          'SELECT name FROM core."deliveryProject" WHERE id=$1',
          [projectId],
        )
      )[0].name,
      project.name,
    );
    console.log(
      'PASS project revision up/down, default backfill and preserved project fields. All fixture writes rolled back.',
    );
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
