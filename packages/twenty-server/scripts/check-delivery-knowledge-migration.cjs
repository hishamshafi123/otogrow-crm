const assert = require('node:assert/strict');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  AddDeliveryKnowledgeFastInstanceCommand,
} = require('../dist/database/commands/upgrade-version-command/2-34/2-34-instance-command-fast-1792999216929-add-delivery-knowledge');
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
    const tables = ['deliveryKnowledgeSource', 'deliveryKnowledgeVersion'];
    const exists = async (table) =>
      (
        await runner.query('SELECT to_regclass($1) AS name', [
          `core."${table}"`,
        ])
      )[0].name;
    for (const table of tables)
      assert.equal(await exists(table), null, 'Run before applying migration');
    const migration = new AddDeliveryKnowledgeFastInstanceCommand();
    await migration.up(runner);
    for (const table of tables) assert(await exists(table));
    await migration.down(runner);
    for (const table of tables) assert.equal(await exists(table), null);
    console.log(
      'PASS meeting-knowledge migration up/down. Transaction rolled back.',
    );
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
