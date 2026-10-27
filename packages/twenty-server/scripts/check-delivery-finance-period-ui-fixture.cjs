const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} = require('node:fs');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');

const FILE = '/tmp/otogrow-finance-period-ui-fixture.json';
const WORKSPACE_ID = '0a420537-0122-45c3-a2f5-18298b636227';
const MONTH = '2098-11';
const TABLES = [
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
  'deliveryProject',
];
const canonical = (value) =>
  value instanceof Date
    ? value.toISOString()
    : Array.isArray(value)
      ? value.map(canonical)
      : value !== null && typeof value === 'object'
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, canonical(value[key])]),
          )
        : value;
const fingerprint = (value) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');

function writeJournal(value, initial = false) {
  const path = initial ? FILE : `${FILE}.${randomUUID()}.tmp`;
  const descriptor = openSync(path, 'wx', 0o600);
  try {
    writeFileSync(descriptor, JSON.stringify(value, null, 2));
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  if (!initial) renameSync(path, FILE);
}
async function locked(manager) {
  await manager.query("SET LOCAL lock_timeout='5s'");
  await manager.query("SET LOCAL statement_timeout='20s'");
  await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
    `delivery:${WORKSPACE_ID}`,
  ]);
}
async function rows(manager) {
  const result = {};
  for (const table of TABLES)
    result[table] = await manager.query(
      `SELECT * FROM core."${table}" WHERE "workspaceId"=$1 ORDER BY id`,
      [WORKSPACE_ID],
    );
  return result;
}
async function operations(manager) {
  const result = await manager.query(
    'SELECT id,state FROM core."deliveryOperations" WHERE "workspaceId"=$1 FOR UPDATE',
    [WORKSPACE_ID],
  );
  assert.equal(result.length, 1);
  return result[0];
}
function additions(tables, fixture, table) {
  const previous = new Set(fixture.baseline[table].ids);
  assert.equal(
    fingerprint(tables[table].filter((row) => previous.has(row.id))),
    fixture.baseline[table].hash,
    `Original ${table} changed; refusing cleanup.`,
  );
  return tables[table].filter((row) => !previous.has(row.id));
}
async function createFixture() {
  assert(
    !existsSync(FILE),
    'Recover the existing period fixture journal first.',
  );
  const fixture = {
    version: 1,
    status: 'CREATING',
    workspaceId: WORKSPACE_ID,
    month: MONTH,
    nonce: randomUUID(),
    entryIds: [randomUUID(), randomUUID()],
    actorId: randomUUID(),
  };
  fixture.sentinel = `Disposable result-lock acceptance ${fixture.nonce.slice(0, 8)}`;
  await connectionSource.transaction(async (manager) => {
    await locked(manager);
    const tables = await rows(manager);
    assert(!tables.deliveryFinanceEntry.some((entry) => entry.month === MONTH));
    assert(
      !tables.deliveryFinancePeriod.some((period) => period.month === MONTH),
    );
    fixture.baseline = Object.fromEntries(
      TABLES.map((table) => [
        table,
        {
          ids: tables[table].map((row) => row.id),
          hash: fingerprint(tables[table]),
        },
      ]),
    );
    const originalOperations = await operations(manager);
    fixture.operationsId = originalOperations.id;
    fixture.businessRecordsHash = fingerprint(
      originalOperations.state.business?.records ?? [],
    );
    // A durable ownership journal must exist before any committed fixture writes.
    writeJournal(fixture, true);
    for (const [index, currency, amount] of [
      [0, 'USD', '2500000'],
      [1, 'EUR', '1000000'],
    ]) {
      await manager.query(
        'INSERT INTO core."deliveryFinanceEntry" (id,"workspaceId",month,kind,category,title,currency,"amountMicros",note,"sourceType","createdBy") VALUES ($1,$2,$3,\'COST\',\'Synthetic acceptance\',$4,$5,$6,\'Disposable local acceptance only; no payment or provider call.\',\'MANUAL\',$7)',
        [
          fixture.entryIds[index],
          WORKSPACE_ID,
          MONTH,
          `${fixture.sentinel} ${currency}`,
          currency,
          amount,
          fixture.actorId,
        ],
      );
      await manager.query(
        'INSERT INTO core."deliveryFinanceAllocation" ("workspaceId","entryId",bucket,"amountMicros") VALUES ($1,$2,\'COMPANY\',$3)',
        [WORKSPACE_ID, fixture.entryIds[index], amount],
      );
    }
  });
  fixture.status = 'READY';
  writeJournal(fixture);
  console.log(
    `Created two synthetic monthly drafts in ${MONTH}; prefix ${fixture.sentinel}. No real financial records changed.`,
  );
}
async function cleanupFixture() {
  const fixture = JSON.parse(readFileSync(FILE, 'utf8'));
  assert.equal(fixture.version, 1);
  assert.equal(fixture.workspaceId, WORKSPACE_ID);
  assert.equal(fixture.month, MONTH);
  assert.equal(
    fixture.sentinel,
    `Disposable result-lock acceptance ${fixture.nonce.slice(0, 8)}`,
  );
  await connectionSource.transaction(async (manager) => {
    await locked(manager);
    const tables = await rows(manager);
    const changed = Object.fromEntries(
      TABLES.map((table) => [table, additions(tables, fixture, table)]),
    );
    const entries = changed.deliveryFinanceEntry;
    assert(
      entries.every(
        (entry) =>
          fixture.entryIds.includes(entry.id) &&
          entry.month === MONTH &&
          entry.title.startsWith(fixture.sentinel) &&
          entry.sourceType === 'MANUAL' &&
          entry.createdBy === fixture.actorId,
      ),
    );
    const periods = changed.deliveryFinancePeriod;
    assert(
      periods.length <= 1 && periods.every((period) => period.month === MONTH),
    );
    const sourceIds = [
      ...fixture.entryIds,
      ...periods.map((period) => period.id),
    ];
    for (const allocation of changed.deliveryFinanceAllocation)
      assert(
        fixture.entryIds.includes(allocation.entryId) &&
          allocation.projectId === null,
      );
    for (const event of changed.deliveryFinanceEvent)
      assert(
        sourceIds.includes(event.sourceId) &&
          ['ENTRY', 'PERIOD'].includes(event.sourceType),
      );
    for (const event of changed.otogrowActivityEvent)
      assert(
        sourceIds.includes(event.sourceId) &&
          ['finance-entry', 'finance-period'].includes(event.sourceType),
      );
    const allowed = new Set([
      'deliveryFinanceEntry',
      'deliveryFinanceAllocation',
      'deliveryFinancePeriod',
      'deliveryFinanceEvent',
      'otogrowActivityEvent',
    ]);
    for (const table of TABLES)
      if (!allowed.has(table))
        assert.equal(
          changed[table].length,
          0,
          `Unexpected ${table} additions; refusing cleanup.`,
        );
    const currentOperations = await operations(manager);
    assert.equal(currentOperations.id, fixture.operationsId);
    assert.equal(
      fingerprint(currentOperations.state.business?.records ?? []),
      fixture.businessRecordsHash,
    );
    const currentOperationsHash = fingerprint(currentOperations);
    for (const table of ['otogrowActivityEvent', 'deliveryFinanceEvent'])
      await manager.query(
        `DELETE FROM core."${table}" WHERE "workspaceId"=$1 AND "sourceId"=ANY($2::uuid[])`,
        [WORKSPACE_ID, sourceIds],
      );
    await manager.query(
      'DELETE FROM core."deliveryFinanceAllocation" WHERE "workspaceId"=$1 AND "entryId"=ANY($2::uuid[])',
      [WORKSPACE_ID, fixture.entryIds],
    );
    await manager.query(
      'DELETE FROM core."deliveryFinanceEntry" WHERE "workspaceId"=$1 AND id=ANY($2::uuid[])',
      [WORKSPACE_ID, fixture.entryIds],
    );
    await manager.query(
      'DELETE FROM core."deliveryFinancePeriod" WHERE "workspaceId"=$1 AND id=ANY($2::uuid[])',
      [WORKSPACE_ID, periods.map((period) => period.id)],
    );
    const remaining = await rows(manager);
    for (const table of TABLES)
      assert.equal(
        fingerprint(remaining[table]),
        fixture.baseline[table].hash,
        `${table} baseline must match after cleanup.`,
      );
    assert.equal(
      fingerprint(await operations(manager)),
      currentOperationsHash,
      'Cleanup must preserve current unrelated Operations state exactly.',
    );
  });
  fixture.status = 'CLEANED';
  writeJournal(fixture);
  renameSync(FILE, `${FILE}.${fixture.nonce}.cleaned`);
  console.log(
    'Removed only verified period/entry/history fixtures. All sixteen protected table baselines match; current unrelated Operations state is unchanged.',
  );
}
async function main() {
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  assert(
    ['create', 'cleanup'].includes(process.argv[2]) &&
      process.argv.length === 3,
  );
  await connectionSource.initialize();
  try {
    if (process.argv[2] === 'create') await createFixture();
    else await cleanupFixture();
  } finally {
    await connectionSource.destroy();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
