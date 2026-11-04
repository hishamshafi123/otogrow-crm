const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  AddCompetitorSourceRegistryFastInstanceCommand: Migration,
} = require('../dist/database/commands/upgrade-version-command/2-34/2-34-instance-command-fast-1793769401151-add-competitor-source-registry');
const {
  INSTANCE_COMMANDS,
} = require('../dist/database/commands/upgrade-version-command/instance-commands.constant');
const {
  getRegisteredInstanceCommandMetadata,
} = require('../dist/engine/core-modules/upgrade/decorators/registered-instance-command.decorator');
const {
  userTables,
  dataFingerprint,
  schemaFingerprint,
} = require('./check-delivery-assistant-indexes-migration.cjs');
const { createFixture } = require('./check-delivery-reconciliation.cjs');

const TABLES = [
  'deliveryCompetitorSource',
  'deliveryCompetitorSourceVersion',
  'deliveryCompetitorSourceEvent',
];
const checks = [];
const quote = (value) => {
  assert.match(value, /^\w+$/);
  return `"${value}"`;
};

async function main() {
  assert.equal(
    process.argv.length,
    2,
    'Migration acceptance is rollback-only.',
  );
  assert.equal(
    process.env.OTOGROW_COMPETITOR_PROOF_SERVICES_STOPPED,
    '1',
    'Pause local API/workers for whole-database preservation.',
  );
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  assert.equal(
    INSTANCE_COMMANDS.filter((candidate) => candidate === Migration).length,
    1,
  );
  assert.deepEqual(getRegisteredInstanceCommandMetadata(Migration), {
    version: '2.34.0',
    timestamp: 1793769401151,
    type: 'fast',
  });
  let runner;
  try {
    await connectionSource.initialize();
    runner = connectionSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    await runner.query("SET LOCAL lock_timeout='5s'");
    await runner.query("SET LOCAL statement_timeout='30s'");
    const originalTables = await userTables(runner);
    assert(
      !originalTables.some(
        (table) => table.schema === 'core' && TABLES.includes(table.name),
      ),
      'Run this before installation; installed registry tables are never dropped for acceptance.',
    );
    for (const table of originalTables)
      await runner.query(
        `LOCK TABLE ${quote(table.schema)}.${quote(table.name)} IN SHARE MODE`,
      );
    const originalData = await dataFingerprint(runner);
    const originalSchema = await schemaFingerprint(runner);
    const unrelatedSchema = await schemaFingerprint(
      runner,
      false,
      [],
      '',
      TABLES,
    );
    const [retainedAudit] = await runner.query(
      `SELECT EXISTS(SELECT 1 FROM core."otogrowActivityEvent" WHERE "sourceType"='competitor-source' OR left(action,18)='COMPETITOR_SOURCE_') AS retained`,
    );
    assert.equal(
      retainedAudit.retained,
      false,
      'Existing competitor audit correctly prevents a full down/up proof; preserve it.',
    );
    const migration = new Migration();
    let sequence = 0;
    const isolated = async (operation) => {
      const name = `competitor_migration_${++sequence}`;
      await runner.query(`SAVEPOINT ${name}`);
      try {
        return await operation();
      } finally {
        await runner.query(`ROLLBACK TO SAVEPOINT ${name}`);
        await runner.query(`RELEASE SAVEPOINT ${name}`);
      }
    };
    const insert = async (table, values) => {
      assert([...TABLES, 'otogrowActivityEvent'].includes(table));
      const columns = Object.keys(values);
      await runner.query(
        `INSERT INTO core.${quote(table)}(${columns.map(quote).join(',')}) VALUES(${columns.map((_, index) => `$${index + 1}`).join(',')})`,
        columns.map((column) =>
          ['body', 'changes'].includes(column)
            ? JSON.stringify(values[column])
            : values[column],
        ),
      );
    };
    const preserved = async () => {
      assert.deepEqual(await dataFingerprint(runner, TABLES), originalData);
      assert.equal(
        await schemaFingerprint(runner, false, [], '', TABLES),
        unrelatedSchema,
      );
    };
    const checkSchema = async () => {
      const constraints = await runner.query(
        'SELECT contype,convalidated,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid=ANY($1::regclass[])',
        [TABLES.map((table) => `core."${table}"`)],
      );
      assert(constraints.every((constraint) => constraint.convalidated));
      for (const [kind, count] of [
        ['p', 3],
        ['f', 7],
        ['c', 17],
      ])
        assert.equal(
          constraints.filter((constraint) => constraint.contype === kind)
            .length,
          count,
        );
      const foreignKeys = constraints.filter(
        (constraint) => constraint.contype === 'f',
      );
      assert.equal(
        foreignKeys.filter((constraint) =>
          constraint.definition.includes('ON DELETE CASCADE'),
        ).length,
        3,
      );
      assert.equal(
        foreignKeys.filter((constraint) =>
          constraint.definition.includes('ON DELETE RESTRICT'),
        ).length,
        4,
      );
      assert(
        foreignKeys.some((constraint) =>
          constraint.definition.includes(
            'FOREIGN KEY ("workspaceId", "projectId")',
          ),
        ),
      );
      assert(
        foreignKeys.some((constraint) =>
          constraint.definition.includes(
            'FOREIGN KEY ("workspaceId", "sourceId", version)',
          ),
        ),
      );
      const indexes = await runner.query(
        "SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='core' AND tablename=ANY($1::text[]) AND indexname NOT LIKE 'PK_%' ORDER BY indexname",
        [TABLES],
      );
      assert.equal(indexes.length, 6);
      assert.equal(
        indexes.filter((index) =>
          index.indexdef.startsWith('CREATE UNIQUE INDEX'),
        ).length,
        5,
      );
      const expected = [
        'ON core."deliveryCompetitorSource" USING btree ("workspaceId", "projectId", status, id)',
        'ON core."deliveryCompetitorSource" USING btree ("workspaceId", "projectId", platform, "canonicalKey")',
        'ON core."deliveryCompetitorSource" USING btree ("workspaceId", id)',
        'ON core."deliveryCompetitorSourceVersion" USING btree ("workspaceId", "sourceId", version)',
        'ON core."deliveryCompetitorSourceEvent" USING btree ("workspaceId", "sourceId", revision)',
        'ON core."deliveryCompetitorSourceEvent" USING btree ("workspaceId", "requestId")',
      ];
      for (const definition of expected)
        assert(indexes.some((index) => index.indexdef.endsWith(definition)));
    };
    const up = async () => {
      const query = runner.query.bind(runner);
      const statements = [];
      runner.query = async (sql, ...arguments_) => {
        assert(
          /^(CREATE TABLE|CREATE (?:UNIQUE )?INDEX|ALTER TABLE) "core"\."deliveryCompetitorSource(?:Version|Event)?"?/.test(
            sql,
          ) ||
            /^CREATE (?:UNIQUE )?INDEX "IDX_[a-f0-9]+" ON "core"\."deliveryCompetitorSource(?:Version|Event)?"/.test(
              sql,
            ),
          'Only the generated additive registry DDL is permitted.',
        );
        statements.push(sql);
        return query(sql, ...arguments_);
      };
      try {
        await migration.up(runner);
        assert.equal(statements.length, 16);
      } finally {
        runner.query = query;
      }
    };
    await up();
    await checkSchema();
    await preserved();
    const installedSchema = await schemaFingerprint(runner);
    checks.push(
      'Actual additive command creates only three tables, six indexes, seven scoped foreign keys and seventeen checks',
    );
    await isolated(async () => {
      const fixture = await createFixture(runner.manager, 'competitor_schema');
      const header = {
        id: randomUUID(),
        workspaceId: fixture.workspaceId,
        projectId: fixture.projects.first,
        companyId: null,
        createdBy: fixture.people.reader.memberId,
        label: 'FIXTURE migration source',
        platform: 'MANUAL',
        canonicalReference: 'https://example.invalid/evidence',
        canonicalKey: 'a'.repeat(64),
        ownerId: fixture.people.writer.memberId,
        ownerName: 'FIXTURE owner',
        reviewerId: fixture.people.reader.memberId,
        reviewerName: 'FIXTURE reviewer',
        revision: 1,
        currentVersion: 1,
        status: 'ACTIVE',
        cadenceHours: 24,
        lookbackDays: 7,
      };
      const version = {
        workspaceId: fixture.workspaceId,
        sourceId: randomUUID(),
        version: 1,
        companyId: null,
        body: { canonicalKey: 'a'.repeat(64) },
        createdBy: fixture.people.reader.memberId,
      };
      const event = {
        workspaceId: fixture.workspaceId,
        sourceId: randomUUID(),
        requestId: randomUUID(),
        actorId: fixture.people.reader.memberId,
        userWorkspaceId: fixture.people.reader.userWorkspaceId,
        actorName: 'FIXTURE reviewer',
        inputHash: 'a'.repeat(64),
        action: 'SAVE',
        note: '',
        revision: 1,
        version: 1,
        status: 'ACTIVE',
      };
      const dropParentForeignKeys = async (table) => {
        const keys = await runner.query(
          "SELECT conname FROM pg_constraint WHERE conrelid=$1::regclass AND contype='f' AND confrelid=ANY($2::regclass[])",
          [`core."${table}"`, TABLES.map((parent) => `core."${parent}"`)],
        );
        for (const key of keys)
          await runner.query(
            `ALTER TABLE core.${quote(table)} DROP CONSTRAINT ${quote(key.conname)}`,
          );
      };
      const retained = async (label, seed) =>
        isolated(async () => {
          await seed();
          const before = await schemaFingerprint(runner);
          const query = runner.query.bind(runner);
          const statements = [];
          runner.query = async (sql, ...arguments_) => {
            assert(
              /^\s*SELECT\b/.test(sql),
              'Retained evidence must reject before any destructive DDL.',
            );
            statements.push(sql);
            return query(sql, ...arguments_);
          };
          try {
            await assert.rejects(
              () => migration.down(runner),
              /Cannot remove retained competitor source history/,
            );
            assert.equal(statements.length, 1);
          } finally {
            runner.query = query;
          }
          assert.equal(await schemaFingerprint(runner), before);
          checks.push(label);
        });
      await retained('Retained header alone rejects downgrade before DDL', () =>
        insert(TABLES[0], header),
      );
      await retained(
        'Orphaned retained version alone rejects downgrade before DDL',
        async () => {
          await dropParentForeignKeys(TABLES[1]);
          await insert(TABLES[1], version);
        },
      );
      await retained(
        'Orphaned retained event alone rejects downgrade before DDL',
        async () => {
          await dropParentForeignKeys(TABLES[2]);
          await insert(TABLES[2], event);
        },
      );
      const audit = {
        workspaceId: fixture.workspaceId,
        occurredAt: new Date(),
        actorId: fixture.people.reader.memberId,
        actorName: 'FIXTURE reviewer',
        actorType: 'HUMAN',
        category: 'DELIVERY',
        outcome: 'RECORDED',
        summary: 'FIXTURE retained competitor audit',
        sourceId: randomUUID(),
        changes: [],
      };
      await retained(
        'Source-type competitor audit independently rejects downgrade before DDL',
        () =>
          insert('otogrowActivityEvent', {
            ...audit,
            sourceType: 'competitor-source',
            action: 'FIXTURE_RETAINED',
          }),
      );
      await retained(
        'Action-prefix competitor audit independently rejects downgrade before DDL',
        () =>
          insert('otogrowActivityEvent', {
            ...audit,
            sourceType: 'project',
            action: 'COMPETITOR_SOURCE_FIXTURE',
          }),
      );
    });
    await preserved();
    await migration.down(runner);
    assert.equal(await schemaFingerprint(runner), originalSchema);
    assert.deepEqual(await dataFingerprint(runner), originalData);
    await up();
    await checkSchema();
    await preserved();
    assert.equal(await schemaFingerprint(runner), installedSchema);
    checks.push(
      'Empty down/up restores the exact generated schema without changing originals',
    );
    await runner.rollbackTransaction();
    assert.equal(await schemaFingerprint(runner), originalSchema);
    assert.deepEqual(await dataFingerprint(runner), originalData);
    checks.push(
      `Every original schema and row preserved across ${originalTables.length} existing tables`,
    );
    process.stdout.write(
      JSON.stringify(
        { passed: checks.length, checks, committedWrites: 0 },
        null,
        2,
      ) + '\n',
    );
  } finally {
    if (runner?.isTransactionActive) await runner.rollbackTransaction();
    if (runner && !runner.isReleased) await runner.release();
    if (connectionSource.isInitialized) await connectionSource.destroy();
  }
}

if (require.main === module)
  main().catch((error) => {
    process.stderr.write(`${error.stack}\n`);
    process.exitCode = 1;
  });
