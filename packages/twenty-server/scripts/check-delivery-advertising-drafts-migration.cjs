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
  indexRows,
} = require('./check-delivery-assistant-indexes-migration.cjs');
const {
  createReviewFixture,
} = require('./check-delivery-creative-review-support.cjs');

const EPOCH = 1793491120493;
const VERSION = '2.34.0';
const TABLE = 'deliveryAdvertisingDraftRun';
const INDEXES = [
  {
    name: 'IDX_70e03606558941ca4bead0a9df',
    columns: ['status', 'updatedAt', 'id'],
    unique: false,
  },
  {
    name: 'IDX_d19605b93cba67df3cd3b5285a',
    columns: ['workspaceId', 'agentId', 'createdAt'],
    unique: false,
  },
  {
    name: 'IDX_129b5f4b6c80906a62ea92bd8a',
    columns: ['workspaceId', 'sourceKind', 'sourceId', 'createdAt', 'id'],
    unique: false,
  },
  {
    name: 'IDX_ef8f7df9fe28cfb808c48151d1',
    columns: ['workspaceId', 'cancelRequestId'],
    unique: true,
    predicate: '("cancelRequestId" IS NOT NULL)',
  },
  {
    name: 'IDX_288ffae61d6c5076583de3d48b',
    columns: ['workspaceId', 'requestId'],
    unique: true,
  },
  {
    name: 'IDX_7896e6666803da8285908013d6',
    columns: ['workspaceId', 'id'],
    unique: true,
  },
];
const quote = (value) => `"${value.replaceAll('"', '""')}"`;
const historyCounts = async (runner) => {
  const [counts] = await runner.query(`SELECT
    (SELECT count(*)::integer FROM core."deliveryAdvertisingDraftRun") AS runs,
    (SELECT count(*)::integer FROM core."otogrowAiSpend" WHERE "sourceKind"='ADVERTISING_DRAFT') AS spend,
    (SELECT count(*)::integer FROM core."otogrowActivityEvent" WHERE action LIKE 'ADVERTISING_DRAFT_%') AS activity,
    (SELECT count(*)::integer FROM core."deliveryAdvertisingAction" WHERE definition ? 'origin') AS actions,
    (SELECT count(*)::integer FROM core."deliveryAdvertisingEvent" event,
      jsonb_array_elements(COALESCE(event.definition->'actions','[]'::jsonb)) AS proposal(value) WHERE proposal.value ? 'origin') AS events`);
  return counts;
};

async function assertSchema(runner) {
  const [{ defaultCollation }] = await runner.query(
    `SELECT oid::integer AS "defaultCollation" FROM pg_collation WHERE collname='default' AND collnamespace='pg_catalog'::regnamespace`,
  );
  const rows = await indexRows(runner, INDEXES);
  assert.equal(rows.length, 6);
  for (const expected of INDEXES) {
    assert.deepEqual(
      rows.find((row) => row.name === expected.name),
      {
        schema: 'core',
        name: expected.name,
        tableSchema: 'core',
        tableName: TABLE,
        method: 'btree',
        primary: false,
        unique: expected.unique,
        valid: true,
        ready: true,
        live: true,
        replicaIdentity: false,
        attributeCount: expected.columns.length,
        keyCount: expected.columns.length,
        simple: true,
        predicate: expected.predicate ?? null,
        options: null,
        tablespace: 0,
        columns: expected.columns,
        keyOptions: expected.columns.map(() => 0),
        collations: expected.columns.map((column) =>
          ['status', 'sourceKind'].includes(column) ? defaultCollation : 0,
        ),
        defaultOperatorClasses: expected.columns.map(() => true),
      },
      `Exact index ${expected.name}`,
    );
  }
  const [{ count }] = await runner.query(
    "SELECT count(*)::integer AS count FROM pg_indexes WHERE schemaname='core' AND tablename=$1",
    [TABLE],
  );
  assert.equal(
    count,
    7,
    'Only six intended indexes and the primary-key index exist.',
  );
  const constraints =
    await runner.query(`SELECT conname AS name,contype::text AS type,convalidated AS validated,
    pg_get_constraintdef(oid) AS definition,confdeltype::text AS "deleteAction"
    FROM pg_constraint WHERE conrelid='core."deliveryAdvertisingDraftRun"'::regclass ORDER BY conname`);
  assert.equal(
    constraints.length,
    8,
    'Five checks, two foreign keys and one primary key.',
  );
  assert(constraints.every((constraint) => constraint.validated));
  assert.equal(
    constraints.filter((constraint) => constraint.type === 'c').length,
    5,
  );
  assert.equal(
    constraints.filter((constraint) => constraint.type === 'p').length,
    1,
  );
  const foreignKeys = constraints.filter(
    (constraint) => constraint.type === 'f',
  );
  assert.equal(foreignKeys.length, 2);
  assert(
    foreignKeys.some(
      (key) =>
        key.definition.includes(
          'FOREIGN KEY ("workspaceId") REFERENCES core.workspace(id)',
        ) && key.deleteAction === 'c',
    ),
  );
  assert(
    foreignKeys.some(
      (key) =>
        key.definition.includes(
          'FOREIGN KEY ("workspaceId", "projectId") REFERENCES core."deliveryProject"("workspaceId", id)',
        ) && key.deleteAction === 'r',
    ),
  );
}

