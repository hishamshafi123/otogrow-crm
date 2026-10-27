const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  AddDeliveryKnowledgeCategoryFastInstanceCommand,
} = require('../dist/database/commands/upgrade-version-command/2-34/2-34-instance-command-fast-1793086114105-add-delivery-knowledge-category');
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
    const command = new AddDeliveryKnowledgeCategoryFastInstanceCommand();
    const installed = await runner.query(
      "SELECT 1 FROM information_schema.columns WHERE table_schema='core' AND table_name='deliveryKnowledgeVersion' AND column_name='category'",
    );
    if (installed.length) await command.down(runner);
    const [{ id: workspaceId }] = await runner.query(
      'SELECT id FROM core.workspace LIMIT 1',
    );
    const sourceId = randomUUID();
    await runner.query(
      'INSERT INTO core."deliveryKnowledgeVersion" ("workspaceId","sourceId",version,title,"meetingDate","sourceUrl",transcript,knowledge,"createdBy") VALUES ($1,$2,1,\'Legacy meeting\',\'2026-10-27\',\'\',\'Original evidence\',\'Reviewed facts\',$3)',
      [workspaceId, sourceId, randomUUID()],
    );
    await command.up(runner);
    const [row] = await runner.query(
      'SELECT category,transcript,knowledge FROM core."deliveryKnowledgeVersion" WHERE "sourceId"=$1',
      [sourceId],
    );
    assert.deepEqual(row, {
      category: 'MEETING',
      transcript: 'Original evidence',
      knowledge: 'Reviewed facts',
    });
    await command.down(runner);
    assert.equal(
      (
        await runner.query(
          'SELECT transcript FROM core."deliveryKnowledgeVersion" WHERE "sourceId"=$1',
          [sourceId],
        )
      )[0].transcript,
      'Original evidence',
    );
    console.log(
      'PASS category migration up/down, legacy meeting default and evidence preservation. Rolled back.',
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
