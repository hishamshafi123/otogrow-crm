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

const FILE = '/tmp/otogrow-reconciliation-ui-fixture.json';
const WORKSPACE_ID = '0a420537-0122-45c3-a2f5-18298b636227';
const SENTINEL = 'Disposable reconciliation acceptance';
const MONTH = '2026-09';
const FINANCE_TABLES = [
  'deliveryFinancePlan',
  'deliveryFinanceEntry',
  'deliveryFinanceAllocation',
  'deliveryFinanceEvent',
  'deliveryFinanceSource',
  'deliveryFinanceSettlement',
  'deliveryFinanceCashMatch',
];
const PROTECTED_TABLES = [
  ...FINANCE_TABLES,
  'otogrowActivityEvent',
  'deliveryReminderOutbox',
  'deliveryProject',
];
const IDENTIFIER =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const STATE_HASH = /^[a-f0-9]{64}$/;

const canonical = (value) => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
};
const fingerprint = (value) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
const fixtureSentinel = (projectId) => `${SENTINEL} ${projectId.slice(0, 8)}`;
const isFixtureTitle = (title, sentinel = SENTINEL) =>
  typeof title === 'string' && title.startsWith(sentinel);
const isReceiptTitle = (title, sentinel = SENTINEL) =>
  typeof title === 'string' && title.startsWith(`Payment: ${sentinel}`);

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

async function lockWorkspace(manager) {
  await manager.query("SET LOCAL lock_timeout='5s'");
  await manager.query("SET LOCAL statement_timeout='20s'");
  await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
    `delivery:${WORKSPACE_ID}`,
  ]);
}

async function readWorkspace(manager) {
  const [workspace] = await manager.query(
    'SELECT id,"databaseSchema" FROM core.workspace WHERE id=$1',
    [WORKSPACE_ID],
  );
  assert(workspace, 'The configured local workspace must exist.');
  assert.match(workspace.databaseSchema, /^[a-zA-Z0-9_]+$/);
  return workspace;
}

async function readTables(manager) {
  const tables = {};
  for (const table of PROTECTED_TABLES)
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
  assert.equal(
    rows.length,
    1,
    'An initialized local Operations record is required.',
  );
  const operations = rows[0];
  assert(operations.state && typeof operations.state === 'object');
  if (operations.state.business)
    assert(Array.isArray(operations.state.business.records));
  return operations;
}

const businessRecords = (operations) =>
  operations.state.business?.records ?? [];

async function assertBaseline(
  manager,
  fixture,
  expectedStateHash = fixture.baseline.operations.stateHash,
) {
  const tables = await readTables(manager);
  for (const table of PROTECTED_TABLES)
    assert.equal(
      fingerprint(tables[table]),
      fixture.baseline.tables[table].hash,
      `Unrelated ${table} rows changed; cleanup must roll back.`,
    );
  const operations = await readOperations(manager);
  assert.equal(operations.id, fixture.baseline.operations.id);
  assert.equal(
    fingerprint(businessRecords(operations)),
    fixture.baseline.operations.recordsHash,
    'Existing business records must remain unchanged.',
  );
  assert.equal(
    fingerprint(operations.state),
    expectedStateHash,
    'Operations must match the exact expected cleanup state.',
  );
}

