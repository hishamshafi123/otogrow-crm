const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const { readdirSync } = require('node:fs');
const { join } = require('node:path');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');

const DIRECTORY = join(
  __dirname,
  '../dist/database/commands/upgrade-version-command/2-34',
);
const files = readdirSync(DIRECTORY).filter((file) =>
  /^2-34-instance-command-fast-\d+-add-delivery-finance-period\.js$/.test(file),
);
assert.equal(
  files.length,
  1,
  'Build the single generated finance-period command first.',
);
const { AddDeliveryFinancePeriodFastInstanceCommand } = require(
  join(DIRECTORY, files[0]),
);
const TABLE = 'deliveryFinancePeriod';
const DATA_TABLES = [
  'workspace',
  'deliveryProject',
  'deliveryFinancePlan',
  'deliveryFinanceEntry',
  'deliveryFinanceAllocation',
  'deliveryFinanceEvent',
  'deliveryFinanceSource',
  'deliveryFinanceSettlement',
  'deliveryFinanceCashMatch',
  'deliveryFinanceAiClaim',
  'otogrowAiSpend',
  'otogrowAiSpendEvent',
  'otogrowAiBudget',
  'otogrowAiPrice',
  'otogrowActivityEvent',
  'deliveryReminderOutbox',
  'deliveryOperations',
];
const fingerprint = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function main() {
  assert.equal(process.argv.length, 2, 'This checker always rolls back.');
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
    await runner.query("SET LOCAL lock_timeout='10s'");
    await runner.query("SET LOCAL statement_timeout='30s'");
    for (const table of DATA_TABLES)
      await runner.query(`LOCK TABLE core."${table}" IN SHARE MODE`);
    const workspaceIds = [randomUUID(), randomUUID()];
    const actorId = randomUUID();
    const data = async () => {
      const result = {};
      for (const table of DATA_TABLES)
        result[table] = fingerprint(
          await runner.query(
            `SELECT to_jsonb(record)::text AS value FROM core."${table}" record WHERE "${table === 'workspace' ? 'id' : 'workspaceId'}"<>ALL($1::uuid[]) ORDER BY id`,
            [workspaceIds],
          ),
        );
      return result;
    };
    const schema = async (excludePeriod = true) =>
      fingerprint(
        await runner.query(
          `SELECT namespace.nspname,relation.relname,relation.relkind::text,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('name',attribute.attname,'type',pg_catalog.format_type(attribute.atttypid,attribute.atttypmod),'required',attribute.attnotnull,'default',pg_get_expr(definition.adbin,definition.adrelid)) ORDER BY attribute.attnum) FROM pg_attribute attribute LEFT JOIN pg_attrdef definition ON definition.adrelid=attribute.attrelid AND definition.adnum=attribute.attnum WHERE attribute.attrelid=relation.oid AND attribute.attnum>0 AND NOT attribute.attisdropped),'[]'::jsonb)::text AS columns,
      COALESCE((SELECT jsonb_agg(pg_get_constraintdef(constraint_row.oid) ORDER BY constraint_row.conname) FROM pg_constraint constraint_row WHERE constraint_row.conrelid=relation.oid),'[]'::jsonb)::text AS constraints,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('name',indexname,'definition',indexdef) ORDER BY indexname) FROM pg_indexes WHERE schemaname=namespace.nspname AND tablename=relation.relname),'[]'::jsonb)::text AS indexes,
      COALESCE((SELECT jsonb_agg(pg_get_triggerdef(trigger_row.oid,true) ORDER BY trigger_row.tgname) FROM pg_trigger trigger_row WHERE trigger_row.tgrelid=relation.oid AND NOT trigger_row.tgisinternal),'[]'::jsonb)::text AS triggers,
      CASE WHEN relation.relkind IN ('v','m') THEN pg_get_viewdef(relation.oid,true) ELSE NULL END AS view
      FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace WHERE namespace.nspname NOT IN ('pg_catalog','information_schema') AND namespace.nspname NOT LIKE 'pg_toast%' AND relation.relkind IN ('r','p','v','m') AND NOT($1 AND namespace.nspname='core' AND relation.relname=$2) ORDER BY namespace.nspname,relation.relname`,
          [excludePeriod, TABLE],
        ),
      );
    const exists = async () =>
      (
        await runner.query(
          'SELECT to_regclass(\'core."deliveryFinancePeriod"\') IS NOT NULL AS present',
        )
      )[0].present;
    const installed = await exists();
    const originalData = await data();
    const originalSchema = await schema(false);
    const unrelatedSchema = await schema();
    const migration = new AddDeliveryFinancePeriodFastInstanceCommand();
    let sequence = 0;
    const rejects = async (label, operation, code = '23514') => {
      const savepoint = `period_migration_${++sequence}`;
      await runner.query(`SAVEPOINT ${savepoint}`);
      try {
        await assert.rejects(operation, (error) => error.code === code, label);
      } finally {
        await runner.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await runner.query(`RELEASE SAVEPOINT ${savepoint}`);
      }
    };
    if (installed) {
      const [{ count }] = await runner.query(
        'SELECT (SELECT count(*) FROM core."deliveryFinancePeriod")+(SELECT count(*) FROM core."deliveryFinanceEvent" WHERE "sourceType"=\'PERIOD\') AS count',
      );
      if (BigInt(count) > 0n) {
        await rejects(
          'Existing result-review history prevents downgrade',
          () => migration.down(runner),
          'P0001',
        );
        assert.fail(
          'Real period history correctly blocks downgrade; do not remove it to run this full-cycle checker.',
        );
      }
      await migration.down(runner);
    }
    const oldSchema = await schema(false);
    await migration.up(runner);
    assert(await exists());
    assert.deepEqual(await data(), originalData);
    assert.equal(
      await schema(),
      unrelatedSchema,
      'Only the new period table may change schema.',
    );
    if (installed) assert.equal(await schema(false), originalSchema);
    const foreignKeys = await runner.query(
      "SELECT pg_get_constraintdef(constraint_row.oid) AS definition FROM pg_constraint constraint_row JOIN pg_class relation ON relation.oid=constraint_row.conrelid JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace WHERE namespace.nspname='core' AND relation.relname=$1 AND constraint_row.contype='f'",
      [TABLE],
    );
    assert.equal(foreignKeys.length, 1);
    assert(
      /FOREIGN KEY \("workspaceId"\).*workspace.*ON DELETE CASCADE/.test(
        foreignKeys[0].definition,
      ),
    );
    const [template] = await runner.query(
      'SELECT "workspaceCustomApplicationId" FROM core.workspace ORDER BY id LIMIT 1',
    );
    assert(template);
    for (const workspaceId of workspaceIds)
      await runner.query(
        'INSERT INTO core.workspace (id,"displayName",subdomain,"activationStatus","workspaceCustomApplicationId") VALUES ($1,\'Disposable period migration fixture\',$2,\'PENDING_CREATION\',$3)',
        [
          workspaceId,
          `period-migration-${workspaceId}`,
          template.workspaceCustomApplicationId,
        ],
      );
    const insert = (fields = {}) =>
      runner.query(
        'INSERT INTO core."deliveryFinancePeriod" (id,"workspaceId",month,status,revision,"changedBy","changedByName","changedAt",reason) VALUES ($1,$2,$3,$4,$5,$6,\'Synthetic reviewer\',now(),$7) RETURNING *',
        [
          fields.id ?? randomUUID(),
          fields.workspaceId ?? workspaceIds[0],
          fields.month ?? '2020-02',
          fields.status ?? 'LOCKED',
          fields.revision ?? 1,
          actorId,
          fields.reason ?? 'Disposable result review',
        ],
      );
    const [period] = await insert();
    assert.equal(period.revision, 1);
    assert.equal(period.status, 'LOCKED');
    assert(period.changedAt instanceof Date);
    await rejects('Workspace/month uniqueness', () => insert(), '23505');
    await insert({ workspaceId: workspaceIds[1], status: 'OPEN' });
    await rejects('Positive revision', () =>
      insert({ month: '2020-03', revision: 0 }),
    );
    await rejects('Finite result statuses', () =>
      insert({ month: '2020-03', status: 'CLOSED' }),
    );
    await rejects('Valid service month', () => insert({ month: '2020-13' }));
    await rejects('Year zero is invalid', () => insert({ month: '0000-01' }));
    await rejects('Reason cannot be blank', () =>
      insert({ month: '2020-03', reason: '  ' }),
    );
    await rejects(
      'Period belongs to an existing workspace',
      () => insert({ workspaceId: randomUUID() }),
      '23503',
    );
    await rejects(
      'Period state blocks destructive downgrade',
      () => migration.down(runner),
      'P0001',
    );
    const eventId = randomUUID();
    await runner.query(
      'INSERT INTO core."deliveryFinanceEvent" (id,"workspaceId","sourceType","sourceId","actorId","actorName",action,revision,reason,"before","after") VALUES ($1,$2,\'PERIOD\',$3,$4,\'Synthetic reviewer\',\'LOCKED\',1,\'Disposable review\',NULL,$5)',
      [
        eventId,
        workspaceIds[0],
        period.id,
        actorId,
        {
          month: '2020-02',
          status: 'LOCKED',
          summaries: [],
          recognitionHash: 'synthetic',
        },
      ],
    );
    await runner.query(
      'DELETE FROM core."deliveryFinancePeriod" WHERE "workspaceId"=ANY($1::uuid[])',
      [workspaceIds],
    );
    await rejects(
      'Even historical review events prevent downgrade',
      () => migration.down(runner),
      'P0001',
    );
    await runner.query(
      'DELETE FROM core."deliveryFinanceEvent" WHERE id=$1 AND "workspaceId"=$2',
      [eventId, workspaceIds[0]],
    );
    await runner.query('SET CONSTRAINTS ALL IMMEDIATE');
    await migration.down(runner);
    assert(!(await exists()));
    assert.deepEqual(await data(), originalData);
    assert.equal(await schema(false), oldSchema);
    await migration.up(runner);
    assert.deepEqual(await data(), originalData);
    assert.equal(await schema(), unrelatedSchema);
    if (installed) assert.equal(await schema(false), originalSchema);
    else {
      await migration.down(runner);
      assert.equal(await schema(false), originalSchema);
    }
    console.log(
      'PASS rollback-only result-period migration: workspace/month uniqueness, state/revision/month/reason checks and workspace FK; downgrade preserves both period state and historical review events; existing finance/cash/ledger/workspace data and unrelated schema unchanged. Outer rollback restores original installation.',
    );
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
