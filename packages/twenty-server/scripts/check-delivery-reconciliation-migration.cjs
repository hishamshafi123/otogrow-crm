const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  AddDeliveryReconciliationFastInstanceCommand,
} = require('../dist/database/commands/upgrade-version-command/2-34/2-34-instance-command-fast-1793102132820-add-delivery-reconciliation');

const TABLES = [
  'deliveryFinanceSource',
  'deliveryFinanceSettlement',
  'deliveryFinanceCashMatch',
];
const EXISTING_TABLES = [
  'deliveryFinancePlan',
  'deliveryFinanceEntry',
  'deliveryFinanceAllocation',
  'deliveryFinanceEvent',
  'deliveryOperations',
];
const fingerprint = (rows) =>
  createHash('sha256').update(JSON.stringify(rows)).digest('hex');

async function main() {
  assert.equal(
    process.argv.length,
    2,
    'This migration checker is rollback-only.',
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
    for (const table of EXISTING_TABLES)
      await runner.query(`LOCK TABLE core."${table}" IN SHARE MODE`);
    const previousData = async () =>
      Object.fromEntries(
        await Promise.all(
          EXISTING_TABLES.map(async (table) => [
            table,
            fingerprint(
              await runner.query(
                `SELECT to_jsonb(t)::text AS value FROM core."${table}" t ORDER BY id`,
              ),
            ),
          ]),
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
      installed.every(Boolean) || installed.every((value) => value === null),
      'Investigate a partially installed reconciliation schema.',
    );
    const originalData = await previousData();
    const originalSchema = await schema();
    const migration = new AddDeliveryReconciliationFastInstanceCommand();
    if (installed.every(Boolean)) await migration.down(runner);
    await migration.up(runner);
    for (const table of TABLES) assert(await exists(table));
    assert.deepEqual(await previousData(), originalData);
    assert.equal(
      await schema(),
      originalSchema,
      'Only the three new reconciliation tables may alter schema.',
    );
    const [{ indexes }] = await runner.query(
      "SELECT count(*)::int AS indexes FROM pg_indexes WHERE schemaname='core' AND tablename=ANY($1::text[]) AND indexname LIKE 'IDX_%'",
      [TABLES],
    );
    assert.equal(indexes, 5);
    const foreignKeys = await runner.query(
      "SELECT relation.relname AS table,pg_get_constraintdef(constraint_row.oid) AS definition FROM pg_constraint constraint_row JOIN pg_class relation ON relation.oid=constraint_row.conrelid JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace WHERE namespace.nspname='core' AND relation.relname=ANY($1::text[]) AND constraint_row.contype='f'",
      [TABLES],
    );
    assert.equal(foreignKeys.length, 8);
    assert(
      foreignKeys.some(
        (row) =>
          row.table === 'deliveryFinanceCashMatch' &&
          /FOREIGN KEY \("workspaceId", "entryId", bucket\).*deliveryFinanceAllocation/.test(
            row.definition,
          ),
      ),
      'Monthly matching must reference an actual allocation in the same workspace.',
    );
    const [existing] = await runner.query(
      'SELECT id,"workspaceCustomApplicationId" FROM core.workspace ORDER BY id LIMIT 1',
    );
    assert(existing);
    const workspaceId = randomUUID();
    const otherWorkspaceId = randomUUID();
    for (const id of [workspaceId, otherWorkspaceId])
      await runner.query(
        `INSERT INTO core.workspace (id,"displayName",subdomain,"activationStatus","workspaceCustomApplicationId") VALUES ($1,'Disposable reconciliation migration fixture',$2,'PENDING_CREATION',$3)`,
        [
          id,
          `reconciliation-migration-${id}`,
          existing.workspaceCustomApplicationId,
        ],
      );
    const actorId = randomUUID();
    const cashId = randomUUID();
    const receivableId = randomUUID();
    const entryId = randomUUID();
    const amount = '9007199254740000';
    const insertSource = async (fields = {}) =>
      runner.query(
        'INSERT INTO core."deliveryFinanceSource" (id,"workspaceId",kind,currency,"amountMicros",snapshot,"createdBy") VALUES ($1,$2,$3,\'USD\',$4,$5,$6) RETURNING *',
        [
          fields.id ?? randomUUID(),
          fields.workspaceId ?? workspaceId,
          fields.kind ?? 'CASH',
          fields.amountMicros ?? amount,
          { fixture: true, exactMicros: fields.amountMicros ?? amount },
          actorId,
        ],
      );
    const [source] = await insertSource({ id: cashId });
    await insertSource({ id: receivableId, kind: 'RECEIVABLE' });
    assert.equal(source.amountMicros, amount);
    assert.equal(source.snapshot.exactMicros, amount);
    assert(source.createdAt instanceof Date);
    assert.equal(source.requestHash, null);
    await runner.query(
      "INSERT INTO core.\"deliveryFinanceEntry\" (id,\"workspaceId\",month,kind,category,title,currency,\"amountMicros\",note,\"sourceType\",\"createdBy\") VALUES ($1,$2,'2020-02','REVENUE','Fixture','Disposable migration entry','USD',$3,'Fixture evidence','MANUAL',$4)",
      [entryId, workspaceId, '9223372036854775807', actorId],
    );
    await runner.query(
      'INSERT INTO core."deliveryFinanceAllocation" ("workspaceId","entryId",bucket,"amountMicros") VALUES ($1,$2,\'COMPANY\',$3)',
      [workspaceId, entryId, '9223372036854775807'],
    );
    const insertSettlement = (fields = {}) =>
      runner.query(
        'INSERT INTO core."deliveryFinanceSettlement" (id,"workspaceId","cashId","receivableId","cashTitle","targetTitle",currency,"amountMicros","requestHash","createdBy","createdByName") VALUES ($1,$2,$3,$4,\'Receipt\',\'Invoice\',\'USD\',$5,\'Fixture request\',$6,\'Fixture actor\') RETURNING *',
        [
          fields.id ?? randomUUID(),
          fields.workspaceId ?? workspaceId,
          fields.cashId ?? cashId,
          fields.receivableId ?? receivableId,
          fields.amountMicros ?? amount,
          actorId,
        ],
      );
    const insertMatch = (fields = {}) =>
      runner.query(
        'INSERT INTO core."deliveryFinanceCashMatch" (id,"workspaceId","cashId","entryId","cashTitle","targetTitle",currency,"amountMicros","requestHash","createdBy","createdByName",month,bucket,"projectId") VALUES ($1,$2,$3,$4,\'Receipt\',\'Monthly recognition\',\'USD\',$5,\'Fixture request\',$6,\'Fixture actor\',$7,$8,$9) RETURNING *',
        [
          fields.id ?? randomUUID(),
          fields.workspaceId ?? workspaceId,
          fields.cashId ?? cashId,
          fields.entryId ?? entryId,
          fields.amountMicros ?? '9223372036854775807',
          actorId,
          fields.month ?? '2020-02',
          fields.bucket ?? 'COMPANY',
          fields.projectId ?? null,
        ],
      );
    const [settlement] = await insertSettlement();
    const [match] = await insertMatch();
    for (const relation of [settlement, match]) {
      assert.equal(relation.revision, 1);
      assert.equal(relation.status, 'ACTIVE');
      assert.equal(relation.createdByName, 'Fixture actor');
      assert(relation.createdAt instanceof Date);
      assert.equal(relation.reversedAt, null);
    }
    assert.equal(settlement.amountMicros, amount);
    assert.equal(match.amountMicros, '9223372036854775807');
    let sequence = 0;
    const rejects = async (label, action, code = '23514') => {
      const savepoint = `reconciliation_check_${++sequence}`;
      await runner.query(`SAVEPOINT ${savepoint}`);
      try {
        await assert.rejects(action, (error) => error.code === code, label);
      } finally {
        await runner.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await runner.query(`RELEASE SAVEPOINT ${savepoint}`);
      }
    };
    for (const amountMicros of ['0', '-10000', '1'])
      await rejects(`Source money ${amountMicros}`, () =>
        insertSource({ amountMicros }),
      );
    await rejects('Source kind', () => insertSource({ kind: 'INVOICE' }));
    await rejects(
      'Source workspace',
      () => insertSource({ workspaceId: randomUUID() }),
      '23503',
    );
    await rejects(
      'Source bigint overflow',
      () => insertSource({ amountMicros: '9223372036854775808' }),
      '22003',
    );
    await rejects(
      'Source ID uniqueness',
      () => insertSource({ id: cashId }),
      '23505',
    );
    for (const amountMicros of ['0', '-10000', '1'])
      await rejects(`Settlement money ${amountMicros}`, () =>
        insertSettlement({ amountMicros }),
      );
    await rejects('Self settlement', () =>
      insertSettlement({ receivableId: cashId }),
    );
    await rejects(
      'Settlement same workspace cash',
      () => insertSettlement({ workspaceId: otherWorkspaceId }),
      '23503',
    );
    const otherCash = randomUUID();
    await insertSource({ id: otherCash, workspaceId: otherWorkspaceId });
    await rejects(
      'Settlement foreign cash',
      () => insertSettlement({ cashId: otherCash }),
      '23503',
    );
    await rejects(
      'Settlement foreign receivable',
      () => insertSettlement({ receivableId: otherCash }),
      '23503',
    );
    await rejects(
      'Missing cash',
      () => insertMatch({ cashId: randomUUID() }),
      '23503',
    );
    await rejects(
      'Match foreign cash',
      () => insertMatch({ cashId: otherCash }),
      '23503',
    );
    await rejects(
      'Match foreign workspace entry',
      () => insertMatch({ workspaceId: otherWorkspaceId, cashId: otherCash }),
      '23503',
    );
    await rejects(
      'Match missing entry',
      () => insertMatch({ entryId: randomUUID() }),
      '23503',
    );
    for (const amountMicros of ['0', '-1'])
      await rejects(`Match money ${amountMicros}`, () =>
        insertMatch({ amountMicros }),
      );
    await insertMatch({ amountMicros: '1' });
    await rejects(
      'Match bigint overflow',
      () => insertMatch({ amountMicros: '9223372036854775808' }),
      '22003',
    );
    for (const month of ['2020-13', '2020-1', '0000-01'])
      await rejects(`Match month ${month}`, () => insertMatch({ month }));
    await rejects('Bucket identity', () => insertMatch({ bucket: 'WRONG' }));
    const missingProject = randomUUID();
    await rejects(
      'Match must have an actual allocation bucket',
      () => insertMatch({ bucket: missingProject, projectId: missingProject }),
      '23503',
    );
    await rejects(
      'Matched allocation cannot disappear',
      () =>
        runner.query(
          'DELETE FROM core."deliveryFinanceAllocation" WHERE "workspaceId"=$1 AND "entryId"=$2 AND bucket=\'COMPANY\'',
          [workspaceId, entryId],
        ),
      '23503',
    );
    for (const [table, relation] of [
      ['deliveryFinanceSettlement', settlement],
      ['deliveryFinanceCashMatch', match],
    ]) {
      for (const [field, value] of [
        ['revision', 0],
        ['status', 'VOID'],
        ['status', 'REVERSED'],
      ])
        await rejects(`${table} ${field}=${value}`, () =>
          runner.query(`UPDATE core."${table}" SET "${field}"=$2 WHERE id=$1`, [
            relation.id,
            value,
          ]),
        );
      await rejects(`${table} missing reversal reason`, () =>
        runner.query(
          `UPDATE core."${table}" SET status='REVERSED',"reversedBy"=$2,"reversedAt"=now(),"reversalReason"='  ' WHERE id=$1`,
          [relation.id, actorId],
        ),
      );
      await rejects(`${table} null reversal reason`, () =>
        runner.query(
          `UPDATE core."${table}" SET status='REVERSED',"reversedBy"=$2,"reversedAt"=now(),"reversalReason"=NULL WHERE id=$1`,
          [relation.id, actorId],
        ),
      );
      await runner.query(
        `UPDATE core."${table}" SET status='REVERSED',revision=2,"reversedBy"=$2,"reversedByName"='Reviewing fixture actor',"reversedAt"=now(),"reversalReason"='Explicit correction evidence' WHERE id=$1`,
        [relation.id, actorId],
      );
      const [history] = await runner.query(
        `SELECT * FROM core."${table}" WHERE id=$1`,
        [relation.id],
      );
      assert.equal(history.createdByName, 'Fixture actor');
      assert.equal(history.reversedByName, 'Reviewing fixture actor');
      assert.equal(history.status, 'REVERSED');
      assert.equal(history.amountMicros, relation.amountMicros);
    }
    await rejects(
      'Cash source deletion preserves history',
      () =>
        runner.query('DELETE FROM core."deliveryFinanceSource" WHERE id=$1', [
          cashId,
        ]),
      '23503',
    );
    await runner.query('SET CONSTRAINTS ALL IMMEDIATE');
    // Protected finance fingerprints must exclude this checker's synthetic recognition row.
    await runner.query(
      'DELETE FROM core."deliveryFinanceCashMatch" WHERE "workspaceId"=$1',
      [workspaceId],
    );
    await runner.query(
      'DELETE FROM core."deliveryFinanceEntry" WHERE id=$1 AND "workspaceId"=$2',
      [entryId, workspaceId],
    );
    assert.deepEqual(await previousData(), originalData);
    assert.equal(await schema(), originalSchema);
    await migration.down(runner);
    for (const table of TABLES) assert.equal(await exists(table), null);
    assert.deepEqual(await previousData(), originalData);
    assert.equal(await schema(), originalSchema);
    console.log(
      'PASS reconciliation migration up/down: three tables, five indexes, eight FKs including workspace/allocation integrity, exact bigint/sub-cent matching, valid positive cent settlements, status/reversal attribution/history, RESTRICT source preservation, unchanged existing finance/Operations data and unrelated schema. Outer rollback restores original database.',
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