async function createFixture() {
  assert(
    !existsSync(FILE),
    `Recover or clean the existing journal at ${FILE}.`,
  );
  const projectId = randomUUID();
  const fixture = {
    version: 1,
    status: 'CREATING',
    workspaceId: WORKSPACE_ID,
    projectId,
    sentinel: fixtureSentinel(projectId),
    month: MONTH,
    createdAt: new Date().toISOString(),
    baseline: null,
  };
  // The initial journal survives a process interruption before the database commit.
  writeJournal(fixture, true);
  await connectionSource.transaction(async (manager) => {
    await lockWorkspace(manager);
    fixture.schema = (await readWorkspace(manager)).databaseSchema;
    const tables = await readTables(manager);
    const operations = await readOperations(manager);
    assert(
      !tables.deliveryProject.some((row) => isFixtureTitle(row.name)) &&
        !tables.deliveryFinancePlan.some((row) => isFixtureTitle(row.name)) &&
        !tables.deliveryFinanceEntry.some((row) => isFixtureTitle(row.title)) &&
        !tables.deliveryFinanceSource.some(
          (row) =>
            isFixtureTitle(row.snapshot?.title) ||
            isReceiptTitle(row.snapshot?.title),
        ) &&
        !businessRecords(operations).some(
          (row) => isFixtureTitle(row.title) || isReceiptTitle(row.title),
        ),
      'Existing reconciliation acceptance records need explicit recovery first.',
    );
    fixture.baseline = {
      tables: Object.fromEntries(
        PROTECTED_TABLES.map((table) => [
          table,
          {
            ids: tables[table].map((row) => row.id),
            hash: fingerprint(tables[table]),
          },
        ]),
      ),
      operations: {
        id: operations.id,
        businessPresent: Boolean(operations.state.business),
        recordIds: businessRecords(operations).map((row) => row.id),
        recordsHash: fingerprint(businessRecords(operations)),
        stateHash: fingerprint(operations.state),
      },
    };
    fixture.status = 'PREPARED';
    writeJournal(fixture);
    await manager.query(
      'INSERT INTO core."deliveryProject" (id,"workspaceId",name,"memberIds") VALUES ($1,$2,$3,$4)',
      [
        fixture.projectId,
        WORKSPACE_ID,
        fixture.sentinel + ' client',
        JSON.stringify([]),
      ],
    );
  });
  fixture.status = 'READY';
  writeJournal(fixture);
  console.log(
    `Created project ${fixture.projectId}. Use titles beginning "${fixture.sentinel}", this project for cash/receivables, and monthly sources in ${MONTH}. No accounts, salaries, payments or notifications were seeded. Journal: ${FILE}`,
  );
}

