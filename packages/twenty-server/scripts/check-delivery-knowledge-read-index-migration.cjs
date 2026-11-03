const assert = require('node:assert/strict');
const { readdirSync } = require('node:fs');
const { join } = require('node:path');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  INSTANCE_COMMANDS,
} = require('../dist/database/commands/upgrade-version-command/instance-commands.constant');
const {
  getRegisteredInstanceCommandMetadata,
} = require('../dist/engine/core-modules/upgrade/decorators/registered-instance-command.decorator');
const {
  TWENTY_CURRENT_VERSION,
} = require('../dist/engine/core-modules/upgrade/constants/twenty-current-version.constant');

const EPOCH = 1793415137847;
const VERSION = '2.34.0';
const INDEXES = [
  {
    name: 'IDX_c2ff827a4faa933f7ef945ea04',
    columns: ['workspaceId', 'projectId', 'createdAt', 'id'],
  },
];
const TABLE = 'deliveryKnowledgeSource';
const {
  userTables,
  dataFingerprint,
  schemaFingerprint,
  indexRows,
  exactIndexes,
  runMigration,
} = require('./check-delivery-assistant-indexes-migration.cjs');
const quote = (value) => '"' + value.replaceAll('"', '""') + '"';

async function main() {
  assert.equal(
    process.argv.length,
    2,
    'This checker has no apply/commit mode and always rolls back.',
  );
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
    'Local database only.',
  );
  assert.equal(TWENTY_CURRENT_VERSION, VERSION);
  const directory = join(
    __dirname,
    '../dist/database/commands/upgrade-version-command/2-34',
  );
  const files = readdirSync(directory).filter((file) =>
    /^2-34-instance-command-fast-\d+-add-delivery-knowledge-read-index\.js$/.test(
      file,
    ),
  );
  assert.deepEqual(
    files,
    [
      `2-34-instance-command-fast-${EPOCH}-add-delivery-knowledge-read-index.js`,
    ],
    'Build only the one official generated read-index command.',
  );
  const { AddDeliveryKnowledgeReadIndexFastInstanceCommand } = require(
    join(directory, files[0]),
  );
  assert.equal(
    INSTANCE_COMMANDS.filter(
      (command) => command === AddDeliveryKnowledgeReadIndexFastInstanceCommand,
    ).length,
    1,
    'The generated class must be registered exactly once.',
  );
  assert.deepEqual(
    getRegisteredInstanceCommandMetadata(
      AddDeliveryKnowledgeReadIndexFastInstanceCommand,
    ),
    { version: VERSION, timestamp: EPOCH, type: 'fast' },
  );
  assert(
    EPOCH <= Date.now() + 60000,
    'The generated migration uses a real current epoch.',
  );
  for (const command of INSTANCE_COMMANDS) {
    const metadata = getRegisteredInstanceCommandMetadata(command);
    if (
      metadata?.version === VERSION &&
      command !== AddDeliveryKnowledgeReadIndexFastInstanceCommand
    )
      assert(
        metadata.timestamp < EPOCH,
        'The new current-version index migration must sort after all earlier commands.',
      );
  }
  const migration = new AddDeliveryKnowledgeReadIndexFastInstanceCommand();
  await connectionSource.initialize();
  const runner = connectionSource.createQueryRunner();
  try {
    await runner.connect();
    await runner.startTransaction();
    await runner.query("SET LOCAL lock_timeout='10s'");
    await runner.query("SET LOCAL statement_timeout='30s'");
    const tables = await userTables(runner);
    for (const table of tables)
      await runner.query(
        `LOCK TABLE ${quote(table.schema)}.${quote(table.name)} IN SHARE MODE`,
      );
    const existing = await indexRows(runner, INDEXES);
    assert(
      [0, INDEXES.length].includes(existing.length),
      'Refuse a partially installed performance-index migration.',
    );
    if (existing.length) exactIndexes(existing, INDEXES, TABLE);
    const installed = existing.length > 0;
    const originalData = await dataFingerprint(runner);
    const originalSchema = await schemaFingerprint(runner);
    const protectedSchema = await schemaFingerprint(
      runner,
      true,
      INDEXES,
      TABLE,
    );
    const unchangedData = async () =>
      assert.deepEqual(
        await dataFingerprint(runner),
        originalData,
        'No preexisting table or row may change during any index migration step.',
      );
    const unchangedSchema = async () =>
      assert.equal(
        await schemaFingerprint(runner, true, INDEXES, TABLE),
        protectedSchema,
        'Only the exact intended deliveryKnowledgeSource index definitions may differ.',
      );
    if (installed)
      await runMigration(runner, migration, 'down', INDEXES, TABLE);
    assert.deepEqual(await indexRows(runner, INDEXES), []);
    await unchangedData();
    await unchangedSchema();
    const oldSchema = await schemaFingerprint(runner);

    await runMigration(runner, migration, 'up', INDEXES, TABLE);
    exactIndexes(await indexRows(runner, INDEXES), INDEXES, TABLE);
    await unchangedData();
    await unchangedSchema();
    const addedSchema = await schemaFingerprint(runner);
    if (installed) assert.equal(addedSchema, originalSchema);

    await runMigration(runner, migration, 'down', INDEXES, TABLE);
    assert.deepEqual(await indexRows(runner, INDEXES), []);
    await unchangedData();
    await unchangedSchema();
    assert.equal(
      await schemaFingerprint(runner),
      oldSchema,
      'Down restores every earlier schema object and removes only the intended new index.',
    );

    await runMigration(runner, migration, 'up', INDEXES, TABLE);
    exactIndexes(await indexRows(runner, INDEXES), INDEXES, TABLE);
    await unchangedData();
    await unchangedSchema();
    assert.equal(
      await schemaFingerprint(runner),
      addedSchema,
      'Re-up restores the intended schema exactly.',
    );
    if (!installed)
      await runMigration(runner, migration, 'down', INDEXES, TABLE);
    assert.equal(await schemaFingerprint(runner), originalSchema);
    await unchangedData();
    assert.deepEqual(await userTables(runner), tables);
    console.log(
      `Knowledge-index migration rollback proof passed: ${tables.length} protected tables; registered current-version epoch ${EPOCH}; exact default nonunique btree index; full up/down/re-up and original schema/data preserved. No changes committed.`,
    );
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
