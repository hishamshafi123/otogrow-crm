const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  AddContentPostingWorkflowFastInstanceCommand: Migration,
} = require('../dist/database/commands/upgrade-version-command/2-34/2-34-instance-command-fast-1793810789786-add-content-posting-workflow');
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
  'deliveryContentAccount',
  'deliveryContentPlan',
  'deliveryContentVariant',
  'deliveryContentVersion',
  'deliveryContentEvent',
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
    process.env.OTOGROW_CONTENT_PROOF_SERVICES_STOPPED,
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
    timestamp: 1793810789786,
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
      'Run this before installation; installed content tables are never dropped for acceptance.',
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
      `SELECT EXISTS(SELECT 1 FROM core."otogrowActivityEvent" WHERE "sourceType" IN ('content-account','content-plan','content-post') OR left(action,16)='CONTENT_ACCOUNT_' OR left(action,13)='CONTENT_PLAN_' OR left(action,13)='CONTENT_POST_') AS retained`,
    );
    assert.equal(
      retainedAudit.retained,
      false,
      'Existing content audit correctly prevents a full down/up proof; preserve it.',
    );
    const migration = new Migration();
    let sequence = 0;
    const isolated = async (operation) => {
      const name = `content_migration_${++sequence}`;
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
        ['p', 5],
        ['f', 14],
        ['c', 20],
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
        5,
      );
      assert.equal(
        foreignKeys.filter((constraint) =>
          constraint.definition.includes('ON DELETE RESTRICT'),
        ).length,
        9,
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
            'FOREIGN KEY ("workspaceId", "variantId", version)',
          ),
        ),
      );
      const indexes = await runner.query(
        "SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='core' AND tablename=ANY($1::text[]) AND indexname NOT LIKE 'PK_%' ORDER BY indexname",
        [TABLES],
      );
      assert.equal(indexes.length, 11);
      assert.equal(
        indexes.filter((index) =>
          index.indexdef.startsWith('CREATE UNIQUE INDEX'),
        ).length,
        10,
      );
      const expected = [
        'ON core."deliveryContentAccount" USING btree ("workspaceId", "projectId", id)',
        'ON core."deliveryContentAccount" USING btree ("workspaceId", id)',
        'ON core."deliveryContentPlan" USING btree ("workspaceId", "projectId", id)',
        'ON core."deliveryContentPlan" USING btree ("workspaceId", id)',
        'ON core."deliveryContentVariant" USING btree ("workspaceId", "projectId", "planId", id)',
        'ON core."deliveryContentVariant" USING btree ("workspaceId", "projectId", "plannedAt", id)',
        'ON core."deliveryContentVariant" USING btree ("workspaceId", id)',
        'ON core."deliveryContentVersion" USING btree ("workspaceId", "variantId", version)',
        'ON core."deliveryContentEvent" USING btree ("workspaceId", "targetKind", "targetId", revision)',
        'ON core."deliveryContentEvent" USING btree ("workspaceId", "variantId", version, id)',
        'ON core."deliveryContentEvent" USING btree ("workspaceId", "requestId")',
      ];
      for (const definition of expected)
        assert(indexes.some((index) => index.indexdef.endsWith(definition)));
    };
    const up = async () => {
      const query = runner.query.bind(runner);
      const statements = [];
      runner.query = async (sql, ...arguments_) => {
        assert(
          /^(CREATE TABLE|CREATE (?:UNIQUE )?INDEX|ALTER TABLE) "core"\."deliveryContent(?:Account|Plan|Variant|Version|Event)"?/.test(
            sql,
          ) ||
            /^CREATE (?:UNIQUE )?INDEX "IDX_[a-f0-9]+" ON "core"\."deliveryContent(?:Account|Plan|Variant|Version|Event)"/.test(
              sql,
            ),
          'Only the generated additive content DDL is permitted.',
        );
        statements.push(sql);
        return query(sql, ...arguments_);
      };
      try {
        await migration.up(runner);
        assert.equal(statements.length, 30);
      } finally {
        runner.query = query;
      }
    };
    await up();
    await checkSchema();
    await preserved();
    const installedSchema = await schemaFingerprint(runner);
    checks.push(
      'Actual additive command creates only five tables, eleven indexes, fourteen scoped foreign keys and twenty checks',
    );
    await isolated(async () => {
      const fixture = await createFixture(runner.manager, 'content_schema');
      const accountId = randomUUID(),
        planId = randomUUID(),
        variantId = randomUUID();
      const account = {
        id: accountId,
        workspaceId: fixture.workspaceId,
        projectId: fixture.projects.first,
        companyId: null,
        revision: 1,
        platform: 'X',
        name: 'FIXTURE account',
        handle: 'fixture',
        profileUrl: 'https://x.com/fixture',
        archived: false,
      };
      const plan = {
        id: planId,
        workspaceId: fixture.workspaceId,
        projectId: fixture.projects.first,
        companyId: null,
        revision: 1,
        title: 'FIXTURE plan',
        purpose: '',
        engagementId: null,
        service: null,
        createdBy: fixture.people.reader.memberId,
      };
      const variant = {
        id: variantId,
        workspaceId: fixture.workspaceId,
        projectId: fixture.projects.first,
        companyId: null,
        planId,
        accountId,
        assetTaskId: null,
        ownerId: fixture.people.writer.memberId,
        reviewerId: fixture.people.reader.memberId,
        createdBy: fixture.people.writer.memberId,
        submittedBy: null,
        revision: 1,
        currentVersion: 1,
        status: 'DRAFT',
        plannedAt: new Date(),
        approvedVersion: null,
        reviewedBy: null,
        reviewedAt: null,
      };
      const version = {
        id: randomUUID(),
        workspaceId: fixture.workspaceId,
        variantId,
        version: 1,
        body: {
          accountId,
          accountRevision: 1,
          ownerId: variant.ownerId,
          reviewerId: variant.reviewerId,
          format: 'TEXT',
          caption: 'FIXTURE post',
          plannedAt: '2026-11-05T03:00:00Z',
          plannedLocal: '2026-11-05T06:00',
          timezone: 'Asia/Qatar',
          asset: null,
          notes: '',
          account,
          assetSnapshot: null,
          ownerName: 'FIXTURE owner',
          reviewerName: 'FIXTURE reviewer',
          contributorIds: [variant.ownerId],
          sourceFingerprint: 'a'.repeat(64),
        },
        createdBy: variant.ownerId,
      };
      const event = {
        id: randomUUID(),
        workspaceId: fixture.workspaceId,
        requestId: randomUUID(),
        actorId: fixture.people.reader.memberId,
        userWorkspaceId: fixture.people.reader.userWorkspaceId,
        actorName: 'FIXTURE reviewer',
        inputHash: 'a'.repeat(64),
        targetKind: 'VARIANT',
        targetId: variantId,
        accountId: null,
        planId,
        variantId,
        version: 1,
        revision: 1,
        action: 'SAVE',
        status: 'DRAFT',
        note: '',
        evidenceUrl: '',
        publishedAt: null,
        correctsEventId: null,
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
              /Cannot remove retained content posting history/,
            );
            assert.equal(statements.length, 1);
          } finally {
            runner.query = query;
          }
          assert.equal(await schemaFingerprint(runner), before);
          checks.push(label);
        });
      for (const [table, values] of [
        [TABLES[0], account],
        [TABLES[1], plan],
        [TABLES[2], variant],
        [TABLES[3], version],
        [TABLES[4], event],
      ]) {
        await retained(
          `Retained ${table} alone rejects downgrade before any DDL`,
          async () => {
            await dropParentForeignKeys(table);
            await insert(table, values);
          },
        );
      }
      const audit = {
        workspaceId: fixture.workspaceId,
        occurredAt: new Date(),
        actorId: fixture.people.reader.memberId,
        actorName: 'FIXTURE reviewer',
        actorType: 'HUMAN',
        category: 'DELIVERY',
        outcome: 'RECORDED',
        summary: 'FIXTURE retained content audit',
        sourceId: randomUUID(),
        changes: [],
      };
      for (const sourceType of [
        'content-account',
        'content-plan',
        'content-post',
      ])
        await retained(
          `${sourceType} source-type audit independently rejects downgrade`,
          () =>
            insert('otogrowActivityEvent', {
              ...audit,
              sourceType,
              action: 'FIXTURE_RETAINED',
            }),
        );
      for (const prefix of [
        'CONTENT_ACCOUNT_',
        'CONTENT_PLAN_',
        'CONTENT_POST_',
      ])
        await retained(
          `${prefix} action-prefix audit independently rejects downgrade`,
          () =>
            insert('otogrowActivityEvent', {
              ...audit,
              sourceType: 'project',
              action: `${prefix}FIXTURE`,
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