async function cleanupFixture(preserveOperations = false) {
  const fixture = JSON.parse(readFileSync(FILE, 'utf8'));
  assert.equal(fixture.version, 1);
  assert.equal(fixture.workspaceId, WORKSPACE_ID);
  assert.equal(fixture.month, MONTH);
  assert.match(fixture.projectId, IDENTIFIER);
  assert.equal(fixture.sentinel, fixtureSentinel(fixture.projectId));
  assert(
    ['CREATING', 'PREPARED', 'READY', 'CLEANUP_PREPARED', 'CLEANED'].includes(
      fixture.status,
    ),
  );
  if (preserveOperations)
    assert(fixture.baseline, 'Recovery requires a recorded fixture baseline.');
  if (fixture.operationsRecovery) {
    assert(
      preserveOperations,
      'Resume this journal with cleanup-preserving-operations.',
    );
    assert.equal(
      fixture.operationsRecovery.originalStateHash,
      fixture.baseline.operations.stateHash,
    );
    assert(Array.isArray(fixture.operationsRecovery.attempts));
    assert(fixture.operationsRecovery.attempts.length <= 20);
    for (const attempt of fixture.operationsRecovery.attempts) {
      assert.match(attempt.beforeStateHash, STATE_HASH);
      assert.match(attempt.expectedStateHash, STATE_HASH);
    }
  }
  await connectionSource.transaction(async (manager) => {
    await lockWorkspace(manager);
    const workspace = await readWorkspace(manager);
    if (fixture.schema) assert.equal(workspace.databaseSchema, fixture.schema);
    const [project] = await manager.query(
      'SELECT * FROM core."deliveryProject" WHERE id=$1 AND "workspaceId"=$2 FOR UPDATE',
      [fixture.projectId, WORKSPACE_ID],
    );
    if (!fixture.baseline) {
      assert(['CREATING', 'CLEANED'].includes(fixture.status));
      assert(
        !project,
        'An unjournalled project must be investigated manually.',
      );
      return;
    }
    if (!project) {
      // A prepared create can roll back, or cleanup can commit before journal removal.
      const lastAttempt = fixture.operationsRecovery?.attempts.at(-1);
      await assertBaseline(manager, fixture, lastAttempt?.expectedStateHash);
      return;
    }
    assert.equal(project.name, fixture.sentinel + ' client');
    assert.equal(project.companyId, null);
    assert.deepEqual(project.memberIds, []);
    assert.equal(project.revision, 1);
    const [{ count: tasks }] = await manager.query(
      'SELECT count(*)::int AS count FROM core."deliveryTask" WHERE "workspaceId"=$1 AND "projectId"=$2',
      [WORKSPACE_ID, fixture.projectId],
    );
    assert.equal(
      tasks,
      0,
      'No tasks or related notices may belong to this fixture.',
    );
    const tables = await readTables(manager);
    const operations = await readOperations(manager);
    assert.equal(operations.id, fixture.baseline.operations.id);
    const newRows = (table) => {
      const existingIds = new Set(fixture.baseline.tables[table].ids);
      const retained = tables[table].filter((row) => existingIds.has(row.id));
      assert.equal(
        fingerprint(retained),
        fixture.baseline.tables[table].hash,
        `Existing ${table} rows were changed; refusing cleanup.`,
      );
      return tables[table].filter((row) => !existingIds.has(row.id));
    };
    const existingRecordIds = new Set(fixture.baseline.operations.recordIds);
    const records = businessRecords(operations);
    assert.equal(
      fingerprint(records.filter((row) => existingRecordIds.has(row.id))),
      fixture.baseline.operations.recordsHash,
      'Existing business records were changed; refusing cleanup.',
    );
    const cashRecords = records.filter((row) => !existingRecordIds.has(row.id));
    assert(cashRecords.length <= 100);
    const cashIds = new Set(cashRecords.map((row) => row.id));
    for (const record of cashRecords) {
      assert.match(record.id, IDENTIFIER);
      assert.equal(record.kind, 'FINANCE');
      assert.equal(record.projectId, fixture.projectId);
      assert.equal(record.taskId, null);
      assert(
        ['INCOME', 'EXPENSE', 'SALARY', 'RECEIVABLE'].includes(record.category),
      );
      if (!isFixtureTitle(record.title, fixture.sentinel)) {
        const invoice = cashRecords.find(
          (candidate) =>
            record.externalReference === `receivable:${candidate.id}`,
        );
        assert(isReceiptTitle(record.title, fixture.sentinel));
        assert.equal(record.category, 'INCOME');
        assert.equal(invoice?.category, 'RECEIVABLE');
        assert(isFixtureTitle(invoice.title, fixture.sentinel));
      }
    }
    assert.deepEqual(newRows('deliveryFinancePlan'), []);
    const entries = newRows('deliveryFinanceEntry');
    assert(entries.length <= 30);
    const entryIds = new Set(entries.map((row) => row.id));
    for (const entry of entries) {
      assert(isFixtureTitle(entry.title, fixture.sentinel));
      assert.equal(entry.month, MONTH);
      assert.equal(entry.sourceType, 'MANUAL');
      assert.equal(entry.planId, null);
      assert.equal(entry.sourcePlan, null);
    }
    const allocations = newRows('deliveryFinanceAllocation');
    for (const allocation of allocations) {
      assert(entryIds.has(allocation.entryId));
      assert([fixture.projectId, null].includes(allocation.projectId));
      assert.equal(allocation.bucket, allocation.projectId ?? 'COMPANY');
    }
    const sources = newRows('deliveryFinanceSource');
    for (const source of sources) {
      const record = cashRecords.find(
        (candidate) => candidate.id === source.id,
      );
      assert(
        record,
        'Only fixture cash records may have new normalized sources.',
      );
      assert.equal(source.snapshot.id, record.id);
      assert.equal(source.snapshot.projectId, fixture.projectId);
      assert(
        isFixtureTitle(source.snapshot.title, fixture.sentinel) ||
          isReceiptTitle(source.snapshot.title, fixture.sentinel),
      );
      assert.equal(
        source.kind,
        record.category === 'RECEIVABLE' ? 'RECEIVABLE' : 'CASH',
      );
    }
    const settlements = newRows('deliveryFinanceSettlement');
    for (const settlement of settlements) {
      assert(cashIds.has(settlement.cashId));
      assert(cashIds.has(settlement.receivableId));
      assert.equal(settlement.projectId, fixture.projectId);
      assert.equal(
        cashRecords.find((row) => row.id === settlement.cashId)?.category,
        'INCOME',
      );
      assert.equal(
        cashRecords.find((row) => row.id === settlement.receivableId)?.category,
        'RECEIVABLE',
      );
    }
    const matches = newRows('deliveryFinanceCashMatch');
    for (const match of matches) {
      assert(cashIds.has(match.cashId));
      assert(entryIds.has(match.entryId));
      assert.equal(match.month, MONTH);
      assert([fixture.projectId, null].includes(match.projectId));
      assert.equal(match.bucket, match.projectId ?? 'COMPANY');
    }
    assert(settlements.length + matches.length <= 300);
    const identities = {
      ENTRY: entryIds,
      PAYMENT: cashIds,
      SETTLEMENT: new Set(settlements.map((row) => row.id)),
      MATCH: new Set(matches.map((row) => row.id)),
    };
    const events = newRows('deliveryFinanceEvent');
    for (const event of events)
      assert(
        identities[event.sourceType]?.has(event.sourceId),
        'Every new finance event must belong to a verified fixture source.',
      );
    const activity = newRows('otogrowActivityEvent');
    for (const event of activity) {
      assert.equal(event.category, 'BUSINESS');
      assert.equal(event.taskId, null);
      assert([fixture.projectId, null].includes(event.projectId));
      assert(
        (['finance', 'finance-payment'].includes(event.sourceType) &&
          cashIds.has(event.sourceId)) ||
          (event.sourceType === 'finance-entry' &&
            entryIds.has(event.sourceId)),
        'Only verified fixture finance activity may be removed.',
      );
    }
    assert.deepEqual(
      newRows('deliveryReminderOutbox'),
      [],
      'No outbound notices may be created during finance acceptance.',
    );
    assert.deepEqual(
      newRows('deliveryProject').map((row) => row.id),
      [fixture.projectId],
    );
    const cleanedState = structuredClone(operations.state);
    if (cleanedState.business)
      cleanedState.business.records = records.filter(
        (row) => !cashIds.has(row.id),
      );
    if (!fixture.baseline.operations.businessPresent && cleanedState.business) {
      assert.equal(
        fingerprint(cleanedState.business),
        fingerprint({ records: [], inbox: [], seen: {} }),
      );
      delete cleanedState.business;
    }
    const expectedStateHash = fingerprint(cleanedState);
    if (preserveOperations) {
      const restoredState = structuredClone(cleanedState);
      if (operations.state.business) {
        restoredState.business ??= structuredClone(operations.state.business);
        restoredState.business.records = structuredClone(records);
      }
      assert.equal(
        fingerprint(restoredState),
        fingerprint(operations.state),
        'Recovery may remove only the verified fixture cash records.',
      );
      // Meta tick updates workerSeenAt every minute, even with automatic imports disabled.
      // Version-one journals cannot prove which other fields changed after their original hash.
      fixture.operationsRecovery ??= {
        originalStateHash: fixture.baseline.operations.stateHash,
        attempts: [],
      };
      assert(fixture.operationsRecovery.attempts.length < 20);
      fixture.operationsRecovery.attempts.push({
        preparedAt: new Date().toISOString(),
        beforeStateHash: fingerprint(operations.state),
        expectedStateHash,
      });
    } else
      assert.equal(
        expectedStateHash,
        fixture.baseline.operations.stateHash,
        'Only fixture cash records may change Operations; notices and other work must remain unchanged.',
      );
    fixture.status = 'CLEANUP_PREPARED';
    fixture.cleanupIds = Object.fromEntries(
      [
        ['deliveryFinanceCashMatch', matches],
        ['deliveryFinanceSettlement', settlements],
        ['deliveryFinanceSource', sources],
        ['deliveryFinanceEvent', events],
        ['deliveryFinanceAllocation', allocations],
        ['deliveryFinanceEntry', entries],
        ['otogrowActivityEvent', activity],
      ].map(([table, rows]) => [table, rows.map((row) => row.id)]),
    );
    fixture.cashRecordIds = [...cashIds];
    writeJournal(fixture);
    // Matches and settlements preserve their source/allocation history through RESTRICT keys.
    for (const [table, ids] of Object.entries(fixture.cleanupIds))
      if (ids.length)
        await manager.query(
          `DELETE FROM core."${table}" WHERE "workspaceId"=$1 AND id=ANY($2::uuid[])`,
          [WORKSPACE_ID, ids],
        );
    if (cashRecords.length)
      await manager.query(
        'UPDATE core."deliveryOperations" SET state=$1 WHERE id=$2 AND "workspaceId"=$3',
        [cleanedState, operations.id, WORKSPACE_ID],
      );
    await manager.query(
      'DELETE FROM core."deliveryProject" WHERE id=$1 AND "workspaceId"=$2 AND name=$3',
      [fixture.projectId, WORKSPACE_ID, fixture.sentinel + ' client'],
    );
    await assertBaseline(manager, fixture, expectedStateHash);
  });
  fixture.status = 'CLEANED';
  writeJournal(fixture);
  const recoveryReceipt = `${FILE}.recovery-${fixture.projectId}.json`;
  if (fixture.operationsRecovery) {
    if (existsSync(recoveryReceipt))
      assert.equal(
        fingerprint(JSON.parse(readFileSync(recoveryReceipt, 'utf8'))),
        fingerprint(fixture),
        'An existing recovery receipt must match the completed journal.',
      );
    else writeJournal(fixture, false, recoveryReceipt);
  }
  unlinkSync(FILE);
  console.log(
    fixture.operationsRecovery
      ? `Removed only verified fixture finance records and project. All finance tables, pre-existing business records, activity and outbox match their baselines. Current unrelated Operations state was preserved exactly; the original whole-Operations baseline is not verified. Private recovery evidence: ${recoveryReceipt}`
      : fixture.baseline
      ? 'Removed only verified reconciliation acceptance records, relations, monthly allocations, events and project. All seven finance tables, existing cash/business records, activity, outbox and unrelated Operations state match their exact baselines.'
      : 'Removed the interrupted create journal. No fixture project or financial records were committed.',
  );
}

async function main() {
  assert.equal(
    process.argv.length,
    3,
    'Choose create, cleanup or cleanup-preserving-operations.',
  );
  assert(
    ['create', 'cleanup', 'cleanup-preserving-operations'].includes(
      process.argv[2],
    ),
  );
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
    'This acceptance fixture only supports the local database.',
  );
  await connectionSource.initialize();
  try {
    if (process.argv[2] === 'create') await createFixture();
    else
      await cleanupFixture(
        process.argv[2] === 'cleanup-preserving-operations',
      );
  } finally {
    if (connectionSource.isInitialized) await connectionSource.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  console.error(
    `Keep ${FILE} for recovery; cleanup commits only after exact ownership, table/business baselines and the selected Operations-state check pass.`,
  );
  process.exitCode = 1;
});
