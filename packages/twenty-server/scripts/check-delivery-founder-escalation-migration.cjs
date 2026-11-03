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
  /^2-34-instance-command-fast-\d+-add-delivery-founder-escalation\.js$/.test(
    file,
  ),
);
assert.equal(
  files.length,
  1,
  'Build the single generated founder-escalation command first.',
);
const { AddDeliveryFounderEscalationFastInstanceCommand } = require(
  join(DIRECTORY, files[0]),
);
const TABLES = [
  'deliveryFounderEscalationRule',
  'deliveryFounderEscalationEpisode',
  'deliveryFounderEscalationNotice',
];
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
      'Investigate a partial founder escalation schema installation.',
    );
    const installed = parts.every(Boolean);
    if (installed)
      for (const table of TABLES)
        await runner.query(`LOCK TABLE core."${table}" IN SHARE MODE`);
    const originalData = await data();
    const originalSchema = await schema(false);
    const unrelatedSchema = await schema();
    const migration = new AddDeliveryFounderEscalationFastInstanceCommand();
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
        'SELECT (SELECT count(*) FROM core."deliveryFounderEscalationRule")+(SELECT count(*) FROM core."deliveryFounderEscalationEpisode")+(SELECT count(*) FROM core."deliveryFounderEscalationNotice") AS count',
      );
      if (BigInt(count) > 0n) {
        await rejects(
          'Existing escalation data/history prevents downgrade',
          () => migration.down(runner),
          'P0001',
        );
        assert.fail(
          'Existing alert history correctly blocks downgrade; never remove it to run this full-cycle checker.',
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
      'Only the three new escalation tables may change schema.',
    );
    if (installed) assert.equal(await schema(false), originalSchema);
    const foreignKeys = await runner.query(
      "SELECT relation.relname AS \"table\",pg_get_constraintdef(constraint_row.oid) AS definition FROM pg_constraint constraint_row JOIN pg_class relation ON relation.oid=constraint_row.conrelid JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace WHERE namespace.nspname='core' AND relation.relname=ANY($1::text[]) AND constraint_row.contype='f' ORDER BY relation.relname,constraint_row.conname",
      [TABLES],
    );
    assert.equal(foreignKeys.length, 6);
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
    for (const [table, target, field] of [
      [TABLES[1], TABLES[0], 'ruleId'],
      [TABLES[2], TABLES[0], 'ruleId'],
      [TABLES[2], TABLES[1], 'episodeId'],
    ])
      assert(
        foreignKeys.some(
          (row) =>
            row.table === table &&
            row.definition.includes(
              `FOREIGN KEY ("workspaceId", "${field}")`,
            ) &&
            row.definition.includes(target) &&
            row.definition.includes('ON DELETE RESTRICT'),
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
      );
    const [template] = await runner.query(
      'SELECT "workspaceCustomApplicationId" FROM core.workspace ORDER BY id LIMIT 1',
    );
    assert(template);
    for (const workspaceId of workspaceIds)
      await runner.query(
        'INSERT INTO core.workspace (id,"displayName",subdomain,"activationStatus","workspaceCustomApplicationId") VALUES ($1,\'Disposable founder migration fixture\',$2,\'PENDING_CREATION\',$3)',
        [
          workspaceId,
          `founder-migration-${workspaceId}`,
          template.workspaceCustomApplicationId,
        ],
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
    const ruleFields = {
      workspaceId: workspaceIds[0],
      id: randomUUID(),
      revision: 1,
      enabled: false,
      name: 'Disposable rule',
      condition: 'TASK_BLOCKED',
      recipientId: actorId,
      recipientName: 'Synthetic administrator',
      priority: 'NORMAL',
      projectScope: 'ALL',
      projectIds: [],
      includeCompany: false,
      currency: null,
      serviceMonth: null,
      repeatMode: 'ONCE',
      repeatHours: null,
      maxSends: 1,
      grantedBy: null,
      grantUserWorkspaceId: null,
      changedBy: actorId,
      changedByName: 'Synthetic administrator',
      changedAt: new Date(),
      lastEvaluatedAt: null,
      evaluationError: null,
    };
    const rule = await insert(TABLES[0], ruleFields);
    const foreignRule = await insert(TABLES[0], {
      ...ruleFields,
      id: randomUUID(),
      workspaceId: workspaceIds[1],
    });
    const companyOnly = await insert(TABLES[0], {
      ...ruleFields,
      id: randomUUID(),
      projectScope: 'SELECTED',
      includeCompany: true,
    });
    assert.equal(companyOnly.projectIds.length, 0);
    await rejects('Revision must be positive', () =>
      insert(TABLES[0], { ...ruleFields, id: randomUUID(), revision: 0 }),
    );
    await rejects('Priority is explicit', () =>
      insert(TABLES[0], { ...ruleFields, id: randomUUID(), priority: 'AUTO' }),
    );
    await rejects('Selected project scope cannot be empty', () =>
      insert(TABLES[0], {
        ...ruleFields,
        id: randomUUID(),
        projectScope: 'SELECTED',
      }),
    );
    await rejects('Once-only rule cannot repeat', () =>
      insert(TABLES[0], { ...ruleFields, id: randomUUID(), repeatHours: 1 }),
    );
    await rejects('Interval rules have a bounded repeat count', () =>
      insert(TABLES[0], {
        ...ruleFields,
        id: randomUUID(),
        repeatMode: 'INTERVAL',
        repeatHours: 1,
        maxSends: 21,
      }),
    );
    await rejects(
      'Workspace must exist',
      () =>
        insert(TABLES[0], {
          ...ruleFields,
          id: randomUUID(),
          workspaceId: randomUUID(),
        }),
      '23503',
    );
    const episodeFields = {
      workspaceId: workspaceIds[0],
      id: randomUUID(),
      ruleId: rule.id,
      revision: 1,
      sourceKey: `TASK:${randomUUID()}`,
      condition: 'TASK_BLOCKED',
      status: 'OPEN',
      source: { key: 'migration-only' },
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      resolvedAt: null,
      acknowledgedAt: null,
      acknowledgedByName: null,
      acknowledgementReason: null,
    };
    const episode = await insert(TABLES[1], episodeFields);
    await rejects(
      'Open source episodes cannot duplicate',
      () => insert(TABLES[1], { ...episodeFields, id: randomUUID() }),
      '23505',
    );
    await rejects(
      'Unavailable source episode still owns its issue',
      () =>
        insert(TABLES[1], {
          ...episodeFields,
          id: randomUUID(),
          status: 'UNAVAILABLE',
        }),
      '23505',
    );
    await rejects(
      'Episode rule cannot cross workspaces',
      () =>
        insert(TABLES[1], {
          ...episodeFields,
          id: randomUUID(),
          ruleId: foreignRule.id,
        }),
      '23503',
    );
    const foreignEpisode = await insert(TABLES[1], {
      ...episodeFields,
      id: randomUUID(),
      workspaceId: workspaceIds[1],
      ruleId: foreignRule.id,
    });
    const noticeFields = {
      workspaceId: workspaceIds[0],
      id: randomUUID(),
      ruleId: rule.id,
      episodeId: episode.id,
      kind: 'ALERT',
      sequence: 1,
      ruleRevision: 1,
      commandId: null,
      requestHash: null,
      ruleSnapshot: {},
      source: {},
      recipientId: actorId,
      recipientName: 'Synthetic administrator',
      priority: 'NORMAL',
      createdBy: null,
      actorName: 'System',
      reason: null,
      createdAt: new Date(),
    };
    await insert(TABLES[2], noticeFields);
    await rejects(
      'Alert sequence cannot duplicate',
      () => insert(TABLES[2], { ...noticeFields, id: randomUUID() }),
      '23505',
    );
    await rejects('Alert must identify an episode', () =>
      insert(TABLES[2], { ...noticeFields, id: randomUUID(), episodeId: null }),
    );
    await rejects(
      'Notice rule cannot cross workspaces',
      () =>
        insert(TABLES[2], {
          ...noticeFields,
          id: randomUUID(),
          ruleId: foreignRule.id,
          sequence: 2,
        }),
      '23503',
    );
    await rejects(
      'Notice episode cannot cross workspaces',
      () =>
        insert(TABLES[2], {
          ...noticeFields,
          id: randomUUID(),
          episodeId: foreignEpisode.id,
          sequence: 2,
        }),
      '23503',
    );
    const command = {
      ...noticeFields,
      id: randomUUID(),
      episodeId: null,
      kind: 'RULE_SAVED',
      sequence: 0,
      commandId: randomUUID(),
      requestHash: 'a'.repeat(64),
    };
    await insert(TABLES[2], command);
    await rejects(
      'Command identity cannot duplicate',
      () => insert(TABLES[2], { ...command, id: randomUUID() }),
      '23505',
    );
    await rejects(
      'Retained episodes protect their rule',
      () =>
        runner.query(
          'DELETE FROM core."deliveryFounderEscalationRule" WHERE id=$1',
          [rule.id],
        ),
      '23503',
    );
    await rejects(
      'Recorded alert history prevents downgrade',
      () => migration.down(runner),
      'P0001',
    );
    for (const table of [...TABLES].reverse())
      await runner.query(
        `DELETE FROM core."${table}" WHERE "workspaceId"=ANY($1::uuid[])`,
        [workspaceIds],
      );
    await runner.query(
      'INSERT INTO core."deliveryOperations" ("workspaceId",state) VALUES ($1,$2)',
      [workspaceIds[0], { founderEscalationRouting: { mode: 'RULES' } }],
    );
    await rejects(
      'Adopted routing alone prevents downgrade',
      () => migration.down(runner),
      'P0001',
    );
    await runner.query(
      'DELETE FROM core."deliveryOperations" WHERE "workspaceId"=$1',
      [workspaceIds[0]],
    );
    const activityId = randomUUID();
    await runner.query(
      'INSERT INTO core."otogrowActivityEvent" (id,"workspaceId","occurredAt","actorName","actorType",category,action,outcome,summary,"sourceType","sourceId") VALUES ($1,$2,now(),\'System\',\'SYSTEM\',\'DELIVERY\',\'FOUNDER_ESCALATION_RULE_SAVED\',\'RECORDED\',\'Disposable retained history proof\',\'founder-alert\',$3)',
      [activityId, workspaceIds[0], randomUUID()],
    );
    await rejects(
      'Activity history alone prevents downgrade',
      () => migration.down(runner),
      'P0001',
    );
    await runner.query(
      'DELETE FROM core."otogrowActivityEvent" WHERE "workspaceId"=$1 AND id=$2',
      [workspaceIds[0], activityId],
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
      'Founder escalation migration rollback: schema/data preservation, six workspace-safe foreign keys, bounded rules, issue/notice/command uniqueness and protected history passed.',
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
