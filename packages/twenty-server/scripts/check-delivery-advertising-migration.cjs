const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
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
const {
  userTables,
  dataFingerprint,
  schemaFingerprint,
} = require('./check-delivery-assistant-indexes-migration.cjs');
const {
  createReviewFixture,
} = require('./check-delivery-creative-review-support.cjs');
const TABLES = [
  'deliveryAdvertisingReview',
  'deliveryAdvertisingAction',
  'deliveryAdvertisingObservation',
  'deliveryAdvertisingEvent',
];
const quote = (value) => '"' + value.replaceAll('"', '""') + '"';

async function main() {
  assert.equal(
    process.argv.length,
    2,
    'This migration checker always rolls back.',
  );
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  const directory = join(
    __dirname,
    '../dist/database/commands/upgrade-version-command/2-34',
  );
  const files = readdirSync(directory).filter((file) =>
    /^2-34-instance-command-fast-\d+-add-delivery-advertising-workbench\.js$/.test(
      file,
    ),
  );
  assert.equal(
    files.length,
    1,
    'Build exactly one official generated command.',
  );
  const { AddDeliveryAdvertisingWorkbenchFastInstanceCommand } = require(
    join(directory, files[0]),
  );
  assert.equal(
    INSTANCE_COMMANDS.filter(
      (command) =>
        command === AddDeliveryAdvertisingWorkbenchFastInstanceCommand,
    ).length,
    1,
  );
  const metadata = getRegisteredInstanceCommandMetadata(
    AddDeliveryAdvertisingWorkbenchFastInstanceCommand,
  );
  assert.equal(metadata.version, TWENTY_CURRENT_VERSION);
  assert.equal(metadata.type, 'fast');
  assert(metadata.timestamp <= Date.now() + 60000);
  for (const command of INSTANCE_COMMANDS) {
    const previous = getRegisteredInstanceCommandMetadata(command);
    if (
      previous?.version === metadata.version &&
      command !== AddDeliveryAdvertisingWorkbenchFastInstanceCommand
    )
      assert(previous.timestamp < metadata.timestamp);
  }
  await connectionSource.initialize();
  const runner = connectionSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    await runner.query("SET LOCAL lock_timeout='10s'");
    await runner.query("SET LOCAL statement_timeout='30s'");
    const originalTables = await userTables(runner);
    for (const table of originalTables)
      await runner.query(
        `LOCK TABLE ${quote(table.schema)}.${quote(table.name)} IN SHARE MODE`,
      );
    const originalData = await dataFingerprint(runner, TABLES);
    const originalSchema = await schemaFingerprint(runner);
    const protectedSchema = await schemaFingerprint(
      runner,
      false,
      [],
      '',
      TABLES,
    );
    const parts = async () =>
      Promise.all(
        TABLES.map(
          async (name) =>
            (
              await runner.query(
                'SELECT to_regclass($1) IS NOT NULL AS present',
                [`core.${quote(name)}`],
              )
            )[0].present,
        ),
      );
    const installedParts = await parts();
    assert(
      installedParts.every(Boolean) || installedParts.every((part) => !part),
      'A partial schema installation needs inspection.',
    );
    const installed = installedParts.every(Boolean);
    const migration = new AddDeliveryAdvertisingWorkbenchFastInstanceCommand();
    let sequence = 0;
    const rejects = async (label, operation, code) => {
      const savepoint = `advertising_rejection_${++sequence}`;
      await runner.query(`SAVEPOINT ${savepoint}`);
      try {
        await assert.rejects(operation, (error) => error.code === code, label);
      } finally {
        await runner.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await runner.query(`RELEASE SAVEPOINT ${savepoint}`);
      }
    };
    const preserved = async () => {
      assert.deepEqual(
        await dataFingerprint(runner, TABLES),
        originalData,
        'Every preexisting row must be preserved.',
      );
      assert.equal(
        await schemaFingerprint(runner, false, [], '', TABLES),
        protectedSchema,
        'Only the four intended tables may change schema.',
      );
    };
    if (installed) {
      for (const table of TABLES) {
        const [{ count }] = await runner.query(
          `SELECT count(*)::text AS count FROM core.${quote(table)}`,
        );
        if (count !== '0') {
          await rejects(
            'Retained advertising evidence blocks downgrade',
            () => migration.down(runner),
            'P0001',
          );
          assert.fail(
            'Retained history correctly prevents full-cycle migration proof. Preserve it.',
          );
        }
      }
      await migration.down(runner);
    }
    const absentSchema = await schemaFingerprint(runner);
    await migration.up(runner);
    assert((await parts()).every(Boolean));
    await preserved();
    const addedSchema = await schemaFingerprint(runner);
    if (installed) assert.equal(addedSchema, originalSchema);

    await runner.query('SAVEPOINT advertising_fixture');
    const fixture = await createReviewFixture(runner.manager);
    const reviewId = randomUUID(),
      sourceId = randomUUID(),
      actionId = randomUUID(),
      observationId = randomUUID();
    await runner.query(
      `INSERT INTO core."deliveryAdvertisingReview" (id,"workspaceId","sourceKind","sourceId","projectId",revision,state,source,goal,note,"noChangeReason","legacyHandling","createdBy") VALUES($1,$2,'META',$3,$4,1,'DRAFT','{}','{}','Synthetic review','','{}',$5)`,
      [
        reviewId,
        fixture.workspaceId,
        sourceId,
        fixture.projects.first,
        fixture.people.admin.memberId,
      ],
    );
    await runner.query(
      `INSERT INTO core."deliveryAdvertisingAction" (id,"workspaceId","reviewId",position,definition,"ownerName","reviewerName","taskId") VALUES($1,$2,$3,0,'{}','Synthetic owner','Synthetic reviewer',$4)`,
      [actionId, fixture.workspaceId, reviewId, fixture.taskId],
    );
    await runner.query(
      `INSERT INTO core."deliveryAdvertisingObservation" (id,"workspaceId","reviewId","actionId","actorId",observation,task) VALUES($1,$2,$3,$4,$5,'{}','{}')`,
      [
        observationId,
        fixture.workspaceId,
        reviewId,
        actionId,
        fixture.people.admin.memberId,
      ],
    );
    await runner.query(
      `INSERT INTO core."deliveryAdvertisingEvent" (id,"workspaceId","reviewId","actorId",action,"inputHash",result) VALUES($1,$2,$3,$4,'SAVED',$5,'{}')`,
      [
        randomUUID(),
        fixture.workspaceId,
        reviewId,
        fixture.people.admin.memberId,
        'a'.repeat(64),
      ],
    );
    await rejects(
      'Populated observations/receipts prevent downgrade',
      () => migration.down(runner),
      'P0001',
    );
    await rejects(
      'Action cannot cross workspace to an unrelated review',
      () =>
        runner.query(
          'UPDATE core."deliveryAdvertisingAction" SET "workspaceId"=$2 WHERE id=$1',
          [actionId, fixture.foreignWorkspaceId],
        ),
      '23503',
    );
    await rejects(
      'Observation must stay in the original action and packet',
      () =>
        runner.query(
          'UPDATE core."deliveryAdvertisingObservation" SET "actionId"=$2 WHERE id=$1',
          [observationId, randomUUID()],
        ),
      '23503',
    );
    await rejects(
      'Review revision must remain positive',
      () =>
        runner.query(
          'UPDATE core."deliveryAdvertisingReview" SET revision=0 WHERE id=$1',
          [reviewId],
        ),
      '23514',
    );
    await rejects(
      'Receipt cannot outlive its review',
      () =>
        runner.query(
          'DELETE FROM core."deliveryAdvertisingReview" WHERE id=$1',
          [reviewId],
        ),
      '23503',
    );
    await rejects(
      'Native task adoption is globally unique within workspace',
      () =>
        runner.query(
          `INSERT INTO core."deliveryAdvertisingAction" (id,"workspaceId","reviewId",position,definition,"ownerName","reviewerName","taskId") VALUES($1,$2,$3,1,'{}','Synthetic owner','Synthetic reviewer',$4)`,
          [randomUUID(), fixture.workspaceId, reviewId, fixture.taskId],
        ),
      '23505',
    );
    await rejects(
      'At most one active draft exists per source',
      () =>
        runner.query(
          `INSERT INTO core."deliveryAdvertisingReview" (id,"workspaceId","sourceKind","sourceId","projectId",revision,state,source,goal,note,"noChangeReason","legacyHandling","createdBy") VALUES($1,$2,'META',$3,$4,1,'DRAFT','{}','{}','Synthetic review','','{}',$5)`,
          [
            randomUUID(),
            fixture.workspaceId,
            sourceId,
            fixture.projects.first,
            fixture.people.admin.memberId,
          ],
        ),
      '23505',
    );
    await runner.query('ROLLBACK TO SAVEPOINT advertising_fixture');
    await runner.query('RELEASE SAVEPOINT advertising_fixture');
    await preserved();
    await migration.down(runner);
    assert((await parts()).every((part) => !part));
    assert.equal(await schemaFingerprint(runner), absentSchema);
    await preserved();
    await migration.up(runner);
    assert.equal(await schemaFingerprint(runner), addedSchema);
    await preserved();
    if (!installed) await migration.down(runner);
    assert.equal(await schemaFingerprint(runner), originalSchema);
    assert.deepEqual(await userTables(runner), originalTables);
    await preserved();
    console.log(
      `Advertising migration rollback proof passed: ${originalTables.length} protected tables; registered current-version epoch ${metadata.timestamp}; exact up/down/re-up; scoped FKs, unique task adoption, single active draft, valid revision and retained-history downgrade protection. No changes committed.`,
    );
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
