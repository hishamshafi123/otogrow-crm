const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} = require('node:fs');
const { dirname } = require('node:path');
const {
  connectionSource,
} = require('../dist/database/typeorm/core/core.datasource');

const FILE = '/tmp/otogrow-finance-export-ui-fixture.json';
const WORKSPACE_ID = '0a420537-0122-45c3-a2f5-18298b636227';
const PREFIX = 'Disposable export acceptance';
const DATE_FROM = '2020-02-10';
const DATE_TO = '2020-02-11';
const MONTH = '2098-12';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
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
  'deliveryFinanceForecastAnchor',
  'deliveryFinanceForecastItem',
  'deliveryFinanceForecastRealization',
  'deliveryFinanceExportProfile',
  'deliveryFinanceExportBatch',
];
const DELETE_ORDER = [
  'otogrowActivityEvent',
  'deliveryFinanceEvent',
  'deliveryFinanceExportBatch',
  'deliveryFinanceExportProfile',
  'deliveryFinanceAllocation',
  'deliveryFinanceEntry',
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
const copy = (value) => JSON.parse(JSON.stringify(value));
const markerFor = (nonce) => `export-ui:${nonce}`;
const titleFor = (nonce) => `${PREFIX} ${nonce.slice(0, 8)}`;
const isDate = (value) =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) &&
  new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const recordsOf = (operations) => {
  assert(
    operations.state.business &&
      Array.isArray(operations.state.business.records),
    'An initialized local Business document is required.',
  );
  return operations.state.business.records;
};
const withoutHeartbeat = (state) => {
  const value = copy(state);
  // This worker timestamp is allowed to advance after a committed cleanup before journal recovery.
  if (value.metaReporting && typeof value.metaReporting === 'object')
    delete value.metaReporting.workerSeenAt;
  return value;
};
function syncDirectory(path) {
  const descriptor = openSync(dirname(path), 'r');
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}
function writeJournal(value, destination = FILE, initial = false) {
  const temporary = `${destination}.${randomUUID()}.tmp`;
  const descriptor = openSync(temporary, 'wx', 0o600);
  try {
    writeFileSync(descriptor, JSON.stringify(value, null, 2));
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  try {
    if (initial) {
      linkSync(temporary, destination);
      unlinkSync(temporary);
    } else renameSync(temporary, destination);
    syncDirectory(destination);
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
}
function readJournal() {
  const metadata = lstatSync(FILE);
  assert(
    metadata.isFile() &&
      !metadata.isSymbolicLink() &&
      (metadata.mode & 0o077) === 0,
    'The ownership journal must be a private regular file.',
  );
  const fixture = JSON.parse(readFileSync(FILE, 'utf8'));
  assert.equal(fixture.version, 1);
  assert.equal(fixture.workspaceId, WORKSPACE_ID);
  for (const key of [
    'nonce',
    'incomeId',
    'expenseId',
    'revenueId',
    'costId',
    'cashProfileId',
    'recognitionProfileId',
    'revenueAllocationId',
    'costAllocationId',
  ])
    assert.match(fixture[key], UUID);
  assert.equal(fixture.marker, markerFor(fixture.nonce));
  assert.equal(fixture.sentinel, titleFor(fixture.nonce));
  assert.equal(fixture.month, MONTH);
  assert.equal(fixture.dateFrom, DATE_FROM);
  assert.equal(fixture.dateTo, DATE_TO);
  assert.equal(fixture.accountingDate, DATE_TO);
  assert(
    ['CREATING', 'PREPARED', 'READY', 'CLEANUP_PREPARED', 'CLEANED'].includes(
      fixture.status,
    ),
  );
  if (fixture.baseline) {
    assert.match(fixture.actorId, UUID);
    assert.match(fixture.userWorkspaceId, UUID);
    assert.match(fixture.baseline.operations.id, UUID);
    assert.match(fixture.baseline.operations.recordsHash, HASH);
    assert(Array.isArray(fixture.baseline.operations.recordIds));
    for (const id of fixture.baseline.operations.recordIds)
      assert.match(id, UUID);
    for (const table of TABLES) {
      assert(Array.isArray(fixture.baseline.tables[table].ids));
      assert.match(fixture.baseline.tables[table].hash, HASH);
      for (const id of fixture.baseline.tables[table].ids)
        assert.match(id, UUID);
    }
  }
  assert(Array.isArray(fixture.cleanupAttempts));
  return fixture;
}
async function locked(manager) {
  await manager.query("SET LOCAL lock_timeout='5s'");
  await manager.query("SET LOCAL statement_timeout='30s'");
  await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
    `delivery:${WORKSPACE_ID}`,
  ]);
}
async function readTables(manager) {
  const result = {};
  for (const table of TABLES) {
    // Date-only ownership must not depend on the host's PostgreSQL date parser.
    const projection =
      table === 'deliveryFinanceForecastAnchor'
        ? `*, to_char("closingDate", 'YYYY-MM-DD') AS "closingDate"`
        : '*';
    result[table] = await manager.query(
      `SELECT ${projection} FROM core."${table}" WHERE "workspaceId"=$1 ORDER BY id`,
      [WORKSPACE_ID],
    );
  }
  return result;
}
async function readOperations(manager) {
  const rows = await manager.query(
    'SELECT id,state FROM core."deliveryOperations" WHERE "workspaceId"=$1 FOR UPDATE',
    [WORKSPACE_ID],
  );
  assert.equal(
    rows.length,
    1,
    'Use the exact initialized local dev workspace.',
  );
  recordsOf(rows[0]);
  return rows[0];
}
function additions(tables, fixture, table) {
  const ids = new Set(fixture.baseline.tables[table].ids);
  assert.equal(
    fingerprint(tables[table].filter((row) => ids.has(row.id))),
    fixture.baseline.tables[table].hash,
    `Preexisting ${table} rows changed; refusing cleanup.`,
  );
  return tables[table].filter((row) => !ids.has(row.id));
}
function newBusinessRecords(operations, fixture) {
  assert.equal(operations.id, fixture.baseline.operations.id);
  const originalIds = new Set(fixture.baseline.operations.recordIds);
  const records = recordsOf(operations);
  assert.equal(
    new Set(records.map((record) => record.id)).size,
    records.length,
    'Duplicate Business record identities require manual investigation.',
  );
  assert.equal(
    fingerprint(records.filter((record) => originalIds.has(record.id))),
    fixture.baseline.operations.recordsHash,
    'Preexisting Business records changed; refusing cleanup.',
  );
  return records.filter((record) => !originalIds.has(record.id));
}
async function assertBaseline(manager, fixture) {
  const tables = await readTables(manager);
  for (const table of TABLES)
    assert.equal(
      fingerprint(tables[table]),
      fixture.baseline.tables[table].hash,
      `${table} baseline must match after cleanup.`,
    );
  const operations = await readOperations(manager);
  assert.equal(operations.id, fixture.baseline.operations.id);
  assert.equal(
    fingerprint(recordsOf(operations)),
    fixture.baseline.operations.recordsHash,
    'All original Business records must remain unchanged.',
  );
  return operations;
}
function printFixture(fixture) {
  console.log(
    JSON.stringify(
      {
        journal: FILE,
        status: fixture.status,
        workspaceId: WORKSPACE_ID,
        actorId: fixture.actorId,
        actorName: fixture.actorName,
        sentinel: fixture.sentinel,
        marker: fixture.marker,
        dateFrom: fixture.dateFrom,
        dateTo: fixture.dateTo,
        month: fixture.month,
        accountingDate: fixture.accountingDate,
        cashProfileId: fixture.cashProfileId,
        recognitionProfileId: fixture.recognitionProfileId,
        incomeId: fixture.incomeId,
        expenseId: fixture.expenseId,
        revenueId: fixture.revenueId,
        costId: fixture.costId,
        cashTotals: { income: '100.00', cost: '25.00', net: '75.00' },
        recognitionTotals: { revenue: '120.00', cost: '30.00', net: '90.00' },
        url: '/delivery?view=finance&financeView=exports&financeCurrency=USD',
      },
      null,
      2,
    ),
  );
}
const cashIds = (fixture) => [fixture.incomeId, fixture.expenseId];
const entryIds = (fixture) => [fixture.revenueId, fixture.costId];
const allocationIds = (fixture) => [
  fixture.revenueAllocationId,
  fixture.costAllocationId,
];
const seedProfileIds = (fixture) => [
  fixture.cashProfileId,
  fixture.recognitionProfileId,
];
const configuration = () => ({
  columns: [
    { header: 'Date', field: 'DATE', constant: null },
    { header: 'Kind', field: 'KIND', constant: null },
    { header: 'Description', field: 'TITLE', constant: null },
    { header: 'Currency', field: 'CURRENCY', constant: null },
    { header: 'Amount', field: 'AMOUNT', constant: null },
    { header: 'Source', field: 'SOURCE_ID', constant: null },
  ],
  mappings: [],
  delimiter: 'COMMA',
  precision: 2,
  dateFormat: 'ISO',
  includeBom: false,
});
async function createFixture() {
  assert(!existsSync(FILE), 'Recover the active export browser fixture first.');
  const fixture = {
    version: 1,
    status: 'CREATING',
    workspaceId: WORKSPACE_ID,
    nonce: randomUUID(),
    incomeId: randomUUID(),
    expenseId: randomUUID(),
    revenueId: randomUUID(),
    costId: randomUUID(),
    revenueAllocationId: randomUUID(),
    costAllocationId: randomUUID(),
    cashProfileId: randomUUID(),
    recognitionProfileId: randomUUID(),
    dateFrom: DATE_FROM,
    dateTo: DATE_TO,
    month: MONTH,
    accountingDate: DATE_TO,
    createdAt: new Date().toISOString(),
    baseline: null,
    cleanupAttempts: [],
  };
  fixture.marker = markerFor(fixture.nonce);
  fixture.sentinel = titleFor(fixture.nonce);
  writeJournal(fixture, FILE, true);
  await connectionSource.transaction(async (manager) => {
    await locked(manager);
    const [workspace] = await manager.query(
      'SELECT id,"databaseSchema","activationStatus" FROM core.workspace WHERE id=$1',
      [WORKSPACE_ID],
    );
    assert(
      workspace &&
        workspace.activationStatus === 'ACTIVE' &&
        /^[a-zA-Z0-9_]+$/.test(workspace.databaseSchema),
    );
    const admins = await manager.query(
      `SELECT member.id AS "memberId",membership.id AS "userWorkspaceId",trim(concat_ws(' ',member."nameFirstName",member."nameLastName")) AS name FROM "${workspace.databaseSchema}"."workspaceMember" member JOIN core."userWorkspace" membership ON membership."userId"=member."userId" AND membership."workspaceId"=$1 JOIN core."user" account ON account.id=membership."userId" JOIN core."roleTarget" target ON target."userWorkspaceId"=membership.id AND target."workspaceId"=$1 JOIN core.role role ON role.id=target."roleId" AND role."workspaceId"=$1 WHERE member."deletedAt" IS NULL AND membership."deletedAt" IS NULL AND account."deletedAt" IS NULL AND account.disabled=false AND role."canUpdateAllSettings"=true ORDER BY member.id`,
      [WORKSPACE_ID],
    );
    assert.equal(
      admins.length,
      1,
      'Use the one existing active native administrator; no access is created or changed.',
    );
    fixture.actorId = admins[0].memberId;
    fixture.userWorkspaceId = admins[0].userWorkspaceId;
    fixture.actorName = admins[0].name;
    const tables = await readTables(manager);
    const operations = await readOperations(manager);
    const records = recordsOf(operations);
    assert.equal(
      new Set(records.map((record) => record.id)).size,
      records.length,
    );
    for (const record of records) assert.match(record.id, UUID);
    assert(
      !records.some(
        (record) =>
          record.kind === 'FINANCE' &&
          (record.currency === 'USD' || typeof record.currency !== 'string') &&
          (!isDate(record.date) ||
            (record.date >= DATE_FROM && record.date <= DATE_TO)),
      ),
      'The exact cash window must be empty and valid; preserve existing data.',
    );
    assert(
      !tables.deliveryFinanceEntry.some((entry) => entry.month === MONTH),
      'The synthetic recognition month must be empty.',
    );
    assert(
      !tables.deliveryFinancePeriod.some((period) => period.month === MONTH),
      'Do not bypass a preexisting management lock.',
    );
    assert(
      !records.some(
        (record) =>
          typeof record.title === 'string' && record.title.startsWith(PREFIX),
      ) &&
        !tables.deliveryFinanceExportProfile.some((profile) =>
          profile.name.startsWith(PREFIX),
        ),
      'Recover earlier export acceptance fixtures first.',
    );
    fixture.baseline = {
      tables: Object.fromEntries(
        TABLES.map((table) => [
          table,
          {
            ids: tables[table].map((row) => row.id),
            hash: fingerprint(tables[table]),
          },
        ]),
      ),
      operations: {
        id: operations.id,
        recordIds: records.map((record) => record.id),
        recordsHash: fingerprint(records),
        initialStateHash: fingerprint(operations.state),
      },
    };
    fixture.status = 'PREPARED';
    writeJournal(fixture);
    const seedRecords = [
      [fixture.incomeId, 'INCOME', 10000, DATE_FROM, 'income'],
      [fixture.expenseId, 'EXPENSE', 2500, DATE_TO, 'expense'],
    ].map(([id, category, amount, date, label]) => ({
      id,
      revision: 1,
      kind: 'FINANCE',
      projectId: null,
      taskId: null,
      title: `${fixture.sentinel} ${label}`,
      category,
      currency: 'USD',
      amount,
      date,
      dueDate: null,
      externalReference: fixture.marker,
      evidenceUrl: null,
      notes: `${fixture.marker} Synthetic export acceptance only.`,
      status: 'POSTED',
      createdBy: fixture.actorId,
      createdAt: fixture.createdAt,
      updatedAt: fixture.createdAt,
      decisionBy: null,
      evidence: null,
      history: [],
    }));
    const proposedState = copy(operations.state);
    proposedState.business.records.push(...seedRecords);
    const updated = await manager.query(
      'WITH updated AS (UPDATE core."deliveryOperations" SET state=$3 WHERE id=$1 AND "workspaceId"=$2 RETURNING id) SELECT id FROM updated',
      [operations.id, WORKSPACE_ID, proposedState],
    );
    assert.equal(updated.length, 1);
    for (const [id, allocationId, kind, amount] of [
      [fixture.revenueId, fixture.revenueAllocationId, 'REVENUE', '120000000'],
      [fixture.costId, fixture.costAllocationId, 'COST', '30000000'],
    ]) {
      await manager.query(
        'INSERT INTO core."deliveryFinanceEntry" (id,"workspaceId",revision,month,kind,category,title,currency,"amountMicros",note,status,"sourceType","createdBy","postedBy","postedAt","createdAt","updatedAt") VALUES ($1,$2,1,$3,$4,\'Synthetic acceptance\',$5,\'USD\',$6,$7,\'POSTED\',\'MANUAL\',$8,$8,$9,$9,$9)',
        [
          id,
          WORKSPACE_ID,
          MONTH,
          kind,
          `${fixture.sentinel} ${kind.toLowerCase()}`,
          amount,
          `${fixture.marker} Synthetic export acceptance only.`,
          fixture.actorId,
          fixture.createdAt,
        ],
      );
      await manager.query(
        'INSERT INTO core."deliveryFinanceAllocation" (id,"workspaceId","entryId",bucket,"amountMicros") VALUES ($1,$2,$3,\'COMPANY\',$4)',
        [allocationId, WORKSPACE_ID, id, amount],
      );
    }
    for (const [id, basis] of [
      [fixture.cashProfileId, 'CASH'],
      [fixture.recognitionProfileId, 'RECOGNITION'],
    ])
      await manager.query(
        'INSERT INTO core."deliveryFinanceExportProfile" (id,"workspaceId",revision,name,basis,active,configuration,"changedBy","changedByName","changedAt") VALUES ($1,$2,1,$3,$4,true,$5,$6,$7,$8)',
        [
          id,
          WORKSPACE_ID,
          `${fixture.sentinel} ${basis}`,
          basis,
          configuration(),
          fixture.actorId,
          fixture.actorName,
          fixture.createdAt,
        ],
      );
    const seeded = await readTables(manager);
    const allowedSeed = {
      deliveryFinanceEntry: entryIds(fixture),
      deliveryFinanceAllocation: allocationIds(fixture),
      deliveryFinanceExportProfile: seedProfileIds(fixture),
    };
    fixture.seed = { recordsHash: fingerprint(seedRecords), tables: {} };
    for (const table of TABLES) {
      const extra = additions(seeded, fixture, table);
      assert.deepEqual(
        extra.map((row) => row.id).sort(),
        [...(allowedSeed[table] ?? [])].sort(),
      );
      if (table !== 'deliveryFinanceExportProfile')
        fixture.seed.tables[table] = fingerprint(extra);
    }
    assert.equal(
      fingerprint((await readOperations(manager)).state),
      fingerprint(proposedState),
    );
    fixture.seedOperationsHash = fingerprint(proposedState);
    writeJournal(fixture);
    if (process.env.OTOGROW_EXPORT_UI_TEST_FAILURE === 'create-before-commit')
      throw new Error('Injected export create failure before commit');
  });
  if (process.env.OTOGROW_EXPORT_UI_TEST_FAILURE === 'create-after-commit')
    throw new Error('Injected export create failure after commit');
  fixture.status = 'READY';
  writeJournal(fixture);
  printFixture(fixture);
  console.log(
    'Synthetic data only. Prefix all new profile names with sentinel. Export only the printed exact cash window/service month. No source edits, payments, matching, forecasts, users, roles or provider calls.',
  );
}
function validateOwned(tables, operations, fixture) {
  const changed = Object.fromEntries(
    TABLES.map((table) => [table, additions(tables, fixture, table)]),
  );
  const records = newBusinessRecords(operations, fixture);
  for (const table of TABLES)
    assert(
      changed[table].length <=
        (['deliveryFinanceEvent', 'otogrowActivityEvent'].includes(table)
          ? 300
          : 50),
      'Unexpected fixture volume requires explicit review.',
    );
  const hasSeed =
    records.length > 0 ||
    changed.deliveryFinanceEntry.length > 0 ||
    changed.deliveryFinanceExportProfile.length > 0;
  if (!hasSeed) {
    assert(
      TABLES.every((table) => changed[table].length === 0),
      'A partial graph without its seeded owner must not be removed.',
    );
    return { changed, records };
  }
  assert(
    fixture.seed,
    'Committed seed requires its durable exact snapshot hashes.',
  );
  assert.deepEqual(
    records.map((record) => record.id).sort(),
    cashIds(fixture).sort(),
  );
  assert.equal(
    fingerprint(records),
    fixture.seed.recordsHash,
    'Fixture cash sources are readonly; changed cash requires investigation.',
  );
  for (const table of ['deliveryFinanceEntry', 'deliveryFinanceAllocation'])
    assert.equal(
      fingerprint(changed[table]),
      fixture.seed.tables[table],
      'Recognition sources/allocations must retain the exact seed.',
    );
  const profiles = changed.deliveryFinanceExportProfile;
  assert(profiles.length >= 2 && profiles.length <= 8);
  const profileIds = new Set(profiles.map((profile) => profile.id));
  for (const id of seedProfileIds(fixture)) assert(profileIds.has(id));
  for (const profile of profiles)
    assert(
      profile.changedBy === fixture.actorId &&
        profile.changedByName === fixture.actorName &&
        profile.name.startsWith(fixture.sentinel) &&
        ['CASH', 'RECOGNITION'].includes(profile.basis) &&
        Number.isSafeInteger(profile.revision) &&
        profile.revision > 0,
      'Only nonce-tagged profiles owned by the exact actor may be removed.',
    );
  const sourcesByBasis = {
    CASH: new Set(cashIds(fixture)),
    RECOGNITION: new Set(entryIds(fixture)),
  };
  const batches = changed.deliveryFinanceExportBatch;
  const batchIds = new Set(batches.map((batch) => batch.id));
  for (const batch of batches) {
    const sources = sourcesByBasis[batch.basis];
    assert(
      profileIds.has(batch.profileId) &&
        batch.createdBy === fixture.actorId &&
        batch.createdByName === fixture.actorName &&
        batch.currency === 'USD' &&
        sources &&
        batch.profileSnapshot.id === batch.profileId &&
        batch.profileSnapshot.name.startsWith(fixture.sentinel) &&
        batch.profileSnapshot.basis === batch.basis,
      'Only exact fixture profiles may own acceptance batches.',
    );
    assert(
      batch.selection.profileId === batch.profileId &&
        batch.selection.currency === 'USD',
    );
    assert(
      batch.basis === 'CASH'
        ? batch.selection.dateFrom === DATE_FROM &&
            batch.selection.dateTo === DATE_TO &&
            batch.selection.serviceMonth === null &&
            batch.selection.accountingDate === null
        : batch.selection.serviceMonth === MONTH &&
            batch.selection.accountingDate === fixture.accountingDate &&
            batch.selection.dateFrom === null &&
            batch.selection.dateTo === null,
      'A batch selecting unrelated periods must never be removed.',
    );
    assert(
      Array.isArray(batch.rows) &&
        batch.rows.length === batch.rowCount &&
        batch.rowCount > 0 &&
        batch.rowCount <= 2,
    );
    assert(
      Array.isArray(batch.sourceIds) &&
        batch.sourceIds.length > 0 &&
        batch.sourceIds.every((id) => sources.has(id)),
    );
    assert(
      Array.isArray(batch.identityKeys) &&
        batch.identityKeys.every((key) =>
          [...sources].some(
            (id) =>
              key === `${batch.basis === 'CASH' ? 'CASH' : 'ENTRY'}:${id}`,
          ),
        ),
      'Logical source keys must belong to the exact fixture.',
    );
    assert.deepEqual(
      [...new Set(batch.rows.map((row) => row.sourceId))].sort(),
      [...batch.sourceIds].sort(),
    );
    assert(
      Array.isArray(batch.exclusions) &&
        batch.exclusions.every(
          (row) => row.sourceId !== null && sources.has(row.sourceId),
        ),
      'Unrelated exclusions require manual batch review.',
    );
    for (const row of batch.rows)
      assert(
        sources.has(row.sourceId) &&
          row.currency === 'USD' &&
          row.title.startsWith(fixture.sentinel) &&
          row.projectId === null &&
          row.sourceType === (batch.basis === 'CASH' ? 'CASH' : 'MANUAL'),
      );
    assert.equal(fingerprintCsv(batch.csv), batch.checksum);
    assert.equal(Buffer.byteLength(batch.csv, 'utf8'), batch.byteLength);
  }
  for (const event of changed.deliveryFinanceEvent)
    assert(
      event.actorId === fixture.actorId &&
        event.actorName === fixture.actorName &&
        typeof event.action === 'string' &&
        event.action.startsWith('FINANCE_EXPORT_') &&
        (event.sourceType === 'EXPORT_PROFILE'
          ? profileIds.has(event.sourceId)
          : event.sourceType === 'EXPORT_BATCH' &&
            batchIds.has(event.sourceId)),
      'Finance history must belong to exact export fixture owners.',
    );
  for (const event of changed.otogrowActivityEvent)
    assert(
      event.actorId === fixture.actorId &&
        event.category === 'BUSINESS' &&
        event.sourceType === 'finance-export' &&
        event.projectId === null &&
        event.taskId === null &&
        (profileIds.has(event.sourceId) || batchIds.has(event.sourceId)),
      'Activity must belong to exact export fixture owners.',
    );
  const allowed = new Set(DELETE_ORDER);
  for (const table of TABLES)
    if (!allowed.has(table))
      assert.equal(
        changed[table].length,
        0,
        `Unexpected ${table} additions; refusing cleanup.`,
      );
  return { changed, records };
}
const fingerprintCsv = (value) =>
  createHash('sha256').update(value, 'utf8').digest('hex');
