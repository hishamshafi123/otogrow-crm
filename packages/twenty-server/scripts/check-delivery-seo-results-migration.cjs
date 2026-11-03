const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  INSTANCE_COMMANDS,
} = require('../dist/database/commands/upgrade-version-command/instance-commands.constant');
const {
  AddSeoOutcomeReportsFastInstanceCommand: Command,
} = require('../dist/database/commands/upgrade-version-command/2-34/2-34-instance-command-fast-1793663177944-add-seo-outcome-reports');
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
const { createFixture } = require('./check-delivery-reconciliation.cjs');
const TABLES = ['deliverySeoReport', 'deliverySeoVersion', 'deliverySeoEvent'];
const INDEXES = [
  {
    name: 'IDX_4ed669f986be75208a87ca6573',
    table: 'deliverySeoReport',
    columns: ['workspaceId', 'projectId', 'id'],
    unique: false,
  },
  {
    name: 'IDX_9d8fca370d9f1c5077de8b4dfe',
    table: 'deliverySeoReport',
    columns: ['workspaceId', 'id'],
    unique: true,
  },
  {
    name: 'IDX_7fa5396fdb6bc833a205e228db',
    table: 'deliverySeoVersion',
    columns: ['workspaceId', 'reportId', 'version'],
    unique: true,
  },
  {
    name: 'IDX_6d3dc7a218de519632857cd5c5',
    table: 'deliverySeoEvent',
    columns: ['workspaceId', 'reportId', 'revision'],
    unique: true,
  },
  {
    name: 'IDX_0c3dab3d01495771bb0b4fce0e',
    table: 'deliverySeoEvent',
    columns: ['workspaceId', 'requestId'],
    unique: true,
  },
];
const quote = (value) => {
  assert(/^[a-zA-Z0-9_]+$/.test(value));
  return `"${value}"`;
};
async function history(runner) {
  return (
    await runner.query(
      `SELECT (SELECT count(*)::integer FROM core."deliverySeoReport") AS reports,(SELECT count(*)::integer FROM core."deliverySeoVersion") AS versions,(SELECT count(*)::integer FROM core."deliverySeoEvent") AS events,(SELECT count(*)::integer FROM core."otogrowActivityEvent" WHERE "sourceType"='seo-report') AS audit`,
    )
  )[0];
}
const EMPTY = { reports: 0, versions: 0, events: 0, audit: 0 };
async function assertSchema(runner) {
  const actual = await indexRows(runner, INDEXES);
  assert.equal(actual.length, 5);
  for (const expected of INDEXES)
    assert.deepEqual(
      actual.find((row) => row.name === expected.name),
      {
        schema: 'core',
        name: expected.name,
        tableSchema: 'core',
        tableName: expected.table,
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
        predicate: null,
        options: null,
        tablespace: 0,
        columns: expected.columns,
        keyOptions: expected.columns.map(() => 0),
        collations: expected.columns.map(() => 0),
        defaultOperatorClasses: expected.columns.map(() => true),
      },
    );
  const indexes = await runner.query(
    "SELECT tablename,count(*)::integer AS count FROM pg_indexes WHERE schemaname='core' AND tablename=ANY($1::text[]) GROUP BY tablename",
    [TABLES],
  );
  assert.deepEqual(
    Object.fromEntries(indexes.map((row) => [row.tablename, row.count])),
    { deliverySeoReport: 3, deliverySeoVersion: 2, deliverySeoEvent: 3 },
  );
  const constraints = await runner.query(
    `SELECT relation.relname AS table,con.contype AS type,con.convalidated AS valid,pg_get_constraintdef(con.oid) AS definition,con.confdeltype::text AS "deleteAction" FROM pg_constraint con JOIN pg_class relation ON relation.oid=con.conrelid JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace WHERE namespace.nspname='core' AND relation.relname=ANY($1::text[])`,
    [TABLES],
  );
  assert(constraints.every((row) => row.valid));
  assert.equal(constraints.filter((row) => row.type === 'p').length, 3);
  const foreign = constraints.filter((row) => row.type === 'f');
  assert.equal(foreign.length, 7);
  assert.equal(foreign.filter((row) => row.deleteAction === 'c').length, 3);
  assert.equal(foreign.filter((row) => row.deleteAction === 'r').length, 4);
  assert(
    foreign.some(
      (row) =>
        row.table === 'deliverySeoReport' &&
        row.definition.includes(
          'FOREIGN KEY ("workspaceId", "projectId") REFERENCES core."deliveryProject"("workspaceId", id)',
        ),
    ),
  );
  assert(
    foreign.some(
      (row) =>
        row.table === 'deliverySeoEvent' &&
        row.definition.includes(
          'FOREIGN KEY ("workspaceId", "reportId", version) REFERENCES core."deliverySeoVersion"("workspaceId", "reportId", version)',
        ),
    ),
  );
  assert.equal(constraints.filter((row) => row.type === 'c').length, 9);
}
async function insert(runner, table, values) {
  const keys = Object.keys(values);
  return (
    await runner.query(
      `INSERT INTO core.${quote(table)} (${keys.map(quote).join(',')}) VALUES (${keys.map((_key, index) => `$${index + 1}`).join(',')}) RETURNING *`,
      keys.map((key) =>
        key === 'body' ? JSON.stringify(values[key]) : values[key],
      ),
    )
  )[0];
}
const reportValues = (fixture, changes = {}) => ({
  id: randomUUID(),
  workspaceId: fixture.workspaceId,
  projectId: fixture.projects.first,
  companyId: null,
  createdBy: fixture.people.writer.memberId,
  ownerId: fixture.people.writer.memberId,
  ownerName: 'Synthetic SEO owner',
  createdByName: 'Synthetic SEO author',
  revision: 1,
  currentVersion: 1,
  status: 'DRAFT',
  title: 'Synthetic SEO migration report',
  periodStart: '2020-02-01',
  periodEnd: '2020-02-29',
  approvedVersion: null,
  reviewedBy: null,
  reviewedAt: null,
  ...changes,
});
const eventValues = (fixture, reportId, changes = {}) => ({
  workspaceId: fixture.workspaceId,
  reportId,
  requestId: randomUUID(),
  actorId: fixture.people.writer.memberId,
  userWorkspaceId: fixture.people.writer.userWorkspaceId,
  actorName: 'Synthetic SEO actor',
  inputHash: 'a'.repeat(64),
  action: 'SAVE',
  note: '',
  revision: 1,
  version: 1,
  status: 'DRAFT',
  ...changes,
});
async function main() {
  assert.equal(
    process.argv.length,
    2,
    'Rollback-only migration proof; no apply or commit mode.',
  );
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  assert.equal(TWENTY_CURRENT_VERSION, '2.34.0');
  assert.equal(
    INSTANCE_COMMANDS.filter((candidate) => candidate === Command).length,
    1,
  );
  assert.deepEqual(getRegisteredInstanceCommandMetadata(Command), {
    version: '2.34.0',
    timestamp: 1793663177944,
    type: 'fast',
  });
  assert(1793663177944 <= Date.now() + 60000);
  for (const candidate of INSTANCE_COMMANDS) {
    const metadata = getRegisteredInstanceCommandMetadata(candidate);
    if (metadata?.version === '2.34.0' && candidate !== Command)
      assert(metadata.timestamp < 1793663177944);
  }
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
    const originalData = await dataFingerprint(runner, TABLES);
    const originalSchema = await schemaFingerprint(runner);
    const protectedSchema = await schemaFingerprint(
      runner,
      false,
      [],
      '',
      TABLES,
    );
    const present = async () =>
      Promise.all(
        TABLES.map(
          async (table) =>
            (
              await runner.query(
                'SELECT to_regclass($1) IS NOT NULL AS present',
                [`core."${table}"`],
              )
            )[0].present,
        ),
      );
    const initial = await present();
    assert(
      initial.every(Boolean) || initial.every((value) => !value),
      'Investigate a partially installed SEO schema.',
    );
    const installed = initial.every(Boolean);
    const migration = new Command();
    let sequence = 0;
    const isolated = async (label, operation) => {
      const name = `seo_migration_${++sequence}`;
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
      assert.deepEqual(await dataFingerprint(runner, TABLES), originalData);
      assert.equal(
        await schemaFingerprint(runner, false, [], '', TABLES),
        protectedSchema,
      );
    };
    if (installed) {
      await assertSchema(runner);
      assert.deepEqual(
        await history(runner),
        EMPTY,
        'Retained source history must not be deleted for a proof.',
      );
      await migration.down(runner);
    }
    const absentSchema = await schemaFingerprint(runner);
    await migration.up(runner);
    await assertSchema(runner);
    await preserved();
    const addedSchema = await schemaFingerprint(runner);
    if (installed) assert.equal(addedSchema, originalSchema);
    await isolated('Disposable schema fixtures', async () => {
      const fixture = await createFixture(
        runner.manager,
        'seo_migration_check',
      );
      await isolated('Source/version/receipt constraints', async () => {
        const report = await insert(
          runner,
          'deliverySeoReport',
          reportValues(fixture),
        );
        assert(report.createdAt instanceof Date);
        const version = await insert(runner, 'deliverySeoVersion', {
          workspaceId: fixture.workspaceId,
          reportId: report.id,
          version: 1,
          body: { title: 'Synthetic source' },
          createdBy: fixture.people.writer.memberId,
        });
        assert.match(version.id, /^[a-f0-9-]{36}$/);
        assert(version.createdAt instanceof Date);
        const event = await insert(
          runner,
          'deliverySeoEvent',
          eventValues(fixture, report.id),
        );
        assert(event.createdAt instanceof Date);
        await rejects(
          'Global report UUID',
          () =>
            insert(
              runner,
              'deliverySeoReport',
              reportValues(fixture, { id: report.id }),
            ),
          '23505',
        );
        await rejects(
          'Project scope cannot cross workspace',
          () =>
            insert(
              runner,
              'deliverySeoReport',
              reportValues(fixture, {
                workspaceId: fixture.foreignWorkspaceId,
              }),
            ),
          '23503',
        );
        await rejects(
          'Version cannot reference another workspace report',
          () =>
            insert(runner, 'deliverySeoVersion', {
              workspaceId: fixture.foreignWorkspaceId,
              reportId: report.id,
              version: 1,
              body: {},
              createdBy: fixture.people.writer.memberId,
            }),
          '23503',
        );
        await rejects(
          'Source version uniqueness',
          () =>
            insert(runner, 'deliverySeoVersion', {
              workspaceId: fixture.workspaceId,
              reportId: report.id,
              version: 1,
              body: {},
              createdBy: fixture.people.writer.memberId,
            }),
          '23505',
        );
        await rejects(
          'Object version body',
          () =>
            insert(runner, 'deliverySeoVersion', {
              workspaceId: fixture.workspaceId,
              reportId: report.id,
              version: 2,
              body: [],
              createdBy: fixture.people.writer.memberId,
            }),
          '23514',
        );
        await rejects(
          'Event exact version foreign key',
          () =>
            insert(
              runner,
              'deliverySeoEvent',
              eventValues(fixture, report.id, { revision: 2, version: 2 }),
            ),
          '23503',
        );
        await rejects(
          'Immutable action revision identity',
          () =>
            insert(runner, 'deliverySeoEvent', eventValues(fixture, report.id)),
          '23505',
        );
        await rejects(
          'Scoped request identity',
          () =>
            insert(
              runner,
              'deliverySeoEvent',
              eventValues(fixture, report.id, {
                revision: 2,
                requestId: event.requestId,
              }),
            ),
          '23505',
        );
        for (const [label, changes] of [
          ['Positive revision', { revision: 0 }],
          ['Positive current version', { currentVersion: 0 }],
          ['Known status', { status: 'PUBLISHED' }],
          ['Nonempty title', { title: ' ' }],
          ['Valid period order', { periodStart: '2020-03-01' }],
          [
            'Approval needs version even with reviewer',
            {
              status: 'APPROVED',
              approvedVersion: null,
              reviewedBy: fixture.people.reader.memberId,
              reviewedAt: new Date(),
            },
          ],
          [
            'Approval exact version',
            {
              status: 'APPROVED',
              approvedVersion: 2,
              reviewedBy: fixture.people.reader.memberId,
              reviewedAt: new Date(),
            },
          ],
          [
            'Approval needs reviewer',
            { status: 'APPROVED', approvedVersion: 1 },
          ],
          ['Draft cannot claim approved version', { approvedVersion: 1 }],
        ])
          await rejects(
            label,
            () =>
              insert(
                runner,
                'deliverySeoReport',
                reportValues(fixture, changes),
              ),
            '23514',
          );
        await insert(
          runner,
          'deliverySeoReport',
          reportValues(fixture, {
            status: 'APPROVED',
            approvedVersion: 1,
            reviewedBy: fixture.people.reader.memberId,
            reviewedAt: new Date(),
          }),
        );
        for (const changes of [
          { revision: 0 },
          { action: 'PUBLISH', revision: 2 },
          { status: 'PUBLISHED', revision: 2 },
        ])
          await rejects(
            'Receipt state/revision contract',
            () =>
              insert(
                runner,
                'deliverySeoEvent',
                eventValues(fixture, report.id, changes),
              ),
            '23514',
          );
      });
      const guard = (kind, seed) =>
        isolated(`Independent ${kind} retained-history guard`, async () => {
          assert.deepEqual(await history(runner), EMPTY);
          await seed();
          const expected = { ...EMPTY, [kind]: 1 };
          assert.deepEqual(await history(runner), expected);
          const before = await schemaFingerprint(runner);
          await isolated('Rejected downgrade transaction boundary', () =>
            assert.rejects(
              () => migration.down(runner),
              /Cannot remove retained SEO report history/,
            ),
          );
          assert((await present()).every(Boolean));
          assert.equal(await schemaFingerprint(runner), before);
          assert.deepEqual(await history(runner), expected);
        });
      await guard('reports', () =>
        insert(runner, 'deliverySeoReport', reportValues(fixture)),
      );
      // Corrupt orphan histories are possible after manual repairs; downgrades must preserve them too.
      await guard('versions', async () => {
        await runner.query(
          'ALTER TABLE core."deliverySeoVersion" DROP CONSTRAINT "FK_c34af9e6980f61b9a64919d2a06"',
        );
        await insert(runner, 'deliverySeoVersion', {
          workspaceId: fixture.workspaceId,
          reportId: randomUUID(),
          version: 1,
          body: {},
          createdBy: fixture.people.writer.memberId,
        });
      });
      await guard('events', async () => {
        await runner.query(
          'ALTER TABLE core."deliverySeoEvent" DROP CONSTRAINT "FK_53b356fb1465175dd5e524d83af"',
        );
        await runner.query(
          'ALTER TABLE core."deliverySeoEvent" DROP CONSTRAINT "FK_6f42e3d3c44b8975676cd658445"',
        );
        await insert(
          runner,
          'deliverySeoEvent',
          eventValues(fixture, randomUUID()),
        );
      });
      await guard('audit', () =>
        runner.query(
          'INSERT INTO core."otogrowActivityEvent" ("workspaceId","occurredAt","actorName","actorType",category,action,outcome,summary,"sourceType","sourceId") VALUES ($1,now(),\'Synthetic SEO actor\',\'SYSTEM\',\'DELIVERY\',\'SEO_REPORT_SAVE\',\'RECORDED\',\'Synthetic retained report audit\',\'seo-report\',$2)',
          [fixture.workspaceId, randomUUID()],
        ),
      );
    });
    await preserved();
    assert.deepEqual(await history(runner), EMPTY);
    await migration.down(runner);
    assert((await present()).every((value) => !value));
    assert.equal(await schemaFingerprint(runner), absentSchema);
    await preserved();
    await migration.up(runner);
    await assertSchema(runner);
    assert.equal(await schemaFingerprint(runner), addedSchema);
    if (!installed) await migration.down(runner);
    assert.equal(await schemaFingerprint(runner), originalSchema);
    assert.deepEqual(await userTables(runner), tables);
    await preserved();
    console.log(
      `PASS SEO migration: ${tables.length} original tables preserved; three tables/five exact indexes/seven scoped FKs, validated source/version/approval/request constraints, four independent retained-history guards, complete up/down/re-up. Outer rollback only.`,
    );
  } finally {
    try {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
    } finally {
      if (!runner.isReleased) await runner.release();
      if (connectionSource.isInitialized) await connectionSource.destroy();
    }
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
