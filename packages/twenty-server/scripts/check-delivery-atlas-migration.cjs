const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const { readdirSync } = require('node:fs');
const { join } = require('node:path');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');

const TABLES = [
  'deliveryAtlasCredential',
  'deliveryAtlasConnection',
  'deliveryAtlasJob',
];
const [CREDENTIAL, CONNECTION, JOB] = TABLES;
const HISTORY_TABLES = ['otogrowAiSpend', 'otogrowActivityEvent'];
const STATUSES = [
  'QUOTED',
  'QUEUED',
  'SUBMITTING',
  'POLLING',
  'DOWNLOADING',
  'SUCCEEDED',
  'FAILED',
  'UNCERTAIN',
  'CANCELLED',
];
const COLUMNS = {
  [CREDENTIAL]: {
    workspaceId: 'uuid',
    id: 'uuid',
    apiKey: 'text',
    createdBy: 'uuid',
    createdAt: 'timestamp with time zone',
    revokedAt: 'timestamp with time zone',
  },
  [CONNECTION]: {
    workspaceId: 'uuid',
    id: 'uuid',
    revision: 'integer',
    enabled: 'boolean',
    credentialId: 'uuid',
    enabledProfileIds: 'text[]',
    defaultImageFamilyId: 'text',
    defaultClipProfileId: 'text',
    reservationLimits: 'jsonb',
    verifiedAt: 'timestamp with time zone',
    updatedAt: 'timestamp with time zone',
  },
  [JOB]: {
    workspaceId: 'uuid',
    id: 'uuid',
    requestId: 'uuid',
    taskId: 'uuid',
    projectId: 'uuid',
    actorId: 'uuid',
    userWorkspaceId: 'uuid',
    credentialId: 'uuid',
    configurationRevision: 'integer',
    revision: 'integer',
    requestHash: 'text',
    quoteToken: 'text',
    status: 'text',
    request: 'jsonb',
    referenceUrls: 'text[]',
    reservationLimit: 'jsonb',
    quotedCostUsd: 'text',
    quoteEstimated: 'boolean',
    quotedAt: 'timestamp with time zone',
    providerPredictionId: 'text',
    providerStatus: 'text',
    outputUrl: 'text',
    publicationCancelled: 'boolean',
    assetId: 'uuid',
    costState: 'text',
    error: 'text',
    leaseToken: 'uuid',
    leaseUntil: 'timestamp with time zone',
    nextAttemptAt: 'timestamp with time zone',
    attempts: 'integer',
    submittedAt: 'timestamp with time zone',
    createdAt: 'timestamp with time zone',
    updatedAt: 'timestamp with time zone',
  },
};
const NULLABLE = {
  [CREDENTIAL]: ['revokedAt'],
  [CONNECTION]: [
    'credentialId',
    'defaultImageFamilyId',
    'defaultClipProfileId',
    'verifiedAt',
  ],
  [JOB]: [
    'providerPredictionId',
    'providerStatus',
    'outputUrl',
    'assetId',
    'error',
    'leaseToken',
    'leaseUntil',
    'nextAttemptAt',
    'submittedAt',
  ],
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

async function dataFingerprint(runner, excludeAtlas = false) {
  const result = {};
  for (const table of await userTables(runner)) {
    if (excludeAtlas && table.schema === 'core' && TABLES.includes(table.name))
      continue;
    result[`${table.schema}.${table.name}`] = hash(
      await runner.query(
        `SELECT to_jsonb(record)::text AS value FROM ${quote(table.schema)}.${quote(table.name)} record ORDER BY value`,
      ),
    );
  }
  return result;
}

async function schemaFingerprint(runner, excludeAtlas = false) {
  const relations = await runner.query(
    `SELECT namespace.nspname,relation.relname,relation.relkind::text,
    relation.relrowsecurity,relation.relforcerowsecurity,relation.reloptions,relation.relacl,
    pg_get_userbyid(relation.relowner) AS owner,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('name',attribute.attname,'type',format_type(attribute.atttypid,attribute.atttypmod),'required',attribute.attnotnull,'identity',attribute.attidentity,'generated',attribute.attgenerated,'collation',collation_row.collname,'default',pg_get_expr(definition.adbin,definition.adrelid)) ORDER BY attribute.attnum) FROM pg_attribute attribute LEFT JOIN pg_attrdef definition ON definition.adrelid=attribute.attrelid AND definition.adnum=attribute.attnum LEFT JOIN pg_collation collation_row ON collation_row.oid=attribute.attcollation WHERE attribute.attrelid=relation.oid AND attribute.attnum>0 AND NOT attribute.attisdropped),'[]'::jsonb)::text AS columns,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('name',constraint_row.conname,'definition',pg_get_constraintdef(constraint_row.oid),'validated',constraint_row.convalidated) ORDER BY constraint_row.conname) FROM pg_constraint constraint_row WHERE constraint_row.conrelid=relation.oid),'[]'::jsonb)::text AS constraints,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('name',indexname,'definition',indexdef) ORDER BY indexname) FROM pg_indexes WHERE schemaname=namespace.nspname AND tablename=relation.relname),'[]'::jsonb)::text AS indexes,
    COALESCE((SELECT jsonb_agg(pg_get_triggerdef(trigger_row.oid,true) ORDER BY trigger_row.tgname) FROM pg_trigger trigger_row WHERE trigger_row.tgrelid=relation.oid AND NOT trigger_row.tgisinternal),'[]'::jsonb)::text AS triggers,
    CASE WHEN relation.relkind IN ('v','m') THEN pg_get_viewdef(relation.oid,true) ELSE NULL END AS view
    FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
    WHERE namespace.nspname NOT IN ('pg_catalog','information_schema')
    AND namespace.nspname NOT LIKE 'pg_toast%' AND namespace.nspname NOT LIKE 'pg_temp_%'
    AND relation.relkind IN ('r','p','v','m','S')
    AND NOT($1 AND namespace.nspname='core' AND relation.relname=ANY($2::text[]))
    ORDER BY namespace.nspname,relation.relname`,
    [excludeAtlas, TABLES],
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

async function main() {
  assert.equal(
    process.argv.length,
    2,
    'This checker accepts no apply/commit mode and always rolls back.',
  );
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
    'Use only the local database.',
  );
  const directory = join(
    __dirname,
    '../dist/database/commands/upgrade-version-command/2-34',
  );
  const files = readdirSync(directory).filter((file) =>
    /^2-34-instance-command-fast-\d+-add-delivery-atlas-media\.js$/.test(file),
  );
  assert.equal(
    files.length,
    1,
    'Build the single registered Atlas migration first.',
  );
  const { AddDeliveryAtlasMediaFastInstanceCommand } = require(
    join(directory, files[0]),
  );
  const migration = new AddDeliveryAtlasMediaFastInstanceCommand();
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
    const installedParts = async () =>
      (
        await runner.query(
          "SELECT to_regclass(format('core.%I',name)) IS NOT NULL AS present FROM unnest($1::text[]) name",
          [TABLES],
        )
      ).map((row) => row.present);
    const parts = await installedParts();
    assert(
      parts.every(Boolean) || parts.every((value) => !value),
      'Refuse a partial Atlas schema installation.',
    );
    const installed = parts.every(Boolean);
    const originalData = await dataFingerprint(runner);
    const protectedData = await dataFingerprint(runner, true);
    const originalSchema = await schemaFingerprint(runner);
    const protectedSchema = await schemaFingerprint(runner, true);
    let sequence = 0;
    let assertions = 0;
    const rollback = async (operation) => {
      const point = `atlas_migration_${++sequence}`;
      await runner.query(`SAVEPOINT ${point}`);
      try {
        return await operation();
      } finally {
        await runner.query(`ROLLBACK TO SAVEPOINT ${point}`);
        await runner.query(`RELEASE SAVEPOINT ${point}`);
      }
    };
    const rejects = async (label, operation, code = '23514', message) =>
      rollback(async () => {
        await assert.rejects(
          operation,
          (error) =>
            error.code === code && (!message || message.test(error.message)),
          label,
        );
        assertions++;
      });
    if (installed) {
      const [{ retained }] = await runner.query(`SELECT
        EXISTS(SELECT 1 FROM core."deliveryAtlasCredential") OR EXISTS(SELECT 1 FROM core."deliveryAtlasConnection") OR EXISTS(SELECT 1 FROM core."deliveryAtlasJob")
        OR EXISTS(SELECT 1 FROM core."otogrowAiSpend" WHERE price->>'billingType'='ATLAS_MEDIA')
        OR EXISTS(SELECT 1 FROM core."otogrowActivityEvent" WHERE left(action,6)='ATLAS_') AS retained`);
      if (retained) {
        await rejects(
          'Retained real Atlas history prevents downgrade',
          () => migration.down(runner),
          'P0001',
          /retain the additive schema/,
        );
        assert.deepEqual(await dataFingerprint(runner), originalData);
        assert.equal(await schemaFingerprint(runner), originalSchema);
        assert.fail(
          'Retained Atlas history correctly blocks the full cycle; never delete it to run this checker.',
        );
      }
      await migration.down(runner);
    }
    const oldSchema = await schemaFingerprint(runner);
    await migration.up(runner);
    assert((await installedParts()).every(Boolean));
    assert.deepEqual(
      await dataFingerprint(runner, true),
      protectedData,
      'Up preserves every preexisting table row.',
    );
    assert.equal(
      await schemaFingerprint(runner, true),
      protectedSchema,
      'Only the three Atlas tables may change schema.',
    );
    const addedSchema = await schemaFingerprint(runner);
    const addedData = await dataFingerprint(runner);
    if (installed) assert.equal(addedSchema, originalSchema);
    const columns = await runner.query(
      `SELECT relation.relname AS "table",attribute.attname AS name,format_type(attribute.atttypid,attribute.atttypmod) AS type,attribute.attnotnull AS required,pg_get_expr(definition.adbin,definition.adrelid) AS "default"
      FROM pg_attribute attribute JOIN pg_class relation ON relation.oid=attribute.attrelid JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
      LEFT JOIN pg_attrdef definition ON definition.adrelid=attribute.attrelid AND definition.adnum=attribute.attnum
      WHERE namespace.nspname='core' AND relation.relname=ANY($1::text[]) AND attribute.attnum>0 AND NOT attribute.attisdropped ORDER BY relation.relname,attribute.attnum`,
      [TABLES],
    );
    for (const table of TABLES) {
      const actual = columns.filter((column) => column.table === table);
      assert.deepEqual(
        actual.map(({ name, type, required }) => ({ name, type, required })),
        Object.entries(COLUMNS[table]).map(([name, type]) => ({
          name,
          type,
          required: !NULLABLE[table].includes(name),
        })),
        `${table} has exactly the intended columns/types/nullability.`,
      );
    }
    const defaults = {
      [`${CREDENTIAL}.id`]: 'uuid_generate_v4()',
      [`${CREDENTIAL}.createdAt`]: 'now()',
      [`${CONNECTION}.id`]: 'uuid_generate_v4()',
      [`${CONNECTION}.enabled`]: 'false',
      [`${CONNECTION}.enabledProfileIds`]: "'{}'::text[]",
      [`${CONNECTION}.reservationLimits`]: "'[]'::jsonb",
      [`${CONNECTION}.updatedAt`]: 'now()',
      [`${JOB}.id`]: 'uuid_generate_v4()',
      [`${JOB}.revision`]: '1',
      [`${JOB}.referenceUrls`]: "'{}'::text[]",
      [`${JOB}.publicationCancelled`]: 'false',
      [`${JOB}.costState`]: "'UNRESERVED'::text",
      [`${JOB}.attempts`]: '0',
      [`${JOB}.createdAt`]: 'now()',
      [`${JOB}.updatedAt`]: 'now()',
    };
    for (const column of columns)
      assert.equal(
        column.default,
        defaults[`${column.table}.${column.name}`] ?? null,
        `${column.table}.${column.name} default`,
      );
    const indexes = await runner.query(
      `SELECT relation.relname AS "table",index_row.indisprimary AS "primary",index_row.indisunique AS "unique",
      ARRAY(SELECT attribute.attname::text FROM unnest(index_row.indkey) WITH ORDINALITY key(number,position) JOIN pg_attribute attribute ON attribute.attrelid=relation.oid AND attribute.attnum=key.number ORDER BY key.position) AS columns
      FROM pg_index index_row JOIN pg_class relation ON relation.oid=index_row.indrelid JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
      WHERE namespace.nspname='core' AND relation.relname=ANY($1::text[]) ORDER BY relation.relname,index_row.indexrelid::regclass::text`,
      [TABLES],
    );
    assert.equal(indexes.length, 8);
    for (const table of TABLES)
      assert(
        indexes.some(
          (index) =>
            index.table === table &&
            index.primary &&
            index.unique &&
            JSON.stringify(index.columns) === '["id"]',
        ),
      );
    for (const [table, unique, fields] of [
      [CREDENTIAL, true, ['workspaceId', 'id']],
      [CONNECTION, true, ['workspaceId']],
      [JOB, true, ['workspaceId', 'requestId']],
      [JOB, false, ['status', 'nextAttemptAt']],
      [JOB, false, ['workspaceId', 'taskId', 'createdAt', 'id']],
    ])
      assert(
        indexes.some(
          (index) =>
            index.table === table &&
            !index.primary &&
            index.unique === unique &&
            JSON.stringify(index.columns) === JSON.stringify(fields),
        ),
        `${table}: ${fields.join(',')} index`,
      );
    const foreignKeys = await runner.query(
      `SELECT relation.relname AS "table",constraint_row.conname AS name,referenced.relname AS referenced,constraint_row.confdeltype AS deletion,constraint_row.confupdtype AS "update",
      ARRAY(SELECT attribute.attname::text FROM unnest(constraint_row.conkey) WITH ORDINALITY key(number,position) JOIN pg_attribute attribute ON attribute.attrelid=relation.oid AND attribute.attnum=key.number ORDER BY key.position) AS columns,
      ARRAY(SELECT attribute.attname::text FROM unnest(constraint_row.confkey) WITH ORDINALITY key(number,position) JOIN pg_attribute attribute ON attribute.attrelid=referenced.oid AND attribute.attnum=key.number ORDER BY key.position) AS targets
      FROM pg_constraint constraint_row JOIN pg_class relation ON relation.oid=constraint_row.conrelid JOIN pg_class referenced ON referenced.oid=constraint_row.confrelid JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
      WHERE namespace.nspname='core' AND relation.relname=ANY($1::text[]) AND constraint_row.contype='f'`,
      [TABLES],
    );
    const expectedForeignKeys = TABLES.map((table) => ({
      table,
      referenced: 'workspace',
      deletion: 'c',
      update: 'a',
      columns: ['workspaceId'],
      targets: ['id'],
    }));
    for (const table of [CONNECTION, JOB])
      expectedForeignKeys.push({
        table,
        referenced: CREDENTIAL,
        deletion: 'r',
        update: 'a',
        columns: ['workspaceId', 'credentialId'],
        targets: ['workspaceId', 'id'],
      });
    expectedForeignKeys.push({
      table: JOB,
      referenced: 'deliveryTask',
      deletion: 'r',
      update: 'a',
      columns: ['workspaceId', 'taskId'],
      targets: ['workspaceId', 'taskId'],
    });
    assert.deepEqual(
      foreignKeys.map(({ name: _name, ...key }) => JSON.stringify(key)).sort(),
      expectedForeignKeys.map((key) => JSON.stringify(key)).sort(),
      'Exactly six workspace-scoped foreign keys with the intended CASCADE/RESTRICT actions.',
    );
    const [{ count: checkCount }] = await runner.query(
      `SELECT count(*)::integer AS count FROM pg_constraint WHERE conrelid IN (SELECT oid FROM pg_class WHERE relnamespace='core'::regnamespace AND relname=ANY($1::text[])) AND contype='c'`,
      [TABLES],
    );
    assert.equal(checkCount, 5);
    const workspaceIds = [randomUUID(), randomUUID()];
    const actorId = randomUUID();
    const taskIds = [randomUUID(), randomUUID()];
    const credentialIds = [randomUUID(), randomUUID()];
    const requestId = randomUUID();
    const connectionId = randomUUID();
    const jobId = randomUUID();
    const insert = async (table, fields) => {
      assert([...TABLES, ...HISTORY_TABLES].includes(table));
      const names = Object.keys(fields);
      return (
        await runner.query(
          `INSERT INTO core.${quote(table)} (${names.map(quote).join(',')}) VALUES (${names.map((_, index) => `$${index + 1}`).join(',')}) RETURNING *`,
          Object.values(fields),
        )
      )[0];
    };
    const update = async (table, id, fields) => {
      assert(TABLES.includes(table));
      const names = Object.keys(fields);
      return (
        await runner.query(
          `UPDATE core.${quote(table)} SET ${names.map((name, index) => `${quote(name)}=$${index + 2}`).join(',')} WHERE id=$1 AND "workspaceId"=ANY($${names.length + 2}::uuid[]) RETURNING *`,
          [id, ...Object.values(fields), workspaceIds],
        )
      )[0];
    };
    const credentialFields = (index = 0) => ({
      id: credentialIds[index],
      workspaceId: workspaceIds[index],
      apiKey: 'enc:v2:synthetic-not-a-provider-key',
      createdBy: actorId,
    });
    const connectionFields = {
      id: connectionId,
      workspaceId: workspaceIds[0],
      revision: 1,
      credentialId: credentialIds[0],
    };
    const jobFields = (index = 0) => ({
      id: index === 0 ? jobId : randomUUID(),
      workspaceId: workspaceIds[index],
      requestId,
      taskId: taskIds[index],
      projectId: randomUUID(),
      actorId,
      userWorkspaceId: randomUUID(),
      credentialId: credentialIds[index],
      configurationRevision: 1,
      requestHash: 'a'.repeat(64),
      quoteToken: 'b'.repeat(64),
      status: 'QUOTED',
      request: { fixture: true },
      reservationLimit: {
        maximumCostUsd: '0.250000',
        source: 'Synthetic migration fixture',
      },
      quotedCostUsd: '0.100001',
      quoteEstimated: false,
      quotedAt: new Date('2026-10-29T00:00:00.000Z'),
    });
    const guard = async (label) => {
      const beforeSchema = await schemaFingerprint(runner);
      const rows = async () => {
        const result = {};
        for (const table of [...TABLES, ...HISTORY_TABLES])
          result[table] = hash(
            await runner.query(
              `SELECT to_jsonb(record)::text AS value FROM core.${quote(table)} record WHERE "workspaceId"=ANY($1::uuid[]) ORDER BY value`,
              [workspaceIds],
            ),
          );
        return result;
      };
      const beforeRows = await rows();
      await rejects(
        label,
        () => migration.down(runner),
        'P0001',
        /Atlas connection, generation or financial history exists; retain the additive schema/,
      );
      assert.deepEqual(
        await rows(),
        beforeRows,
        `${label}: rejected downgrade preserves source rows.`,
      );
      assert.equal(
        await schemaFingerprint(runner),
        beforeSchema,
        `${label}: rejected downgrade preserves schema.`,
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
          `INSERT INTO core.workspace (id,"displayName",subdomain,"activationStatus","workspaceCustomApplicationId") VALUES ($1,'Disposable Atlas migration fixture',$2,'PENDING_CREATION',$3)`,
          [
            workspaceId,
            `atlas-migration-${workspaceId}`,
            template.workspaceCustomApplicationId,
          ],
        );
        await runner.query(
          'INSERT INTO core."deliveryTask" ("workspaceId","taskId","projectId",details) VALUES ($1,$2,$3,\'{}\'::jsonb)',
          [workspaceId, taskIds[index], randomUUID()],
        );
      }
      await rollback(async () => {
        for (const index of [0, 1])
          await insert(CREDENTIAL, credentialFields(index));
        const connection = await insert(CONNECTION, connectionFields);
        const job = await insert(JOB, jobFields());
        assert.equal(connection.enabled, false);
        assert.deepEqual(connection.enabledProfileIds, []);
        assert.deepEqual(connection.reservationLimits, []);
        assert.equal(job.revision, 1);
        assert.equal(job.attempts, 0);
        assert.equal(job.costState, 'UNRESERVED');
        assert.equal(job.publicationCancelled, false);
        assert.deepEqual(job.referenceUrls, []);
        assert.equal(job.quotedCostUsd, '0.100001');
        await rejects(
          'Credential workspace must exist',
          () =>
            insert(CREDENTIAL, {
              ...credentialFields(),
              id: randomUUID(),
              workspaceId: randomUUID(),
            }),
          '23503',
        );
        await rejects(
          'Connection workspace must exist',
          () =>
            insert(CONNECTION, {
              workspaceId: randomUUID(),
              revision: 1,
              credentialId: null,
            }),
          '23503',
        );
        await rejects(
          'Connection cannot use another workspace credential',
          () =>
            update(CONNECTION, connectionId, {
              credentialId: credentialIds[1],
            }),
          '23503',
        );
        await rejects(
          'Job workspace must exist',
          () =>
            insert(JOB, {
              ...jobFields(),
              id: randomUUID(),
              requestId: randomUUID(),
              workspaceId: randomUUID(),
            }),
          '23503',
        );
        await rejects(
          'Job cannot use another workspace credential',
          () => update(JOB, jobId, { credentialId: credentialIds[1] }),
          '23503',
        );
        await rejects(
          'Job cannot use another workspace task',
          () => update(JOB, jobId, { taskId: taskIds[1] }),
          '23503',
        );
        await rejects(
          'Only one connection exists per workspace',
          () => insert(CONNECTION, { ...connectionFields, id: randomUUID() }),
          '23505',
        );
        await rejects(
          'Only one job exists per workspace request',
          () => insert(JOB, { ...jobFields(), id: randomUUID() }),
          '23505',
        );
        const foreignJob = await insert(JOB, jobFields(1));
        assert.equal(
          foreignJob.requestId,
          requestId,
          'Request identity is workspace scoped.',
        );
        for (const apiKey of ['', 'plaintext-synthetic', 'enc:v1:synthetic'])
          await rejects('Credential rejects unencrypted storage', () =>
            update(CREDENTIAL, credentialIds[0], { apiKey }),
          );
        for (const revision of [0, -1])
          await rejects('Connection revision must be positive', () =>
            update(CONNECTION, connectionId, { revision }),
          );
        for (const fields of [
          { revision: 0 },
          { revision: -1 },
          { attempts: -1 },
          { configurationRevision: 0 },
          { configurationRevision: -1 },
          { status: 'UNKNOWN' },
          { status: 'quoted' },
          { requestHash: '' },
          { requestHash: 'a'.repeat(63) },
          { requestHash: 'a'.repeat(65) },
          { quoteToken: '' },
          { quoteToken: 'b'.repeat(63) },
          { quoteToken: 'b'.repeat(65) },
        ])
          await rejects(`Job rejects ${JSON.stringify(fields)}`, () =>
            update(JOB, jobId, fields),
          );
        for (const status of STATUSES)
          await rollback(async () =>
            assert.equal(
              (await update(JOB, jobId, { status }))[0].status,
              status,
            ),
          );
        for (const [table, id] of [
          [CREDENTIAL, credentialIds[0]],
          [CONNECTION, connectionId],
          [JOB, jobId],
        ])
          for (const column of columns.filter(
            (column) => column.table === table && column.required,
          ))
            await rejects(
              `${table}.${column.name} rejects NULL`,
              () => update(table, id, { [column.name]: null }),
              '23502',
            );
        await rollback(async () => {
          await runner.query(
            'DELETE FROM core."deliveryAtlasJob" WHERE id=$1 AND "workspaceId"=$2',
            [jobId, workspaceIds[0]],
          );
          await rejects(
            'Connection independently restricts deleting its retained credential',
            () =>
              runner.query(
                'DELETE FROM core."deliveryAtlasCredential" WHERE id=$1 AND "workspaceId"=$2',
                [credentialIds[0], workspaceIds[0]],
              ),
            '23503',
          );
        });
        await rollback(async () => {
          await runner.query(
            'DELETE FROM core."deliveryAtlasConnection" WHERE id=$1 AND "workspaceId"=$2',
            [connectionId, workspaceIds[0]],
          );
          await rejects(
            'Job independently restricts deleting its credential',
            () =>
              runner.query(
                'DELETE FROM core."deliveryAtlasCredential" WHERE id=$1 AND "workspaceId"=$2',
                [credentialIds[0], workspaceIds[0]],
              ),
            '23503',
          );
        });
        await rejects(
          'Job restricts deleting its source task',
          () =>
            runner.query(
              'DELETE FROM core."deliveryTask" WHERE "workspaceId"=$1 AND "taskId"=$2',
              [workspaceIds[0], taskIds[0]],
            ),
          '23503',
        );
      });
      await rollback(async () => {
        await insert(CONNECTION, {
          ...connectionFields,
          credentialId: null,
          enabled: false,
        });
        await guard(
          'Even a disabled credential-free connection prevents downgrade',
        );
      });
      await rollback(async () => {
        await insert(CREDENTIAL, {
          ...credentialFields(),
          revokedAt: new Date(),
        });
        await guard('A revoked credential independently prevents downgrade');
      });
      await rollback(async () => {
        await insert(CREDENTIAL, credentialFields());
        await insert(JOB, {
          ...jobFields(),
          status: 'CANCELLED',
          costState: 'RELEASED',
          publicationCancelled: true,
        });
        // Isolate the job guard from its required credential; the savepoint restores the FK and row together.
        const credentialForeignKey = foreignKeys.find(
          (key) => key.table === JOB && key.referenced === CREDENTIAL,
        );
        await runner.query(
          `ALTER TABLE core."deliveryAtlasJob" DROP CONSTRAINT ${quote(credentialForeignKey.name)}`,
        );
        await runner.query(
          'DELETE FROM core."deliveryAtlasCredential" WHERE id=$1 AND "workspaceId"=$2',
          [credentialIds[0], workspaceIds[0]],
        );
        await guard('A cancelled released job alone prevents downgrade');
      });
      for (const state of [
        'RESERVED',
        'DISPATCHED',
        'UNCERTAIN',
        'SETTLED',
        'RELEASED',
      ])
        await rollback(async () => {
          await insert('otogrowAiSpend', {
            workspaceId: workspaceIds[0],
            sourceKind: 'MEDIA',
            sourceRunId: randomUUID(),
            actorId,
            state,
            reservedMicroUsd: '250000',
            actualMicroUsd:
              state === 'SETTLED'
                ? '100001'
                : state === 'RELEASED'
                  ? '0'
                  : null,
            price: {
              billingType: 'ATLAS_MEDIA',
              kind: 'IMAGE',
              modelId: 'atlascloud/synthetic',
              maximumCostUsd: '0.250000',
              quotedCostUsd: '0.100001',
            },
          });
          await guard(
            `Retained ${state} Atlas financial history alone prevents downgrade`,
          );
        });
      for (const action of [
        'ATLAS_SETTINGS_UPDATED',
        'ATLAS_CONNECTION_REMOVED',
        'ATLAS_HISTORICAL_UNKNOWN_ACTION',
      ])
        await rollback(async () => {
          await insert('otogrowActivityEvent', {
            workspaceId: workspaceIds[0],
            occurredAt: new Date(),
            actorName: 'Synthetic administrator',
            actorType: 'SYSTEM',
            category: 'DELIVERY',
            action,
            outcome: 'RECORDED',
            summary: 'Disposable Atlas history',
            sourceType: 'task',
            sourceId: taskIds[0],
          });
          await guard(`${action} activity alone prevents downgrade`);
        });
    });
    assert.deepEqual(
      await dataFingerprint(runner),
      addedData,
      'Every fixture row and mutation is restored by its owned savepoint.',
    );
    assert.equal(
      await schemaFingerprint(runner),
      addedSchema,
      'All temporary guard-probe schema changes are restored.',
    );
    await migration.down(runner);
    assert(!(await installedParts()).some(Boolean));
    assert.equal(
      await schemaFingerprint(runner),
      oldSchema,
      'Empty downgrade restores the complete old schema.',
    );
    assert.deepEqual(await dataFingerprint(runner, true), protectedData);
    await migration.up(runner);
    assert.equal(
      await schemaFingerprint(runner),
      addedSchema,
      'Re-up restores the exact complete Atlas schema.',
    );
    assert.deepEqual(await dataFingerprint(runner), addedData);
    assert.equal(await schemaFingerprint(runner, true), protectedSchema);
    if (!installed) await migration.down(runner);
    assert.equal(await schemaFingerprint(runner), originalSchema);
    assert.deepEqual(await dataFingerprint(runner), originalData);
    console.log(
      `Atlas migration rollback proof passed: ${baselineTables.length} protected tables, exact up/down/re-up, six scoped foreign keys, encrypted-storage/unique/default/status/revision/hash/NULL checks, and independent connection/credential/job/financial/activity downgrade guards (${assertions} rejection cases). No changes committed.`,
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
