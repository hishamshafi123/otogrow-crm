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
  /^2-34-instance-command-fast-\d+-add-delivery-finance-forecast\.js$/.test(
    file,
  ),
);
assert.equal(
  files.length,
  1,
  'Build the single generated forecast migration first.',
);
const { AddDeliveryFinanceForecastFastInstanceCommand } = require(
  join(DIRECTORY, files[0]),
);
const TABLES = [
  'deliveryFinanceForecastAnchor',
  'deliveryFinanceForecastItem',
  'deliveryFinanceForecastRealization',
];
const PLAN_INDEX = 'IDX_d39da878eb67253f778647300d';
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
    const installedParts = async () => {
      const rows = await runner.query(
        "SELECT name,to_regclass(format('core.%I',name)) IS NOT NULL AS present FROM unnest($1::text[]) name ORDER BY name",
        [TABLES],
      );
      return rows.map((row) => row.present);
    };
    const planIndexUnique = async () => {
      const [row] = await runner.query(
        'SELECT index_row.indisunique AS "unique" FROM pg_index index_row JOIN pg_class relation ON relation.oid=index_row.indexrelid JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace WHERE namespace.nspname=\'core\' AND relation.relname=$1',
        [PLAN_INDEX],
      );
      assert(row, 'The existing workspace/plan index must exist.');
      return row.unique;
    };
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
        `SELECT namespace.nspname AS schema,relation.relname AS relation,relation.relkind::text AS kind,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('name',attribute.attname,'type',pg_catalog.format_type(attribute.atttypid,attribute.atttypmod),'required',attribute.attnotnull,'default',pg_get_expr(definition.adbin,definition.adrelid)) ORDER BY attribute.attnum) FROM pg_attribute attribute LEFT JOIN pg_attrdef definition ON definition.adrelid=attribute.attrelid AND definition.adnum=attribute.attnum WHERE attribute.attrelid=relation.oid AND attribute.attnum>0 AND NOT attribute.attisdropped),'[]'::jsonb)::text AS columns,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('name',constraint_row.conname,'definition',pg_get_constraintdef(constraint_row.oid)) ORDER BY constraint_row.conname) FROM pg_constraint constraint_row WHERE constraint_row.conrelid=relation.oid),'[]'::jsonb)::text AS constraints,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('name',index_row.indexname,'definition',index_row.indexdef) ORDER BY index_row.indexname) FROM pg_indexes index_row WHERE index_row.schemaname=namespace.nspname AND index_row.tablename=relation.relname AND NOT($1 AND namespace.nspname='core' AND relation.relname='deliveryFinancePlan' AND index_row.indexname=$3)),'[]'::jsonb)::text AS indexes,
        COALESCE((SELECT jsonb_agg(pg_get_triggerdef(trigger_row.oid,true) ORDER BY trigger_row.tgname) FROM pg_trigger trigger_row WHERE trigger_row.tgrelid=relation.oid AND NOT trigger_row.tgisinternal),'[]'::jsonb)::text AS triggers,
        CASE WHEN relation.relkind IN ('v','m') THEN pg_get_viewdef(relation.oid,true) ELSE NULL END AS view
        FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace WHERE namespace.nspname NOT IN ('pg_catalog','information_schema') AND namespace.nspname NOT LIKE 'pg_toast%' AND relation.relkind IN ('r','p','v','m') AND NOT($1 AND namespace.nspname='core' AND relation.relname=ANY($2::text[])) ORDER BY namespace.nspname,relation.relname`,
        [excludeIntended, TABLES, PLAN_INDEX],
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
      'Investigate partial forecast schema installation.',
    );
    const installed = parts.every(Boolean);
    assert.equal(
      await planIndexUnique(),
      installed,
      'Plan workspace/id index must agree with forecast installation.',
    );
    if (installed)
      for (const table of TABLES)
        await runner.query(`LOCK TABLE core."${table}" IN SHARE MODE`);
    const originalData = await data();
    const originalSchema = await schema(false);
    const unrelatedSchema = await schema();
    const migration = new AddDeliveryFinanceForecastFastInstanceCommand();
    let savepointSequence = 0;
    const rejects = async (label, operation, code = '23514') => {
      const savepoint = `forecast_migration_${++savepointSequence}`;
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
        'SELECT (SELECT count(*) FROM core."deliveryFinanceForecastAnchor")+(SELECT count(*) FROM core."deliveryFinanceForecastItem")+(SELECT count(*) FROM core."deliveryFinanceForecastRealization")+(SELECT count(*) FROM core."deliveryFinanceEvent" WHERE "sourceType" IN (\'FORECAST_ANCHOR\',\'FORECAST_ITEM\',\'FORECAST_REALIZATION\')) AS count',
      );
      if (BigInt(count) > 0n) {
        await rejects(
          'Existing forecast state/history prevents downgrade',
          () => migration.down(runner),
          'P0001',
        );
        assert.fail(
          'Existing forecast history correctly blocks downgrade; never remove it to run this full-cycle checker.',
        );
      }
      await migration.down(runner);
    }
    assert(!(await installedParts()).some(Boolean));
    assert.equal(await planIndexUnique(), false);
    const oldSchema = await schema(false);
    await migration.up(runner);
    assert((await installedParts()).every(Boolean));
    assert.equal(await planIndexUnique(), true);
    assert.deepEqual(await data(), originalData);
    assert.equal(
      await schema(),
      unrelatedSchema,
      'Only three new tables and the existing plan index uniqueness may change.',
    );
    if (installed) assert.equal(await schema(false), originalSchema);
    const foreignKeys = await runner.query(
      "SELECT relation.relname AS \"table\",pg_get_constraintdef(constraint_row.oid) AS definition FROM pg_constraint constraint_row JOIN pg_class relation ON relation.oid=constraint_row.conrelid JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace WHERE namespace.nspname='core' AND relation.relname=ANY($1::text[]) AND constraint_row.contype='f' ORDER BY relation.relname,constraint_row.conname",
      [TABLES],
    );
    assert.equal(foreignKeys.length, 7);
    for (const table of TABLES)
      assert(
        foreignKeys.some(
          (row) =>
            row.table === table &&
            /FOREIGN KEY \("workspaceId"\).*workspace.*ON DELETE CASCADE/.test(
              row.definition,
            ),
        ),
        `Missing workspace FK for ${table}`,
      );
    for (const [table, expression] of [
      [
        'deliveryFinanceForecastItem',
        /FOREIGN KEY \("workspaceId", "receivableId"\).*deliveryFinanceSource.*ON DELETE RESTRICT/,
      ],
      [
        'deliveryFinanceForecastItem',
        /FOREIGN KEY \("workspaceId", "planId"\).*deliveryFinancePlan.*ON DELETE RESTRICT/,
      ],
      [
        'deliveryFinanceForecastRealization',
        /FOREIGN KEY \("workspaceId", "cashId"\).*deliveryFinanceSource.*ON DELETE RESTRICT/,
      ],
      [
        'deliveryFinanceForecastRealization',
        /FOREIGN KEY \("workspaceId", "itemId"\).*deliveryFinanceForecastItem.*ON DELETE RESTRICT/,
      ],
    ])
      assert(
        foreignKeys.some(
          (row) => row.table === table && expression.test(row.definition),
        ),
        `Missing composite boundary: ${expression}`,
      );
    const [template] = await runner.query(
      'SELECT "workspaceCustomApplicationId" FROM core.workspace ORDER BY id LIMIT 1',
    );
    assert(template);
    for (const workspaceId of workspaceIds)
      await runner.query(
        'INSERT INTO core.workspace (id,"displayName",subdomain,"activationStatus","workspaceCustomApplicationId") VALUES ($1,\'Disposable forecast migration fixture\',$2,\'PENDING_CREATION\',$3)',
        [
          workspaceId,
          `forecast-migration-${workspaceId}`,
          template.workspaceCustomApplicationId,
        ],
      );
    const sourceIds = workspaceIds.map(() => ({
      cash: randomUUID(),
      invoice: randomUUID(),
    }));
    const planIds = workspaceIds.map(() => randomUUID());
    for (let index = 0; index < workspaceIds.length; index++) {
      for (const kind of ['cash', 'invoice'])
        await runner.query(
          'INSERT INTO core."deliveryFinanceSource" (id,"workspaceId",kind,currency,"amountMicros",snapshot,"requestHash","createdBy") VALUES ($1,$2,$3,\'USD\',1000000,$4,NULL,$5)',
          [
            sourceIds[index][kind],
            workspaceIds[index],
            kind === 'cash' ? 'CASH' : 'RECEIVABLE',
            {
              id: sourceIds[index][kind],
              title: 'Disposable forecast source',
              currency: 'USD',
              amountMicros: '1000000',
              date: '2020-02-01',
            },
            actorId,
          ],
        );
      await runner.query(
        'INSERT INTO core."deliveryFinancePlan" (id,"workspaceId",revision,type,name,currency,"monthlyAmountMicros","memberId","memberName","startMonth","endMonth","dueDay",active,"createdBy") VALUES ($1,$2,1,\'OVERHEAD\',\'Disposable forecast plan\',\'USD\',0,NULL,NULL,\'2020-01\',NULL,31,true,$3)',
        [planIds[index], workspaceIds[index], actorId],
      );
    }
    const insertAnchor = (fields = {}) =>
      runner.query(
        'INSERT INTO core."deliveryFinanceForecastAnchor" (id,"workspaceId",currency,"amountMicros","closingDate",timezone,revision,note,"evidenceUrl","changedBy","changedByName") VALUES ($1,$2,$3,$4,\'2020-02-01\',\'UTC\',$5,$6,NULL,$7,\'Synthetic reviewer\') RETURNING *',
        [
          fields.id ?? randomUUID(),
          fields.workspaceId ?? workspaceIds[0],
          fields.currency ?? 'USD',
          fields.amountMicros ?? '0',
          fields.revision ?? 1,
          fields.note ?? 'Disposable reviewed closing balance',
          actorId,
        ],
      );
    const insertItem = (fields = {}) =>
      runner.query(
        'INSERT INTO core."deliveryFinanceForecastItem" (id,"workspaceId",revision,status,kind,"sourceType","receivableId","planId","planMonth",currency,title,"amountMicros","expectedDate","ownerId","ownerName","nextActionDate",note,"sourceToken","sourceSnapshot","createdBy","changedBy","changedByName") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,\'USD\',\'Disposable forecast expectation\',$10,\'2020-02-03\',$11,\'Synthetic owner\',\'2020-02-02\',\'Disposable follow-up\',NULL,NULL,$11,$11,\'Synthetic reviewer\') RETURNING *',
        [
          fields.id ?? randomUUID(),
          fields.workspaceId ?? workspaceIds[0],
          fields.revision ?? 1,
          fields.status ?? 'ACTIVE',
          fields.kind ?? 'OUTFLOW',
          fields.sourceType ?? 'MANUAL',
          fields.receivableId ?? null,
          fields.planId ?? null,
          fields.planMonth ?? null,
          fields.amountMicros ?? '1000000',
          actorId,
        ],
      );
    const [localItem] = await insertItem();
    const [foreignItem] = await insertItem({ workspaceId: workspaceIds[1] });
    const insertRealization = (fields = {}) =>
      runner.query(
        'INSERT INTO core."deliveryFinanceForecastRealization" (id,"workspaceId",revision,"cashId","cashTitle","targetTitle",currency,"amountMicros",status,"projectId","projectName","requestHash","createdBy","createdByName","reversedBy","reversedByName","reversedAt","reversalReason","itemId",note) VALUES ($1,$2,$3,$4,\'Disposable cash\',\'Disposable expectation\',\'USD\',$5,$6,NULL,NULL,$7,$8,\'Synthetic reviewer\',$9,$10,$11,$12,$13,\'Disposable application note\') RETURNING *',
        [
          fields.id ?? randomUUID(),
          fields.workspaceId ?? workspaceIds[0],
          fields.revision ?? 1,
          fields.cashId ?? sourceIds[0].cash,
          fields.amountMicros ?? '1',
          fields.status ?? 'ACTIVE',
          'a'.repeat(64),
          actorId,
          fields.reversedBy ?? null,
          fields.reversedByName ?? null,
          fields.reversedAt ?? null,
          fields.reversalReason ?? null,
          fields.itemId ?? localItem.id,
        ],
      );
    const [anchor] = await insertAnchor();
    assert.equal(anchor.amountMicros, '0');
    assert.equal(anchor.revision, 1);
    assert(anchor.changedAt instanceof Date);
    await insertAnchor({
      currency: 'EUR',
      amountMicros: '-9223372036854775808',
    });
    await insertAnchor({
      currency: 'GBP',
      amountMicros: '9223372036854775807',
    });
    await insertAnchor({ workspaceId: workspaceIds[1], amountMicros: '-1' });
    await rejects(
      'One reviewed anchor per workspace/currency',
      () => insertAnchor(),
      '23505',
    );
    await rejects(
      'Anchor signed lower bigint bound',
      () =>
        insertAnchor({ currency: 'AUD', amountMicros: '-9223372036854775809' }),
      '22003',
    );
    await rejects(
      'Anchor signed upper bigint bound',
      () =>
        insertAnchor({ currency: 'AUD', amountMicros: '9223372036854775808' }),
      '22003',
    );
    await rejects('Anchor revision is positive', () =>
      insertAnchor({ currency: 'AUD', revision: 0 }),
    );
    await rejects('Anchor source note is not blank', () =>
      insertAnchor({ currency: 'AUD', note: '  ' }),
    );
    await rejects(
      'Anchor workspace must exist',
      () => insertAnchor({ workspaceId: randomUUID() }),
      '23503',
    );
    await insertItem({ amountMicros: '0' });
    await insertItem({ amountMicros: '9223372036854775807' });
    await rejects('Expected outflows are nonnegative', () =>
      insertItem({ amountMicros: '-1' }),
    );
    await rejects(
      'Expected amount bigint upper bound',
      () => insertItem({ amountMicros: '9223372036854775808' }),
      '22003',
    );
    await rejects('Expected revision is positive', () =>
      insertItem({ revision: 0 }),
    );
    await rejects('Expected states are finite', () =>
      insertItem({ status: 'POSTED' }),
    );
    await rejects('Manual outflow cannot claim an invoice', () =>
      insertItem({ receivableId: sourceIds[0].invoice }),
    );
    await rejects('Manual outflow cannot claim a plan', () =>
      insertItem({ planId: planIds[0], planMonth: '2020-02' }),
    );
    await rejects(
      'Manual outflow cannot retain an unexplained plan month',
      () => insertItem({ planMonth: '2020-02' }),
    );
    await rejects('Manual source cannot invent a collection', () =>
      insertItem({ kind: 'COLLECTION' }),
    );
    await rejects('Collection must identify an invoice', () =>
      insertItem({ kind: 'COLLECTION', sourceType: 'RECEIVABLE' }),
    );
    await rejects('Plan occurrence must identify a month', () =>
      insertItem({ sourceType: 'PLAN', planId: planIds[0] }),
    );
    await rejects('Plan occurrence month is valid', () =>
      insertItem({
        sourceType: 'PLAN',
        planId: planIds[0],
        planMonth: '2020-13',
      }),
    );
    await rejects('Plan occurrence cannot use year zero', () =>
      insertItem({
        sourceType: 'PLAN',
        planId: planIds[0],
        planMonth: '0000-01',
      }),
    );
    await rejects(
      'Expectation workspace must exist',
      () => insertItem({ workspaceId: randomUUID() }),
      '23503',
    );
    await rejects(
      'Invoice relation cannot cross workspace',
      () =>
        insertItem({
          kind: 'COLLECTION',
          sourceType: 'RECEIVABLE',
          receivableId: sourceIds[1].invoice,
        }),
      '23503',
    );
    await rejects(
      'Plan relation cannot cross workspace',
      () =>
        insertItem({
          sourceType: 'PLAN',
          planId: planIds[1],
          planMonth: '2020-02',
        }),
      '23503',
    );
    await insertItem({
      kind: 'COLLECTION',
      sourceType: 'RECEIVABLE',
      receivableId: sourceIds[0].invoice,
      status: 'CANCELLED',
    });
    await rejects(
      'Cancelled invoice occurrence still owns unique source',
      () =>
        insertItem({
          kind: 'COLLECTION',
          sourceType: 'RECEIVABLE',
          receivableId: sourceIds[0].invoice,
        }),
      '23505',
    );
    await insertItem({
      sourceType: 'PLAN',
      planId: planIds[0],
      planMonth: '2020-02',
      status: 'CANCELLED',
    });
    await rejects(
      'Cancelled plan-month still owns unique occurrence',
      () =>
        insertItem({
          sourceType: 'PLAN',
          planId: planIds[0],
          planMonth: '2020-02',
        }),
      '23505',
    );
    await insertItem({
      sourceType: 'PLAN',
      planId: planIds[0],
      planMonth: '2020-03',
    });
    const [realization] = await insertRealization();
    assert.equal(
      realization.amountMicros,
      '1',
      'Subcent realized micros stay exact.',
    );
    assert.equal(realization.status, 'ACTIVE');
    assert(realization.createdAt instanceof Date);
    await rejects(
      'Application workspace must exist',
      () => insertRealization({ workspaceId: randomUUID() }),
      '23503',
    );
    await rejects(
      'Application cash cannot cross workspace',
      () => insertRealization({ cashId: sourceIds[1].cash }),
      '23503',
    );
    await rejects(
      'Application item cannot cross workspace',
      () => insertRealization({ itemId: foreignItem.id }),
      '23503',
    );
    await rejects('Application must be positive', () =>
      insertRealization({ amountMicros: '0' }),
    );
    await rejects('Application cannot be negative', () =>
      insertRealization({ amountMicros: '-1' }),
    );
    await rejects(
      'Application bigint upper bound',
      () => insertRealization({ amountMicros: '9223372036854775808' }),
      '22003',
    );
    await rejects('Application revision is positive', () =>
      insertRealization({ revision: 0 }),
    );
    await rejects('Application state is finite', () =>
      insertRealization({ status: 'VOID' }),
    );
    await rejects('Reversal requires reason and actor/time proof', () =>
      insertRealization({ status: 'REVERSED' }),
    );
    await rejects('Reversal proof reason cannot be blank', () =>
      insertRealization({
        status: 'REVERSED',
        reversedBy: actorId,
        reversedByName: 'Synthetic reviewer',
        reversedAt: new Date(),
        reversalReason: ' ',
      }),
    );
    await insertRealization({
      revision: 2,
      status: 'REVERSED',
      reversedBy: actorId,
      reversedByName: 'Synthetic reviewer',
      reversedAt: new Date(),
      reversalReason: 'Disposable reversal evidence',
    });
    await rejects(
      'Applied actual source cannot be deleted',
      () =>
        runner.query(
          'DELETE FROM core."deliveryFinanceSource" WHERE "workspaceId"=$1 AND id=$2',
          [workspaceIds[0], sourceIds[0].cash],
        ),
      '23503',
    );
    await rejects(
      'Applied expected item cannot be deleted',
      () =>
        runner.query(
          'DELETE FROM core."deliveryFinanceForecastItem" WHERE "workspaceId"=$1 AND id=$2',
          [workspaceIds[0], localItem.id],
        ),
      '23503',
    );
    await rejects(
      'Claimed invoice source cannot be deleted',
      () =>
        runner.query(
          'DELETE FROM core."deliveryFinanceSource" WHERE "workspaceId"=$1 AND id=$2',
          [workspaceIds[0], sourceIds[0].invoice],
        ),
      '23503',
    );
    await rejects(
      'Claimed plan cannot be deleted',
      () =>
        runner.query(
          'DELETE FROM core."deliveryFinancePlan" WHERE "workspaceId"=$1 AND id=$2',
          [workspaceIds[0], planIds[0]],
        ),
      '23503',
    );
    await rejects(
      'Any forecast state prevents destructive downgrade',
      () => migration.down(runner),
      'P0001',
    );
    await runner.query(
      'DELETE FROM core."deliveryFinanceForecastRealization" WHERE "workspaceId"=ANY($1::uuid[])',
      [workspaceIds],
    );
    await runner.query(
      'DELETE FROM core."deliveryFinanceForecastItem" WHERE "workspaceId"=ANY($1::uuid[])',
      [workspaceIds],
    );
    await rejects(
      'Anchor-only state prevents destructive downgrade',
      () => migration.down(runner),
      'P0001',
    );
    await runner.query(
      'DELETE FROM core."deliveryFinanceForecastAnchor" WHERE "workspaceId"=ANY($1::uuid[])',
      [workspaceIds],
    );
    const [historyItem] = await insertItem();
    await rejects(
      'Item-only state prevents destructive downgrade',
      () => migration.down(runner),
      'P0001',
    );
    await runner.query(
      'DELETE FROM core."deliveryFinanceForecastItem" WHERE id=$1 AND "workspaceId"=$2',
      [historyItem.id, workspaceIds[0]],
    );
    for (const sourceType of [
      'FORECAST_ANCHOR',
      'FORECAST_ITEM',
      'FORECAST_REALIZATION',
    ]) {
      const eventId = randomUUID();
      await runner.query(
        'INSERT INTO core."deliveryFinanceEvent" (id,"workspaceId","sourceType","sourceId","actorId","actorName",action,revision,reason,"before","after") VALUES ($1,$2,$3,$4,$5,\'Synthetic reviewer\',\'SYNTHETIC_REVIEW\',1,\'Disposable historic evidence\',NULL,$6)',
        [
          eventId,
          workspaceIds[0],
          sourceType,
          randomUUID(),
          actorId,
          { currency: 'USD', amountMicros: '0' },
        ],
      );
      await rejects(
        `${sourceType} history alone prevents downgrade after all current rows are removed`,
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
    assert.equal(
      await planIndexUnique(),
      false,
      'Downgrade restores the exact original nonunique plan index.',
    );
    assert.deepEqual(await data(), originalData);
    assert.equal(await schema(false), oldSchema);
    await migration.up(runner);
    assert((await installedParts()).every(Boolean));
    assert.equal(await planIndexUnique(), true);
    assert.deepEqual(await data(), originalData);
    assert.equal(await schema(), unrelatedSchema);
    if (installed) assert.equal(await schema(false), originalSchema);
    else {
      await migration.down(runner);
      assert.equal(await schema(false), originalSchema);
    }
    console.log(
      'PASS rollback-only cash-forecast migration: three tables and exact plan-index transition, seven workspace-safe FKs, signed/zero/exact amount bounds, source identities and permanent invoice/plan-month uniqueness, positive applications and reversal proof, row/history-preserving downgrade, unchanged preexisting data and unrelated schema. Outer rollback restores original installation.',
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
