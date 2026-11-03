const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
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

const EPOCH = 1793320076500;
const VERSION = '2.34.0';
const INDEXES = [
  {
    name: 'IDX_f0787e6a65d3c0fc15954c7b41',
    columns: ['workspaceId', 'initiatorId', 'createdAt', 'id'],
  },
  {
    name: 'IDX_045b474658efd422cffbe80cb8',
    columns: ['workspaceId', 'taskId', 'createdAt', 'id'],
  },
  {
    name: 'IDX_97ecbe33294c2207ef35034b00',
    columns: ['workspaceId', 'createdAt', 'id'],
  },
];
const hash = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const quote = (value) => `"${value.replaceAll('"', '""')}"`;

async function userTables(runner) {
  return runner.query(`SELECT namespace.nspname AS schema,relation.relname AS name
    FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
    WHERE namespace.nspname NOT IN ('pg_catalog','information_schema')
    AND namespace.nspname NOT LIKE 'pg_toast%' AND namespace.nspname NOT LIKE 'pg_temp_%'
    AND relation.relkind IN ('r','p') ORDER BY namespace.nspname,relation.relname`);
}

async function dataFingerprint(runner, excludedTables = []) {
  const result = {};
  for (const table of await userTables(runner)) {
    if (table.schema === 'core' && excludedTables.includes(table.name))
      continue;
    result[`${table.schema}.${table.name}`] = hash(
      await runner.query(
        `SELECT to_jsonb(record)::text AS value FROM ${quote(table.schema)}.${quote(table.name)} record ORDER BY value`,
      ),
    );
  }
  return result;
}

async function schemaFingerprint(
  runner,
  normalizeIndexes = false,
  indexes = INDEXES,
  tableName = 'deliveryAgentRun',
  excludedTables = [],
) {
  const relations = await runner.query(
    `SELECT namespace.nspname,relation.relname,relation.relkind::text,
    relation.relrowsecurity,relation.relforcerowsecurity,relation.reloptions,relation.relacl,
    pg_get_userbyid(relation.relowner) AS owner,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('name',attribute.attname,'type',format_type(attribute.atttypid,attribute.atttypmod),'required',attribute.attnotnull,'identity',attribute.attidentity,'generated',attribute.attgenerated,'collation',collation_row.collname,'default',pg_get_expr(definition.adbin,definition.adrelid)) ORDER BY attribute.attnum) FROM pg_attribute attribute LEFT JOIN pg_attrdef definition ON definition.adrelid=attribute.attrelid AND definition.adnum=attribute.attnum LEFT JOIN pg_collation collation_row ON collation_row.oid=attribute.attcollation WHERE attribute.attrelid=relation.oid AND attribute.attnum>0 AND NOT attribute.attisdropped),'[]'::jsonb)::text AS columns,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('name',constraint_row.conname,'definition',pg_get_constraintdef(constraint_row.oid),'validated',constraint_row.convalidated) ORDER BY constraint_row.conname) FROM pg_constraint constraint_row WHERE constraint_row.conrelid=relation.oid),'[]'::jsonb)::text AS constraints,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('name',indexname,'definition',indexdef) ORDER BY indexname) FROM pg_indexes WHERE schemaname=namespace.nspname AND tablename=relation.relname AND NOT($1 AND namespace.nspname='core' AND relation.relname=$3 AND indexname=ANY($2::text[]))),'[]'::jsonb)::text AS indexes,
    COALESCE((SELECT jsonb_agg(pg_get_triggerdef(trigger_row.oid,true) ORDER BY trigger_row.tgname) FROM pg_trigger trigger_row WHERE trigger_row.tgrelid=relation.oid AND NOT trigger_row.tgisinternal),'[]'::jsonb)::text AS triggers,
    CASE WHEN relation.relkind IN ('v','m') THEN pg_get_viewdef(relation.oid,true) ELSE NULL END AS view
    FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
    WHERE namespace.nspname NOT IN ('pg_catalog','information_schema')
    AND namespace.nspname NOT LIKE 'pg_toast%' AND namespace.nspname NOT LIKE 'pg_temp_%'
    AND relation.relkind IN ('r','p','v','m','S')
    AND NOT(namespace.nspname='core' AND relation.relname=ANY($4::text[]))
    ORDER BY namespace.nspname,relation.relname`,
    [
      normalizeIndexes,
      indexes.map((index) => index.name),
      tableName,
      excludedTables,
    ],
  );
  const enums =
    await runner.query(`SELECT namespace.nspname,type_row.typname,json_agg(enum_row.enumlabel ORDER BY enum_row.enumsortorder)::text AS values
    FROM pg_enum enum_row JOIN pg_type type_row ON type_row.oid=enum_row.enumtypid JOIN pg_namespace namespace ON namespace.oid=type_row.typnamespace
    WHERE namespace.nspname NOT IN ('pg_catalog','information_schema') GROUP BY namespace.nspname,type_row.typname ORDER BY namespace.nspname,type_row.typname`);
  const functions =
    await runner.query(`SELECT namespace.nspname,procedure_row.proname,pg_get_function_identity_arguments(procedure_row.oid) AS arguments,pg_get_functiondef(procedure_row.oid) AS definition
    FROM pg_proc procedure_row JOIN pg_namespace namespace ON namespace.oid=procedure_row.pronamespace
    WHERE namespace.nspname NOT IN ('pg_catalog','information_schema') AND namespace.nspname NOT LIKE 'pg_toast%' AND namespace.nspname NOT LIKE 'pg_temp_%'
    AND procedure_row.prokind IN ('f','p') ORDER BY namespace.nspname,procedure_row.proname,arguments`);
  const schemas =
    await runner.query(`SELECT nspname,nspacl,pg_get_userbyid(nspowner) AS owner FROM pg_namespace
    WHERE nspname NOT IN ('pg_catalog','information_schema') AND nspname NOT LIKE 'pg_toast%' AND nspname NOT LIKE 'pg_temp_%' ORDER BY nspname`);
  const sequences =
    await runner.query(`SELECT namespace.nspname,relation.relname,sequence.seqstart,sequence.seqincrement,sequence.seqmax,sequence.seqmin,sequence.seqcache,sequence.seqcycle
    FROM pg_sequence sequence JOIN pg_class relation ON relation.oid=sequence.seqrelid JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace ORDER BY namespace.nspname,relation.relname`);
  const policies = await runner.query(
    'SELECT * FROM pg_policies ORDER BY schemaname,tablename,policyname',
  );
  return hash({ relations, enums, functions, schemas, sequences, policies });
}

