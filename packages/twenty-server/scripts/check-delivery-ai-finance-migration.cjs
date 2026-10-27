const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');
const {
  AddDeliveryAiFinanceFastInstanceCommand,
} = require('../dist/database/commands/upgrade-version-command/2-34/2-34-instance-command-fast-1793133548966-add-delivery-ai-finance');

const CLAIM = 'deliveryFinanceAiClaim';
const SPEND_INDEX = 'IDX_4b5c1e09b9da95620baf0fddc2';
const SOURCE_CHECKS = [
  'CHK_60b25b3109b9eb0814862b4df7',
  'CHK_84dd5db10c39e082e1486c35d9',
  'CHK_4baad4b2ae804be240d2b7d4ea',
  'CHK_3199c264563bbcfe130790a24c',
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
    'This checker always rolls back its migration and fixtures.',
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
    for (const table of DATA_TABLES)
      await runner.query(`LOCK TABLE core."${table}" IN SHARE MODE`);
    const workspaceId = randomUUID();
    const foreignWorkspaceId = randomUUID();
    const actorId = randomUUID();
    const workspaceIds = [workspaceId, foreignWorkspaceId];
    const installedParts = async () => {
      const [value] = await runner.query(
        "SELECT to_regclass('core.\"deliveryFinanceAiClaim\"') IS NOT NULL AS claim,EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='core' AND table_name='deliveryFinanceEntry' AND column_name='sourceAiSpend') AS column,to_regclass($1) IS NOT NULL AS index",
        [`core."${SPEND_INDEX}"`],
      );
      return Object.values(value);
    };
    const data = async () => {
      const result = {};
      for (const table of DATA_TABLES) {
        // Adding a nullable JSONB column must not make unchanged legacy rows look different.
        const projection =
          table === 'deliveryFinanceEntry'
            ? "(CASE WHEN to_jsonb(fixture_row)->'sourceAiSpend' IS NULL OR to_jsonb(fixture_row)->'sourceAiSpend'='null'::jsonb THEN to_jsonb(fixture_row)-'sourceAiSpend' ELSE to_jsonb(fixture_row) END)::text"
            : 'to_jsonb(fixture_row)::text';
        result[table] = fingerprint(
          await runner.query(
            `SELECT ${projection} AS value FROM core."${table}" fixture_row WHERE "${table === 'workspace' ? 'id' : 'workspaceId'}"<>ALL($1::uuid[]) ORDER BY id`,
            [workspaceIds],
          ),
        );
      }
      return result;
    };
    const schema = async (excludeIntended = true) => {
      const relations = await runner.query(
        `SELECT namespace.nspname AS schema,relation.relname AS relation,relation.relkind::text AS kind,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('name',attribute.attname,'type',pg_catalog.format_type(attribute.atttypid,attribute.atttypmod),'notNull',attribute.attnotnull,'default',pg_get_expr(definition.adbin,definition.adrelid)) ORDER BY attribute.attnum) FROM pg_attribute attribute LEFT JOIN pg_attrdef definition ON definition.adrelid=attribute.attrelid AND definition.adnum=attribute.attnum WHERE attribute.attrelid=relation.oid AND attribute.attnum>0 AND NOT attribute.attisdropped AND NOT($1 AND namespace.nspname='core' AND relation.relname='deliveryFinanceEntry' AND attribute.attname='sourceAiSpend')),'[]'::jsonb)::text AS columns,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('name',constraint_row.conname,'definition',pg_get_constraintdef(constraint_row.oid)) ORDER BY constraint_row.conname) FROM pg_constraint constraint_row WHERE constraint_row.conrelid=relation.oid AND NOT($1 AND namespace.nspname='core' AND relation.relname='deliveryFinanceEntry' AND constraint_row.conname=ANY($2::text[]))),'[]'::jsonb)::text AS constraints,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('name',index_row.indexname,'definition',index_row.indexdef) ORDER BY index_row.indexname) FROM pg_indexes index_row WHERE index_row.schemaname=namespace.nspname AND index_row.tablename=relation.relname AND NOT($1 AND namespace.nspname='core' AND relation.relname='otogrowAiSpend' AND index_row.indexname=$3)),'[]'::jsonb)::text AS indexes,
        CASE WHEN relation.relkind IN ('v','m') THEN pg_get_viewdef(relation.oid,true) ELSE NULL END AS view,
        COALESCE((SELECT jsonb_agg(pg_get_triggerdef(trigger_row.oid,true) ORDER BY trigger_row.tgname) FROM pg_trigger trigger_row WHERE trigger_row.tgrelid=relation.oid AND NOT trigger_row.tgisinternal),'[]'::jsonb)::text AS triggers
        FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
        WHERE namespace.nspname NOT IN ('pg_catalog','information_schema') AND namespace.nspname NOT LIKE 'pg_toast%' AND relation.relkind IN ('r','p','v','m') AND NOT($1 AND namespace.nspname='core' AND relation.relname=$4) ORDER BY namespace.nspname,relation.relname`,
        [excludeIntended, SOURCE_CHECKS, SPEND_INDEX, CLAIM],
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
      'Investigate partially installed AI finance schema.',
    );
    const installed = parts.every(Boolean);
    const originalData = await data();
    const unrelatedSchema = await schema();
    const originalFullSchema = await schema(false);
    const migration = new AddDeliveryAiFinanceFastInstanceCommand();
    let savepointSequence = 0;
    const rejects = async (label, operation, code = '23514') => {
      const savepoint = `ai_migration_${++savepointSequence}`;
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
        'SELECT (SELECT count(*) FROM core."deliveryFinanceAiClaim")+(SELECT count(*) FROM core."deliveryFinanceEntry" WHERE "sourceType"=\'AI_SPEND\') AS count',
      );
      if (BigInt(count) > 0n) {
        await rejects(
          'Existing AI history must prevent downgrade',
          () => migration.down(runner),
          'P0001',
        );
        assert.fail(
          'Existing AI accounting history correctly blocks downgrade; do not remove real history to run this full-cycle checker.',
        );
      }
      await migration.down(runner);
    }
    const oldFullSchema = await schema(false);
    await migration.up(runner);
    assert((await installedParts()).every(Boolean));
    assert.deepEqual(await data(), originalData);
    assert.equal(
      await schema(),
      unrelatedSchema,
      'Only claim/source-column/source-check/ledger-index changes are allowed.',
    );
    if (installed) assert.equal(await schema(false), originalFullSchema);
    const foreignKeys = await runner.query(
      "SELECT pg_get_constraintdef(constraint_row.oid) AS definition FROM pg_constraint constraint_row JOIN pg_class relation ON relation.oid=constraint_row.conrelid JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace WHERE namespace.nspname='core' AND relation.relname=$1 AND constraint_row.contype='f'",
      [CLAIM],
    );
    assert.equal(foreignKeys.length, 4);
    for (const expression of [
      /FOREIGN KEY \("workspaceId"\).*workspace/,
      /FOREIGN KEY \("workspaceId", "spendId"\).*otogrowAiSpend.*ON DELETE RESTRICT/,
      /FOREIGN KEY \("workspaceId", "currentEntryId"\).*deliveryFinanceEntry.*ON DELETE RESTRICT/,
      /FOREIGN KEY \("workspaceId", "replacementEntryId"\).*deliveryFinanceEntry.*ON DELETE RESTRICT/,
    ])
      assert(
        foreignKeys.some((row) => expression.test(row.definition)),
        `Missing expected claim integrity: ${expression}`,
      );
    const [{ indexes }] = await runner.query(
      "SELECT count(*)::int AS indexes FROM pg_indexes WHERE schemaname='core' AND ((tablename='deliveryFinanceAiClaim' AND indexname LIKE 'IDX_%') OR indexname=$1)",
      [SPEND_INDEX],
    );
    assert.equal(indexes, 2);

    const [template] = await runner.query(
      'SELECT "workspaceCustomApplicationId" FROM core.workspace ORDER BY id LIMIT 1',
    );
    assert(template);
    for (const id of workspaceIds)
      await runner.query(
        'INSERT INTO core.workspace (id,"displayName",subdomain,"activationStatus","workspaceCustomApplicationId") VALUES ($1,\'Disposable AI finance migration fixture\',$2,\'PENDING_CREATION\',$3)',
        [
          id,
          `ai-finance-migration-${id}`,
          template.workspaceCustomApplicationId,
        ],
      );
    const spendId = randomUUID();
    const foreignSpendId = randomUUID();
    for (const [id, target] of [
      [spendId, workspaceId],
      [foreignSpendId, foreignWorkspaceId],
    ])
      await runner.query(
        'INSERT INTO core."otogrowAiSpend" (id,"workspaceId","sourceKind","sourceRunId","actorId",state,"reservedMicroUsd","actualMicroUsd",price) VALUES ($1,$2,\'TASK_AGENT\',$3,$4,\'SETTLED\',\'1000000\',\'0\',$5)',
        [
          id,
          target,
          randomUUID(),
          actorId,
          { modelId: 'synthetic-migration-source' },
        ],
      );
    const insertEntry = async (fields = {}) => {
      const amountMicros = fields.amountMicros ?? '1';
      return runner.query(
        'INSERT INTO core."deliveryFinanceEntry" (id,"workspaceId",month,kind,category,title,currency,"amountMicros",note,"sourceType","sourceAiSpend","planId","sourcePlan","createdBy") VALUES ($1,$2,\'2020-02\',$3,\'Fixture\',\'Disposable AI migration cost\',$4,$5,\'Synthetic source proof\',$6,$7,$8,$9,$10) RETURNING *',
        [
          fields.id ?? randomUUID(),
          fields.workspaceId ?? workspaceId,
          fields.kind ?? 'COST',
          fields.currency ?? 'USD',
          amountMicros,
          fields.sourceType ?? 'AI_SPEND',
          fields.sourceAiSpend === undefined
            ? { spendId, amountMicros }
            : fields.sourceAiSpend,
          fields.planId ?? null,
          fields.sourcePlan ?? null,
          actorId,
        ],
      );
    };
    const [zero] = await insertEntry({ amountMicros: '0' });
    const [micro] = await insertEntry({ amountMicros: '1' });
    const [maximum] = await insertEntry({
      amountMicros: '9223372036854775807',
    });
    const [foreignEntry] = await insertEntry({
      workspaceId: foreignWorkspaceId,
    });
    for (const [entry, amount] of [
      [zero, '0'],
      [micro, '1'],
      [maximum, '9223372036854775807'],
    ]) {
      assert.equal(entry.amountMicros, amount);
      assert.equal(entry.sourceAiSpend.amountMicros, amount);
      assert.equal(entry.revision, 1);
      assert.equal(entry.status, 'DRAFT');
      await runner.query(
        'INSERT INTO core."deliveryFinanceAllocation" ("workspaceId","entryId",bucket,"amountMicros") VALUES ($1,$2,\'COMPANY\',$3)',
        [workspaceId, entry.id, amount],
      );
    }
    await rejects('AI amount cannot be negative', () =>
      insertEntry({ amountMicros: '-1' }),
    );
    await rejects(
      'AI bigint overflow',
      () => insertEntry({ amountMicros: '9223372036854775808' }),
      '22003',
    );
    await rejects('AI entry is a cost', () => insertEntry({ kind: 'REVENUE' }));
    await rejects('AI source stays USD', () =>
      insertEntry({ currency: 'EUR' }),
    );
    await rejects('AI source cannot be null', () =>
      insertEntry({ sourceAiSpend: null }),
    );
    await rejects('Manual entry cannot carry AI source', () =>
      insertEntry({ sourceType: 'MANUAL' }),
    );
    await rejects('AI source cannot also carry a plan', () =>
      insertEntry({ sourcePlan: {} }),
    );
    const insertClaim = (fields = {}) =>
      runner.query(
        'INSERT INTO core."deliveryFinanceAiClaim" (id,"workspaceId","spendId","currentEntryId","replacementEntryId","createdBy") VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
        [
          fields.id ?? randomUUID(),
          fields.workspaceId ?? workspaceId,
          fields.spendId ?? spendId,
          fields.currentEntryId === undefined ? zero.id : fields.currentEntryId,
          fields.replacementEntryId === undefined
            ? micro.id
            : fields.replacementEntryId,
          actorId,
        ],
      );
    const [claim] = await insertClaim();
    assert.equal(claim.revision, 1);
    assert.equal(claim.reviewedSpendRevision, null);
    assert(claim.createdAt instanceof Date && claim.updatedAt instanceof Date);
    await rejects(
      'One claim per workspace/source',
      () => insertClaim(),
      '23505',
    );
    await rejects('Claim revision is positive', () =>
      runner.query(
        'UPDATE core."deliveryFinanceAiClaim" SET revision=0 WHERE id=$1',
        [claim.id],
      ),
    );
    await rejects('Reviewed source revision is positive', () =>
      runner.query(
        'UPDATE core."deliveryFinanceAiClaim" SET "reviewedSpendRevision"=0 WHERE id=$1',
        [claim.id],
      ),
    );
    await rejects('Pending replacement needs current entry', () =>
      runner.query(
        'UPDATE core."deliveryFinanceAiClaim" SET "currentEntryId"=NULL WHERE id=$1',
        [claim.id],
      ),
    );
    await rejects('Current and pending entry differ', () =>
      runner.query(
        'UPDATE core."deliveryFinanceAiClaim" SET "replacementEntryId"="currentEntryId" WHERE id=$1',
        [claim.id],
      ),
    );
    await rejects(
      'Claim needs a workspace',
      () => insertClaim({ workspaceId: randomUUID() }),
      '23503',
    );
    await rejects(
      'Spend must be in claim workspace',
      () => insertClaim({ spendId: foreignSpendId }),
      '23503',
    );
    await rejects(
      'Current entry must be in claim workspace',
      () =>
        insertClaim({
          workspaceId: foreignWorkspaceId,
          spendId: foreignSpendId,
          currentEntryId: zero.id,
          replacementEntryId: null,
        }),
      '23503',
    );
    await rejects(
      'Replacement entry must be in claim workspace',
      () =>
        insertClaim({
          workspaceId: foreignWorkspaceId,
          spendId: foreignSpendId,
          currentEntryId: foreignEntry.id,
          replacementEntryId: micro.id,
        }),
      '23503',
    );
    await rejects(
      'Claim preserves source ledger history',
      () =>
        runner.query('DELETE FROM core."otogrowAiSpend" WHERE id=$1', [
          spendId,
        ]),
      '23503',
    );
    await rejects(
      'Claim preserves current recognition',
      () =>
        runner.query('DELETE FROM core."deliveryFinanceEntry" WHERE id=$1', [
          zero.id,
        ]),
      '23503',
    );
    await rejects(
      'Claim preserves pending recognition',
      () =>
        runner.query('DELETE FROM core."deliveryFinanceEntry" WHERE id=$1', [
          micro.id,
        ]),
      '23503',
    );
    await rejects(
      'Downgrade refuses claim and financial history',
      () => migration.down(runner),
      'P0001',
    );
    await runner.query(
      'DELETE FROM core."deliveryFinanceAiClaim" WHERE id=$1 AND "workspaceId"=$2',
      [claim.id, workspaceId],
    );
    await rejects(
      'Downgrade still refuses AI recognition without a claim',
      () => migration.down(runner),
      'P0001',
    );
    await runner.query(
      'DELETE FROM core."deliveryFinanceEntry" WHERE "workspaceId"=ANY($1::uuid[])',
      [workspaceIds],
    );
    const [emptyClaim] = await insertClaim({
      currentEntryId: null,
      replacementEntryId: null,
    });
    await rejects(
      'Even released claim history blocks downgrade',
      () => migration.down(runner),
      'P0001',
    );
    await runner.query(
      'DELETE FROM core."deliveryFinanceAiClaim" WHERE id=$1 AND "workspaceId"=$2',
      [emptyClaim.id, workspaceId],
    );
    await runner.query('SET CONSTRAINTS ALL IMMEDIATE');
    await migration.down(runner);
    assert((await installedParts()).every((value) => !value));
    assert.deepEqual(await data(), originalData);
    assert.equal(await schema(), unrelatedSchema);
    assert.equal(
      await schema(false),
      oldFullSchema,
      'Down must restore the exact old checks and schema.',
    );
    const oldEntry = (sourceType, sourcePlan = null) =>
      runner.query(
        "INSERT INTO core.\"deliveryFinanceEntry\" (id,\"workspaceId\",month,kind,category,title,currency,\"amountMicros\",note,\"sourceType\",\"sourcePlan\",\"createdBy\") VALUES ($1,$2,'2020-02','COST','Fixture','Old source guard','USD','0','Synthetic evidence',$3,$4,$5)",
        [randomUUID(), workspaceId, sourceType, sourcePlan, actorId],
      );
    await rejects('Old schema rejects AI source type', () =>
      oldEntry('AI_SPEND'),
    );
    await rejects('Old schema rejects plan without a plan ID', () =>
      oldEntry('PLAN', {}),
    );
    await rejects('Old manual source rejects plan snapshot', () =>
      oldEntry('MANUAL', {}),
    );
    await migration.up(runner);
    assert((await installedParts()).every(Boolean));
    assert.deepEqual(await data(), originalData);
    assert.equal(await schema(), unrelatedSchema);
    if (installed) assert.equal(await schema(false), originalFullSchema);
    else {
      await migration.down(runner);
      assert.equal(await schema(false), originalFullSchema);
    }
    console.log(
      'PASS rollback-only AI-finance migration: exact existing finance/ledger/cash/workspace data and unrelated schema preserved; claim uniqueness/four workspace-safe FKs/revision/pending rules; exact zero/sub-cent/bigint COST/USD sources; RESTRICT history; downgrade refuses AI/claim history and restores legacy source checks/column absence after fixture removal. Outer rollback restores the original installation state.',
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