async function cleanupFixture() {
  const fixture = readJournal();
  await connectionSource.transaction(async (manager) => {
    await locked(manager);
    const tables = await readTables(manager);
    const operations = await readOperations(manager);
    if (!fixture.baseline) {
      const ids = new Set([
        ...cashIds(fixture),
        ...entryIds(fixture),
        ...allocationIds(fixture),
        ...seedProfileIds(fixture),
      ]);
      assert(
        !recordsOf(operations).some(
          (record) =>
            ids.has(record.id) ||
            (typeof record.notes === 'string' &&
              record.notes.startsWith(fixture.marker)),
        ),
      );
      for (const table of TABLES)
        assert(
          !tables[table].some((row) => ids.has(row.id)),
          'An unprepared journal cannot own committed database rows.',
        );
      fixture.noCommittedSeed = true;
      return;
    }
    const { changed, records } = validateOwned(tables, operations, fixture);
    const nothingRemains =
      records.length === 0 &&
      TABLES.every((table) => changed[table].length === 0);
    if (nothingRemains && fixture.cleanupAttempts.length > 0) {
      const expected =
        fixture.cleanupAttempts[fixture.cleanupAttempts.length - 1];
      assert.equal(
        fingerprint(withoutHeartbeat(operations.state)),
        expected.proposedStateWithoutHeartbeatHash,
        'Interrupted committed cleanup must match its saved target; only the worker heartbeat may advance.',
      );
      if (fixture.status !== 'CLEANED') {
        fixture.cleanupRecoveredAfterCommit = true;
        fixture.cleanupFinalOperationsHash = fingerprint(operations.state);
        fixture.heartbeatAdvancedAfterCleanup =
          fixture.cleanupFinalOperationsHash !== expected.proposedStateHash;
      }
      await assertBaseline(manager, fixture);
      return;
    }
    const proposedState = copy(operations.state);
    const ownedRecordIds = new Set(records.map((record) => record.id));
    proposedState.business.records = proposedState.business.records.filter(
      (record) => !ownedRecordIds.has(record.id),
    );
    assert.equal(
      fingerprint(proposedState.business.records),
      fixture.baseline.operations.recordsHash,
    );
    assert(
      fixture.cleanupAttempts.length < 20,
      'Retain the journal for explicit review after repeated cleanup attempts.',
    );
    const attempt = {
      preparedAt: new Date().toISOString(),
      ids: Object.fromEntries(
        DELETE_ORDER.map((table) => [
          table,
          changed[table].map((row) => row.id),
        ]),
      ),
      rowsHash: Object.fromEntries(
        DELETE_ORDER.map((table) => [table, fingerprint(changed[table])]),
      ),
      businessRecordIds: [...ownedRecordIds].sort(),
      beforeStateHash: fingerprint(operations.state),
      proposedStateHash: fingerprint(proposedState),
      proposedStateWithoutHeartbeatHash: fingerprint(
        withoutHeartbeat(proposedState),
      ),
    };
    fixture.cleanupAttempts.push(attempt);
    fixture.status = 'CLEANUP_PREPARED';
    writeJournal(fixture);
    for (const table of DELETE_ORDER)
      if (attempt.ids[table].length) {
        const deleted = await manager.query(
          `WITH deleted AS (DELETE FROM core."${table}" WHERE "workspaceId"=$1 AND id=ANY($2::uuid[]) RETURNING id) SELECT id FROM deleted`,
          [WORKSPACE_ID, attempt.ids[table]],
        );
        assert.equal(deleted.length, attempt.ids[table].length);
      }
    if (records.length) {
      const updated = await manager.query(
        'WITH updated AS (UPDATE core."deliveryOperations" SET state=$3 WHERE id=$1 AND "workspaceId"=$2 RETURNING id) SELECT id FROM updated',
        [operations.id, WORKSPACE_ID, proposedState],
      );
      assert.equal(updated.length, 1);
    }
    const finalOperations = await assertBaseline(manager, fixture);
    assert.equal(
      fingerprint(finalOperations.state),
      attempt.proposedStateHash,
      'Cleanup may remove only exact verified fixture Business records from the locked current Operations state.',
    );
    fixture.cleanupFinalOperationsHash = fingerprint(finalOperations.state);
    if (process.env.OTOGROW_EXPORT_UI_TEST_FAILURE === 'cleanup-before-commit')
      throw new Error('Injected export fixture cleanup failure before commit');
  });
  if (process.env.OTOGROW_EXPORT_UI_TEST_FAILURE === 'cleanup-after-commit')
    throw new Error('Injected export fixture cleanup failure after commit');
  fixture.status = 'CLEANED';
  writeJournal(fixture);
  const receipt = `${FILE}.${fixture.nonce}.cleaned.json`;
  if (existsSync(receipt))
    assert.equal(
      fingerprint(JSON.parse(readFileSync(receipt, 'utf8'))),
      fingerprint(fixture),
      'Existing cleanup receipt must match exactly.',
    );
  else writeJournal(fixture, receipt, true);
  unlinkSync(FILE);
  syncDirectory(FILE);
  console.log(
    fixture.baseline
      ? `Removed only verified export UI fixture records, source-linked rows and histories. All twenty-one protected table baselines and original Business records match. Current unrelated Operations state/heartbeat preserved. Receipt: ${receipt}`
      : `No seed was committed; archived the ownership journal without database mutation. Receipt: ${receipt}`,
  );
}
async function main() {
  assert.equal(process.argv.length, 3);
  const command = process.argv[2];
  assert(['create', 'inspect', 'cleanup'].includes(command));
  assert(
    ['localhost', '127.0.0.1'].includes(
      new URL(connectionSource.options.url).hostname,
    ),
  );
  if (command === 'inspect') {
    printFixture(readJournal());
    return;
  }
  await connectionSource.initialize();
  try {
    if (command === 'create') await createFixture();
    else await cleanupFixture();
  } finally {
    await connectionSource.destroy();
  }
}
main().catch((error) => {
  console.error(error);
  console.error(
    `Retain ${FILE}; the transaction may have committed and the private journal is required for exact recovery.`,
  );
  process.exitCode = 1;
});