async function insertRun(runner, fixture, changes = {}) {
  const id = randomUUID();
  const values = {
    id,
    workspaceId: fixture.workspaceId,
    requestId: randomUUID(),
    projectId: fixture.projects.first,
    companyId: null,
    sourceKind: 'META',
    sourceId: randomUUID(),
    initiatorId: fixture.people.admin.memberId,
    initiatorName: 'Synthetic migration actor',
    userWorkspaceId: fixture.people.admin.userWorkspaceId,
    agentId: randomUUID(),
    agentVersion: 1,
    revision: 1,
    status: 'QUEUED',
    inputHash: 'a'.repeat(64),
    bodyFingerprint: 'b'.repeat(64),
    contextFingerprint: 'c'.repeat(64),
    input: {},
    configuration: {},
    agent: {},
    basis: {},
    context: {},
    startReceipt: {},
    result: null,
    cancelRequestId: null,
    cancelInputHash: null,
    cancelReceipt: null,
    ...changes,
  };
  const fields = Object.keys(values);
  await runner.query(
    `INSERT INTO core."deliveryAdvertisingDraftRun" (${fields.map(quote).join(',')}) VALUES (${fields.map((_, index) => `$${index + 1}`).join(',')})`,
    Object.values(values),
  );
  return values;
}

async function insertReview(runner, fixture) {
  const id = randomUUID();
  await runner.query(
    `INSERT INTO core."deliveryAdvertisingReview" (id,"workspaceId","sourceKind","sourceId","projectId",revision,state,source,goal,note,"noChangeReason","legacyHandling","createdBy")
    VALUES($1,$2,'META',$3,$4,1,'DRAFT','{}','{}','Synthetic migration review','','{}',$5)`,
    [
      id,
      fixture.workspaceId,
      randomUUID(),
      fixture.projects.first,
      fixture.people.admin.memberId,
    ],
  );
  return id;
}

