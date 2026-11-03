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

const FILE = '/tmp/otogrow-finance-forecast-ui-fixture.json';
const WORKSPACE_ID = '0a420537-0122-45c3-a2f5-18298b636227';
const PREFIX = 'Disposable forecast acceptance';
const TIMEZONE = 'Asia/Qatar';
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
];
const DELETE_ORDER = [
  'otogrowActivityEvent',
  'deliveryFinanceEvent',
  'deliveryFinanceForecastRealization',
  'deliveryFinanceCashMatch',
  'deliveryFinanceSettlement',
  'deliveryFinanceAllocation',
  'deliveryFinanceEntry',
  'deliveryFinanceForecastItem',
  'deliveryFinanceForecastAnchor',
  'deliveryFinanceSource',
  'deliveryFinancePlan',
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
const markerFor = (nonce) => `forecast-ui:${nonce}`;
const titleFor = (nonce) => `${PREFIX} ${nonce.slice(0, 8)}`;
const isDate = (value) =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) &&
  new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const businessDate = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  return ['year', 'month', 'day']
    .map((type) => parts.find((part) => part.type === type).value)
    .join('-');
};
const shiftDate = (date, days) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
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
  for (const key of ['nonce', 'invoiceId', 'planId'])
    assert.match(fixture[key], UUID);
  assert.equal(fixture.marker, markerFor(fixture.nonce));
  assert.equal(fixture.sentinel, titleFor(fixture.nonce));
  assert.equal(fixture.timezone, TIMEZONE);
  assert(isDate(fixture.businessDate) && isDate(fixture.closingDate));
  assert.equal(fixture.month, fixture.businessDate.slice(0, 7));
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
        workspaceId: fixture.workspaceId,
        actorId: fixture.actorId,
        userWorkspaceId: fixture.userWorkspaceId,
        actorName: fixture.actorName,
        sentinel: fixture.sentinel,
        marker: fixture.marker,
        invoiceId: fixture.invoiceId,
        planId: fixture.planId,
        timezone: fixture.timezone,
        month: fixture.month,
        businessDate: fixture.businessDate,
        closingDate: fixture.closingDate,
        invoiceDate: fixture.invoiceDate,
        invoiceDueDate: fixture.invoiceDueDate,
        collectionDate: fixture.collectionDate,
        outflowDate: fixture.outflowDate,
        invoiceAmountMicros: '1000000000',
        planAmountMicros: '500000000',
        initialAnchorMicros: '0',
        url: `/delivery?view=finance&financeView=forecast&financeCurrency=USD&financeForecastDays=30&financeForecastKind=RECEIVABLE&financeForecastSource=${fixture.invoiceId}`,
      },
      null,
      2,
    ),
  );
}
async function createFixture() {
  assert(
    !existsSync(FILE),
    'Recover the existing forecast browser fixture first.',
  );
  const today = businessDate();
  const fixture = {
    version: 1,
    status: 'CREATING',
    workspaceId: WORKSPACE_ID,
    nonce: randomUUID(),
    invoiceId: randomUUID(),
    planId: randomUUID(),
    timezone: TIMEZONE,
    businessDate: today,
    month: today.slice(0, 7),
    closingDate: shiftDate(today, -1),
    invoiceDate: shiftDate(today, -5),
    invoiceDueDate: shiftDate(today, -1),
    collectionDate: shiftDate(today, 2),
    outflowDate: shiftDate(today, 1),
    createdAt: new Date().toISOString(),
    baseline: null,
    cleanupAttempts: [],
  };
  fixture.sentinel = titleFor(fixture.nonce);
  fixture.marker = markerFor(fixture.nonce);
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
      'This helper requires the one existing active local native administrator; it never creates or changes access.',
    );
    fixture.actorId = admins[0].memberId;
    fixture.userWorkspaceId = admins[0].userWorkspaceId;
    fixture.actorName = admins[0].name;
    const tables = await readTables(manager);
    const operations = await readOperations(manager);
    const originalRecordIds = recordsOf(operations).map((record) => record.id);
    assert.equal(new Set(originalRecordIds).size, originalRecordIds.length);
    for (const id of originalRecordIds) assert.match(id, UUID);
    for (const table of [
      'deliveryFinanceForecastAnchor',
      'deliveryFinanceForecastItem',
      'deliveryFinanceForecastRealization',
    ])
      assert.equal(
        tables[table].length,
        0,
        'Existing real forecast state must never be overwritten.',
      );
    assert(
      !recordsOf(operations).some(
        (record) =>
          record.kind === 'FINANCE' &&
          record.currency === 'USD' &&
          record.status !== 'VOID' &&
          record.category !== 'OPENING_BALANCE',
      ),
      'Active USD cash/debt would change the exact browser scenario; preserve it and use a separately reviewed fixture.',
    );
    assert(
      !tables.deliveryFinanceSource.some((source) => source.currency === 'USD'),
      'Existing normalized USD sources would change source/anomaly expectations.',
    );
    assert(
      !tables.deliveryFinanceEntry.some(
        (entry) => entry.currency === 'USD' && entry.month === fixture.month,
      ),
      'The current USD recognition month must be empty for isolated optional matching.',
    );
    assert(
      !tables.deliveryFinancePlan.some(
        (plan) =>
          plan.currency === 'USD' &&
          plan.active &&
          plan.startMonth <= fixture.month &&
          (!plan.endMonth || plan.endMonth >= fixture.month),
      ),
      'Existing active USD plans would change plan preparation; do not modify them.',
    );
    assert(
      !recordsOf(operations).some(
        (record) =>
          typeof record.title === 'string' && record.title.startsWith(PREFIX),
      ) &&
        !tables.deliveryFinancePlan.some((plan) =>
          plan.name.startsWith(PREFIX),
        ),
      'Recover previous forecast acceptance records first.',
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
        recordIds: recordsOf(operations).map((record) => record.id),
        recordsHash: fingerprint(recordsOf(operations)),
        initialStateHash: fingerprint(operations.state),
        initialStateWithoutHeartbeatHash: fingerprint(
          withoutHeartbeat(operations.state),
        ),
      },
    };
    fixture.status = 'PREPARED';
    writeJournal(fixture);
    const invoice = {
      id: fixture.invoiceId,
      revision: 1,
      kind: 'FINANCE',
      projectId: null,
      title: `${fixture.sentinel} invoice`,
      category: 'RECEIVABLE',
      currency: 'USD',
      amount: 100000,
      date: fixture.invoiceDate,
      dueDate: fixture.invoiceDueDate,
      externalReference: fixture.marker,
      evidenceUrl: null,
      notes: `${fixture.marker} Synthetic USD1000 invoice for local browser acceptance only.`,
      status: 'OPEN',
      createdBy: fixture.actorId,
      createdAt: fixture.createdAt,
      updatedAt: fixture.createdAt,
      decisionBy: null,
      evidence: null,
      taskId: null,
      history: [],
    };
    const proposedState = copy(operations.state);
    proposedState.business.records.push(invoice);
    const updated = await manager.query(
      'WITH updated AS (UPDATE core."deliveryOperations" SET state=$3 WHERE id=$1 AND "workspaceId"=$2 RETURNING id) SELECT id FROM updated',
      [operations.id, WORKSPACE_ID, proposedState],
    );
    assert.equal(updated.length, 1);
    await manager.query(
      'INSERT INTO core."deliveryFinancePlan" (id,"workspaceId",revision,type,name,currency,"monthlyAmountMicros","memberId","memberName","startMonth","endMonth","dueDay",active,"createdBy","createdAt","updatedAt") VALUES ($1,$2,1,\'OVERHEAD\',$3,\'USD\',\'500000000\',NULL,NULL,$4,$4,31,true,$5,$6,$6)',
      [
        fixture.planId,
        WORKSPACE_ID,
        `${fixture.sentinel} cost plan`,
        fixture.month,
        fixture.actorId,
        fixture.createdAt,
      ],
    );
    const seeded = await readTables(manager);
    for (const table of TABLES) {
      const extra = additions(seeded, fixture, table);
      assert.equal(extra.length, table === 'deliveryFinancePlan' ? 1 : 0);
      if (table === 'deliveryFinancePlan')
        assert.equal(extra[0].id, fixture.planId);
    }
    assert.equal(
      fingerprint((await readOperations(manager)).state),
      fingerprint(proposedState),
    );
    fixture.seedOperationsHash = fingerprint(proposedState);
    writeJournal(fixture);
    if (process.env.OTOGROW_FORECAST_UI_TEST_FAILURE === 'create-before-commit')
      throw new Error('Injected forecast fixture failure before create commit');
  });
  if (process.env.OTOGROW_FORECAST_UI_TEST_FAILURE === 'create-after-commit')
    throw new Error('Injected forecast fixture failure after create commit');
  fixture.status = 'READY';
  writeJournal(fixture);
  printFixture(fixture);
  console.log(
    'Seeded only one synthetic invoice and one cost plan; no cash, forecasts, recognition, users, roles, providers or messages were created. Prefix every UI title with sentinel and every note/reason with marker.',
  );
}
function validateOwned(tables, operations, fixture) {
  const changed = Object.fromEntries(
    TABLES.map((table) => [table, additions(tables, fixture, table)]),
  );
  for (const table of TABLES)
    assert(
      changed[table].length <=
        (['deliveryFinanceEvent', 'otogrowActivityEvent'].includes(table)
          ? 400
          : 80),
      'Unexpected acceptance volume requires manual review.',
    );
  const records = newBusinessRecords(operations, fixture);
  assert(records.length <= 30);
  const tagged = (value) =>
    typeof value === 'string' && value.startsWith(fixture.marker);
  const titled = (value) =>
    typeof value === 'string' &&
    (value.startsWith(fixture.sentinel) ||
      value.startsWith(`Payment: ${fixture.sentinel}`));
  for (const record of records) {
    assert.match(record.id, UUID);
    assert(
      record.kind === 'FINANCE' &&
        record.currency === 'USD' &&
        record.projectId === null &&
        record.taskId === null &&
        record.createdBy === fixture.actorId &&
        titled(record.title) &&
        tagged(record.notes),
      'Only exact tagged fixture finance records may be removed.',
    );
    assert(
      Number.isSafeInteger(record.amount) &&
        record.amount > 0 &&
        record.amount <= 100000000000 &&
        isDate(record.date),
    );
    assert(Number.isSafeInteger(record.revision) && record.revision > 0);
    assert(
      ['INCOME', 'EXPENSE', 'SALARY', 'RECEIVABLE'].includes(record.category),
    );
    assert(
      record.category === 'RECEIVABLE'
        ? record.id === fixture.invoiceId &&
            ['OPEN', 'PAID', 'VOID'].includes(record.status)
        : ['POSTED', 'VOID'].includes(record.status),
    );
    assert(
      ['', fixture.marker, `receivable:${fixture.invoiceId}`].includes(
        record.externalReference,
      ),
    );
    if (record.id === fixture.invoiceId)
      assert(
        record.amount === 100000 &&
          record.date === fixture.invoiceDate &&
          record.dueDate === fixture.invoiceDueDate &&
          record.title === `${fixture.sentinel} invoice`,
      );
  }
  const recordIds = new Set(records.map((record) => record.id));
  const cash = records.filter((record) => record.category !== 'RECEIVABLE');
  const cashIds = new Set(cash.map((record) => record.id));
  const plans = changed.deliveryFinancePlan;
  assert(plans.length <= 1);
  for (const plan of plans)
    assert(
      plan.id === fixture.planId &&
        plan.createdBy === fixture.actorId &&
        plan.currency === 'USD' &&
        plan.name.startsWith(fixture.sentinel) &&
        plan.startMonth === fixture.month &&
        plan.endMonth === fixture.month &&
        ['OVERHEAD', 'SALARY'].includes(plan.type) &&
        [null, fixture.actorId].includes(plan.memberId),
    );
  assert.equal(
    records.some((record) => record.id === fixture.invoiceId),
    plans.some((plan) => plan.id === fixture.planId),
    'Atomic seed records must both exist or both be absent.',
  );
  const entries = changed.deliveryFinanceEntry;
  const entryIds = new Set(entries.map((entry) => entry.id));
  for (const entry of entries)
    assert(
      entry.currency === 'USD' &&
        entry.month === fixture.month &&
        entry.createdBy === fixture.actorId &&
        titled(entry.title) &&
        (entry.sourceType === 'MANUAL' ||
          (entry.sourceType === 'PLAN' &&
            entry.sourcePlan?.planId === fixture.planId)) &&
        ['COST', 'REVENUE'].includes(entry.kind),
    );
  for (const allocation of changed.deliveryFinanceAllocation)
    assert(
      entryIds.has(allocation.entryId) &&
        allocation.projectId === null &&
        allocation.bucket === 'COMPANY',
    );
  for (const source of changed.deliveryFinanceSource) {
    const record = records.find((candidate) => candidate.id === source.id);
    assert(
      record &&
        source.createdBy === fixture.actorId &&
        source.currency === 'USD' &&
        source.kind ===
          (record.category === 'RECEIVABLE' ? 'RECEIVABLE' : 'CASH'),
    );
    const snapshot = source.snapshot;
    assert(
      snapshot &&
        snapshot.id === record.id &&
        snapshot.title === record.title &&
        snapshot.category === record.category &&
        snapshot.currency === record.currency &&
        snapshot.amountMicros === (BigInt(record.amount) * 10000n).toString() &&
        source.amountMicros === snapshot.amountMicros &&
        snapshot.date === record.date &&
        snapshot.dueDate === record.dueDate &&
        snapshot.projectId === null &&
        snapshot.evidenceUrl === record.evidenceUrl &&
        snapshot.note === record.notes,
      'Normalized sources must match exact owned finance snapshots.',
    );
  }
  const settlements = changed.deliveryFinanceSettlement;
  const matches = changed.deliveryFinanceCashMatch;
  const relations = [
    ...settlements,
    ...matches,
    ...changed.deliveryFinanceForecastRealization,
  ];
  for (const relation of relations) {
    assert(
      relation.createdBy === fixture.actorId &&
        relation.currency === 'USD' &&
        relation.projectId === null &&
        cashIds.has(relation.cashId),
    );
    assert(
      /^[1-9]\d*$/.test(relation.amountMicros) &&
        ['ACTIVE', 'REVERSED'].includes(relation.status),
    );
    if (relation.status === 'REVERSED')
      assert(
        relation.reversedBy === fixture.actorId &&
          relation.reversedAt !== null &&
          typeof relation.reversalReason === 'string' &&
          relation.reversalReason.length > 0,
      );
  }
  for (const settlement of settlements)
    assert(
      settlement.receivableId === fixture.invoiceId &&
        recordIds.has(fixture.invoiceId) &&
        cash.find((record) => record.id === settlement.cashId)?.category ===
          'INCOME',
    );
  for (const match of matches)
    assert(entryIds.has(match.entryId) && match.bucket === 'COMPANY');
  const anchors = changed.deliveryFinanceForecastAnchor;
  assert(anchors.length <= 1);
  for (const anchor of anchors)
    assert(
      anchor.currency === 'USD' &&
        anchor.changedBy === fixture.actorId &&
        tagged(anchor.note) &&
        anchor.timezone === fixture.timezone &&
        isDate(anchor.closingDate) &&
        anchor.closingDate === fixture.closingDate,
    );
  const items = changed.deliveryFinanceForecastItem;
  const itemIds = new Set(items.map((item) => item.id));
  for (const item of items) {
    assert(
      item.currency === 'USD' &&
        item.createdBy === fixture.actorId &&
        item.changedBy === fixture.actorId &&
        item.ownerId === fixture.actorId &&
        titled(item.title) &&
        tagged(item.note),
    );
    assert(
      item.sourceType === 'RECEIVABLE'
        ? item.kind === 'COLLECTION' &&
            item.receivableId === fixture.invoiceId &&
            recordIds.has(fixture.invoiceId)
        : item.sourceType === 'PLAN'
          ? item.kind === 'OUTFLOW' &&
            item.planId === fixture.planId &&
            item.planMonth === fixture.month &&
            plans.length === 1
          : item.sourceType === 'MANUAL' &&
            item.kind === 'OUTFLOW' &&
            item.receivableId === null &&
            item.planId === null &&
            item.planMonth === null,
    );
  }
  const realizations = changed.deliveryFinanceForecastRealization;
  const realizationIds = new Set(realizations.map((row) => row.id));
  for (const row of realizations)
    assert(
      itemIds.has(row.itemId) &&
        items.find((item) => item.id === row.itemId)?.kind === 'OUTFLOW' &&
        ['EXPENSE', 'SALARY'].includes(
          cash.find((record) => record.id === row.cashId)?.category,
        ) &&
        tagged(row.note),
    );
  const anchorIds = new Set(anchors.map((anchor) => anchor.id));
  const financeSources = {
    PLAN: new Set(plans.map((plan) => plan.id)),
    ENTRY: entryIds,
    PAYMENT: cashIds,
    SETTLEMENT: new Set(settlements.map((row) => row.id)),
    MATCH: new Set(matches.map((row) => row.id)),
    FORECAST_ANCHOR: anchorIds,
    FORECAST_ITEM: itemIds,
    FORECAST_REALIZATION: realizationIds,
  };
  for (const event of changed.deliveryFinanceEvent)
    assert(
      event.actorId === fixture.actorId &&
        financeSources[event.sourceType]?.has(event.sourceId),
      'Finance history must belong to exact fixture sources.',
    );
  const activitySources = {
    finance: recordIds,
    'finance-payment': cashIds,
    'finance-plan': new Set(plans.map((plan) => plan.id)),
    'finance-entry': entryIds,
    'finance-forecast': new Set([...anchorIds, ...itemIds, ...realizationIds]),
  };
  for (const event of changed.otogrowActivityEvent)
    assert(
      event.actorId === fixture.actorId &&
        event.category === 'BUSINESS' &&
        event.taskId === null &&
        event.projectId === null &&
        activitySources[event.sourceType]?.has(event.sourceId),
      'Activity must belong to exact fixture sources.',
    );
  const allowed = new Set(DELETE_ORDER);
  for (const table of TABLES)
    if (!allowed.has(table))
      assert.equal(
        changed[table].length,
        0,
        `Unexpected ${table} additions; refusing cleanup.`,
      );
  for (const record of cash) {
    for (const rows of [settlements, matches, realizations])
      assert(
        rows
          .filter((row) => row.cashId === record.id && row.status === 'ACTIVE')
          .reduce((amount, row) => amount + BigInt(row.amountMicros), 0n) <=
          BigInt(record.amount) * 10000n,
        'Fixture payment links must conserve the actual amount independently.',
      );
  }
  return { changed, records };
}
async function cleanupFixture() {
  const fixture = readJournal();
  await connectionSource.transaction(async (manager) => {
    await locked(manager);
    const tables = await readTables(manager);
    const operations = await readOperations(manager);
    if (!fixture.baseline) {
      assert(
        !recordsOf(operations).some(
          (record) =>
            record.id === fixture.invoiceId ||
            (typeof record.notes === 'string' &&
              record.notes.startsWith(fixture.marker)),
        ),
      );
      assert(
        !tables.deliveryFinancePlan.some((row) => row.id === fixture.planId),
      );
      for (const table of [
        'deliveryFinanceForecastAnchor',
        'deliveryFinanceForecastItem',
      ])
        assert(
          !tables[table].some(
            (row) =>
              typeof row.note === 'string' &&
              row.note.startsWith(fixture.marker),
          ),
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
    if (
      process.env.OTOGROW_FORECAST_UI_TEST_FAILURE === 'cleanup-before-commit'
    )
      throw new Error(
        'Injected forecast fixture cleanup failure before commit',
      );
  });
  if (process.env.OTOGROW_FORECAST_UI_TEST_FAILURE === 'cleanup-after-commit')
    throw new Error('Injected forecast fixture cleanup failure after commit');
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
      ? `Removed only verified forecast UI fixture records, source-linked rows and histories. All nineteen protected table baselines and original Business records match. Current unrelated Operations state/heartbeat preserved. Receipt: ${receipt}`
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
