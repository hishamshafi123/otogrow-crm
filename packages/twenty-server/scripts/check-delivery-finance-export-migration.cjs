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
  /^2-34-instance-command-fast-\d+-add-delivery-finance-export\.js$/.test(file),
);
assert.equal(
  files.length,
  1,
  'Build the single generated accountant-export command first.',
);
const { AddDeliveryFinanceExportFastInstanceCommand } = require(
  join(DIRECTORY, files[0]),
);
const TABLES = ['deliveryFinanceExportProfile', 'deliveryFinanceExportBatch'];
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
  'deliveryFinancePeriod',
  'deliveryFinanceForecastAnchor',
  'deliveryFinanceForecastItem',
  'deliveryFinanceForecastRealization',
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
    const installedParts = async () =>
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
    const schema = async (excludeIntended = true) => {
      const relations = await runner.query(
        `SELECT namespace.nspname,relation.relname,relation.relkind::text,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('name',attribute.attname,'type',pg_catalog.format_type(attribute.atttypid,attribute.atttypmod),'required',attribute.attnotnull,'default',pg_get_expr(definition.adbin,definition.adrelid)) ORDER BY attribute.attnum) FROM pg_attribute attribute LEFT JOIN pg_attrdef definition ON definition.adrelid=attribute.attrelid AND definition.adnum=attribute.attnum WHERE attribute.attrelid=relation.oid AND attribute.attnum>0 AND NOT attribute.attisdropped),'[]'::jsonb)::text AS columns,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('name',constraint_row.conname,'definition',pg_get_constraintdef(constraint_row.oid)) ORDER BY constraint_row.conname) FROM pg_constraint constraint_row WHERE constraint_row.conrelid=relation.oid),'[]'::jsonb)::text AS constraints,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('name',indexname,'definition',indexdef) ORDER BY indexname) FROM pg_indexes WHERE schemaname=namespace.nspname AND tablename=relation.relname),'[]'::jsonb)::text AS indexes,
        COALESCE((SELECT jsonb_agg(pg_get_triggerdef(trigger_row.oid,true) ORDER BY trigger_row.tgname) FROM pg_trigger trigger_row WHERE trigger_row.tgrelid=relation.oid AND NOT trigger_row.tgisinternal),'[]'::jsonb)::text AS triggers,
        CASE WHEN relation.relkind IN ('v','m') THEN pg_get_viewdef(relation.oid,true) ELSE NULL END AS view
        FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace WHERE namespace.nspname NOT IN ('pg_catalog','information_schema') AND namespace.nspname NOT LIKE 'pg_toast%' AND relation.relkind IN ('r','p','v','m') AND NOT($1 AND namespace.nspname='core' AND relation.relname=ANY($2::text[])) ORDER BY namespace.nspname,relation.relname`,
        [excludeIntended, TABLES],
      );
      const enums = await runner.query(
        "SELECT namespace.nspname,type_row.typname,json_agg(enum_row.enumlabel ORDER BY enum_row.enumsortorder)::text AS values FROM pg_enum enum_row JOIN pg_type type_row ON type_row.oid=enum_row.enumtypid JOIN pg_namespace namespace ON namespace.oid=type_row.typnamespace WHERE namespace.nspname NOT IN ('pg_catalog','information_schema') GROUP BY namespace.nspname,type_row.typname ORDER BY namespace.nspname,type_row.typname",
      );
      const functions = await runner.query(
        "SELECT namespace.nspname,procedure_row.proname,pg_get_function_identity_arguments(procedure_row.oid) AS arguments,pg_get_functiondef(procedure_row.oid) AS definition FROM pg_proc procedure_row JOIN pg_namespace namespace ON namespace.oid=procedure_row.pronamespace WHERE namespace.nspname NOT IN ('pg_catalog','information_schema') AND namespace.nspname NOT LIKE 'pg_toast%' AND procedure_row.prokind IN ('f','p') ORDER BY namespace.nspname,procedure_row.proname,arguments",
      );
      return fingerprint({ relations, enums, functions });
    };
    const parts = await installedParts();
    assert(
      parts.every(Boolean) || parts.every((value) => !value),
      'Investigate a partial export schema installation.',
    );
    const installed = parts.every(Boolean);
    if (installed)
      for (const table of TABLES)
        await runner.query(`LOCK TABLE core."${table}" IN SHARE MODE`);
    const originalData = await data();
    const originalSchema = await schema(false);
    const unrelatedSchema = await schema();
    const migration = new AddDeliveryFinanceExportFastInstanceCommand();
    let sequence = 0;
    const rejects = async (label, operation, code = '23514') => {
      const savepoint = `export_migration_${++sequence}`;
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
        'SELECT (SELECT count(*) FROM core."deliveryFinanceExportProfile")+(SELECT count(*) FROM core."deliveryFinanceExportBatch")+(SELECT count(*) FROM core."deliveryFinanceEvent" WHERE "sourceType" IN (\'EXPORT_PROFILE\',\'EXPORT_BATCH\')) AS count',
      );
      if (BigInt(count) > 0n) {
        await rejects(
          'Existing export data/history prevents downgrade',
          () => migration.down(runner),
          'P0001',
        );
        assert.fail(
          'Existing handoff history correctly blocks downgrade; never remove it to run this full-cycle checker.',
        );
      }
      await migration.down(runner);
    }
    const oldSchema = await schema(false);
    await migration.up(runner);
    assert((await installedParts()).every(Boolean));
    assert.deepEqual(await data(), originalData);
    assert.equal(
      await schema(),
      unrelatedSchema,
      'Only the two new export tables may change schema.',
    );
    if (installed) assert.equal(await schema(false), originalSchema);
    const foreignKeys = await runner.query(
      "SELECT relation.relname AS \"table\",pg_get_constraintdef(constraint_row.oid) AS definition FROM pg_constraint constraint_row JOIN pg_class relation ON relation.oid=constraint_row.conrelid JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace WHERE namespace.nspname='core' AND relation.relname=ANY($1::text[]) AND constraint_row.contype='f' ORDER BY relation.relname,constraint_row.conname",
      [TABLES],
    );
    assert.equal(foreignKeys.length, 3);
    for (const table of TABLES)
      assert(
        foreignKeys.some(
          (row) =>
            row.table === table &&
            /FOREIGN KEY \("workspaceId"\).*workspace.*ON DELETE CASCADE/.test(
              row.definition,
            ),
        ),
        `Missing workspace cascade for ${table}.`,
      );
    assert(
      foreignKeys.some(
        (row) =>
          row.table === 'deliveryFinanceExportBatch' &&
          /FOREIGN KEY \("workspaceId", "profileId"\).*deliveryFinanceExportProfile.*ON DELETE RESTRICT/.test(
            row.definition,
          ),
      ),
    );
    const indexes = await runner.query(
      "SELECT tablename,indexdef FROM pg_indexes WHERE schemaname='core' AND tablename=ANY($1::text[])",
      [TABLES],
    );
    for (const table of TABLES)
      assert(
        indexes.some(
          (row) =>
            row.tablename === table &&
            /CREATE UNIQUE INDEX.*\("workspaceId", id\)/.test(row.indexdef),
        ),
        `Missing workspace-safe source index for ${table}.`,
      );
    assert(
      indexes.some(
        (row) =>
          row.tablename === 'deliveryFinanceExportBatch' &&
          /\("workspaceId", basis, currency, id\)/.test(row.indexdef),
      ),
    );
    const [template] = await runner.query(
      'SELECT "workspaceCustomApplicationId" FROM core.workspace ORDER BY id LIMIT 1',
    );
    assert(template);
    for (const workspaceId of workspaceIds)
      await runner.query(
        'INSERT INTO core.workspace (id,"displayName",subdomain,"activationStatus","workspaceCustomApplicationId") VALUES ($1,\'Disposable export migration fixture\',$2,\'PENDING_CREATION\',$3)',
        [
          workspaceId,
          `export-migration-${workspaceId}`,
          template.workspaceCustomApplicationId,
        ],
      );
    const configuration = {
      columns: [{ header: 'Amount', field: 'AMOUNT', constant: null }],
      mappings: [],
      delimiter: 'COMMA',
      precision: 6,
      dateFormat: 'ISO',
      includeBom: false,
    };
    const insertProfile = (fields = {}) =>
      runner.query(
        'INSERT INTO core."deliveryFinanceExportProfile" (id,"workspaceId",revision,name,basis,active,configuration,"changedBy","changedByName") VALUES ($1,$2,$3,$4,$5,true,$6,$7,\'Synthetic reviewer\') RETURNING *',
        [
          fields.id ?? randomUUID(),
          fields.workspaceId ?? workspaceIds[0],
          fields.revision ?? 1,
          fields.name ?? 'Disposable accountant template',
          fields.basis ?? 'CASH',
          configuration,
          actorId,
        ],
      );
    const [profile] = await insertProfile();
    const [foreignProfile] = await insertProfile({
      workspaceId: workspaceIds[1],
      basis: 'RECOGNITION',
    });
    assert.equal(profile.revision, 1);
    assert(profile.changedAt instanceof Date);
    await rejects('Profile revision must be positive', () =>
      insertProfile({ revision: 0 }),
    );
    await rejects('Profile basis is explicit', () =>
      insertProfile({ basis: 'JOURNAL' }),
    );
    await rejects('Profile name cannot be blank', () =>
      insertProfile({ name: '  ' }),
    );
    await rejects(
      'Profile workspace must exist',
      () => insertProfile({ workspaceId: randomUUID() }),
      '23503',
    );
    await rejects(
      'Profile identity cannot be claimed twice',
      () => insertProfile({ id: profile.id }),
      '23505',
    );
    const sourceId = randomUUID();
    const csv = 'Amount\r\n1.000000\r\n';
    const insertBatch = (fields = {}) =>
      runner.query(
        'INSERT INTO core."deliveryFinanceExportBatch" (id,"workspaceId","profileId","profileRevision",basis,currency,selection,"profileSnapshot",rows,"sourceIds","identityKeys",exclusions,totals,"rowCount",csv,checksum,"byteLength","previewToken","requestHash","reexportReason","createdBy","createdByName") VALUES ($1,$2,$3,$4,$5,\'USD\',$6,$7,$8,$9,$10,\'[]\'::jsonb,$11,$12,$13,$14,$15,$16,$17,NULL,$18,\'Synthetic reviewer\') RETURNING *',
        [
          fields.id ?? randomUUID(),
          fields.workspaceId ?? workspaceIds[0],
          fields.profileId ?? profile.id,
          fields.profileRevision ?? 1,
          fields.basis ?? 'CASH',
          {
            profileId: profile.id,
            currency: 'USD',
            dateFrom: '2020-02-01',
            dateTo: '2020-02-29',
            serviceMonth: null,
            accountingDate: null,
          },
          {
            id: profile.id,
            revision: 1,
            name: profile.name,
            basis: 'CASH',
            active: true,
            ...configuration,
            changedAt: profile.changedAt.toISOString(),
            changedByName: 'Synthetic reviewer',
          },
          JSON.stringify([
            {
              sourceId,
              identityKey: `CASH:${sourceId}`,
              amountMicros: '1000000',
              cells: ['1.000000'],
            },
          ]),
          [sourceId],
          [`CASH:${sourceId}`],
          {
            incomingMicros: '1000000',
            outgoingMicros: '0',
            netMicros: '1000000',
            sourceCount: 1,
            rowCount: 1,
            exclusionCount: 0,
            errorCount: 0,
            repeatedSourceCount: 0,
          },
          fields.rowCount ?? 1,
          csv,
          fields.checksum ?? createHash('sha256').update(csv).digest('hex'),
          fields.byteLength ?? Buffer.byteLength(csv),
          'a'.repeat(64),
          'b'.repeat(64),
          actorId,
        ],
      );
    const [batch] = await insertBatch();
    assert(batch.createdAt instanceof Date);
    assert.equal(batch.csv, csv);
    await rejects('Batch profile revision must be positive', () =>
      insertBatch({ profileRevision: 0 }),
    );
    await rejects('Batch basis is explicit', () =>
      insertBatch({ basis: 'JOURNAL' }),
    );
    await rejects('Empty batches are prohibited', () =>
      insertBatch({ rowCount: 0 }),
    );
    await rejects('Oversized batch row count is prohibited', () =>
      insertBatch({ rowCount: 2001 }),
    );
    await rejects('CSV byte count is positive', () =>
      insertBatch({ byteLength: 0 }),
    );
    await rejects('CSV byte count is bounded', () =>
      insertBatch({ byteLength: 5000001 }),
    );
    await rejects('CSV checksum has the exact format', () =>
      insertBatch({ checksum: 'not-a-checksum' }),
    );
    await rejects(
      'Batch workspace must exist',
      () => insertBatch({ workspaceId: randomUUID() }),
      '23503',
    );
    await rejects(
      'Profile reference cannot cross workspaces',
      () => insertBatch({ profileId: foreignProfile.id }),
      '23503',
    );
    await rejects(
      'Batch identity cannot be claimed twice',
      () => insertBatch({ id: batch.id }),
      '23505',
    );
    await rejects(
      'Retained batch protects its profile',
      () =>
        runner.query(
          'DELETE FROM core."deliveryFinanceExportProfile" WHERE id=$1 AND "workspaceId"=$2',
          [profile.id, workspaceIds[0]],
        ),
      '23503',
    );
    await rejects(
      'Export state prevents destructive downgrade',
      () => migration.down(runner),
      'P0001',
    );
    await runner.query(
      'DELETE FROM core."deliveryFinanceExportBatch" WHERE "workspaceId"=ANY($1::uuid[])',
      [workspaceIds],
    );
    await rejects(
      'Profile-only state prevents destructive downgrade',
      () => migration.down(runner),
      'P0001',
    );
    await runner.query(
      'DELETE FROM core."deliveryFinanceExportProfile" WHERE "workspaceId"=ANY($1::uuid[])',
      [workspaceIds],
    );
    for (const sourceType of ['EXPORT_PROFILE', 'EXPORT_BATCH']) {
      const eventId = randomUUID();
      await runner.query(
        'INSERT INTO core."deliveryFinanceEvent" (id,"workspaceId","sourceType","sourceId","actorId","actorName",action,revision,reason,"before","after") VALUES ($1,$2,$3,$4,$5,\'Synthetic reviewer\',\'SYNTHETIC_EXPORT_HISTORY\',1,\'Disposable retained handoff proof\',NULL,$6)',
        [
          eventId,
          workspaceIds[0],
          sourceType,
          randomUUID(),
          actorId,
          { checksum: batch.checksum, importStatus: 'REVERSED' },
        ],
      );
      await rejects(
        `${sourceType} history alone prevents downgrade`,
        () => migration.down(runner),
        'P0001',
      );
      await runner.query(
        'DELETE FROM core."deliveryFinanceEvent" WHERE id=$1 AND "workspaceId"=$2',
        [eventId, workspaceIds[0]],
      );
    }
    await runner.query('SET CONSTRAINTS ALL IMMEDIATE');
    await migration.down(runner);
    assert(!(await installedParts()).some(Boolean));
    assert.deepEqual(await data(), originalData);
    assert.equal(await schema(false), oldSchema);
    await migration.up(runner);
    assert((await installedParts()).every(Boolean));
    assert.deepEqual(await data(), originalData);
    assert.equal(await schema(), unrelatedSchema);
    if (installed) assert.equal(await schema(false), originalSchema);
    else {
      await migration.down(runner);
      assert.equal(await schema(false), originalSchema);
    }
    console.log(
      'PASS rollback-only accountant-export migration: two tables, workspace-safe profile/batch identities, three FKs and bounded batch metadata/checksums; cross-workspace references and profile deletion rejected; profiles, batches and both retained event types protect downgrade. Existing data and unrelated schema preserved; outer rollback restores the original installation.',
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