async function main() {
  assert.equal(
    process.argv.length,
    2,
    'This checker has no apply or commit mode; every operation rolls back.',
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
    /^2-34-instance-command-fast-\d+-add-delivery-advertising-drafts\.js$/.test(
      file,
    ),
  );
  assert.deepEqual(files, [
    `2-34-instance-command-fast-${EPOCH}-add-delivery-advertising-drafts.js`,
  ]);
  const { AddDeliveryAdvertisingDraftsFastInstanceCommand } = require(
    join(directory, files[0]),
  );
  assert.equal(
    INSTANCE_COMMANDS.filter(
      (command) => command === AddDeliveryAdvertisingDraftsFastInstanceCommand,
    ).length,
    1,
    'Official command is registered exactly once.',
  );
  assert.deepEqual(
    getRegisteredInstanceCommandMetadata(
      AddDeliveryAdvertisingDraftsFastInstanceCommand,
    ),
    { version: VERSION, timestamp: EPOCH, type: 'fast' },
  );
  assert(EPOCH <= Date.now() + 60000, 'Use the official real current epoch.');
  for (const command of INSTANCE_COMMANDS) {
    const metadata = getRegisteredInstanceCommandMetadata(command);
    if (
      metadata?.version === VERSION &&
      command !== AddDeliveryAdvertisingDraftsFastInstanceCommand
    )
      assert(
        metadata.timestamp < EPOCH,
        'This additive command follows every earlier current-version command.',
      );
  }
  await connectionSource.initialize();
  const runner = connectionSource.createQueryRunner();
  try {
    await runner.connect();
    await runner.startTransaction();
    await runner.query("SET LOCAL lock_timeout='10s'");
    await runner.query("SET LOCAL statement_timeout='30s'");
    const originalTables = await userTables(runner);
    for (const table of originalTables)
      await runner.query(
        `LOCK TABLE ${quote(table.schema)}.${quote(table.name)} IN SHARE MODE`,
      );
    const originalData = await dataFingerprint(runner, [TABLE]);
    const originalSchema = await schemaFingerprint(runner);
    const protectedSchema = await schemaFingerprint(runner, false, [], '', [
      TABLE,
    ]);
    const present = async () =>
      (
        await runner.query('SELECT to_regclass($1) IS NOT NULL AS present', [
          `core.${quote(TABLE)}`,
        ])
      )[0].present;
    const installed = await present();
    const migration = new AddDeliveryAdvertisingDraftsFastInstanceCommand();
    let sequence = 0;
    const isolated = async (label, operation) => {
      const name = `advertising_draft_migration_${++sequence}`;
      await runner.query(`SAVEPOINT ${name}`);
      try {
        return await operation();
      } catch (error) {
        error.message = `${label}: ${error.message}`;
        throw error;
      } finally {
        await runner.query(`ROLLBACK TO SAVEPOINT ${name}`);
        await runner.query(`RELEASE SAVEPOINT ${name}`);
      }
    };
    const rejects = (label, operation, code) =>
      isolated(label, () =>
        assert.rejects(operation, (error) => error.code === code, label),
      );
    const preserved = async () => {
      assert.deepEqual(
        await dataFingerprint(runner, [TABLE]),
        originalData,
        'Every original row must remain unchanged.',
      );
      assert.equal(
        await schemaFingerprint(runner, false, [], '', [TABLE]),
        protectedSchema,
        'Only the new drafting table schema may differ.',
      );
    };
    if (installed) {
      await assertSchema(runner);
      const counts = await historyCounts(runner);
      if (Object.values(counts).some((count) => count > 0)) {
        await isolated('Existing retained history', () =>
          assert.rejects(
            () => migration.down(runner),
            /Refusing to remove advertising suggestion history/,
          ),
        );
        assert.fail(
          'Retained history correctly prevents a destructive full-cycle proof. No original history was removed.',
        );
      }
      await migration.down(runner);
    }
    const absentSchema = await schemaFingerprint(runner);
    await migration.up(runner);
    assert(await present());
    await assertSchema(runner);
    await preserved();
    const addedSchema = await schemaFingerprint(runner);
    if (installed) assert.equal(addedSchema, originalSchema);
    assert.deepEqual(
      await historyCounts(runner),
      { runs: 0, spend: 0, activity: 0, actions: 0, events: 0 },
      'Preexisting history must never be removed to make a downgrade test pass.',
    );

    await isolated('Disposable synthetic fixture', async () => {
      const fixture = await createReviewFixture(
        runner.manager,
        'ad_draft_migration',
      );
      await isolated('Run integrity constraints', async () => {
        const protectedProjectId = randomUUID();
        await runner.query(
          'INSERT INTO core."deliveryProject" (id,"workspaceId",name) VALUES($1,$2,$3)',
          [
            protectedProjectId,
            fixture.workspaceId,
            'Synthetic run-only project',
          ],
        );
        const original = await insertRun(runner, fixture, {
          projectId: protectedProjectId,
        });
        await rejects(
          'Global run primary key',
          () => insertRun(runner, fixture, { id: original.id }),
          '23505',
        );
        await rejects(
          'Stable request identity is unique within workspace',
          () => insertRun(runner, fixture, { requestId: original.requestId }),
          '23505',
        );
        await rejects(
          'Project cannot cross workspace',
          () =>
            insertRun(runner, fixture, { projectId: fixture.projects.foreign }),
          '23503',
        );
        await rejects(
          'Workspace must exist',
          () => insertRun(runner, fixture, { workspaceId: randomUUID() }),
          '23503',
        );
        await rejects(
          'Retained run protects its original project',
          () =>
            runner.query(
              'DELETE FROM core."deliveryProject" WHERE "workspaceId"=$1 AND id=$2',
              [fixture.workspaceId, protectedProjectId],
            ),
          '23503',
        );
        await insertRun(runner, fixture, {
          workspaceId: fixture.foreignWorkspaceId,
          projectId: fixture.projects.foreign,
          requestId: original.requestId,
        });
        await rejects(
          'Primary key is not reusable by a different workspace',
          () =>
            insertRun(runner, fixture, {
              id: original.id,
              workspaceId: fixture.foreignWorkspaceId,
              projectId: fixture.projects.foreign,
            }),
          '23505',
        );
        const cancelled = await insertRun(runner, fixture, {
          status: 'CANCELLED',
          cancelRequestId: randomUUID(),
          cancelInputHash: 'd'.repeat(64),
          cancelReceipt: {},
        });
        await rejects(
          'Cancellation request is unique within workspace',
          () =>
            insertRun(runner, fixture, {
              status: 'CANCELLED',
              cancelRequestId: cancelled.cancelRequestId,
              cancelInputHash: 'e'.repeat(64),
              cancelReceipt: {},
            }),
          '23505',
        );
        for (const [label, changes] of [
          ['Zero revision', { revision: 0 }],
          ['Zero assistant version', { agentVersion: 0 }],
          ['Unknown lifecycle state', { status: 'APPROVED' }],
          ['Unsupported source kind', { sourceKind: 'OTHER' }],
          ['Malformed input hash', { inputHash: 'invalid' }],
          ['Malformed body fingerprint', { bodyFingerprint: 'invalid' }],
          ['Malformed context fingerprint', { contextFingerprint: 'invalid' }],
          ['Success requires an immutable result', { status: 'SUCCEEDED' }],
          ['Unfinished run cannot contain a result', { result: {} }],
          [
            'Cancellation identity without receipt',
            { status: 'CANCELLED', cancelRequestId: randomUUID() },
          ],
          [
            'Cancellation hash without identity',
            { status: 'CANCELLED', cancelInputHash: 'd'.repeat(64) },
          ],
          [
            'Cancellation receipt without identity',
            { status: 'CANCELLED', cancelReceipt: {} },
          ],
          [
            'Cancellation rejects a null hash',
            {
              status: 'CANCELLED',
              cancelRequestId: randomUUID(),
              cancelInputHash: null,
              cancelReceipt: {},
            },
          ],
          [
            'Cancellation rejects a malformed hash',
            {
              status: 'CANCELLED',
              cancelRequestId: randomUUID(),
              cancelInputHash: 'bad',
              cancelReceipt: {},
            },
          ],
          [
            'Cancellation receipt belongs only to cancelled state',
            {
              cancelRequestId: randomUUID(),
              cancelInputHash: 'd'.repeat(64),
              cancelReceipt: {},
            },
          ],
        ])
          await rejects(
            label,
            () => insertRun(runner, fixture, changes),
            '23514',
          );
        await insertRun(runner, fixture, { status: 'SUCCEEDED', result: {} });
      });

      const guard = async (kind, seed) =>
        isolated(`Independent ${kind} history guard`, async () => {
          assert.deepEqual(await historyCounts(runner), {
            runs: 0,
            spend: 0,
            activity: 0,
            actions: 0,
            events: 0,
          });
          await seed();
          const expected = {
            runs: 0,
            spend: 0,
            activity: 0,
            actions: 0,
            events: 0,
            [kind]: 1,
          };
          assert.deepEqual(
            await historyCounts(runner),
            expected,
            'This one history source independently triggers protection.',
          );
          const schema = await schemaFingerprint(runner);
          await assert.rejects(
            () => migration.down(runner),
            /Refusing to remove advertising suggestion history/,
          );
          assert(await present());
          assert.deepEqual(
            await historyCounts(runner),
            expected,
            'Rejected downgrade retains the exact history source.',
          );
          assert.equal(
            await schemaFingerprint(runner),
            schema,
            'Rejected downgrade executes no destructive schema change.',
          );
        });
      await guard('runs', () => insertRun(runner, fixture));
      await guard('spend', () =>
        runner.query(
          `INSERT INTO core."otogrowAiSpend" (id,"workspaceId","sourceKind","sourceRunId","actorId",state,"reservedMicroUsd",price)
        VALUES($1,$2,'ADVERTISING_DRAFT',$3,$4,'RESERVED',1,'{}')`,
          [
            randomUUID(),
            fixture.workspaceId,
            randomUUID(),
            fixture.people.admin.memberId,
          ],
        ),
      );
      await guard('activity', () =>
        runner.query(
          `INSERT INTO core."otogrowActivityEvent" (id,"workspaceId","occurredAt","actorName","actorType",category,action,outcome,summary,"sourceType","sourceId")
        VALUES($1,$2,now(),'Synthetic migration actor','SYSTEM','AGENT','ADVERTISING_DRAFT_QUEUED','QUEUED','Synthetic protected history','advertising-draft',$3)`,
          [randomUUID(), fixture.workspaceId, randomUUID()],
        ),
      );
      await guard('actions', async () => {
        const reviewId = await insertReview(runner, fixture);
        await runner.query(
          `INSERT INTO core."deliveryAdvertisingAction" (id,"workspaceId","reviewId",position,definition,"ownerName","reviewerName")
          VALUES($1,$2,$3,0,$4,'Synthetic owner','Synthetic reviewer')`,
          [
            randomUUID(),
            fixture.workspaceId,
            reviewId,
            {
              origin: {
                runId: randomUUID(),
                suggestionId: randomUUID(),
                humanEdited: true,
              },
            },
          ],
        );
      });
      await guard('events', async () => {
        const reviewId = await insertReview(runner, fixture);
        await runner.query(
          `INSERT INTO core."deliveryAdvertisingEvent" (id,"workspaceId","reviewId","actorId",action,"inputHash",result,definition)
          VALUES($1,$2,$3,$4,'SAVED',$5,'{}',$6)`,
          [
            randomUUID(),
            fixture.workspaceId,
            reviewId,
            fixture.people.admin.memberId,
            'f'.repeat(64),
            {
              actions: [
                {
                  origin: {
                    runId: randomUUID(),
                    suggestionId: randomUUID(),
                    humanEdited: false,
                  },
                },
              ],
            },
          ],
        );
      });
    });
    await preserved();
    assert.deepEqual(await historyCounts(runner), {
      runs: 0,
      spend: 0,
      activity: 0,
      actions: 0,
      events: 0,
    });
    await migration.down(runner);
    assert.equal(await present(), false);
    assert.equal(await schemaFingerprint(runner), absentSchema);
    await preserved();
    await migration.up(runner);
    await assertSchema(runner);
    assert.equal(await schemaFingerprint(runner), addedSchema);
    await preserved();
    if (!installed) await migration.down(runner);
    assert.equal(await schemaFingerprint(runner), originalSchema);
    assert.deepEqual(await userTables(runner), originalTables);
    await preserved();
    console.log(
      `Advertising drafts migration rollback proof passed: ${originalTables.length} protected tables; official current-version epoch ${EPOCH}; six exact indexes, scoped project/workspace FKs, identity/state/result/cancellation constraints; five independent retained-history guards; full up/down/re-up and all original schema/data preserved. No changes committed.`,
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
