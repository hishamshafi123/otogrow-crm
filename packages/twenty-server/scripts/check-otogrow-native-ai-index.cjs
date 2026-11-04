const assert = require('node:assert/strict');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  dataFingerprint,
  schemaFingerprint,
} = require('./check-delivery-assistant-indexes-migration.cjs');
const {
  AddNativeAiRecoveryIndexFastInstanceCommand,
} = require('../dist/database/commands/upgrade-version-command/2-34/2-34-instance-command-fast-1793806940710-add-native-ai-recovery-index');

async function main() {
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  assert.equal(process.env.OTOGROW_NATIVE_AI_PROOF_SERVICES_STOPPED, '1');
  await connectionSource.initialize();
  const runner = connectionSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    const definition = () =>
      runner.query(
        `SELECT indexdef FROM pg_indexes WHERE schemaname='core' AND indexname='IDX_otogrow_native_ai_recovery'`,
      );
    assert.equal(
      (await definition()).length,
      0,
      'Never drop an installed index for a test.',
    );
    const schemaBefore = await schemaFingerprint(runner);
    const dataBefore = await dataFingerprint(runner);
    const command = new AddNativeAiRecoveryIndexFastInstanceCommand();
    await command.up(runner);
    const rows = await definition();
    assert.equal(rows.length, 1);
    assert.match(rows[0].indexdef, /\(state, "createdAt", id\)/);
    assert.match(rows[0].indexdef, /NATIVE_CRM/);
    assert.match(rows[0].indexdef, /RESERVED/);
    assert.match(rows[0].indexdef, /DISPATCHED/);
    assert.deepEqual(await dataFingerprint(runner), dataBefore);
    await command.down(runner);
    assert.equal((await definition()).length, 0);
    assert.equal(await schemaFingerprint(runner), schemaBefore);
    assert.deepEqual(await dataFingerprint(runner), dataBefore);
    console.log(
      'PASS native AI recovery index up/down; original schema and data preserved.',
    );
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
}
main().catch((error) => {
  console.error(error.stack);
  process.exitCode = 1;
});
