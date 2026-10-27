const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  AddDeliveryFinanceFastInstanceCommand,
} = require('../dist/database/commands/upgrade-version-command/2-34/2-34-instance-command-fast-1793098333552-add-delivery-finance');
const TABLES = [
  'deliveryFinancePlan',
  'deliveryFinanceEntry',
  'deliveryFinanceAllocation',
  'deliveryFinanceEvent',
];
const fingerprint = (rows) =>
  createHash('sha256').update(JSON.stringify(rows)).digest('hex');
(async () => {
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
    'Only the local development database may be used.',
  );
  await connectionSource.initialize();
  const runner = connectionSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    await runner.query('LOCK TABLE core."deliveryOperations" IN SHARE MODE');
    const legacy = async () =>
      fingerprint(
        await runner.query(
          'SELECT id,"workspaceId",state::text FROM core."deliveryOperations" ORDER BY id',
        ),
      );
    const schema = async () =>
      fingerprint(
        await runner.query(
          `SELECT namespace.nspname AS schema,relation.relname AS relation,relation.relkind::text AS kind,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('name',attribute.attname,'type',pg_catalog.format_type(attribute.atttypid,attribute.atttypmod),'notNull',attribute.attnotnull,'default',pg_get_expr(definition.adbin,definition.adrelid)) ORDER BY attribute.attnum) FROM pg_attribute attribute LEFT JOIN pg_attrdef definition ON definition.adrelid=attribute.attrelid AND definition.adnum=attribute.attnum WHERE attribute.attrelid=relation.oid AND attribute.attnum>0 AND NOT attribute.attisdropped),'[]'::jsonb)::text AS columns,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('name',constraint_row.conname,'definition',pg_get_constraintdef(constraint_row.oid)) ORDER BY constraint_row.conname) FROM pg_constraint constraint_row WHERE constraint_row.conrelid=relation.oid),'[]'::jsonb)::text AS constraints,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('name',index_row.indexname,'definition',index_row.indexdef) ORDER BY index_row.indexname) FROM pg_indexes index_row WHERE index_row.schemaname=namespace.nspname AND index_row.tablename=relation.relname),'[]'::jsonb)::text AS indexes
      FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
      WHERE namespace.nspname NOT IN ('pg_catalog','information_schema') AND namespace.nspname NOT LIKE 'pg_toast%' AND relation.relkind IN ('r','p','v','m') AND NOT(namespace.nspname='core' AND relation.relname=ANY($1::text[])) ORDER BY namespace.nspname,relation.relname`,
          [TABLES],
        ),
      );
    const exists = async (table) =>
      (
        await runner.query('SELECT to_regclass($1) AS name', [
          `core."${table}"`,
        ])
      )[0].name;
    const installed = await Promise.all(TABLES.map(exists));
    assert(
      installed.every(Boolean) || installed.every((table) => table === null),
      'Partial finance schema must be investigated.',
    );
    const oldLegacy = await legacy(),
      oldSchema = await schema();
    const migration = new AddDeliveryFinanceFastInstanceCommand();
    // The outer rollback restores an installed schema and every pre-existing row.
    if (installed.every(Boolean)) await migration.down(runner);
    await migration.up(runner);
    for (const table of TABLES) assert(await exists(table));
    assert.equal(
      await schema(),
      oldSchema,
      'Only finance schema objects may change.',
    );
    const [{ indexes }] = await runner.query(
      "SELECT count(*)::int AS indexes FROM pg_indexes WHERE schemaname='core' AND tablename=ANY($1::text[]) AND indexname LIKE 'IDX_%'",
      [TABLES],
    );
    assert.equal(indexes, 7);
    const [{ foreignKeys }] = await runner.query(
      "SELECT count(*)::int AS \"foreignKeys\" FROM pg_constraint constraint_row JOIN pg_class relation ON relation.oid=constraint_row.conrelid JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace WHERE namespace.nspname='core' AND relation.relname=ANY($1::text[]) AND constraint_row.contype='f'",
      [TABLES],
    );
    assert.equal(foreignKeys, 5);
    const [{ id: workspaceId }] = await runner.query(
      'SELECT id FROM core.workspace ORDER BY id LIMIT 1',
    );
    const otherWorkspaceId = randomUUID();
    await runner.query(
      'INSERT INTO core.workspace (id,"displayName",subdomain,"activationStatus","workspaceCustomApplicationId") SELECT $1,\'Disposable finance migration fixture\',$2,\'PENDING_CREATION\',"workspaceCustomApplicationId" FROM core.workspace WHERE id=$3',
      [otherWorkspaceId, `finance-migration-${otherWorkspaceId}`, workspaceId],
    );
    const planId = randomUUID(),
      memberId = randomUUID(),
      entryId = randomUUID(),
      amount = '9007199254740993';
    const [plan] = await runner.query(
      'INSERT INTO core."deliveryFinancePlan" (id,"workspaceId",type,name,currency,"monthlyAmountMicros","memberId","startMonth","dueDay",active,"createdBy") VALUES ($1,$2,\'SALARY\',\'Disposable salary\',\'USD\',$3,$4,\'2026-10\',31,true,$4) RETURNING *',
      [planId, workspaceId, amount, memberId],
    );
    assert.equal(plan.revision, 1);
    assert.equal(plan.monthlyAmountMicros, amount);
    assert.equal(plan.dueDay, 31);
    assert(plan.createdAt instanceof Date && plan.updatedAt instanceof Date);
    const sourcePlan = {
      planId,
      revision: 1,
      type: 'SALARY',
      name: plan.name,
      memberId,
      memberName: 'Fixture',
      monthlyAmountMicros: amount,
      startMonth: '2026-10',
      endMonth: null,
      dueDay: 31,
    };
    const insertEntry = (values = {}) =>
      runner.query(
        'INSERT INTO core."deliveryFinanceEntry" (id,"workspaceId",month,kind,category,title,currency,"amountMicros",note,"sourceType","planId","sourcePlan","createdBy") VALUES ($1,$2,$3,$4,$5,\'Disposable entry\',\'USD\',$6,\'Fixture evidence\',$7,$8,$9,$10) RETURNING *',
        [
          values.id ?? randomUUID(),
          values.workspaceId ?? workspaceId,
          values.month ?? '2026-10',
          values.kind ?? 'COST',
          values.category ?? 'Custom category',
          values.amountMicros ?? amount,
          values.sourceType ?? 'PLAN',
          values.planId === undefined ? planId : values.planId,
          values.sourcePlan === undefined ? sourcePlan : values.sourcePlan,
          memberId,
        ],
      );
    const [entry] = await insertEntry({ id: entryId });
    assert.equal(entry.revision, 1);
    assert.equal(entry.status, 'DRAFT');
    assert.equal(entry.amountMicros, amount);
    assert.deepEqual(entry.sourcePlan, sourcePlan);
    assert(entry.createdAt instanceof Date && entry.updatedAt instanceof Date);
    assert.equal(entry.postedAt, null);
    assert.equal(entry.voidedAt, null);
    const insertAllocation = (values = {}) =>
      runner.query(
        'INSERT INTO core."deliveryFinanceAllocation" ("workspaceId","entryId",bucket,"projectId","amountMicros") VALUES ($1,$2,$3,$4,$5) RETURNING *',
        [
          values.workspaceId ?? workspaceId,
          values.entryId ?? entryId,
          values.bucket ?? 'COMPANY',
          values.projectId ?? null,
          values.amountMicros ?? amount,
        ],
      );
    const [allocation] = await insertAllocation();
    assert(allocation.id);
    assert.equal(allocation.amountMicros, amount);
    const [event] = await runner.query(
      'INSERT INTO core."deliveryFinanceEvent" ("workspaceId","sourceType","sourceId","actorId","actorName",action,revision,reason,"after") VALUES ($1,\'ENTRY\',$2,$3,\'Fixture\',\'FINANCE_ENTRY_SAVED\',1,\'Fixture reason\',$4) RETURNING *',
      [
        workspaceId,
        entryId,
        memberId,
        { amountMicros: amount, status: 'DRAFT' },
      ],
    );
    assert(event.id);
    assert(event.createdAt instanceof Date);
    assert.equal(event.before, null);
    assert.equal(event.after.amountMicros, amount);
    let sequence = 0;
    const rejects = async (label, action, code = '23514') => {
      const savepoint = `finance_check_${++sequence}`;
      await runner.query(`SAVEPOINT ${savepoint}`);
      try {
        await assert.rejects(action, (error) => error.code === code, label);
      } finally {
        await runner.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await runner.query(`RELEASE SAVEPOINT ${savepoint}`);
      }
    };
    for (const [field, value] of [
      ['monthlyAmountMicros', '-1'],
      ['revision', 0],
      ['dueDay', 0],
      ['dueDay', 32],
      ['type', 'BONUS'],
      ['startMonth', '2026-13'],
      ['startMonth', '0000-01'],
      ['startMonth', '2026-1'],
      ['endMonth', '2026-09'],
      ['endMonth', '2026-00'],
      ['endMonth', '0000-12'],
      ['memberId', null],
    ])
      await rejects(`Plan ${field}=${value}`, () =>
        runner.query(
          `UPDATE core."deliveryFinancePlan" SET "${field}"=$2 WHERE id=$1`,
          [planId, value],
        ),
      );
    await rejects(
      'Plan workspace FK',
      () =>
        runner.query(
          'UPDATE core."deliveryFinancePlan" SET "workspaceId"=$2 WHERE id=$1',
          [planId, randomUUID()],
        ),
      '23503',
    );
    for (const [field, value] of [
      ['amountMicros', '-1'],
      ['revision', 0],
      ['month', '2026-13'],
      ['month', '0000-01'],
      ['month', '2026-1'],
      ['kind', 'EXPENSE'],
      ['status', 'PAID'],
      ['status', 'POSTED'],
      ['status', 'VOID'],
      ['sourceType', 'CASH'],
      ['planId', null],
      ['sourcePlan', null],
    ])
      await rejects(`Entry ${field}=${value}`, () =>
        runner.query(
          `UPDATE core."deliveryFinanceEntry" SET "${field}"=$2 WHERE id=$1`,
          [entryId, value],
        ),
      );
    await rejects('Missing void reason', () =>
      runner.query(
        'UPDATE core."deliveryFinanceEntry" SET status=\'VOID\',"voidedAt"=now(),"voidedBy"=$2,"voidReason"=\'   \' WHERE id=$1',
        [entryId, memberId],
      ),
    );
    await rejects('Unique plan/month', () => insertEntry(), '23505');
    await insertEntry({ month: '2026-11' });
    await insertEntry({
      sourceType: 'MANUAL',
      planId: null,
      sourcePlan: null,
      amountMicros: '0',
    });
    await insertEntry({
      sourceType: 'MANUAL',
      planId: null,
      sourcePlan: null,
      amountMicros: '0',
    });
    await rejects('Negative allocation', () =>
      insertAllocation({ amountMicros: '-1' }),
    );
    await rejects(
      'Company bucket uniqueness',
      () => insertAllocation(),
      '23505',
    );
    await rejects('Bucket identity', () =>
      insertAllocation({ bucket: 'WRONG' }),
    );
    const projectId = randomUUID();
    await insertAllocation({ projectId, bucket: projectId, amountMicros: '0' });
    await rejects(
      'Project bucket uniqueness',
      () => insertAllocation({ projectId, bucket: projectId }),
      '23505',
    );
    await rejects(
      'Composite workspace-entry FK',
      () => insertAllocation({ workspaceId: otherWorkspaceId }),
      '23503',
    );
    await rejects(
      'Missing entry FK',
      () => insertAllocation({ entryId: randomUUID() }),
      '23503',
    );
    await runner.query(
      'UPDATE core."deliveryFinanceEntry" SET status=\'POSTED\',"postedAt"=now(),"postedBy"=$2 WHERE id=$1',
      [entryId, memberId],
    );
    await runner.query(
      'UPDATE core."deliveryFinanceEntry" SET status=\'VOID\',"voidedAt"=now(),"voidedBy"=$2,"voidReason"=\'Retain original evidence\' WHERE id=$1',
      [entryId, memberId],
    );
    assert.deepEqual(
      (
        await runner.query(
          'SELECT "sourcePlan" FROM core."deliveryFinanceEntry" WHERE id=$1',
          [entryId],
        )
      )[0].sourcePlan,
      sourcePlan,
    );
    await runner.query('DELETE FROM core."deliveryFinanceEntry" WHERE id=$1', [
      entryId,
    ]);
    assert.equal(
      (
        await runner.query(
          'SELECT count(*)::int AS count FROM core."deliveryFinanceAllocation" WHERE "entryId"=$1',
          [entryId],
        )
      )[0].count,
      0,
    );
    assert.equal(await legacy(), oldLegacy);
    assert.equal(await schema(), oldSchema);
    await runner.query('SET CONSTRAINTS ALL IMMEDIATE');
    await migration.down(runner);
    for (const table of TABLES) assert.equal(await exists(table), null);
    assert.equal(await legacy(), oldLegacy);
    assert.equal(await schema(), oldSchema);
    console.log(
      'PASS finance migration up/down: 4 tables/7 indexes/5 FKs, defaults, exact large money, due31/ranges/month/type/status/nonnegative checks, source preservation, unique plan-month and buckets, composite workspace-entry FK/cascade, unchanged legacy operations and unrelated schema. Outer rollback restores original database.',
    );
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
    await connectionSource.destroy();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
