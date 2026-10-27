const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} = require('node:fs');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');

const FILE = '/tmp/otogrow-ai-cost-ui-fixture.json';
const WORKSPACE_ID = '0a420537-0122-45c3-a2f5-18298b636227';
const PREFIX = 'Disposable AI cost acceptance';
const MONTH = '2026-09';
const TABLES = [
  'deliveryFinancePlan',
  'deliveryFinanceEntry',
  'deliveryFinanceAllocation',
  'deliveryFinanceEvent',
  'deliveryFinanceSource',
  'deliveryFinanceSettlement',
  'deliveryFinanceCashMatch',
  'deliveryFinanceAiClaim',
  'otogrowAiSpend',
  'otogrowAiSpendEvent',
  'otogrowAiBudget',
  'otogrowAiPrice',
  'otogrowActivityEvent',
  'deliveryReminderOutbox',
  'deliveryProject',
];
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
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
const sentinel = (projectId) => `${PREFIX} ${projectId.slice(0, 8)}`;

function writeJournal(fixture, initial = false, destination = FILE) {
  const path = initial ? destination : `${destination}.${randomUUID()}.tmp`;
  const descriptor = openSync(path, 'wx', 0o600);
  try {
    writeFileSync(descriptor, JSON.stringify(fixture, null, 2));
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  if (!initial) renameSync(path, destination);
}

async function locked(manager) {
  await manager.query("SET LOCAL lock_timeout='5s'");
  await manager.query("SET LOCAL statement_timeout='20s'");
  await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
    `delivery:${WORKSPACE_ID}`,
  ]);
}
async function readTables(manager) {
  const tables = {};
  for (const table of TABLES)
    tables[table] = await manager.query(
      `SELECT * FROM core."${table}" WHERE "workspaceId"=$1 ORDER BY id`,
      [WORKSPACE_ID],
    );
  return tables;
}
async function readOperations(manager) {
  const rows = await manager.query(
    'SELECT id,state FROM core."deliveryOperations" WHERE "workspaceId"=$1 FOR UPDATE',
    [WORKSPACE_ID],
  );
  assert.equal(rows.length, 1);
  return rows[0];
}
async function assertBaseline(manager, fixture) {
  const tables = await readTables(manager);
  for (const table of TABLES)
    assert.equal(
      fingerprint(tables[table]),
      fixture.baseline[table].hash,
      `Original ${table} rows must remain unchanged.`,
    );
  const operations = await readOperations(manager);
  assert.equal(operations.id, fixture.operationsBaseline.id);
  assert.equal(
    fingerprint(operations.state.business?.records ?? []),
    fixture.operationsBaseline.businessRecordsHash,
    'Original cash, invoice and business records must remain unchanged.',
  );
}
function newRows(tables, fixture, table) {
  const ids = new Set(fixture.baseline[table].ids);
  assert.equal(
    fingerprint(tables[table].filter((row) => ids.has(row.id))),
    fixture.baseline[table].hash,
    `Existing ${table} rows changed; refusing cleanup.`,
  );
  return tables[table].filter((row) => !ids.has(row.id));
}

function priceSnapshot(fixture) {
  return {
    profileId: fixture.profileId,
    revision: 1,
    modelId: fixture.modelId,
    kind: 'TEXT',
    source: 'Synthetic acceptance tariff. No provider called.',
    verifiedAt: fixture.createdAt,
    pricing: {
      inputUsdPerMillionTokens: '1',
      outputUsdPerMillionTokens: '0',
      reasoningUsdPerMillionTokens: '0',
      cacheReadUsdPerMillionTokens: '0',
      cacheWriteUsdPerMillionTokens: '0',
      maxInputTokens: 5000000,
      maxOutputTokens: 100,
      maxReasoningTokens: 0,
      outputIncludesReasoning: true,
      longContextThresholdTokens: null,
      longInputUsdPerMillionTokens: null,
      longOutputUsdPerMillionTokens: null,
      longReasoningUsdPerMillionTokens: null,
      longCacheReadUsdPerMillionTokens: null,
      longCacheWriteUsdPerMillionTokens: null,
    },
    inputTokenBound: 5000000,
    outputTokenBound: 100,
    reasoningTokenBound: 0,
    boundSource: 'MODEL_CONTEXT',
  };
}
const usage = (inputTokens) => ({
  inputTokens,
  outputTokens: 0,
  reasoningTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
});

