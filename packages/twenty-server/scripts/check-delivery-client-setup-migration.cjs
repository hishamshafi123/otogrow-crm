const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const { readdirSync } = require('node:fs');
const { join } = require('node:path');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');

const TABLE = 'deliveryClientSetup';
const TABLES = [TABLE];
const PROJECT_INDEX = 'IDX_699fb35023512a9edf6a9334a4';
const DOWNGRADE_MESSAGE =
  'Client setup receipts or activity exist; retain the additive schema.';
const COLUMNS = {
  workspaceId: 'uuid',
  id: 'uuid',
  requestId: 'uuid',
  requestHash: 'text',
  actorId: 'uuid',
  userWorkspaceId: 'uuid',
  companyId: 'uuid',
  projectId: 'uuid',
  engagementId: 'uuid',
  taskId: 'uuid',
  reusedProject: 'boolean',
  reusedEngagement: 'boolean',
  source: 'jsonb',
  createdAt: 'timestamp with time zone',
};
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

async function dataFingerprint(runner, normalizeIntended = false) {
  const result = {};
  for (const table of await userTables(runner)) {
    if (
      normalizeIntended &&
      table.schema === 'core' &&
      TABLES.includes(table.name)
    )
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
  normalizeIntended = false,
  projectIndexName = '',
) {
  const relations = await runner.query(
    `SELECT namespace.nspname,relation.relname,relation.relkind::text,
    relation.relrowsecurity,relation.relforcerowsecurity,relation.reloptions,relation.relacl,
    pg_get_userbyid(relation.relowner) AS owner,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('name',attribute.attname,'type',format_type(attribute.atttypid,attribute.atttypmod),'required',attribute.attnotnull,'identity',attribute.attidentity,'generated',attribute.attgenerated,'collation',collation_row.collname,'default',pg_get_expr(definition.adbin,definition.adrelid)) ORDER BY attribute.attnum) FROM pg_attribute attribute LEFT JOIN pg_attrdef definition ON definition.adrelid=attribute.attrelid AND definition.adnum=attribute.attnum LEFT JOIN pg_collation collation_row ON collation_row.oid=attribute.attcollation WHERE attribute.attrelid=relation.oid AND attribute.attnum>0 AND NOT attribute.attisdropped),'[]'::jsonb)::text AS columns,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('name',constraint_row.conname,'definition',pg_get_constraintdef(constraint_row.oid),'validated',constraint_row.convalidated) ORDER BY constraint_row.conname) FROM pg_constraint constraint_row WHERE constraint_row.conrelid=relation.oid),'[]'::jsonb)::text AS constraints,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('name',indexname,'definition',indexdef) ORDER BY indexname) FROM pg_indexes WHERE schemaname=namespace.nspname AND tablename=relation.relname AND NOT($1 AND namespace.nspname='core' AND relation.relname='deliveryProject' AND indexname=$3)),'[]'::jsonb)::text AS indexes,
    COALESCE((SELECT jsonb_agg(pg_get_triggerdef(trigger_row.oid,true) ORDER BY trigger_row.tgname) FROM pg_trigger trigger_row WHERE trigger_row.tgrelid=relation.oid AND NOT trigger_row.tgisinternal),'[]'::jsonb)::text AS triggers,
    CASE WHEN relation.relkind IN ('v','m') THEN pg_get_viewdef(relation.oid,true) ELSE NULL END AS view
    FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
    WHERE namespace.nspname NOT IN ('pg_catalog','information_schema')
    AND namespace.nspname NOT LIKE 'pg_toast%' AND namespace.nspname NOT LIKE 'pg_temp_%'
    AND relation.relkind IN ('r','p','v','m','S')
    AND NOT($1 AND namespace.nspname='core' AND relation.relname=ANY($2::text[]))
    ORDER BY namespace.nspname,relation.relname`,
    [normalizeIntended, TABLES, projectIndexName],
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

async function indexRows(runner, table) {
  return runner.query(
    `SELECT index_relation.relname AS name,index_row.indisprimary AS "primary",index_row.indisunique AS "unique",index_row.indisvalid AS valid,index_row.indisready AS ready,index_row.indnatts::integer AS "attributeCount",index_row.indnkeyatts::integer AS "keyCount",index_row.indexprs IS NULL AS simple,pg_get_expr(index_row.indpred,index_row.indrelid) AS predicate,
    ARRAY(SELECT attribute.attname::text FROM unnest(index_row.indkey) WITH ORDINALITY key(number,position) JOIN pg_attribute attribute ON attribute.attrelid=relation.oid AND attribute.attnum=key.number ORDER BY key.position) AS columns
    FROM pg_index index_row JOIN pg_class relation ON relation.oid=index_row.indrelid JOIN pg_class index_relation ON index_relation.oid=index_row.indexrelid
    WHERE relation.relnamespace='core'::regnamespace AND relation.relname=$1 ORDER BY index_relation.relname`,
    [table],
  );
}

async function projectIndexes(runner) {
  return (await indexRows(runner, 'deliveryProject')).filter(
    (index) =>
      !index.primary &&
      index.unique &&
      index.simple &&
      index.attributeCount === 2 &&
      index.keyCount === 2 &&
      index.predicate === null &&
      JSON.stringify(index.columns) === '["workspaceId","id"]',
  );
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
  const directory = join(
    __dirname,
    '../dist/database/commands/upgrade-version-command/2-34',
  );
  const files = readdirSync(directory).filter((file) =>
    /^2-34-instance-command-fast-\d+-add-delivery-client-setup\.js$/.test(file),
  );
  assert.equal(
    files.length,
    1,
    'Build the single registered client-setup command first.',
  );
  const { AddDeliveryClientSetupFastInstanceCommand } = require(
    join(directory, files[0]),
  );
  const migration = new AddDeliveryClientSetupFastInstanceCommand();
  await connectionSource.initialize();
  const runner = connectionSource.createQueryRunner();
  try {
    await runner.connect();
    await runner.startTransaction();
    await runner.query("SET LOCAL lock_timeout='10s'");
    await runner.query("SET LOCAL statement_timeout='30s'");
    const baselineTables = await userTables(runner);
    for (const table of baselineTables)
      await runner.query(
        `LOCK TABLE ${quote(table.schema)}.${quote(table.name)} IN SHARE MODE`,
      );
    const present = async () =>
      (
        await runner.query('SELECT to_regclass($1) IS NOT NULL AS present', [
          `core."${TABLE}"`,
        ])
      )[0].present;
    const originalProjectIndexes = await projectIndexes(runner);
    assert(
      originalProjectIndexes.length <= 1,
      'Refuse ambiguous composite project indexes.',
    );
    const installed = await present();
    assert.equal(
      installed,
      originalProjectIndexes.length === 1,
      'Refuse a partial client-setup table/project-index installation.',
    );
    const originalIndexName = originalProjectIndexes[0]?.name ?? '';
    const originalData = await dataFingerprint(runner);
    const protectedData = await dataFingerprint(runner, true);
    const originalSchema = await schemaFingerprint(runner);
    const protectedSchema = await schemaFingerprint(
      runner,
      true,
      originalIndexName,
    );
    let sequence = 0;
    let assertions = 0;
    const rollback = async (operation) => {
      const point = `client_setup_migration_${++sequence}`;
      await runner.query(`SAVEPOINT ${point}`);
      try {
        return await operation();
      } finally {
        await runner.query(`ROLLBACK TO SAVEPOINT ${point}`);
        await runner.query(`RELEASE SAVEPOINT ${point}`);
      }
    };
    const rejects = (label, operation, code = '23514') =>
      rollback(async () => {
        await assert.rejects(
          operation,
          (error) =>
            error.code === code &&
            (code !== 'P0001' || error.message.includes(DOWNGRADE_MESSAGE)),
          label,
        );
        assertions++;
      });
    if (installed) {
      const [{ retained }] = await runner.query(
        `SELECT EXISTS(SELECT 1 FROM core."deliveryClientSetup") OR EXISTS(SELECT 1 FROM core."otogrowActivityEvent" WHERE left(action,13)='CLIENT_SETUP_') AS retained`,
      );
      if (retained) {
        await rejects(
          'Retained real client-setup history prevents downgrade',
          () => migration.down(runner),
          'P0001',
        );
        assert.deepEqual(await dataFingerprint(runner), originalData);
        assert.equal(await schemaFingerprint(runner), originalSchema);
        assert.fail(
          'Retained client-setup history correctly blocks the full cycle; never delete it to run this checker.',
        );
      }
      await migration.down(runner);
    }
    const oldSchema = await schemaFingerprint(runner);
    await migration.up(runner);
    assert.equal(await present(), true);
    const addedIndexes = await projectIndexes(runner);
    assert.equal(addedIndexes.length, 1);
    const projectIndexName = addedIndexes[0].name;
    assert.equal(projectIndexName, PROJECT_INDEX);
    if (installed) assert.equal(projectIndexName, originalIndexName);
    assert.equal(addedIndexes[0].valid, true);
    assert.equal(addedIndexes[0].ready, true);
    const addedSchema = await schemaFingerprint(runner);
    const addedData = await dataFingerprint(runner);
    assert.deepEqual(
      await dataFingerprint(runner, true),
      protectedData,
      'Up preserves every preexisting table row.',
    );
    assert.equal(
      await schemaFingerprint(runner, true, projectIndexName),
      protectedSchema,
      'Only one new table and its exact composite project index may change schema.',
    );
    if (installed) assert.equal(addedSchema, originalSchema);
    const [{ retainedActivity }] = await runner.query(
      `SELECT EXISTS(SELECT 1 FROM core."otogrowActivityEvent" WHERE left(action,13)='CLIENT_SETUP_') AS "retainedActivity"`,
    );
    if (retainedActivity) {
      await rejects(
        'Retained real activity prevents downgrade even when the receipt table was absent',
        () => migration.down(runner),
        'P0001',
      );
      assert.deepEqual(await dataFingerprint(runner), addedData);
      assert.equal(await schemaFingerprint(runner), addedSchema);
      assert.fail(
        'Retained client-setup activity correctly blocks the full cycle; never delete it to run this checker.',
      );
    }
    const columns =
      await runner.query(`SELECT attribute.attname AS name,format_type(attribute.atttypid,attribute.atttypmod) AS type,attribute.attnotnull AS required,pg_get_expr(definition.adbin,definition.adrelid) AS "default"
      FROM pg_attribute attribute LEFT JOIN pg_attrdef definition ON definition.adrelid=attribute.attrelid AND definition.adnum=attribute.attnum
      WHERE attribute.attrelid='core."deliveryClientSetup"'::regclass AND attribute.attnum>0 AND NOT attribute.attisdropped ORDER BY attribute.attnum`);
    assert.deepEqual(
      columns.map(({ name, type, required }) => ({ name, type, required })),
      Object.entries(COLUMNS).map(([name, type]) => ({
        name,
        type,
        required: name !== 'taskId',
      })),
      'Exact receipt columns/types/nullability.',
    );
    for (const column of columns)
      assert.equal(
        column.default,
        column.name === 'id'
          ? 'uuid_generate_v4()'
          : column.name === 'createdAt'
            ? 'now()'
            : null,
        `${column.name} default`,
      );
    const indexes = await indexRows(runner, TABLE);
    assert.equal(indexes.length, 3);
    for (const [primary, unique, expected] of [
      [true, true, ['id']],
      [false, true, ['workspaceId', 'requestId']],
      [false, false, ['workspaceId', 'actorId', 'createdAt', 'id']],
    ])
      assert(
        indexes.some(
          (index) =>
            index.primary === primary &&
            index.unique === unique &&
            index.valid &&
            index.ready &&
            index.simple &&
            index.attributeCount === expected.length &&
            index.keyCount === expected.length &&
            index.predicate === null &&
            JSON.stringify(index.columns) === JSON.stringify(expected),
        ),
        `Exact ${expected.join(',')} index.`,
      );
    const foreignKeys =
      await runner.query(`SELECT target_namespace.nspname AS schema,target.relname AS target,constraint_row.confdeltype AS deletion,constraint_row.confupdtype AS "update",constraint_row.convalidated AS validated,constraint_row.condeferrable AS deferrable,
      ARRAY(SELECT attribute.attname::text FROM unnest(constraint_row.conkey) WITH ORDINALITY key(number,position) JOIN pg_attribute attribute ON attribute.attrelid=constraint_row.conrelid AND attribute.attnum=key.number ORDER BY key.position) AS columns,
      ARRAY(SELECT attribute.attname::text FROM unnest(constraint_row.confkey) WITH ORDINALITY key(number,position) JOIN pg_attribute attribute ON attribute.attrelid=constraint_row.confrelid AND attribute.attnum=key.number ORDER BY key.position) AS targets
      FROM pg_constraint constraint_row JOIN pg_class target ON target.oid=constraint_row.confrelid JOIN pg_namespace target_namespace ON target_namespace.oid=target.relnamespace
      WHERE constraint_row.conrelid='core."deliveryClientSetup"'::regclass AND constraint_row.contype='f'`);
    const expectedKeys = [
      {
        schema: 'core',
        target: 'workspace',
        deletion: 'c',
        update: 'a',
        validated: true,
        deferrable: false,
        columns: ['workspaceId'],
        targets: ['id'],
      },
      {
        schema: 'core',
        target: 'deliveryProject',
        deletion: 'r',
        update: 'a',
        validated: true,
        deferrable: false,
        columns: ['workspaceId', 'projectId'],
        targets: ['workspaceId', 'id'],
      },
      {
        schema: 'core',
        target: 'deliveryTask',
        deletion: 'r',
        update: 'a',
        validated: true,
        deferrable: false,
        columns: ['workspaceId', 'taskId'],
        targets: ['workspaceId', 'taskId'],
      },
    ];
    assert.deepEqual(
      foreignKeys.map((key) => JSON.stringify(key)).sort(),
      expectedKeys.map((key) => JSON.stringify(key)).sort(),
      'Exactly three current workspace/project/task foreign keys with explicit CASCADE/RESTRICT actions.',
    );
    assert.equal(
      (
        await runner.query(
          `SELECT count(*)::integer AS count FROM pg_constraint WHERE conrelid='core."deliveryClientSetup"'::regclass AND contype='c'`,
        )
      )[0].count,
      1,
    );
    const workspaceIds = [randomUUID(), randomUUID()];
    const projectIds = [randomUUID(), randomUUID()];
    const taskIds = [randomUUID(), randomUUID()];
    const requestId = randomUUID();
    const actorId = randomUUID();
    const receiptId = randomUUID();
    const insert = async (fields) => {
      const names = Object.keys(fields);
      return (
        await runner.query(
          `INSERT INTO core."deliveryClientSetup" (${names.map(quote).join(',')}) VALUES (${names.map((_, index) => `$${index + 1}`).join(',')}) RETURNING *`,
          Object.values(fields),
        )
      )[0];
    };
    const update = (fields) => {
      const names = Object.keys(fields);
      return runner.query(
        `UPDATE core."deliveryClientSetup" SET ${names.map((name, index) => `${quote(name)}=$${index + 3}`).join(',')} WHERE id=$1 AND "workspaceId"=$2 RETURNING *`,
        [receiptId, workspaceIds[0], ...Object.values(fields)],
      );
    };
    const fields = (index = 0) => ({
      id: index === 0 ? receiptId : randomUUID(),
      workspaceId: workspaceIds[index],
      requestId,
      requestHash: 'a'.repeat(64),
      actorId,
      userWorkspaceId: randomUUID(),
      companyId: randomUUID(),
      projectId: projectIds[index],
      engagementId: randomUUID(),
      taskId: taskIds[index],
      reusedProject: false,
      reusedEngagement: false,
      source: {
        companyName: 'Synthetic migration company',
        companySourceToken: 'b'.repeat(64),
        projectRevision: null,
        engagementRevision: null,
      },
    });
    const guarded = async (label) => {
      const beforeSchema = await schemaFingerprint(runner);
      const rows = async () => {
        const result = {};
        for (const table of [TABLE, 'otogrowActivityEvent'])
          result[table] = hash(
            await runner.query(
              `SELECT to_jsonb(record)::text AS value FROM core.${quote(table)} record WHERE "workspaceId"=ANY($1::uuid[]) ORDER BY value`,
              [workspaceIds],
            ),
          );
        return result;
      };
      const beforeRows = await rows();
      await rejects(label, () => migration.down(runner), 'P0001');
      assert.deepEqual(
        await rows(),
        beforeRows,
        `${label}: no source rows changed.`,
      );
      assert.equal(
        await schemaFingerprint(runner),
        beforeSchema,
        `${label}: no schema changed.`,
      );
    };
    await rollback(async () => {
      const [template] = await runner.query(
        'SELECT "workspaceCustomApplicationId" FROM core.workspace ORDER BY id LIMIT 1',
      );
      assert(template, 'An initialized local workspace is required.');
      assert.equal(
        (
          await runner.query(
            'SELECT count(*)::integer AS count FROM core.workspace WHERE id=ANY($1::uuid[])',
            [workspaceIds],
          )
        )[0].count,
        0,
      );
      for (const [index, workspaceId] of workspaceIds.entries()) {
        await runner.query(
          `INSERT INTO core.workspace (id,"displayName",subdomain,"activationStatus","workspaceCustomApplicationId") VALUES ($1,'Disposable client-setup migration fixture',$2,'PENDING_CREATION',$3)`,
          [
            workspaceId,
            `client-setup-migration-${workspaceId}`,
            template.workspaceCustomApplicationId,
          ],
        );
        await runner.query(
          'INSERT INTO core."deliveryProject" (id,"workspaceId",name,"memberIds") VALUES ($1,$2,\'Disposable setup project\',\'[]\'::jsonb)',
          [projectIds[index], workspaceId],
        );
        await runner.query(
          'INSERT INTO core."deliveryTask" ("workspaceId","taskId","projectId",details) VALUES ($1,$2,$3,\'{}\'::jsonb)',
          [workspaceId, taskIds[index], projectIds[index]],
        );
      }
      await rollback(async () => {
        const receipt = await insert(fields());
        assert.equal(receipt.requestHash.length, 64);
        assert.equal(receipt.reusedProject, false);
        assert.equal(receipt.reusedEngagement, false);
        await rejects(
          'Setup workspace must exist',
          () =>
            insert({
              ...fields(),
              id: randomUUID(),
              requestId: randomUUID(),
              workspaceId: randomUUID(),
              taskId: null,
            }),
          '23503',
        );
        await rejects(
          'Setup cannot reference another workspace project',
          () => update({ projectId: projectIds[1] }),
          '23503',
        );
        await rejects(
          'Setup cannot reference another workspace task',
          () => update({ taskId: taskIds[1] }),
          '23503',
        );
        await rejects(
          'Missing project identity is rejected',
          () => update({ projectId: randomUUID() }),
          '23503',
        );
        await rejects(
          'Missing task identity is rejected',
          () => update({ taskId: randomUUID() }),
          '23503',
        );
        await rejects(
          'Request identity is unique inside its workspace',
          () => insert({ ...fields(), id: randomUUID() }),
          '23505',
        );
        const foreign = await insert(fields(1));
        assert.equal(
          foreign.requestId,
          requestId,
          'Request identity remains workspace scoped.',
        );
        for (const requestHash of ['', 'a'.repeat(63), 'a'.repeat(65)])
          await rejects(
            'Receipt request hash must be exactly64 characters',
            () => update({ requestHash }),
          );
        for (const column of columns.filter((column) => column.required))
          await rejects(
            `${column.name} rejects NULL`,
            () => update({ [column.name]: null }),
            '23502',
          );
        await rejects(
          'Retained receipt restricts deleting its project',
          () =>
            runner.query(
              'DELETE FROM core."deliveryProject" WHERE id=$1 AND "workspaceId"=$2',
              [projectIds[0], workspaceIds[0]],
            ),
          '23503',
        );
        await rejects(
          'Retained receipt restricts deleting its optional source task',
          () =>
            runner.query(
              'DELETE FROM core."deliveryTask" WHERE "taskId"=$1 AND "workspaceId"=$2',
              [taskIds[0], workspaceIds[0]],
            ),
          '23503',
        );
      });
      await rollback(async () => {
        const receipt = await insert({
          ...fields(),
          taskId: null,
          reusedProject: true,
          reusedEngagement: true,
        });
        assert.equal(receipt.taskId, null);
        assert.equal(receipt.reusedProject, true);
        assert.equal(receipt.reusedEngagement, true);
        await guarded(
          'A retained reused-project/plan receipt without a task independently prevents downgrade',
        );
      });
      for (const action of [
        'CLIENT_SETUP_CREATED',
        'CLIENT_SETUP_HISTORICAL_ACTION',
      ])
        await rollback(async () => {
          await runner.query(
            `INSERT INTO core."otogrowActivityEvent" ("workspaceId","occurredAt","actorName","actorType",category,action,outcome,summary,"sourceType","sourceId") VALUES ($1,now(),'Synthetic manager','HUMAN','CLIENT',$3,'RECORDED','Disposable retained setup activity','client-engagement',$2)`,
            [workspaceIds[0], randomUUID(), action],
          );
          await guarded(
            `${action} activity alone prevents downgrade without any receipt`,
          );
        });
    });
    assert.deepEqual(
      await dataFingerprint(runner),
      addedData,
      'Owned savepoints restore every synthetic fixture row.',
    );
    assert.equal(await schemaFingerprint(runner), addedSchema);
    await migration.down(runner);
    assert.equal(await present(), false);
    assert.deepEqual(await projectIndexes(runner), []);
    assert.deepEqual(await dataFingerprint(runner, true), protectedData);
    assert.equal(
      await schemaFingerprint(runner),
      oldSchema,
      'Empty downgrade preserves all original schema objects and drops only the additive index/table.',
    );
    await migration.up(runner);
    assert.equal(
      await schemaFingerprint(runner),
      addedSchema,
      'Re-up restores the complete intended schema exactly.',
    );
    assert.deepEqual(await dataFingerprint(runner), addedData);
    assert.equal(
      await schemaFingerprint(runner, true, projectIndexName),
      protectedSchema,
    );
    if (!installed) await migration.down(runner);
    assert.equal(await schemaFingerprint(runner), originalSchema);
    assert.deepEqual(await dataFingerprint(runner), originalData);
    console.log(
      `Client-setup migration rollback proof passed: ${baselineTables.length} protected tables, exact new table/composite project index and up/down/re-up, three scoped foreign keys, unique request/hash-length/required fields, and independent retained receipt/activity guards (${assertions} rejection cases). No changes committed.`,
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
