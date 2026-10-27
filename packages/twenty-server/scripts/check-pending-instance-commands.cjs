// Read-only evidence before the normal migration CLI: never runs migration methods.
const assert = require('node:assert/strict');
const { connectionSource } = require('../dist/database/typeorm/core/core.datasource');
const { INSTANCE_COMMANDS } = require('../dist/database/commands/upgrade-version-command/instance-commands.constant');
const { getRegisteredInstanceCommandMetadata } = require('../dist/engine/core-modules/upgrade/decorators/registered-instance-command.decorator');
const { TWENTY_CROSS_UPGRADE_SUPPORTED_VERSIONS } = require('../dist/engine/core-modules/upgrade/constants/twenty-cross-upgrade-supported-version.constant');

async function main() {
  assert(['localhost', '127.0.0.1'].includes(new URL(connectionSource.options.url).hostname));
  const expected = process.argv.slice(2);
  assert(expected.length > 0, 'Supply the exact expected pending fast command names.');
  await connectionSource.initialize();
  try {
    const attempts = await connectionSource.query('SELECT DISTINCT ON (name) name,status FROM core."upgradeMigration" WHERE "workspaceId" IS NULL ORDER BY name,attempt DESC');
    const completed = new Set(attempts.filter((attempt) => attempt.status === 'completed').map((attempt) => attempt.name));
    const pending = INSTANCE_COMMANDS.flatMap((command) => {
      const metadata = getRegisteredInstanceCommandMetadata(command);
      if (!metadata || !TWENTY_CROSS_UPGRADE_SUPPORTED_VERSIONS.includes(metadata.version)) return [];
      const name = `${metadata.version}_${command.name}_${metadata.timestamp}`;
      return completed.has(name) ? [] : [{ name, type: metadata.type }];
    });
    const pendingFast = pending.filter((command) => command.type === 'fast').map((command) => command.name);
    const pendingSlow = pending.filter((command) => command.type === 'slow').map((command) => command.name);
    const pendingLegacy = await connectionSource.showMigrations();
    console.log(JSON.stringify({ pendingFast, pendingSlowCount: pendingSlow.length, pendingLegacy, note: 'Slow commands require --include-slow; do not pass that flag.' }));
    assert.deepEqual(pendingFast.sort(), expected.sort());
    assert.equal(pendingLegacy, false);
  } finally {
    await connectionSource.destroy();
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