async function createFixture() {
  assert(
    !existsSync(FILE),
    'Recover the existing AI-cost fixture journal first.',
  );
  const projectId = randomUUID();
  const fixture = {
    version: 1,
    status: 'CREATING',
    workspaceId: WORKSPACE_ID,
    projectId,
    sentinel: sentinel(projectId),
    month: MONTH,
    createdAt: new Date().toISOString(),
    modelId: `disposable-ai-cost-${projectId.slice(0, 8)}`,
    profileId: randomUUID(),
    charges: ['original', 'zero', 'uncertain'].map((name) => ({
      name,
      id: randomUUID(),
      runId: randomUUID(),
      eventId: randomUUID(),
    })),
    lateEvents: [],
    baseline: null,
  };
  writeJournal(fixture, true);
  await connectionSource.transaction(async (manager) => {
    await locked(manager);
    const [workspace] = await manager.query(
      'SELECT "databaseSchema" FROM core.workspace WHERE id=$1',
      [WORKSPACE_ID],
    );
    assert(workspace && /^\w+$/.test(workspace.databaseSchema));
    const members = await manager.query(
      `SELECT id FROM "${workspace.databaseSchema}"."workspaceMember" WHERE "deletedAt" IS NULL ORDER BY id LIMIT 2`,
    );
    assert.equal(
      members.length,
      1,
      'The local one-member acceptance workspace is required.',
    );
    fixture.actorId = members[0].id;
    const tables = await readTables(manager);
    assert(!tables.deliveryProject.some((row) => row.name.startsWith(PREFIX)));
    assert(
      !tables.otogrowAiSpend.some((row) =>
        row.price?.modelId?.startsWith('disposable-ai-cost-'),
      ),
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
    const operations = await readOperations(manager);
    fixture.operationsBaseline = {
      id: operations.id,
      businessRecordsHash: fingerprint(
        operations.state.business?.records ?? [],
      ),
    };
    fixture.status = 'PREPARED';
    writeJournal(fixture);
    await manager.query(
      'INSERT INTO core."deliveryProject" (id,"workspaceId",name,"memberIds") VALUES ($1,$2,$3,$4)',
      [
        projectId,
        WORKSPACE_ID,
        fixture.sentinel + ' client',
        JSON.stringify([]),
      ],
    );
    for (const charge of fixture.charges) {
      const settled = charge.name !== 'uncertain';
      const amount =
        charge.name === 'original' ? '2500000' : settled ? '0' : null;
      const state = settled ? 'SETTLED' : 'UNCERTAIN';
      await manager.query(
        'INSERT INTO core."otogrowAiSpend" (id,"workspaceId",revision,"sourceKind","sourceRunId","actorId","projectId",state,"reservedMicroUsd","actualMicroUsd",price,usage,"createdAt","updatedAt","dispatchedAt","settledAt") VALUES ($1,$2,1,\'TASK_AGENT\',$3,$4,$5,$6,\'5000000\',$7,$8,$9,$10,$10,$10,$11)',
        [
          charge.id,
          WORKSPACE_ID,
          charge.runId,
          fixture.actorId,
          projectId,
          state,
          amount,
          priceSnapshot(fixture),
          settled ? usage(Number(amount)) : null,
          fixture.createdAt,
          settled ? fixture.createdAt : null,
        ],
      );
      await manager.query(
        'INSERT INTO core."otogrowAiSpendEvent" (id,"workspaceId","spendId","actorId",action,"before","after","createdAt") VALUES ($1,$2,$3,NULL,$4,$5,$6,$7)',
        [
          charge.eventId,
          WORKSPACE_ID,
          charge.id,
          state,
          {},
          {
            state,
            revision: 1,
            reservedMicroUsd: '5000000',
            actualMicroUsd: amount,
          },
          fixture.createdAt,
        ],
      );
    }
    const after = await readTables(manager);
    fixture.ledgerHashes = Object.fromEntries(
      ['otogrowAiSpend', 'otogrowAiSpendEvent'].map((table) => [
        table,
        fingerprint(newRows(after, fixture, table)),
      ]),
    );
    fixture.status = 'READY';
    writeJournal(fixture);
  });
  console.log(
    `Created synthetic AI-cost sources for ${fixture.sentinel}; service month ${MONTH}. Original USD2.50, explicit zero and unresolved charge. No model, provider, payment, roles or notifications invoked. Journal ${FILE}`,
  );
}

function readFixture() {
  const fixture = JSON.parse(readFileSync(FILE, 'utf8'));
  assert.equal(fixture.version, 1);
  assert.equal(fixture.workspaceId, WORKSPACE_ID);
  assert.match(fixture.projectId, UUID);
  assert.equal(fixture.sentinel, sentinel(fixture.projectId));
  assert.equal(fixture.month, MONTH);
  for (const charge of fixture.charges) {
    assert.match(charge.id, UUID);
    assert.match(charge.runId, UUID);
    assert.match(charge.eventId, UUID);
  }
  assert(
    [
      'CREATING',
      'PREPARED',
      'READY',
      'LATE_PREPARED',
      'CLEANUP_PREPARED',
      'CLEANED',
    ].includes(fixture.status),
  );
  return fixture;
}

async function addLateEvidence(kind) {
  const fixture = readFixture();
  assert.equal(fixture.status, 'READY');
  assert(
    !fixture.lateEvents.some((event) => event.kind === kind),
    'This synthetic evidence was already added.',
  );
  const event = {
    kind,
    id: randomUUID(),
    amountMicros: kind === 'lower' ? '1000000' : '3750000',
    createdAt: new Date().toISOString(),
  };
  await connectionSource.transaction(async (manager) => {
    await locked(manager);
    const tables = await readTables(manager);
    for (const table of ['otogrowAiSpend', 'otogrowAiSpendEvent'])
      assert.equal(
        fingerprint(newRows(tables, fixture, table)),
        fixture.ledgerHashes[table],
        'Fixture ledger changed outside the staged evidence step.',
      );
    const original = fixture.charges.find(
      (charge) => charge.name === 'original',
    );
    const spend = tables.otogrowAiSpend.find((row) => row.id === original.id);
    assert.equal(spend.price.modelId, fixture.modelId);
    assert.equal(spend.state, 'SETTLED');
    assert.equal(spend.actualMicroUsd, '2500000');
    fixture.status = 'LATE_PREPARED';
    fixture.pendingLateEvent = event;
    writeJournal(fixture);
    await manager.query(
      'UPDATE core."otogrowAiSpend" SET revision=revision+1,"attentionReason"=$2,"updatedAt"=$3 WHERE id=$1 AND "workspaceId"=$4',
      [
        original.id,
        'Synthetic later usage evidence differs from the retained original settlement.',
        event.createdAt,
        WORKSPACE_ID,
      ],
    );
    await manager.query(
      'INSERT INTO core."otogrowAiSpendEvent" (id,"workspaceId","spendId","actorId",action,"before","after","createdAt") VALUES ($1,$2,$3,NULL,\'LATE_PROVIDER_USAGE\',$4,$5,$6)',
      [
        event.id,
        WORKSPACE_ID,
        original.id,
        {
          state: 'SETTLED',
          revision: spend.revision,
          reservedMicroUsd: spend.reservedMicroUsd,
          actualMicroUsd: spend.actualMicroUsd,
        },
        {
          state: 'SETTLED',
          revision: spend.revision + 1,
          reservedMicroUsd: spend.reservedMicroUsd,
          actualMicroUsd: spend.actualMicroUsd,
          reportedActualMicroUsd: event.amountMicros,
          usage: usage(Number(event.amountMicros)),
        },
        event.createdAt,
      ],
    );
    const after = await readTables(manager);
    fixture.pendingAfterLedgerHashes = Object.fromEntries(
      ['otogrowAiSpend', 'otogrowAiSpendEvent'].map((table) => [
        table,
        fingerprint(newRows(after, fixture, table)),
      ]),
    );
    writeJournal(fixture);
  });
  fixture.lateEvents.push(event);
  fixture.ledgerHashes = fixture.pendingAfterLedgerHashes;
  delete fixture.pendingLateEvent;
  delete fixture.pendingAfterLedgerHashes;
  fixture.status = 'READY';
  writeJournal(fixture);
  console.log(
    `Added synthetic ${kind} usage evidence ${event.amountMicros} micro-USD. Original settlement remains USD2.50. No provider called.`,
  );
}

async function cleanupFixture() {
  const fixture = readFixture();
  await connectionSource.transaction(async (manager) => {
    await locked(manager);
    const tables = await readTables(manager);
    const project = tables.deliveryProject.find(
      (row) => row.id === fixture.projectId,
    );
    if (!fixture.baseline) {
      assert(!project);
      return;
    }
    if (!project) {
      await assertBaseline(manager, fixture);
      return;
    }
    assert.equal(project.name, fixture.sentinel + ' client');
    assert.equal(project.companyId, null);
    assert.equal(project.revision, 1);
    assert.deepEqual(project.memberIds, []);
    const [{ count: tasks }] = await manager.query(
      'SELECT count(*)::int AS count FROM core."deliveryTask" WHERE "workspaceId"=$1 AND "projectId"=$2',
      [WORKSPACE_ID, fixture.projectId],
    );
    assert.equal(tasks, 0);
    for (const table of [
      'deliveryFinancePlan',
      'deliveryFinanceSource',
      'deliveryFinanceSettlement',
      'deliveryFinanceCashMatch',
      'otogrowAiBudget',
      'otogrowAiPrice',
      'deliveryReminderOutbox',
    ])
      assert.deepEqual(newRows(tables, fixture, table), []);
    const chargeIds = new Set(fixture.charges.map((charge) => charge.id));
    const entries = newRows(tables, fixture, 'deliveryFinanceEntry');
    assert(entries.length <= 30);
    const entryIds = new Set(entries.map((row) => row.id));
    for (const entry of entries) {
      assert(entry.title.startsWith(fixture.sentinel));
      assert.equal(entry.sourceType, 'AI_SPEND');
      assert(chargeIds.has(entry.sourceAiSpend?.spendId));
      assert.equal(entry.month, MONTH);
      assert.equal(entry.currency, 'USD');
      assert.equal(entry.kind, 'COST');
    }
    const allocations = newRows(tables, fixture, 'deliveryFinanceAllocation');
    for (const row of allocations) {
      assert(entryIds.has(row.entryId));
      assert([fixture.projectId, null].includes(row.projectId));
      assert.equal(row.bucket, row.projectId ?? 'COMPANY');
    }
    const claims = newRows(tables, fixture, 'deliveryFinanceAiClaim');
    for (const row of claims) {
      assert(chargeIds.has(row.spendId));
      assert(row.currentEntryId === null || entryIds.has(row.currentEntryId));
      assert(
        row.replacementEntryId === null || entryIds.has(row.replacementEntryId),
      );
    }
    const events = newRows(tables, fixture, 'deliveryFinanceEvent');
    for (const row of events) {
      assert.equal(row.sourceType, 'ENTRY');
      assert(entryIds.has(row.sourceId));
    }
    const activity = newRows(tables, fixture, 'otogrowActivityEvent');
    for (const row of activity) {
      assert.equal(row.sourceType, 'finance-entry');
      assert(entryIds.has(row.sourceId));
      assert.equal(row.category, 'BUSINESS');
      assert.equal(row.taskId, null);
      assert([fixture.projectId, null].includes(row.projectId));
    }
    const spends = newRows(tables, fixture, 'otogrowAiSpend');
    for (const row of spends) {
      assert(chargeIds.has(row.id));
      assert.equal(row.price.modelId, fixture.modelId);
      assert.equal(row.price.profileId, fixture.profileId);
      assert.equal(row.projectId, fixture.projectId);
      assert.equal(row.actorId, fixture.actorId);
    }
    const spendEvents = newRows(tables, fixture, 'otogrowAiSpendEvent');
    for (const row of spendEvents) assert(chargeIds.has(row.spendId));
    if (!fixture.pendingLateEvent)
      for (const table of ['otogrowAiSpend', 'otogrowAiSpendEvent'])
        assert.equal(
          fingerprint(newRows(tables, fixture, table)),
          fixture.ledgerHashes[table],
        );
    else {
      assert(fixture.pendingLateEvent);
      assert.match(fixture.pendingLateEvent.id, UUID);
      const ledgerTables = ['otogrowAiSpend', 'otogrowAiSpendEvent'];
      const matchesManifest = (manifest) =>
        manifest &&
        ledgerTables.every(
          (table) =>
            fingerprint(newRows(tables, fixture, table)) === manifest[table],
        );
      assert(
        matchesManifest(fixture.ledgerHashes) ||
          matchesManifest(fixture.pendingAfterLedgerHashes),
        'An interrupted evidence step must match one complete atomic before/after ledger manifest.',
      );
    }
    assert.deepEqual(
      newRows(tables, fixture, 'deliveryProject').map((row) => row.id),
      [fixture.projectId],
    );
    const operations = await readOperations(manager);
    assert.equal(operations.id, fixture.operationsBaseline.id);
    assert.equal(
      fingerprint(operations.state.business?.records ?? []),
      fixture.operationsBaseline.businessRecordsHash,
    );
    const operationsBefore = fingerprint(operations.state);
    fixture.cleanupIds = Object.fromEntries(
      [
        ['deliveryFinanceAiClaim', claims],
        ['deliveryFinanceEvent', events],
        ['deliveryFinanceAllocation', allocations],
        ['otogrowActivityEvent', activity],
        ['deliveryFinanceEntry', entries],
        ['otogrowAiSpendEvent', spendEvents],
        ['otogrowAiSpend', spends],
      ].map(([table, rows]) => [table, rows.map((row) => row.id)]),
    );
    fixture.status = 'CLEANUP_PREPARED';
    fixture.operationsBeforeCleanupHash = operationsBefore;
    writeJournal(fixture);
    for (const [table, ids] of Object.entries(fixture.cleanupIds))
      if (ids.length)
        await manager.query(
          `DELETE FROM core."${table}" WHERE "workspaceId"=$1 AND id=ANY($2::uuid[])`,
          [WORKSPACE_ID, ids],
        );
    await manager.query(
      'DELETE FROM core."deliveryProject" WHERE id=$1 AND "workspaceId"=$2 AND name=$3',
      [fixture.projectId, WORKSPACE_ID, fixture.sentinel + ' client'],
    );
    await assertBaseline(manager, fixture);
    assert.equal(
      fingerprint((await readOperations(manager)).state),
      operationsBefore,
      'Cleanup must preserve the entire current unrelated Operations state.',
    );
  });
  fixture.status = 'CLEANED';
  writeJournal(fixture);
  const receipt = `${FILE}.cleaned-${fixture.projectId}.json`;
  if (existsSync(receipt))
    assert.equal(
      fingerprint(JSON.parse(readFileSync(receipt, 'utf8'))),
      fingerprint(fixture),
    );
  else writeJournal(fixture, false, receipt);
  unlinkSync(FILE);
  console.log(
    'Removed only verified AI-cost acceptance project, charges/evidence, claims, monthly entries/allocations and audit events. All fifteen protected table baselines match; current unrelated Operations state preserved exactly. No real roles, accounts, settings, cash, invoices or provider data changed.',
  );
}

async function main() {
  assert.equal(process.argv.length, 3);
  const command = process.argv[2];
  assert(['create', 'late-lower', 'late-higher', 'cleanup'].includes(command));
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  await connectionSource.initialize();
  try {
    if (command === 'create') await createFixture();
    else if (command === 'cleanup') await cleanupFixture();
    else await addLateEvidence(command === 'late-lower' ? 'lower' : 'higher');
  } finally {
    await connectionSource.destroy();
  }
}
main().catch((error) => {
  console.error(error);
  console.error(
    `Retain ${FILE}; failed cleanup rolls back and leaves its ownership journal for recovery.`,
  );
  process.exitCode = 1;
});