async function indexRows(runner, indexes = INDEXES) {
  return runner.query(
    `SELECT index_namespace.nspname AS schema,index_relation.relname AS name,
    table_namespace.nspname AS "tableSchema",table_relation.relname AS "tableName",
    method.amname AS method,index_row.indisprimary AS "primary",index_row.indisunique AS "unique",
    index_row.indisvalid AS valid,index_row.indisready AS ready,index_row.indislive AS live,
    index_row.indisreplident AS "replicaIdentity",index_row.indnatts::integer AS "attributeCount",
    index_row.indnkeyatts::integer AS "keyCount",index_row.indexprs IS NULL AS simple,
    pg_get_expr(index_row.indpred,index_row.indrelid) AS predicate,index_relation.reloptions AS options,
    index_relation.reltablespace::integer AS tablespace,
    ARRAY(SELECT attribute.attname::text FROM unnest(index_row.indkey) WITH ORDINALITY key(number,position)
      JOIN pg_attribute attribute ON attribute.attrelid=table_relation.oid AND attribute.attnum=key.number
      ORDER BY key.position) AS columns,
    ARRAY(SELECT key_option.value::integer FROM unnest(index_row.indoption) AS key_option(value)) AS "keyOptions",
    ARRAY(SELECT collation_value.value::integer FROM unnest(index_row.indcollation) AS collation_value(value)) AS collations,
    ARRAY(SELECT operator_class.opcdefault FROM unnest(index_row.indclass) WITH ORDINALITY item(number,position)
      JOIN pg_opclass operator_class ON operator_class.oid=item.number ORDER BY item.position) AS "defaultOperatorClasses"
    FROM pg_index index_row JOIN pg_class table_relation ON table_relation.oid=index_row.indrelid
    JOIN pg_namespace table_namespace ON table_namespace.oid=table_relation.relnamespace
    JOIN pg_class index_relation ON index_relation.oid=index_row.indexrelid
    JOIN pg_namespace index_namespace ON index_namespace.oid=index_relation.relnamespace
    JOIN pg_am method ON method.oid=index_relation.relam
    WHERE index_namespace.nspname='core' AND index_relation.relname=ANY($1::text[])
    ORDER BY index_relation.relname`,
    [indexes.map((index) => index.name)],
  );
}
function exactIndexes(rows, indexes = INDEXES, tableName = 'deliveryAgentRun') {
  assert.equal(
    rows.length,
    indexes.length,
    'All intended indexes must exist together.',
  );
  for (const expected of indexes) {
    const row = rows.find((row) => row.name === expected.name);
    assert(row, `Expected exact index ${expected.name}.`);
    assert.deepEqual(
      row,
      {
        schema: 'core',
        name: expected.name,
        tableSchema: 'core',
        tableName,
        method: 'btree',
        primary: false,
        unique: false,
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
      `Exact normal nonunique btree index ${expected.name}.`,
    );
  }
}
const normalizedSql = (sql) => sql.trim().replace(/\s+/g, ' ');
async function runMigration(
  runner,
  migration,
  direction,
  indexes = INDEXES,
  tableName = 'deliveryAgentRun',
) {
  const expected =
    direction === 'up'
      ? indexes.map(
          (index) =>
            `CREATE INDEX ${quote(index.name)} ON "core".${quote(tableName)} (${index.columns.map(quote).join(', ')})`,
        )
      : [...indexes]
          .reverse()
          .map((index) => `DROP INDEX "core".${quote(index.name)}`);
  const query = runner.query.bind(runner);
  let statements = 0;
  runner.query = async (sql, ...arguments_) => {
    assert.equal(
      normalizedSql(sql),
      normalizedSql(expected[statements] ?? ''),
      'The compiled command may execute only its exact intended index statements.',
    );
    statements++;
    return query(sql, ...arguments_);
  };
  try {
    await migration[direction](runner);
    assert.equal(statements, indexes.length);
  } finally {
    runner.query = query;
  }
}

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
    /^2-34-instance-command-fast-\d+-add-delivery-assistant-read-indexes\.js$/.test(
      file,
    ),
  );
  assert.deepEqual(
    files,
    [
      `2-34-instance-command-fast-${EPOCH}-add-delivery-assistant-read-indexes.js`,
    ],
    'Build only the one official generated read-index command.',
  );
  const { AddDeliveryAssistantReadIndexesFastInstanceCommand } = require(
    join(directory, files[0]),
  );
  assert.equal(
    INSTANCE_COMMANDS.filter(
      (command) =>
        command === AddDeliveryAssistantReadIndexesFastInstanceCommand,
    ).length,
    1,
    'The generated class must be registered exactly once.',
  );
  assert.deepEqual(
    getRegisteredInstanceCommandMetadata(
      AddDeliveryAssistantReadIndexesFastInstanceCommand,
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
      command !== AddDeliveryAssistantReadIndexesFastInstanceCommand
    )
      assert(
        metadata.timestamp < EPOCH,
        'The new current-version index migration must sort after all earlier commands.',
      );
  }
  const migration = new AddDeliveryAssistantReadIndexesFastInstanceCommand();
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
    const existing = await indexRows(runner);
    assert(
      [0, INDEXES.length].includes(existing.length),
      'Refuse a partially installed performance-index migration.',
    );
    if (existing.length) exactIndexes(existing);
    const installed = existing.length > 0;
    const originalData = await dataFingerprint(runner);
    const originalSchema = await schemaFingerprint(runner);
    const protectedSchema = await schemaFingerprint(runner, true);
    const unchangedData = async () =>
      assert.deepEqual(
        await dataFingerprint(runner),
        originalData,
        'No preexisting table or row may change during any index migration step.',
      );
    const unchangedSchema = async () =>
      assert.equal(
        await schemaFingerprint(runner, true),
        protectedSchema,
        'Only the three exact intended deliveryAgentRun index definitions may differ.',
      );
    if (installed) await runMigration(runner, migration, 'down');
    assert.deepEqual(await indexRows(runner), []);
    await unchangedData();
    await unchangedSchema();
    const oldSchema = await schemaFingerprint(runner);

    await runMigration(runner, migration, 'up');
    exactIndexes(await indexRows(runner));
    await unchangedData();
    await unchangedSchema();
    const addedSchema = await schemaFingerprint(runner);
    if (installed) assert.equal(addedSchema, originalSchema);

    await runMigration(runner, migration, 'down');
    assert.deepEqual(await indexRows(runner), []);
    await unchangedData();
    await unchangedSchema();
    assert.equal(
      await schemaFingerprint(runner),
      oldSchema,
      'Down restores every earlier schema object and removes only the three new indexes.',
    );

    await runMigration(runner, migration, 'up');
    exactIndexes(await indexRows(runner));
    await unchangedData();
    await unchangedSchema();
    assert.equal(
      await schemaFingerprint(runner),
      addedSchema,
      'Re-up restores the intended schema exactly.',
    );
    if (!installed) await runMigration(runner, migration, 'down');
    assert.equal(await schemaFingerprint(runner), originalSchema);
    await unchangedData();
    assert.deepEqual(await userTables(runner), tables);
    console.log(
      `Assistant-index migration rollback proof passed: ${tables.length} protected tables; registered current-version epoch ${EPOCH}; exact three default nonunique btree indexes; full up/down/re-up and original schema/data preserved. No changes committed.`,
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

module.exports = {
  userTables,
  dataFingerprint,
  schemaFingerprint,
  indexRows,
  exactIndexes,
  runMigration,
};
