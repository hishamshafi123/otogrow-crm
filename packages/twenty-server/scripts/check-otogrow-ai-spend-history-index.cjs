const assert = require('node:assert/strict');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  AddAiSpendHistoryIndexFastInstanceCommand,
} = require('../dist/database/commands/upgrade-version-command/2-34/2-34-instance-command-fast-1792928528022-add-ai-spend-history-index');

async function main() {
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  await connectionSource.initialize();
  const runner = connectionSource.createQueryRunner();
  try {
    await runner.connect();
    const definition = async () =>
      (
        await runner.query(
          'SELECT indexdef FROM pg_indexes WHERE schemaname=$1 AND tablename=$2 AND indexname=$3',
          ['core', 'otogrowAiSpendEvent', 'IDX_1a527d53799c9d81d8295ab1c4'],
        )
      )[0]?.indexdef;
    const original = await definition();
    assert.match(original, /\("workspaceId", "spendId", "createdAt", id\)/);
    await runner.startTransaction();
    try {
      await runner.query("SET LOCAL lock_timeout='2s'");
      await runner.query("SET LOCAL statement_timeout='10s'");
      const migration = new AddAiSpendHistoryIndexFastInstanceCommand();
      await migration.down(runner);
      assert.equal(await definition(), undefined);
      await migration.up(runner);
      assert.equal(await definition(), original);
    } finally {
      await runner.rollbackTransaction();
    }
    assert.equal(await definition(), original);
    console.log(
      'PASS: exact spend-history index exists in pg_indexes; generated down/up passed inside a rolled-back transaction, and the original definition remains unchanged.',
    );
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
