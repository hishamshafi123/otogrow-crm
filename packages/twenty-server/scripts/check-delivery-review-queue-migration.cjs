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
  /^2-34-instance-command-fast-\d+-add-delivery-review-queue\.js$/.test(file),
);
assert.equal(
  files.length,
  1,
  'Build the single registered review-queue command first.',
);
const { AddDeliveryReviewQueueFastInstanceCommand } = require(
  join(DIRECTORY, files[0]),
);
const TABLES = ['deliveryReviewAssignment', 'deliveryReviewAssignmentEvent'];
const RULE = 'deliveryFounderEscalationRule';
const WAIT_COLUMN = 'minimumReviewWaitHours';
const WAIT_CHECK = 'CHK_4e991781e141cc89867b0bceac';
const FIXTURE_TABLES = new Set([
  ...TABLES,
  RULE,
  'deliveryFounderEscalationNotice',
  'deliveryOperations',
]);
const fingerprint = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const quote = (value) => `"${value.replaceAll('"', '""')}"`;

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
    'Use only the local database.',
  );
  await connectionSource.initialize();
  const runner = connectionSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    await runner.query("SET LOCAL lock_timeout='10s'");
    await runner.query("SET LOCAL statement_timeout='30s'");
    const workspaceIds = [randomUUID(), randomUUID()],
      actorId = randomUUID();
    const userTables = () =>
      runner.query(
        `SELECT namespace.nspname AS schema,relation.relname AS name,EXISTS(SELECT 1 FROM pg_attribute attribute WHERE attribute.attrelid=relation.oid AND attribute.attname='workspaceId' AND attribute.atttypid='uuid'::regtype AND NOT attribute.attisdropped) AS "hasWorkspaceId" FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace WHERE namespace.nspname NOT IN ('pg_catalog','information_schema') AND namespace.nspname NOT LIKE 'pg_toast%' AND namespace.nspname NOT LIKE 'pg_temp_%' AND relation.relkind IN ('r','p') ORDER BY namespace.nspname,relation.relname`,
      );
    const baselineTables = await userTables();
    for (const table of baselineTables)
      await runner.query(
        `LOCK TABLE ${quote(table.schema)}.${quote(table.name)} IN SHARE MODE`,
      );
    assert.equal(
      (
        await runner.query(
          'SELECT count(*)::integer AS count FROM core.workspace WHERE id=ANY($1::uuid[])',
          [workspaceIds],
        )
      )[0].count,
      0,
    );
    const installedParts = async () => {
      const relations = await Promise.all(
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
      const [column] = await runner.query(
        `SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='core' AND table_name=$1 AND column_name=$2) AS present`,
        [RULE, WAIT_COLUMN],
      );
      const [check] = await runner.query(
        `SELECT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='core."deliveryFounderEscalationRule"'::regclass AND conname=$1) AS present`,
        [WAIT_CHECK],
      );
      return [...relations, column.present, check.present];
    };
    const data = async (normalizeColumn = true) => {
      const result = {};
      for (const table of await userTables()) {
        if (table.schema === 'core' && TABLES.includes(table.name)) continue;
        const ownKey =
          table.schema === 'core' && table.name === 'workspace'
            ? 'id'
            : table.hasWorkspaceId
              ? 'workspaceId'
              : null;
        const projection =
          normalizeColumn && table.schema === 'core' && table.name === RULE
            ? `to_jsonb(record)-'${WAIT_COLUMN}'`
            : 'to_jsonb(record)';
        const rows = await runner.query(
          `SELECT (${projection})::text AS value FROM ${quote(table.schema)}.${quote(table.name)} record ${ownKey ? `WHERE record.${quote(ownKey)} IS NULL OR record.${quote(ownKey)}<>ALL($1::uuid[])` : ''} ORDER BY value`,
          ownKey ? [workspaceIds] : [],
        );
        result[`${table.schema}.${table.name}`] = fingerprint(rows);
      }
      return result;
    };
    const schema = async (normalizeIntended = true) => {
      const relations = await runner.query(
        `SELECT namespace.nspname,relation.relname,relation.relkind::text,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('name',attribute.attname,'type',pg_catalog.format_type(attribute.atttypid,attribute.atttypmod),'required',attribute.attnotnull,'default',pg_get_expr(definition.adbin,definition.adrelid)) ORDER BY attribute.attnum) FROM pg_attribute attribute LEFT JOIN pg_attrdef definition ON definition.adrelid=attribute.attrelid AND definition.adnum=attribute.attnum WHERE attribute.attrelid=relation.oid AND attribute.attnum>0 AND NOT attribute.attisdropped AND NOT($1 AND namespace.nspname='core' AND relation.relname=$3 AND attribute.attname=$4)),'[]'::jsonb)::text AS columns,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('name',constraint_row.conname,'definition',pg_get_constraintdef(constraint_row.oid)) ORDER BY constraint_row.conname) FROM pg_constraint constraint_row WHERE constraint_row.conrelid=relation.oid AND NOT($1 AND namespace.nspname='core' AND relation.relname=$3 AND constraint_row.conname=$5)),'[]'::jsonb)::text AS constraints,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('name',indexname,'definition',indexdef) ORDER BY indexname) FROM pg_indexes WHERE schemaname=namespace.nspname AND tablename=relation.relname),'[]'::jsonb)::text AS indexes,
        COALESCE((SELECT jsonb_agg(pg_get_triggerdef(trigger_row.oid,true) ORDER BY trigger_row.tgname) FROM pg_trigger trigger_row WHERE trigger_row.tgrelid=relation.oid AND NOT trigger_row.tgisinternal),'[]'::jsonb)::text AS triggers,
        CASE WHEN relation.relkind IN ('v','m') THEN pg_get_viewdef(relation.oid,true) ELSE NULL END AS view
        FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace WHERE namespace.nspname NOT IN ('pg_catalog','information_schema') AND namespace.nspname NOT LIKE 'pg_toast%' AND namespace.nspname NOT LIKE 'pg_temp_%' AND relation.relkind IN ('r','p','v','m') AND NOT($1 AND namespace.nspname='core' AND relation.relname=ANY($2::text[])) ORDER BY namespace.nspname,relation.relname`,
        [normalizeIntended, TABLES, RULE, WAIT_COLUMN, WAIT_CHECK],
      );
      const enums = await runner.query(
        "SELECT namespace.nspname,type_row.typname,json_agg(enum_row.enumlabel ORDER BY enum_row.enumsortorder)::text AS values FROM pg_enum enum_row JOIN pg_type type_row ON type_row.oid=enum_row.enumtypid JOIN pg_namespace namespace ON namespace.oid=type_row.typnamespace WHERE namespace.nspname NOT IN ('pg_catalog','information_schema') GROUP BY namespace.nspname,type_row.typname ORDER BY namespace.nspname,type_row.typname",
      );
      const functions = await runner.query(
        "SELECT namespace.nspname,procedure_row.proname,pg_get_function_identity_arguments(procedure_row.oid) AS arguments,pg_get_functiondef(procedure_row.oid) AS definition FROM pg_proc procedure_row JOIN pg_namespace namespace ON namespace.oid=procedure_row.pronamespace WHERE namespace.nspname NOT IN ('pg_catalog','information_schema') AND namespace.nspname NOT LIKE 'pg_toast%' AND namespace.nspname NOT LIKE 'pg_temp_%' AND procedure_row.prokind IN ('f','p') ORDER BY namespace.nspname,procedure_row.proname,arguments",
      );
      return fingerprint({ relations, enums, functions });
    };
    const parts = await installedParts();
    assert(
      parts.every(Boolean) || parts.every((value) => !value),
      'Refuse a partial review-queue schema installation.',
    );
    const installed = parts.every(Boolean),
      migration = new AddDeliveryReviewQueueFastInstanceCommand();
    const originalData = await data(),
      originalFullData = await data(false),
      originalSchema = await schema(false),
      unrelatedSchema = await schema();
    let sequence = 0;
    const rejects = async (label, operation, code = '23514') => {
      const point = `review_queue_migration_${++sequence}`;
      await runner.query(`SAVEPOINT ${point}`);
      try {
        await assert.rejects(operation, (error) => error.code === code, label);
      } finally {
        await runner.query(`ROLLBACK TO SAVEPOINT ${point}`);
        await runner.query(`RELEASE SAVEPOINT ${point}`);
      }
    };
    if (installed) {
      const [{ count }] = await runner.query(
        `SELECT (SELECT count(*) FROM core."deliveryReviewAssignment")+(SELECT count(*) FROM core."deliveryReviewAssignmentEvent")+(SELECT count(*) FROM core."deliveryOperations" WHERE state @> '{"notices":[{"kind":"REVIEW_ASSIGNMENT"}]}'::jsonb)+(SELECT count(*) FROM core."deliveryFounderEscalationRule" WHERE "minimumReviewWaitHours" IS NOT NULL OR condition='TASK_REVIEW_WAIT')+(SELECT count(*) FROM core."deliveryFounderEscalationNotice" WHERE "ruleSnapshot"->>'condition'='TASK_REVIEW_WAIT' OR "ruleSnapshot"->>'minimumReviewWaitHours' IS NOT NULL)+(SELECT count(*) FROM core."otogrowActivityEvent" WHERE action IN ('REVIEW_BACKUP_ASSIGNED','REVIEW_PRIMARY_RESTORED')) AS count`,
      );
      if (BigInt(count) > 0n) {
        await rejects(
          'Retained real review/wait history prevents downgrade',
          () => migration.down(runner),
          'P0001',
        );
        assert.fail(
          'Retained review or wait-alert history correctly blocks the full cycle; never delete it to run this checker.',
        );
      }
      await migration.down(runner);
    }
    const oldSchema = await schema(false);
    await migration.up(runner);
    assert((await installedParts()).every(Boolean));
    const addedSchema = await schema(false);
    assert.deepEqual(
      await data(),
      originalData,
      'Migration must preserve every preexisting table row.',
    );
    assert.equal(
      await schema(),
      unrelatedSchema,
      'Only two new tables and the named rule column/check may change schema.',
    );
    if (installed) assert.equal(await schema(false), originalSchema);
    const [column] = await runner.query(
      `SELECT data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='core' AND table_name=$1 AND column_name=$2`,
      [RULE, WAIT_COLUMN],
    );
    assert.deepEqual(column, {
      data_type: 'integer',
      is_nullable: 'YES',
      column_default: null,
    });
    const indexes = await runner.query(
      `SELECT relation.relname AS "table",index_relation.relname AS name,index_row.indisunique AS "unique" FROM pg_index index_row JOIN pg_class relation ON relation.oid=index_row.indrelid JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace JOIN pg_class index_relation ON index_relation.oid=index_row.indexrelid WHERE namespace.nspname='core' AND relation.relname=ANY($1::text[]) AND NOT index_row.indisprimary ORDER BY index_relation.relname`,
      [TABLES],
    );
    assert.equal(indexes.length, 5);
    assert.equal(indexes.filter((index) => index.unique).length, 4);
    const foreignKeys = await runner.query(
      `SELECT relation.relname AS "table",constraint_row.conname AS name,pg_get_constraintdef(constraint_row.oid) AS definition FROM pg_constraint constraint_row JOIN pg_class relation ON relation.oid=constraint_row.conrelid JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace WHERE namespace.nspname='core' AND relation.relname=ANY($1::text[]) AND constraint_row.contype='f' ORDER BY relation.relname,constraint_row.conname`,
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
    const eventAssignmentForeignKey = foreignKeys.find(
      (row) =>
        row.table === TABLES[1] &&
        /FOREIGN KEY \("workspaceId", "taskId", "assignmentId", "submissionVersion"\).*deliveryReviewAssignment.*ON DELETE RESTRICT/.test(
          row.definition,
        ),
    );
    assert(
      eventAssignmentForeignKey,
      'Immutable event must reference the exact assignment submission version.',
    );
    const [template] = await runner.query(
      'SELECT "workspaceCustomApplicationId" FROM core.workspace ORDER BY id LIMIT 1',
    );
    assert(template);
    for (const workspaceId of workspaceIds)
      await runner.query(
        'INSERT INTO core.workspace (id,"displayName",subdomain,"activationStatus","workspaceCustomApplicationId") VALUES ($1,\'Disposable review-queue migration fixture\',$2,\'PENDING_CREATION\',$3)',
        [
          workspaceId,
          `review-queue-migration-${workspaceId}`,
          template.workspaceCustomApplicationId,
        ],
      );
    const taskId = randomUUID(),
      otherTaskId = randomUUID(),
      foreignTaskId = randomUUID();
    for (const [workspaceId, sourceTaskId] of [
      [workspaceIds[0], taskId],
      [workspaceIds[0], otherTaskId],
      [workspaceIds[1], foreignTaskId],
    ])
      await runner.query(
        'INSERT INTO core."deliveryTask" ("workspaceId","taskId","projectId",details) VALUES ($1,$2,$3,\'{}\'::jsonb)',
        [workspaceId, sourceTaskId, randomUUID()],
      );
    const insert = async (table, fields) => {
      assert(FIXTURE_TABLES.has(table));
      const keys = Object.keys(fields);
      return (
        await runner.query(
          `INSERT INTO core.${quote(table)} (${keys.map(quote).join(',')}) VALUES (${keys.map((_, index) => `$${index + 1}`).join(',')}) RETURNING *`,
          Object.values(fields),
        )
      )[0];
    };
    const assignmentFields = {
      workspaceId: workspaceIds[0],
      taskId,
      submissionVersion: 1,
      revision: 1,
      mode: 'BACKUP',
      reviewerId: actorId,
      reviewerName: 'Synthetic independent reviewer',
      reason: 'Cover this exact pending submission.',
      changedBy: actorId,
      changedByName: 'Synthetic manager',
      changedAt: new Date(),
    };
    const assignment = await insert(TABLES[0], assignmentFields);
    const foreignAssignment = await insert(TABLES[0], {
      ...assignmentFields,
      workspaceId: workspaceIds[1],
      taskId: foreignTaskId,
    });
    await rejects(
      'Assignment task cannot cross workspaces',
      () => insert(TABLES[0], { ...assignmentFields, taskId: foreignTaskId }),
      '23503',
    );
    await rejects(
      'Assignment workspace must exist',
      () =>
        insert(TABLES[0], { ...assignmentFields, workspaceId: randomUUID() }),
      '23503',
    );
    await rejects(
      'Only one current assignment exists per exact submission',
      () => insert(TABLES[0], assignmentFields),
      '23505',
    );
    for (const fields of [
      { submissionVersion: 0 },
      { submissionVersion: -1 },
      { revision: 0 },
      { revision: -1 },
      { mode: 'OTHER' },
      { mode: 'BACKUP', reviewerId: null },
      { mode: 'PRIMARY', reviewerId: actorId },
      { reason: '  ' },
      { reason: 'x'.repeat(2001) },
    ])
      await rejects(`Assignment rejects ${JSON.stringify(fields)}`, () =>
        insert(TABLES[0], {
          ...assignmentFields,
          taskId: otherTaskId,
          ...fields,
        }),
      );
    for (const fields of [
      { submissionVersion: null },
      { revision: null },
      { mode: null },
    ])
      await rejects(
        `Assignment required field rejects NULL: ${Object.keys(fields)[0]}`,
        () =>
          insert(TABLES[0], {
            ...assignmentFields,
            taskId: otherTaskId,
            ...fields,
          }),
        '23502',
      );
    const primary = await insert(TABLES[0], {
      ...assignmentFields,
      taskId: otherTaskId,
      mode: 'PRIMARY',
      reviewerId: null,
      reviewerName: null,
      reason: 'x'.repeat(2000),
    });
    assert.equal(primary.reason.length, 2000);
    await insert(TABLES[0], { ...assignmentFields, submissionVersion: 2 });
    const eventFields = {
      workspaceId: workspaceIds[0],
      taskId,
      assignmentId: assignment.id,
      submissionVersion: 1,
      commandId: randomUUID(),
      requestHash: 'a'.repeat(64),
      revision: 1,
      mode: 'BACKUP',
      reviewerId: actorId,
      reviewerName: 'Synthetic independent reviewer',
      primaryReviewerId: actorId,
      primaryReviewerName: 'Synthetic manager',
      previousMode: 'PRIMARY',
      previousReviewerId: actorId,
      previousReviewerName: 'Synthetic manager',
      reason: 'Cover this exact pending submission.',
      actorId,
      actorName: 'Synthetic manager',
      createdAt: new Date(),
    };
    const event = await insert(TABLES[1], eventFields);
    await rejects(
      'Event command is unique inside its workspace',
      () => insert(TABLES[1], { ...eventFields, revision: 2 }),
      '23505',
    );
    await rejects(
      'Event revision is unique per assignment',
      () => insert(TABLES[1], { ...eventFields, commandId: randomUUID() }),
      '23505',
    );
    await rejects(
      'Event cannot reference another workspace assignment',
      () =>
        insert(TABLES[1], {
          ...eventFields,
          commandId: randomUUID(),
          assignmentId: foreignAssignment.id,
        }),
      '23503',
    );
    await rejects(
      'Event cannot reference another task assignment',
      () =>
        insert(TABLES[1], {
          ...eventFields,
          commandId: randomUUID(),
          taskId: otherTaskId,
        }),
      '23503',
    );
    await rejects(
      'Event workspace must exist',
      () =>
        insert(TABLES[1], {
          ...eventFields,
          commandId: randomUUID(),
          workspaceId: randomUUID(),
        }),
      '23503',
    );
    await rejects(
      'Event cannot claim another submission on the same assignment',
      () =>
        insert(TABLES[1], {
          ...eventFields,
          commandId: randomUUID(),
          revision: 2,
          submissionVersion: 2,
        }),
      '23503',
    );
    for (const fields of [
      { submissionVersion: 0 },
      { revision: 0 },
      { mode: 'OTHER' },
      { mode: 'BACKUP', reviewerId: null },
      { mode: 'PRIMARY', reviewerId: actorId },
      { previousMode: 'OTHER' },
      { reason: '  ' },
      { reason: 'x'.repeat(2001) },
      ...[
        '',
        'a'.repeat(63),
        'a'.repeat(65),
        'A'.repeat(64),
        'g'.repeat(64),
      ].map((requestHash) => ({ requestHash })),
    ])
      await rejects(`Immutable event rejects ${JSON.stringify(fields)}`, () =>
        insert(TABLES[1], {
          ...eventFields,
          commandId: randomUUID(),
          revision: 2,
          ...fields,
        }),
      );
    for (const fields of [
      { mode: null },
      { submissionVersion: null },
      { revision: null },
      { previousMode: null },
    ])
      await rejects(
        `Event required field rejects NULL: ${Object.keys(fields)[0]}`,
        () =>
          insert(TABLES[1], {
            ...eventFields,
            commandId: randomUUID(),
            revision: 2,
            ...fields,
          }),
        '23502',
      );
    await rejects(
      'Assignment history prevents deleting its parent',
      () =>
        runner.query(
          'DELETE FROM core."deliveryReviewAssignment" WHERE id=$1 AND "workspaceId"=$2',
          [assignment.id, workspaceIds[0]],
        ),
      '23503',
    );
    await rejects(
      'Source task deletion is restricted while an assignment exists',
      () =>
        runner.query(
          'DELETE FROM core."deliveryTask" WHERE "workspaceId"=$1 AND "taskId"=$2',
          [workspaceIds[0], taskId],
        ),
      '23503',
    );
    await rejects(
      'Assignment rows and events prevent downgrade',
      () => migration.down(runner),
      'P0001',
    );
    const point = `event_only_guard_${++sequence}`;
    await runner.query(`SAVEPOINT ${point}`);
    try {
      // Restore the fixture link by savepoint; RESTRICT cannot defer an orphaned-event guard probe.
      await runner.query(
        `ALTER TABLE core."deliveryReviewAssignmentEvent" DROP CONSTRAINT ${quote(eventAssignmentForeignKey.name)}`,
      );
      await runner.query(
        'DELETE FROM core."deliveryReviewAssignment" WHERE "workspaceId"=ANY($1::uuid[])',
        [workspaceIds],
      );
      await rejects(
        'Even orphaned retained immutable event evidence independently blocks downgrade',
        () => migration.down(runner),
        'P0001',
      );
    } finally {
      await runner.query(`ROLLBACK TO SAVEPOINT ${point}`);
      await runner.query(`RELEASE SAVEPOINT ${point}`);
    }
    assert.equal(
      event.id,
      (
        await runner.query(
          'SELECT id FROM core."deliveryReviewAssignmentEvent" WHERE "workspaceId"=$1',
          [workspaceIds[0]],
        )
      )[0].id,
    );
    for (const table of [...TABLES].reverse())
      await runner.query(
        `DELETE FROM core.${quote(table)} WHERE "workspaceId"=ANY($1::uuid[])`,
        [workspaceIds],
      );
    const primaryNotice = {
      id: randomUUID(),
      taskId,
      recipientId: actorId,
      senderId: randomUUID(),
      kind: 'REVIEW_ASSIGNMENT',
      reviewAssignment: {
        submissionVersion: 1,
        assignmentId: null,
        assignmentRevision: 0,
        recipientId: actorId,
      },
      text: 'A pending submission requires independent review.',
      createdAt: new Date().toISOString(),
      remindAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      seenAt: null,
      acknowledgedAt: null,
      cancelled: false,
      sendState: 'PENDING',
      attemptedAt: null,
      error: null,
    };
    const operationsState = {
      timezone: 'UTC',
      enabled: false,
      telegramEnabled: false,
      founderId: null,
      templates: [],
      notices: [primaryNotice],
      fulfilments: [],
      alerts: [],
      assignments: {},
      connections: {},
      linkTokens: [],
    };
    const operations = await insert('deliveryOperations', {
      workspaceId: workspaceIds[0],
      state: operationsState,
      updatedAt: new Date(),
    });
    await rejects(
      'A primary revision-zero notice alone prevents downgrade without any assignment row',
      () => migration.down(runner),
      'P0001',
    );
    for (const changes of [
      { seenAt: new Date().toISOString() },
      { cancelled: true, sendState: 'SUPPRESSED' },
    ]) {
      await runner.query(
        'UPDATE core."deliveryOperations" SET state=$3::jsonb WHERE id=$1 AND "workspaceId"=$2',
        [
          operations.id,
          workspaceIds[0],
          JSON.stringify({
            ...operationsState,
            notices: [{ ...primaryNotice, ...changes }],
          }),
        ],
      );
      await rejects(
        'Seen or cancelled primary review notice history remains protected',
        () => migration.down(runner),
        'P0001',
      );
    }
    const { reviewAssignment: _reviewOrigin, ...legacyNotice } = primaryNotice;
    await runner.query(
      'UPDATE core."deliveryOperations" SET state=$3::jsonb WHERE id=$1 AND "workspaceId"=$2',
      [
        operations.id,
        workspaceIds[0],
        JSON.stringify({
          ...operationsState,
          notices: [
            {
              ...legacyNotice,
              kind: 'MESSAGE',
              text: 'An unrelated retained legacy message.',
            },
          ],
        }),
      ],
    );
    for (const action of [
      'REVIEW_BACKUP_ASSIGNED',
      'REVIEW_PRIMARY_RESTORED',
    ]) {
      const activityId = randomUUID();
      await runner.query(
        'INSERT INTO core."otogrowActivityEvent" (id,"workspaceId","occurredAt","actorName","actorType",category,action,outcome,summary,"sourceType","sourceId") VALUES ($1,$2,now(),\'Synthetic manager\',\'SYSTEM\',\'DELIVERY\',$3,\'RECORDED\',\'Disposable retained review assignment\',\'task\',$4)',
        [activityId, workspaceIds[0], action, taskId],
      );
      await rejects(
        `${action} activity independently prevents downgrade`,
        () => migration.down(runner),
        'P0001',
      );
      await runner.query(
        'DELETE FROM core."otogrowActivityEvent" WHERE id=$1 AND "workspaceId"=$2',
        [activityId, workspaceIds[0]],
      );
    }
    const ruleFields = {
      workspaceId: workspaceIds[0],
      id: randomUUID(),
      revision: 1,
      enabled: false,
      name: 'Disposable review wait rule',
      condition: 'TASK_REVIEW',
      minimumReviewWaitHours: null,
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
    const legacyRule = await insert(RULE, ruleFields);
    const waitRule = await insert(RULE, {
      ...ruleFields,
      id: randomUUID(),
      condition: 'TASK_REVIEW_WAIT',
      minimumReviewWaitHours: 1,
    });
    const maximumWait = await insert(RULE, {
      ...ruleFields,
      id: randomUUID(),
      condition: 'TASK_REVIEW_WAIT',
      minimumReviewWaitHours: 720,
    });
    assert.equal(waitRule.minimumReviewWaitHours, 1);
    assert.equal(maximumWait.minimumReviewWaitHours, 720);
    for (const fields of [
      { condition: 'TASK_REVIEW_WAIT', minimumReviewWaitHours: null },
      { condition: 'TASK_REVIEW_WAIT', minimumReviewWaitHours: 0 },
      { condition: 'TASK_REVIEW_WAIT', minimumReviewWaitHours: 721 },
      { condition: 'TASK_REVIEW_WAIT', minimumReviewWaitHours: -1 },
      { condition: 'TASK_REVIEW', minimumReviewWaitHours: 1 },
      { condition: 'TASK_BLOCKED', minimumReviewWaitHours: 720 },
    ])
      await rejects(
        `Chosen review wait rejects ${JSON.stringify(fields)}`,
        () => insert(RULE, { ...ruleFields, id: randomUUID(), ...fields }),
      );
    await rejects(
      'A paused wait rule still prevents dropping its meaning',
      () => migration.down(runner),
      'P0001',
    );
    await runner.query(
      'DELETE FROM core."deliveryFounderEscalationRule" WHERE id=$1 AND "workspaceId"=$2',
      [maximumWait.id, workspaceIds[0]],
    );
    const noticeFields = {
      workspaceId: workspaceIds[0],
      id: randomUUID(),
      ruleId: waitRule.id,
      episodeId: null,
      kind: 'RULE_PAUSED',
      sequence: 0,
      ruleRevision: 1,
      commandId: randomUUID(),
      requestHash: 'b'.repeat(64),
      ruleSnapshot: {
        condition: 'TASK_REVIEW_WAIT',
        minimumReviewWaitHours: 1,
        enabled: false,
      },
      source: null,
      recipientId: actorId,
      recipientName: 'Synthetic administrator',
      priority: 'NORMAL',
      createdBy: actorId,
      actorName: 'Synthetic administrator',
      reason: 'Pause the reviewed wait alert.',
      createdAt: new Date(),
    };
    const notice = await insert(
      'deliveryFounderEscalationNotice',
      noticeFields,
    );
    await runner.query(
      'UPDATE core."deliveryFounderEscalationRule" SET condition=\'TASK_REVIEW\',"minimumReviewWaitHours"=NULL,enabled=false WHERE id=$1 AND "workspaceId"=$2',
      [waitRule.id, workspaceIds[0]],
    );
    await rejects(
      'Changing/pausing a formerly used wait rule must preserve its immutable notice snapshot',
      () => migration.down(runner),
      'P0001',
    );
    await runner.query(
      'UPDATE core."deliveryFounderEscalationNotice" SET "ruleSnapshot"=$3::jsonb WHERE id=$1 AND "workspaceId"=$2',
      [
        notice.id,
        workspaceIds[0],
        JSON.stringify({ condition: 'TASK_REVIEW_WAIT', enabled: false }),
      ],
    );
    await rejects(
      'Historical WAIT condition alone prevents downgrade',
      () => migration.down(runner),
      'P0001',
    );
    await runner.query(
      'UPDATE core."deliveryFounderEscalationNotice" SET "ruleSnapshot"=$3::jsonb WHERE id=$1 AND "workspaceId"=$2',
      [
        notice.id,
        workspaceIds[0],
        JSON.stringify({
          condition: 'TASK_REVIEW',
          minimumReviewWaitHours: 1,
          enabled: false,
        }),
      ],
    );
    await rejects(
      'Historical configured wait hours alone prevent downgrade',
      () => migration.down(runner),
      'P0001',
    );
    await runner.query(
      'DELETE FROM core."deliveryFounderEscalationNotice" WHERE id=$1 AND "workspaceId"=$2',
      [notice.id, workspaceIds[0]],
    );
    await insert('deliveryFounderEscalationNotice', {
      ...noticeFields,
      id: randomUUID(),
      ruleId: legacyRule.id,
      commandId: randomUUID(),
      ruleSnapshot: {
        condition: 'TASK_REVIEW',
        minimumReviewWaitHours: null,
        enabled: false,
      },
    });
    await runner.query('SET CONSTRAINTS ALL IMMEDIATE');
    await migration.down(runner);
    assert(!(await installedParts()).some(Boolean));
    assert.deepEqual(await data(), originalData);
    assert.equal(
      await schema(false),
      oldSchema,
      'Every original column/check/index/enum/function remains after empty downgrade.',
    );
    await migration.up(runner);
    assert((await installedParts()).every(Boolean));
    assert.equal(
      await schema(false),
      addedSchema,
      'Re-up must restore the complete intended schema exactly.',
    );
    assert.deepEqual(await data(), originalData);
    assert.equal(await schema(), unrelatedSchema);
    if (installed) {
      assert.equal(await schema(false), originalSchema);
      assert.deepEqual(await data(false), originalFullData);
    } else {
      await migration.down(runner);
      assert.equal(await schema(false), originalSchema);
      assert.deepEqual(await data(false), originalFullData);
    }
    console.log(
      `Review queue migration rollback passed: ${baselineTables.length} protected tables, exact intended schema normalization, 4 workspace/task/version foreign keys, unique source/command/revision history, strict mode/reason/hash/wait bounds, and independent retained assignment/event/activity/primary-review-notice/rule/wait-snapshot downgrade guards.`,
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
