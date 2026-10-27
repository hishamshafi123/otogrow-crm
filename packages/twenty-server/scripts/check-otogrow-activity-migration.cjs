const assert = require('node:assert/strict');
const { connectionSource } = require('../dist/database/typeorm/core/core.datasource');
const { AddOtogrowActivityFastInstanceCommand } = require('../dist/database/commands/upgrade-version-command/2-34/2-34-instance-command-fast-1792921997275-add-otogrow-activity');

const { AddActivitySourceNamesFastInstanceCommand } = require('../dist/database/commands/upgrade-version-command/2-34/2-34-instance-command-fast-1792923507475-add-activity-source-names');

async function main() {
  assert(['localhost', '127.0.0.1'].includes(new URL(connectionSource.options.url).hostname));
  await connectionSource.initialize();
  const runner = connectionSource.createQueryRunner();
  try {
    await runner.connect();
    await runner.startTransaction();
    if (process.argv.includes('--source-names')) {
      const columns = () => runner.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='core' AND table_name='otogrowActivityEvent' AND column_name IN ('taskName','agentName') ORDER BY column_name`);
      assert.equal((await columns()).length, 0, 'Run before applying source-name migration.');
      const command = new AddActivitySourceNamesFastInstanceCommand();
      await command.up(runner);
      assert.deepEqual((await columns()).map((column) => column.column_name), ['agentName', 'taskName']);
      await command.down(runner);
      assert.equal((await columns()).length, 0);
      console.log('Activity source-name migration up/down passed; transaction rolled back.');
      return;
    }
    const [{ existing }] = await runner.query(`SELECT to_regclass('core."otogrowActivityEvent"') AS existing`);
    assert.equal(existing, null, 'Run this reversible migration check before applying the new table.');
    const command = new AddOtogrowActivityFastInstanceCommand();
    await command.up(runner);
    const [{ count }] = await runner.query(`SELECT count(*)::int AS count FROM pg_indexes WHERE schemaname='core' AND tablename='otogrowActivityEvent'`);
    assert.equal(count, 6);
    await command.down(runner);
    const [{ removed }] = await runner.query(`SELECT to_regclass('core."otogrowActivityEvent"') AS removed`);
    assert.equal(removed, null);
    console.log('Activity migration up/down passed; transaction rolled back.');
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
