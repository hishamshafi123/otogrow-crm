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
  /^2-34-instance-command-fast-\d+-add-delivery-creative-review\.js$/.test(
    file,
  ),
);
assert.equal(
  files.length,
  1,
  'Build the single generated creative-review command first.',
);
const { AddDeliveryCreativeReviewFastInstanceCommand } = require(
  join(DIRECTORY, files[0]),
);
const TABLES = ['deliveryCreativeFeedback', 'deliveryCreativeFeedbackEvent'];
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
      'Investigate a partial creative review schema installation.',
    );
    const installed = parts.every(Boolean);
    if (installed)
      for (const table of TABLES)
        await runner.query(`LOCK TABLE core."${table}" IN SHARE MODE`);
    const originalData = await data();
    const originalSchema = await schema(false);
    const unrelatedSchema = await schema();
    const migration = new AddDeliveryCreativeReviewFastInstanceCommand();
    let sequence = 0;
    const rejects = async (label, operation, code = '23514') => {
      const savepoint = `founder_escalation_migration_${++sequence}`;
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
        'SELECT (SELECT count(*) FROM core."deliveryCreativeFeedback")+(SELECT count(*) FROM core."deliveryCreativeFeedbackEvent") AS count',
      );
      if (BigInt(count) > 0n) {
        await rejects(
          'Existing review data/history prevents downgrade',
          () => migration.down(runner),
          'P0001',
        );
        assert.fail(
          'Existing creative review history correctly blocks downgrade; never remove it to run this full-cycle checker.',
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
      'Only the two new review tables may change schema.',
    );
    if (installed) assert.equal(await schema(false), originalSchema);
    const foreignKeys = await runner.query(
      "SELECT relation.relname AS \"table\",pg_get_constraintdef(constraint_row.oid) AS definition FROM pg_constraint constraint_row JOIN pg_class relation ON relation.oid=constraint_row.conrelid JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace WHERE namespace.nspname='core' AND relation.relname=ANY($1::text[]) AND constraint_row.contype='f' ORDER BY relation.relname,constraint_row.conname",
      [TABLES],
    );
    assert.equal(foreignKeys.length, 4);
    for (const table of TABLES)
      assert(
        foreignKeys.some(
          (row) =>
            row.table === table &&
            /FOREIGN KEY \("workspaceId"\).*workspace.*ON DELETE CASCADE/.test(
              row.definition,
            ),
        ),
      );
    assert(
      foreignKeys.some(
        (row) =>
          row.table === TABLES[0] &&
          /FOREIGN KEY \("workspaceId", "taskId"\).*deliveryTask.*ON DELETE RESTRICT/.test(
            row.definition,
          ),
      ),
    );
    assert(
      foreignKeys.some(
        (row) =>
          row.table === TABLES[1] &&
          /FOREIGN KEY \("workspaceId", "taskId", "feedbackId"\).*deliveryCreativeFeedback.*ON DELETE RESTRICT/.test(
            row.definition,
          ),
      ),
    );
    const [template] = await runner.query(
      'SELECT "workspaceCustomApplicationId" FROM core.workspace ORDER BY id LIMIT 1',
    );
    assert(template);
    for (const workspaceId of workspaceIds)
      await runner.query(
        'INSERT INTO core.workspace (id,"displayName",subdomain,"activationStatus","workspaceCustomApplicationId") VALUES ($1,\'Disposable review migration fixture\',$2,\'PENDING_CREATION\',$3)',
        [
          workspaceId,
          `review-migration-${workspaceId}`,
          template.workspaceCustomApplicationId,
        ],
      );
    const taskId = randomUUID(),
      foreignTaskId = randomUUID(),
      otherTaskId = randomUUID();
    for (const [workspaceId, nativeId] of [
      [workspaceIds[0], taskId],
      [workspaceIds[0], otherTaskId],
      [workspaceIds[1], foreignTaskId],
    ])
      await runner.query(
        'INSERT INTO core."deliveryTask" ("workspaceId","taskId","projectId",details) VALUES ($1,$2,$3,\'{}\'::jsonb)',
        [workspaceId, nativeId, randomUUID()],
      );
    const insert = async (table, fields) => {
      assert(TABLES.includes(table));
      const keys = Object.keys(fields);
      return (
        await runner.query(
          `INSERT INTO core."${table}" (${keys.map((key) => `"${key}"`).join(',')}) VALUES (${keys.map((_, index) => `$${index + 1}`).join(',')}) RETURNING *`,
          Object.values(fields),
        )
      )[0];
    };
    const feedbackFields = {
      workspaceId: workspaceIds[0],
      id: randomUUID(),
      taskId,
      projectId: randomUUID(),
      revision: 1,
      targetKind: 'SUBMISSION',
      submissionVersion: 1,
      assetId: randomUUID(),
      target: {},
      body: 'Synthetic exact version note',
      anchorKind: 'TIME',
      startMs: 1000,
      endMs: null,
      status: 'OPEN',
      createdBy: actorId,
      createdByName: 'Synthetic reviewer',
      createdAt: new Date(),
      updatedAt: new Date(),
      correction: null,
    };
    const feedback = await insert(TABLES[0], feedbackFields);
    const foreign = await insert(TABLES[0], {
      ...feedbackFields,
      id: randomUUID(),
      workspaceId: workspaceIds[1],
      taskId: foreignTaskId,
    });
    await rejects(
      'Feedback task cannot cross workspaces',
      () =>
        insert(TABLES[0], {
          ...feedbackFields,
          id: randomUUID(),
          taskId: foreignTaskId,
        }),
      '23503',
    );
    await rejects('Submission identity cannot be NULL', () =>
      insert(TABLES[0], {
        ...feedbackFields,
        id: randomUUID(),
        submissionVersion: null,
      }),
    );
    await rejects('ASSET identity cannot claim a submission', () =>
      insert(TABLES[0], {
        ...feedbackFields,
        id: randomUUID(),
        targetKind: 'ASSET',
      }),
    );
    await rejects('Timestamp cannot be NULL', () =>
      insert(TABLES[0], { ...feedbackFields, id: randomUUID(), startMs: null }),
    );
    await rejects('Negative timestamp is rejected', () =>
      insert(TABLES[0], { ...feedbackFields, id: randomUUID(), startMs: -1 }),
    );
    await rejects('Range end must exist', () =>
      insert(TABLES[0], {
        ...feedbackFields,
        id: randomUUID(),
        anchorKind: 'RANGE',
      }),
    );
    await rejects('Range start must exist', () =>
      insert(TABLES[0], {
        ...feedbackFields,
        id: randomUUID(),
        anchorKind: 'RANGE',
        startMs: null,
        endMs: 2000,
      }),
    );
    await rejects('A range has positive duration', () =>
      insert(TABLES[0], {
        ...feedbackFields,
        id: randomUUID(),
        anchorKind: 'RANGE',
        endMs: 1000,
      }),
    );
    await rejects('General notes cannot carry time', () =>
      insert(TABLES[0], {
        ...feedbackFields,
        id: randomUUID(),
        anchorKind: 'GENERAL',
      }),
    );
    await rejects('Body cannot be blank', () =>
      insert(TABLES[0], { ...feedbackFields, id: randomUUID(), body: '   ' }),
    );
    await rejects('Body size is bounded', () =>
      insert(TABLES[0], {
        ...feedbackFields,
        id: randomUUID(),
        body: 'x'.repeat(6001),
      }),
    );
    const eventFields = {
      workspaceId: workspaceIds[0],
      taskId,
      feedbackId: feedback.id,
      commandId: randomUUID(),
      requestHash: 'a'.repeat(64),
      revision: 1,
      action: 'CREATED',
      body: 'Synthetic exact version note',
      actorId,
      actorName: 'Synthetic reviewer',
      createdAt: new Date(),
      beforeStatus: null,
      afterStatus: 'OPEN',
      correction: null,
    };
    await insert(TABLES[1], eventFields);
    await rejects(
      'Event command cannot duplicate',
      () => insert(TABLES[1], { ...eventFields, revision: 2 }),
      '23505',
    );
    await rejects(
      'History revision cannot duplicate',
      () => insert(TABLES[1], { ...eventFields, commandId: randomUUID() }),
      '23505',
    );
    await rejects(
      'Event cannot cross workspace feedback',
      () =>
        insert(TABLES[1], {
          ...eventFields,
          feedbackId: foreign.id,
          commandId: randomUUID(),
        }),
      '23503',
    );
    await rejects(
      'Event cannot cross task feedback',
      () =>
        insert(TABLES[1], {
          ...eventFields,
          taskId: otherTaskId,
          commandId: randomUUID(),
        }),
      '23503',
    );
    await rejects('Request fingerprint is bounded exact hex', () =>
      insert(TABLES[1], {
        ...eventFields,
        revision: 2,
        commandId: randomUUID(),
        requestHash: 'bad',
      }),
    );
    await rejects(
      'Feedback history prevents destructive downgrade',
      () => migration.down(runner),
      'P0001',
    );
    for (const table of [...TABLES].reverse())
      await runner.query(
        `DELETE FROM core."${table}" WHERE "workspaceId"=ANY($1::uuid[])`,
        [workspaceIds],
      );
    const activityId = randomUUID();
    await runner.query(
      'INSERT INTO core."otogrowActivityEvent" (id,"workspaceId","occurredAt","actorName","actorType",category,action,outcome,summary,"sourceType","sourceId") VALUES ($1,$2,now(),\'System\',\'SYSTEM\',\'CREATIVE\',\'CREATIVE_FEEDBACK_CREATED\',\'RECORDED\',\'Disposable retained review history\',\'creative-review\',$3)',
      [activityId, workspaceIds[0], randomUUID()],
    );
    await rejects(
      'Retained unified activity prevents downgrade',
      () => migration.down(runner),
      'P0001',
    );
    await runner.query(
      'DELETE FROM core."otogrowActivityEvent" WHERE id=$1 AND "workspaceId"=$2',
      [activityId, workspaceIds[0]],
    );
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
      'Creative review migration rollback: schema/source preservation, four workspace-safe foreign keys, strict nullable/time/body constraints, unique command/revision history and guarded downgrade passed.',
    );
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
